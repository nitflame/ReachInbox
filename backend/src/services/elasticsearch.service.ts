import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env";
import { query } from "../config/db";
import type { EmailRecord, EmailStatus, EmailWithSenderLimit } from "../types/email";

export const EMAIL_INDEX_NAME = "emails";

let clientInstance: Client | null = null;

export function getElasticClient(): Client {
  if (!clientInstance) {
    clientInstance = new Client({
      node: env.ELASTICSEARCH_URL,
      maxRetries: 0,
      requestTimeout: 1000,
    });
  }
  return clientInstance;
}

export async function ensureEmailIndex(): Promise<boolean> {
  try {
    const client = getElasticClient();
    const exists = await client.indices.exists({ index: EMAIL_INDEX_NAME });
    if (!exists) {
      await client.indices.create({
        index: EMAIL_INDEX_NAME,
        mappings: {
          properties: {
            id: { type: "keyword" },
            user_id: { type: "keyword" },
            sender_id: { type: "keyword" },
            sender: {
              type: "text",
              fields: { keyword: { type: "keyword" } },
            },
            recipient: {
              type: "text",
              fields: { keyword: { type: "keyword" } },
            },
            subject: { type: "text" },
            body: { type: "text" },
            status: { type: "keyword" },
            scheduled_at: { type: "date" },
            sent_at: { type: "date" },
            created_at: { type: "date" },
            updated_at: { type: "date" },
          },
        },
      });
      console.log(`✅ Elasticsearch index '${EMAIL_INDEX_NAME}' created`);
    }
    return true;
  } catch (err) {
    console.warn(`⚠️ Could not initialize Elasticsearch index '${EMAIL_INDEX_NAME}':`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function indexEmailDocument(email: EmailRecord | EmailWithSenderLimit): Promise<void> {
  try {
    const client = getElasticClient();
    await client.index({
      index: EMAIL_INDEX_NAME,
      id: email.id,
      document: {
        id: email.id,
        user_id: email.user_id,
        sender_id: email.sender_id,
        sender: email.sender,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        status: email.status,
        scheduled_at: email.scheduled_at ? new Date(email.scheduled_at).toISOString() : null,
        sent_at: email.sent_at ? new Date(email.sent_at).toISOString() : null,
        created_at: email.created_at ? new Date(email.created_at).toISOString() : null,
        updated_at: email.updated_at ? new Date(email.updated_at).toISOString() : null,
      },
    });
  } catch (err) {
    console.warn(`⚠️ Non-blocking ES indexing error for email ${email.id}:`, err instanceof Error ? err.message : String(err));
  }
}

export async function updateEmailDocumentStatus(
  id: string,
  status: EmailStatus,
  opts: { sentAt?: Date; lastError?: string | null } = {}
): Promise<void> {
  try {
    const client = getElasticClient();
    const doc: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (opts.sentAt) {
      doc.sent_at = opts.sentAt.toISOString();
    }
    await client.update({
      index: EMAIL_INDEX_NAME,
      id,
      doc,
      doc_as_upsert: true,
    });
  } catch (err) {
    console.warn(`⚠️ Non-blocking ES status update error for email ${id}:`, err instanceof Error ? err.message : String(err));
  }
}

export async function reindexAllEmailsFromDb(): Promise<{ indexedCount: number }> {
  try {
    await ensureEmailIndex();
    const result = await query<EmailRecord>(`SELECT * FROM emails ORDER BY created_at ASC`);
    const emails = result.rows;
    if (emails.length === 0) {
      return { indexedCount: 0 };
    }

    const client = getElasticClient();
    const operations = emails.flatMap((email) => [
      { index: { _index: EMAIL_INDEX_NAME, _id: email.id } },
      {
        id: email.id,
        user_id: email.user_id,
        sender_id: email.sender_id,
        sender: email.sender,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        status: email.status,
        scheduled_at: email.scheduled_at ? new Date(email.scheduled_at).toISOString() : null,
        sent_at: email.sent_at ? new Date(email.sent_at).toISOString() : null,
        created_at: email.created_at ? new Date(email.created_at).toISOString() : null,
        updated_at: email.updated_at ? new Date(email.updated_at).toISOString() : null,
      },
    ]);

    const bulkResponse = await client.bulk({ refresh: true, operations });
    if (bulkResponse.errors) {
      console.warn("⚠️ Some errors occurred during ES bulk reindex");
    }
    return { indexedCount: emails.length };
  } catch (err) {
    console.error("❌ ES Reindex failed:", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export interface SearchEmailsOptions {
  query?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface SearchEmailsResult {
  emails: Array<{
    id: string;
    user_id: string;
    sender_id: string;
    sender: string;
    recipient: string;
    subject: string;
    body: string;
    status: string;
    scheduled_at: string | null;
    sent_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
  total: number;
  page: number;
  limit: number;
}

export async function searchEmails(
  userId: string,
  opts: SearchEmailsOptions = {}
): Promise<SearchEmailsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const from = (page - 1) * limit;

  try {
    const client = getElasticClient();

    const mustConditions: any[] = [];
    const filterConditions: any[] = [{ term: { user_id: userId } }];

    if (opts.status) {
      filterConditions.push({ term: { status: opts.status } });
    }

    if (opts.query && opts.query.trim()) {
      mustConditions.push({
        multi_match: {
          query: opts.query.trim(),
          fields: ["subject^3", "recipient^2", "sender^2", "body"],
          fuzziness: "AUTO",
        },
      });
    }

    const response = await client.search({
      index: EMAIL_INDEX_NAME,
      from,
      size: limit,
      query: {
        bool: {
          must: mustConditions.length > 0 ? mustConditions : [{ match_all: {} }],
          filter: filterConditions,
        },
      },
      sort: [{ created_at: { order: "desc" } }],
    });

    const hits = response.hits.hits;
    const total = typeof response.hits.total === "number" ? response.hits.total : (response.hits.total?.value ?? 0);

    const emails = hits.map((hit) => hit._source as SearchEmailsResult["emails"][0]);

    return { emails, total, page, limit };
  } catch (err) {
    console.warn("⚠️ Elasticsearch search query failed, falling back gracefully:", err instanceof Error ? err.message : String(err));
    return { emails: [], total: 0, page, limit };
  }
}
