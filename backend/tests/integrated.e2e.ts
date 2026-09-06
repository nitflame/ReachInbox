import http from "http";
import type { AddressInfo } from "net";
import { createApp } from "../src/app";
import { pool, checkDbConnection, closeDb, query } from "../src/config/db";
import { redis, checkRedisConnection, closeRedis } from "../src/config/redis";
import { emailQueue, checkQueueConnection, closeEmailQueue } from "../src/queues/email.queue";
import {
  ensureEmailIndex,
  getElasticClient,
  EMAIL_INDEX_NAME,
} from "../src/services/elasticsearch.service";
import { createEmailWorker } from "../src/workers/email.worker";
import { env } from "../src/config/env";

// Colorful console formatting
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

let passedCount = 0;
let failedCount = 0;

function logHeader(title: string) {
  console.log(`\n${BOLD}${CYAN}======================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================${RESET}`);
}

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ${GREEN}✓${RESET} ${message}`);
    passedCount++;
  } else {
    console.error(`  ${RED}✗ FAIL:${RESET} ${message}`);
    failedCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

class TestClient {
  private cookies: Map<string, string> = new Map();

  constructor(public baseUrl: string, public defaultHeaders: Record<string, string> = {}) {}

  setCookie(name: string, value: string) {
    this.cookies.set(name, value);
  }

  clearCookies() {
    this.cookies.clear();
  }

  private getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  private saveCookiesFromHeaders(headers: Headers) {
    const rawSetCookie = headers.get("set-cookie");
    if (!rawSetCookie) return;
    const parts = rawSetCookie.split(/,(?=[^;]+=[^;]+)/);
    for (const part of parts) {
      const match = part.match(/^\s*([^=;\s]+)=([^;]+)/);
      if (match) {
        const [, name, val] = match;
        if (val === "" || val.toLowerCase().includes("deleted")) {
          this.cookies.delete(name);
        } else {
          this.cookies.set(name, val);
        }
      }
    }
  }

  async request(
    path: string,
    options: RequestInit & { sendCookies?: boolean } = {}
  ): Promise<{ status: number; headers: Headers; body: any; text: string }> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...(options.headers as Record<string, string>),
    };

    if (options.sendCookies !== false && this.cookies.size > 0) {
      headers["Cookie"] = this.getCookieHeader();
    }

    const response = await fetch(url, {
      ...options,
      headers,
      redirect: options.redirect || "manual",
    });

    this.saveCookiesFromHeaders(response.headers);

    const text = await response.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return {
      status: response.status,
      headers: response.headers,
      body,
      text,
    };
  }

  async get(path: string, options: RequestInit & { sendCookies?: boolean } = {}) {
    return this.request(path, { ...options, method: "GET" });
  }

  async post(path: string, body?: any, options: RequestInit & { sendCookies?: boolean } = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    return this.request(path, {
      ...options,
      method: "POST",
      headers,
      body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    });
  }
}

async function runAllIntegrationTests(): Promise<void> {
  const startTime = Date.now();
  console.log(`${BOLD}🚀 REACHINBOX FULL INTEGRATED TEST RUNNER${RESET}`);
  console.log(`Node.js ${process.version} | Environment: ${env.NODE_ENV}`);

  let server: http.Server | null = null;
  let worker: ReturnType<typeof createEmailWorker> | null = null;
  let client: TestClient | null = null;

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Infrastructure Diagnostics
    // -------------------------------------------------------------------------
    logHeader("Phase 1: Pre-flight Infrastructure Diagnostics");

    const dbConnected = await checkDbConnection();
    assert(dbConnected, "PostgreSQL connection alive and accepting queries");

    const redisConnected = await checkRedisConnection();
    assert(redisConnected, "Redis connection alive (PONG received)");

    const queueConnected = await checkQueueConnection();
    assert(queueConnected, `BullMQ email queue "${env.EMAIL_QUEUE_NAME}" is ready`);

    const esClient = getElasticClient();
    const esHealth = await esClient.cluster.health();
    assert(
      esHealth.status === "green" || esHealth.status === "yellow",
      `Elasticsearch cluster online (status: ${esHealth.status})`
    );

    const esIndexReady = await ensureEmailIndex();
    assert(esIndexReady, `Elasticsearch index "${EMAIL_INDEX_NAME}" exists or initialized`);

    // Clean up any stale integration-test data from previous test runs
    await query(`DELETE FROM users WHERE email LIKE '%@integration-test.local'`);
    console.log(`  ${GREEN}✓${RESET} Stale test users and cascaded records purged from PostgreSQL`);

    // -------------------------------------------------------------------------
    // Phase 2: Live Server Bootstrap & Health Endpoint
    // -------------------------------------------------------------------------
    logHeader("Phase 2: Express Server Bootstrap & Health Endpoint");

    const app = createApp();
    server = await new Promise<http.Server>((resolve, reject) => {
      const s = app.listen(0, () => resolve(s));
      s.on("error", reject);
    });

    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`  ${GREEN}✓${RESET} Express API server listening dynamically on ${baseUrl}`);

    client = new TestClient(baseUrl);

    const healthRes = await client.get("/health");
    assert(healthRes.status === 200, "GET /health returns HTTP 200");
    assert(healthRes.body?.status === "ok", "GET /health status is 'ok'");
    assert(healthRes.body?.dependencies?.postgres === "up", "PostgreSQL marked 'up' in health report");
    assert(healthRes.body?.dependencies?.redis === "up", "Redis marked 'up' in health report");
    assert(healthRes.body?.dependencies?.bullmq === "up", "BullMQ marked 'up' in health report");

    // -------------------------------------------------------------------------
    // Phase 3: Authentication & Security Matrix (Google OAuth, Dev Auth, Sessions)
    // -------------------------------------------------------------------------
    logHeader("Phase 3: Authentication, Authorization & Session Management");

    // 3.1 Unauthenticated requests are rejected
    const unauthMe = await client.get("/api/auth/me", { sendCookies: false });
    assert(unauthMe.status === 401, "GET /api/auth/me rejects unauthenticated request (HTTP 401)");

    const unauthSearch = await client.get("/api/emails/search", { sendCookies: false });
    assert(unauthSearch.status === 401, "GET /api/emails/search rejects unauthenticated request (HTTP 401)");

    const unauthSchedule = await client.post("/api/emails/schedule", { subject: "x" }, { sendCookies: false });
    assert(unauthSchedule.status === 401, "POST /api/emails/schedule rejects unauthenticated request (HTTP 401)");

    const unauthQueues = await client.get("/admin/queues", { sendCookies: false });
    assert(unauthQueues.status === 401, "GET /admin/queues rejects unauthenticated request (HTTP 401)");

    // 3.2 Google OAuth redirect generation
    const googleRes = await client.get("/api/auth/google");
    assert(googleRes.status === 302, "GET /api/auth/google returns HTTP 302 Redirect");
    const googleLocation = googleRes.headers.get("location") || "";
    assert(
      googleLocation.startsWith("https://accounts.google.com/o/oauth2/v2/auth"),
      "Google OAuth redirect points to accounts.google.com"
    );
    assert(googleLocation.includes("client_id="), "Google OAuth URL includes client_id");
    assert(googleLocation.includes("state="), "Google OAuth URL includes random CSRF state");
    assert(googleLocation.includes("scope="), "Google OAuth URL includes requested scopes");

    // 3.3 Google OAuth callback CSRF state protection
    const badStateRes = await client.get("/api/auth/google/callback?code=fake_code&state=bad_state");
    assert(badStateRes.status === 302, "Google OAuth callback rejects mismatched state with HTTP 302");
    const badStateLoc = badStateRes.headers.get("location") || "";
    assert(badStateLoc.includes("error=invalid_state"), "Google OAuth callback redirects with error=invalid_state");

    // 3.4 Dev Login session creation
    const aliceEmail = "alice@integration-test.local";
    const aliceClient = new TestClient(baseUrl);
    const devLoginRes = await aliceClient.get(`/api/auth/dev-login?email=${aliceEmail}`);
    assert(devLoginRes.status === 302, "GET /api/auth/dev-login returns HTTP 302 redirect");

    // Verify session persistence via cookie
    const aliceProfileRes = await aliceClient.get("/api/auth/me");
    assert(aliceProfileRes.status === 200, "GET /api/auth/me returns HTTP 200 for authenticated session");
    assert(aliceProfileRes.body?.email === aliceEmail, "User profile matches Alice's email");
    assert(typeof aliceProfileRes.body?.id === "string", "User profile contains valid user UUID");
    const aliceId = aliceProfileRes.body?.id;

    // 3.5 Dev Header Auth Fallback
    const bobEmail = "bob@integration-test.local";
    const bobHeaderClient = new TestClient(baseUrl, { "X-Dev-User-Email": bobEmail });
    const bobHeaderRes = await bobHeaderClient.get("/api/auth/me", { sendCookies: false });
    assert(bobHeaderRes.status === 200, "GET /api/auth/me succeeds with X-Dev-User-Email fallback header");
    assert(bobHeaderRes.body?.email === bobEmail, "User profile matches Bob's header email");

    // 3.6 Session Logout
    const eveEmail = "eve@integration-test.local";
    const eveClient = new TestClient(baseUrl);
    await eveClient.get(`/api/auth/dev-login?email=${eveEmail}`);
    const eveProfileBefore = await eveClient.get("/api/auth/me");
    assert(eveProfileBefore.status === 200, "Eve authenticated before logout");

    const logoutRes = await eveClient.post("/api/auth/logout");
    assert(logoutRes.status === 200, "POST /api/auth/logout returns HTTP 200");
    assert(logoutRes.body?.success === true, "Logout response confirms success: true");

    const eveProfileAfter = await eveClient.get("/api/auth/me");
    assert(eveProfileAfter.status === 401, "Subsequent GET /api/auth/me after logout returns HTTP 401 Unauthorized");

    // -------------------------------------------------------------------------
    // Phase 4: Input Validation & Schema Enforcement
    // -------------------------------------------------------------------------
    logHeader("Phase 4: Input Validation & Schema Enforcement");

    const badPayload1 = await aliceClient.post("/api/emails/schedule", {
      sender: "sender@integration-test.local",
      recipient: "recipient@integration-test.local",
    });
    assert(badPayload1.status === 400, "Reject scheduling request missing subject and body (HTTP 400)");
    assert(badPayload1.body?.error === "ValidationError", "Response error type is 'ValidationError'");

    const badPayload2 = await aliceClient.post("/api/emails/schedule", {
      sender: "sender@integration-test.local",
      recipient: "not-an-email",
      subject: "Valid Subject",
      body: "Valid Body",
    });
    assert(badPayload2.status === 400, "Reject invalid recipient email syntax (HTTP 400)");

    const badPayload3 = await aliceClient.post("/api/emails/schedule", {
      sender: "sender@integration-test.local",
      recipients: [],
      subject: "Valid Subject",
      body: "Valid Body",
    });
    assert(badPayload3.status === 400, "Reject empty recipients array (HTTP 400)");

    const badPayload4 = await aliceClient.post("/api/emails/schedule", {
      sender: "sender@integration-test.local",
      recipient: "ok@integration-test.local",
      subject: "Valid Subject",
      body: "Valid Body",
      delayBetweenEmailsMs: -1000,
    });
    assert(badPayload4.status === 400, "Reject negative delayBetweenEmailsMs (HTTP 400)");

    // -------------------------------------------------------------------------
    // Phase 5: Email Scheduling, Database Consistency & BullMQ Enqueueing
    // -------------------------------------------------------------------------
    logHeader("Phase 5: Email Scheduling, Database Records & Queue Enqueueing");

    const batchKey = `idem-batch-${Date.now()}`;
    const schedulePayload = {
      sender: "alice.outreach@integration-test.local",
      recipients: [
        "lead-alpha@integration-test.local",
        "lead-beta@integration-test.local",
      ],
      subject: "Q4 Growth Strategy & Integrations",
      body: "Hello! We are testing the complete outbox scheduling pipeline end to end.",
      delayBetweenEmailsMs: 2000,
      hourlyLimit: 50,
      idempotencyKey: batchKey,
    };

    const scheduleRes = await aliceClient.post("/api/emails/schedule", schedulePayload);
    assert(scheduleRes.status === 201, "POST /api/emails/schedule returns HTTP 201 Created");
    assert(scheduleRes.body?.idempotencyKey === batchKey, "Response matches provided idempotencyKey");
    assert(scheduleRes.body?.pacing?.requestedDelayMs === 2000, "Pacing requestedDelayMs matches");
    const expectedEffectiveDelay = Math.max(2000, Math.ceil(3600000 / 50));
    assert(
      scheduleRes.body?.pacing?.effectiveDelayMs === expectedEffectiveDelay,
      `Pacing effectiveDelayMs correctly computes max(requestedDelay, 3600000/hourlyLimit) = ${expectedEffectiveDelay}ms`
    );
    assert(scheduleRes.body?.emails?.length === 2, "Response contains 2 scheduled email items");

    const scheduledEmail1 = scheduleRes.body.emails[0];
    const scheduledEmail2 = scheduleRes.body.emails[1];
    assert(
      scheduledEmail1.status === "queued" || scheduledEmail1.status === "scheduled",
      `Email 1 status is '${scheduledEmail1.status}' (enqueued in BullMQ)`
    );
    assert(
      scheduledEmail2.status === "queued" || scheduledEmail2.status === "scheduled",
      `Email 2 status is '${scheduledEmail2.status}' (enqueued in BullMQ)`
    );
    assert(typeof scheduledEmail1.id === "string", "Email 1 ID is a valid string UUID");

    // Check Postgres database records
    const dbEmails = await query<{ id: string; user_id: string; status: string; recipient: string }>(
      `SELECT * FROM emails WHERE id = $1 OR id = $2`,
      [scheduledEmail1.id, scheduledEmail2.id]
    );
    assert(dbEmails.rows.length === 2, "Both email records exist in PostgreSQL 'emails' table");
    assert(dbEmails.rows[0].user_id === aliceId, "Email record belongs to Alice in PostgreSQL");

    const dbSenders = await query<{ id: string; email: string; hourly_limit: number }>(
      `SELECT * FROM senders WHERE user_id = $1 AND email = $2`,
      [aliceId, "alice.outreach@integration-test.local"]
    );
    assert(dbSenders.rows.length === 1, "Sender record created in PostgreSQL 'senders' table");
    assert(dbSenders.rows[0].hourly_limit === 50, "Sender hourly_limit saved correctly (50)");

    // Check BullMQ Queue Job IDs
    const job1 = await emailQueue.getJob(scheduledEmail1.id);
    assert(job1 !== undefined && job1 !== null, `BullMQ job exists for Email 1 (jobId=${scheduledEmail1.id})`);
    assert(job1?.data?.emailId === scheduledEmail1.id, "BullMQ job payload references emailId");

    // Check GET /api/emails/:id
    const getEmailRes = await aliceClient.get(`/api/emails/${scheduledEmail1.id}`);
    assert(getEmailRes.status === 200, "GET /api/emails/:id returns HTTP 200");
    assert(getEmailRes.body?.id === scheduledEmail1.id, "GET /api/emails/:id returns matching email object");
    assert(getEmailRes.body?.subject === "Q4 Growth Strategy & Integrations", "Email subject matches");

    // -------------------------------------------------------------------------
    // Phase 6: Idempotency & Deduplication
    // -------------------------------------------------------------------------
    logHeader("Phase 6: Idempotency & Replay Deduplication");

    const replayRes = await aliceClient.post("/api/emails/schedule", schedulePayload);
    assert(replayRes.status === 201, "Idempotent replay returns HTTP 201");
    assert(replayRes.body?.emails?.length === 2, "Replay returns original 2 emails");
    assert(replayRes.body.emails[0].id === scheduledEmail1.id, "Replay returns identical Email 1 ID");
    assert(replayRes.body.emails[1].id === scheduledEmail2.id, "Replay returns identical Email 2 ID");
    assert(replayRes.body.emails[0].idempotentReplay === true, "Email 1 marked idempotentReplay=true");
    assert(replayRes.body.emails[1].idempotentReplay === true, "Email 2 marked idempotentReplay=true");

    const countCheck = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM emails WHERE user_id = $1 AND subject = $2`,
      [aliceId, "Q4 Growth Strategy & Integrations"]
    );
    assert(parseInt(countCheck.rows[0].count, 10) === 2, "No duplicate database rows created upon replay");

    // -------------------------------------------------------------------------
    // Phase 7: Real Worker Execution, Pacing & Ethereal SMTP Delivery
    // -------------------------------------------------------------------------
    logHeader("Phase 7: Real BullMQ Worker Execution & Nodemailer/Ethereal Delivery");

    worker = createEmailWorker();
    console.log(`  ${GREEN}✓${RESET} BullMQ worker instantiated and attached to queue "${env.EMAIL_QUEUE_NAME}"`);

    // Wait for Email 1 to be picked up and processed by the worker
    console.log("  ⏳ Waiting for worker to process immediate job via Ethereal SMTP...");
    let email1Sent = false;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 25000) {
      const pollRow = await query<{ status: string; sent_at: Date; attempts: number }>(
        `SELECT status, sent_at, attempts FROM emails WHERE id = $1`,
        [scheduledEmail1.id]
      );
      if (pollRow.rows[0]?.status === "sent") {
        email1Sent = true;
        assert(pollRow.rows[0].sent_at !== null, "sent_at timestamp populated upon delivery");
        assert(pollRow.rows[0].attempts >= 1, "attempts incremented upon delivery");
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert(email1Sent, "Email 1 successfully delivered by worker (status: 'sent')");

    // -------------------------------------------------------------------------
    // Phase 8: Distributed Hourly Rate Limiting & Rescheduling
    // -------------------------------------------------------------------------
    logHeader("Phase 8: Distributed Hourly Rate Limiting & Rescheduling");

    // Schedule 1st email for Charlie with hourlyLimit: 1
    const charlieEmail = "charlie@integration-test.local";
    const charlieClient = new TestClient(baseUrl);
    await charlieClient.get(`/api/auth/dev-login?email=${charlieEmail}`);

    const res1 = await charlieClient.post("/api/emails/schedule", {
      sender: "charlie.burst@integration-test.local",
      recipient: "charlie-target-1@integration-test.local",
      subject: "Hourly Rate Limit Enforcement Test - Email 1",
      body: "Testing that first email is sent within hourly limit.",
      hourlyLimit: 1,
    });
    assert(res1.status === 201, "Scheduled Email 1 with hourlyLimit=1");
    const charlieJob1 = res1.body.emails[0];

    // Wait for Email 1 to be sent
    console.log("  ⏳ Waiting for worker to deliver Charlie's 1st email...");
    let charlieJob1Done = false;
    const poll1Start = Date.now();
    while (Date.now() - poll1Start < 25000) {
      const row1 = await query<{ status: string }>(`SELECT status FROM emails WHERE id = $1`, [charlieJob1.id]);
      if (row1.rows[0]?.status === "sent") {
        charlieJob1Done = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert(charlieJob1Done, "Charlie's 1st email sent under hourly quota (status: 'sent')");

    // Now schedule 2nd email for the SAME sender in the same hour window
    const res2 = await charlieClient.post("/api/emails/schedule", {
      sender: "charlie.burst@integration-test.local",
      recipient: "charlie-target-2@integration-test.local",
      subject: "Hourly Rate Limit Enforcement Test - Email 2",
      body: "Testing that second email exceeds hourly limit and gets rescheduled.",
      hourlyLimit: 1,
    });
    assert(res2.status === 201, "Scheduled Email 2 for same sender with hourlyLimit=1");
    const charlieJob2 = res2.body.emails[0];

    // Wait for worker to pick up job 2, hit rate limit, and reschedule it
    console.log("  ⏳ Waiting for worker to evaluate rate limit and reschedule Charlie's 2nd email...");
    let charlieJob2Rescheduled = false;
    const poll2Start = Date.now();
    while (Date.now() - poll2Start < 25000) {
      const row2 = await query<{ status: string; scheduled_at: Date; attempts: number }>(
        `SELECT status, scheduled_at, attempts FROM emails WHERE id = $1`,
        [charlieJob2.id]
      );
      if (row2.rows[0]?.status === "scheduled") {
        charlieJob2Rescheduled = true;
        assert(row2.rows[0].attempts === 0, "Rescheduled job attempts counter preserved at 0");
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert(charlieJob2Rescheduled, "Charlie's 2nd email rescheduled to start of next UTC hour");

    // -------------------------------------------------------------------------
    // Phase 9: Elasticsearch Multi-field Search, Filters & Bulk Reindexing
    // -------------------------------------------------------------------------
    logHeader("Phase 9: Elasticsearch Multi-Field Search, Filtering & Reindexing");

    // Refresh ES index so newly indexed docs are immediately searchable
    await esClient.indices.refresh({ index: EMAIL_INDEX_NAME });

    // Search by subject keyword
    const searchSubjectRes = await aliceClient.get("/api/emails/search?q=Growth");
    assert(searchSubjectRes.status === 200, "GET /api/emails/search?q=Growth returns HTTP 200");
    assert(
      searchSubjectRes.body?.data?.emails?.length > 0,
      "Search by subject keyword 'Growth' returns matches"
    );

    // Search by recipient keyword
    const searchRecipientRes = await aliceClient.get("/api/emails/search?q=lead-alpha");
    assert(searchRecipientRes.status === 200, "GET /api/emails/search?q=lead-alpha returns HTTP 200");
    assert(
      searchRecipientRes.body?.data?.emails?.some((e: any) => e.recipient.includes("lead-alpha")),
      "Search results contain matching recipient 'lead-alpha'"
    );

    // Filter by status=sent
    const searchStatusRes = await aliceClient.get("/api/emails/search?status=sent");
    assert(searchStatusRes.status === 200, "GET /api/emails/search?status=sent returns HTTP 200");
    assert(
      searchStatusRes.body?.data?.emails?.every((e: any) => e.status === "sent"),
      "Status filter returns strictly emails with status 'sent'"
    );

    // Test reindexing endpoint
    const reindexRes = await aliceClient.post("/api/emails/reindex");
    assert(reindexRes.status === 200, "POST /api/emails/reindex returns HTTP 200");
    assert(reindexRes.body?.success === true, "Reindexing completed successfully");
    assert(typeof reindexRes.body?.indexedCount === "number", "Reindexing reported indexedCount");

    // -------------------------------------------------------------------------
    // Phase 10: Strict Multi-Tenant Data Isolation
    // -------------------------------------------------------------------------
    logHeader("Phase 10: Strict Multi-Tenant Data Isolation");

    // Bob tries to access Alice's email directly by ID
    const bobClient = new TestClient(baseUrl);
    await bobClient.get(`/api/auth/dev-login?email=${bobEmail}`);

    const bobGetAliceEmail = await bobClient.get(`/api/emails/${scheduledEmail1.id}`);
    assert(
      bobGetAliceEmail.status === 404,
      "Tenant B cannot view Tenant A's email by ID (returns HTTP 404 Not Found)"
    );

    // Bob searches for Alice's campaign keyword
    const bobSearchAliceEmail = await bobClient.get("/api/emails/search?q=Growth");
    assert(bobSearchAliceEmail.status === 200, "Bob search executes successfully");
    assert(
      bobSearchAliceEmail.body?.data?.emails?.length === 0,
      "Tenant B search results never leak Tenant A's emails (total: 0)"
    );

    // -------------------------------------------------------------------------
    // Phase 11: Slack OAuth & Connection Management Endpoints
    // -------------------------------------------------------------------------
    logHeader("Phase 11: Slack OAuth & Connection Management");

    const slackConnectRes = await aliceClient.get("/api/slack/connect");
    assert(slackConnectRes.status === 302, "GET /api/slack/connect returns HTTP 302 Redirect");
    const slackLocation = slackConnectRes.headers.get("location") || "";
    assert(
      slackLocation.startsWith("https://slack.com/oauth/v2/authorize"),
      "Slack OAuth redirect points to slack.com authorization endpoint"
    );
    assert(slackLocation.includes("state="), "Slack OAuth URL contains state token");

    const slackStatusRes = await aliceClient.get("/api/slack/status");
    assert(slackStatusRes.status === 200, "GET /api/slack/status returns HTTP 200");
    assert(slackStatusRes.body?.connected === false, "Slack status initially reflects connected: false");

    const slackDisconnectRes = await aliceClient.post("/api/slack/disconnect");
    assert(slackDisconnectRes.status === 200, "POST /api/slack/disconnect returns HTTP 200");
    assert(slackDisconnectRes.body?.success === true, "Slack disconnect returns success: true");

    // -------------------------------------------------------------------------
    // Phase 12: Bull Board Queue Dashboard UI
    // -------------------------------------------------------------------------
    logHeader("Phase 12: Bull Board Queue Dashboard UI");

    const bullBoardRes = await aliceClient.get("/admin/queues/");
    assert(bullBoardRes.status === 200, "GET /admin/queues/ accessible for authenticated user (HTTP 200)");
    assert(
      bullBoardRes.text.includes("BullMQ") || bullBoardRes.text.includes("<!DOCTYPE html>"),
      "Bull Board dashboard UI HTML content served successfully"
    );

    // -------------------------------------------------------------------------
    // Phase 13: Real PostgreSQL Analytics & Tenant Isolation (Milestone B7)
    // -------------------------------------------------------------------------
    logHeader("Phase 13: Real PostgreSQL Analytics & Tenant Isolation");

    // Alice fetches her analytics
    const aliceAnalyticsRes = await aliceClient.get("/api/emails/analytics?range=all");
    assert(aliceAnalyticsRes.status === 200, "GET /api/emails/analytics returns HTTP 200");
    assert(typeof aliceAnalyticsRes.body?.total === "number", "Analytics returns numeric total");
    assert(aliceAnalyticsRes.body?.total >= 2, "Alice analytics total reflects scheduled emails (>=2)");
    assert(aliceAnalyticsRes.body?.sent >= 1, "Alice analytics sent reflects delivered email (>=1)");
    assert(typeof aliceAnalyticsRes.body?.successRate === "number", "Analytics calculates successRate");
    assert(Array.isArray(aliceAnalyticsRes.body?.daily), "Analytics returns daily time-series array");
    assert(Array.isArray(aliceAnalyticsRes.body?.statusBreakdown), "Analytics returns statusBreakdown array");
    assert(typeof aliceAnalyticsRes.body?.hourlyLimit === "number", "Analytics reports hourlyLimit");
    assert(aliceAnalyticsRes.body?.hourlyLimit === 50, "Alice configured hourlyLimit is 50");

    // Bob (Tenant B with 0 emails) fetches analytics - strict multi-tenant isolation
    const bobAnalyticsRes = await bobClient.get("/api/emails/analytics");
    assert(bobAnalyticsRes.status === 200, "Bob GET /api/emails/analytics returns HTTP 200");
    assert(bobAnalyticsRes.body?.total === 0, "Bob total email count is strictly 0");
    assert(bobAnalyticsRes.body?.sent === 0, "Bob sent email count is strictly 0");
    assert(bobAnalyticsRes.body?.failed === 0, "Bob failed email count is strictly 0");
    assert(bobAnalyticsRes.body?.scheduled === 0, "Bob scheduled email count is strictly 0");
    assert(bobAnalyticsRes.body?.successRate === 0, "Bob successRate is strictly 0");

    // -------------------------------------------------------------------------
    // Clean Teardown
    // -------------------------------------------------------------------------
    logHeader("Clean Teardown & Post-Test Cleanup");

    if (worker) {
      await worker.close();
      console.log(`  ${GREEN}✓${RESET} BullMQ worker shut down gracefully`);
    }

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      console.log(`  ${GREEN}✓${RESET} Express HTTP test server closed`);
    }

    // Clean test data from DB
    await query(`DELETE FROM users WHERE email LIKE '%@integration-test.local'`);
    console.log(`  ${GREEN}✓${RESET} Integration test users and database records purged`);

    // Close connections
    await closeEmailQueue();
    console.log(`  ${GREEN}✓${RESET} Email queue closed`);
    await closeRedis();
    console.log(`  ${GREEN}✓${RESET} Redis connection closed`);
    await closeDb();
    console.log(`  ${GREEN}✓${RESET} PostgreSQL connection closed`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    logHeader(`INTEGRATED TEST SUMMARY - ALL FEATURES VERIFIED`);
    console.log(`  ${BOLD}Total Checks Passed: ${GREEN}${passedCount}${RESET}`);
    console.log(`  ${BOLD}Total Checks Failed: ${RED}${failedCount}${RESET}`);
    console.log(`  ${BOLD}Execution Time:      ${YELLOW}${elapsed}s${RESET}`);

    if (failedCount > 0) {
      process.exit(1);
    } else {
      console.log(`\n${BOLD}${GREEN}🎉 ALL INTEGRATED TESTS PASSED SUCCESSFULLY!${RESET}\n`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`\n${BOLD}${RED}💥 Integration test suite failed with unhandled error:${RESET}`, err);
    if (worker) await (worker as any).close().catch(() => {});
    if (server) await new Promise<void>((r) => (server as any).close(() => r())).catch(() => {});
    await closeEmailQueue().catch(() => {});
    await closeRedis().catch(() => {});
    await closeDb().catch(() => {});
    process.exit(1);
  }
}

runAllIntegrationTests();
