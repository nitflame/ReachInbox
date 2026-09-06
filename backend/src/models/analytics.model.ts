import { query } from "../config/db";
import { env } from "../config/env";

export interface ActivityDataPoint {
  date: string;
  sent: number;
  failed: number;
  scheduled: number;
  total: number;
}

export interface StatusBreakdownItem {
  status: string;
  count: number;
  percentage: number;
}

export interface TopRecipientItem {
  recipient: string;
  emails: number;
  sent: number;
  failed: number;
}

export interface EmailAnalyticsResult {
  scheduled: number;
  sent: number;
  failed: number;
  total: number;
  successRate: number;
  hourlySent: number;
  hourlyLimit: number;
  resetsInMinutes: number;
  daily: ActivityDataPoint[];
  statusBreakdown: StatusBreakdownItem[];
  topRecipients: TopRecipientItem[];
}

export async function getEmailAnalytics(
  userId: string,
  range: string = "7d"
): Promise<EmailAnalyticsResult> {
  // Determine date filtering based on range parameter
  let timeFilterSql = "";
  if (range === "today") {
    timeFilterSql = "AND created_at >= CURRENT_DATE";
  } else if (range === "30d") {
    timeFilterSql = "AND created_at >= NOW() - INTERVAL '30 days'";
  } else if (range === "all") {
    timeFilterSql = "";
  } else {
    // default: 7 days
    timeFilterSql = "AND created_at >= NOW() - INTERVAL '7 days'";
  }

  // 1. Status aggregation for user within date range
  const statusRes = await query<{ status: string; count: number }>(
    `SELECT status, COUNT(*)::int AS count
     FROM emails
     WHERE user_id = $1 ${timeFilterSql}
     GROUP BY status`,
    [userId]
  );

  let sent = 0;
  let failed = 0;
  let scheduled = 0;
  let total = 0;

  for (const row of statusRes.rows) {
    total += row.count;
    if (row.status === "sent") {
      sent += row.count;
    } else if (row.status === "failed") {
      failed += row.count;
    } else if (["scheduled", "queued", "processing"].includes(row.status)) {
      scheduled += row.count;
    }
  }

  // Success rate: sent / (sent + failed) * 100
  const decisive = sent + failed;
  const successRate = decisive > 0 ? Number(((sent / decisive) * 100).toFixed(1)) : 0;

  // 2. Hourly sent count in current UTC hour window
  const hourlyRes = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM emails
     WHERE user_id = $1 AND status = 'sent' AND sent_at >= date_trunc('hour', NOW())`,
    [userId]
  );
  const hourlySent = hourlyRes.rows[0]?.count ?? 0;

  // 3. Sender configured hourly limit
  const limitRes = await query<{ hourly_limit: number }>(
    `SELECT COALESCE(MAX(hourly_limit), $2)::int AS hourly_limit
     FROM senders
     WHERE user_id = $1`,
    [userId, env.DEFAULT_HOURLY_LIMIT]
  );
  const hourlyLimit = limitRes.rows[0]?.hourly_limit ?? env.DEFAULT_HOURLY_LIMIT;

  // Minutes until the next hour window begins
  const currentMinute = new Date().getUTCMinutes();
  const resetsInMinutes = Math.max(1, 60 - currentMinute);

  // 4. Time-series activity buckets for chart
  let daily: ActivityDataPoint[] = [];
  if (range === "today") {
    const hourlyActivityRes = await query<{
      time_bucket: string;
      sent: number;
      failed: number;
      scheduled: number;
      total: number;
    }>(
      `SELECT
         to_char(created_at, 'HH24:00') AS time_bucket,
         COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
         COUNT(*) FILTER (WHERE status IN ('scheduled', 'queued', 'processing'))::int AS scheduled,
         COUNT(*)::int AS total
       FROM emails
       WHERE user_id = $1 AND created_at >= CURRENT_DATE
       GROUP BY time_bucket
       ORDER BY time_bucket ASC`,
      [userId]
    );
    daily = hourlyActivityRes.rows.map((r) => ({
      date: r.time_bucket,
      sent: r.sent,
      failed: r.failed,
      scheduled: r.scheduled,
      total: r.total,
    }));
  } else {
    const dailyActivityRes = await query<{
      time_bucket: string;
      sent: number;
      failed: number;
      scheduled: number;
      total: number;
    }>(
      `SELECT
         to_char(created_at, 'YYYY-MM-DD') AS time_bucket,
         COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
         COUNT(*) FILTER (WHERE status IN ('scheduled', 'queued', 'processing'))::int AS scheduled,
         COUNT(*)::int AS total
       FROM emails
       WHERE user_id = $1 ${timeFilterSql}
       GROUP BY time_bucket
       ORDER BY time_bucket ASC`,
      [userId]
    );
    daily = dailyActivityRes.rows.map((r) => ({
      date: r.time_bucket,
      sent: r.sent,
      failed: r.failed,
      scheduled: r.scheduled,
      total: r.total,
    }));
  }

  // 5. Status breakdown with percentages
  const divisor = total > 0 ? total : 1;
  const statusBreakdown: StatusBreakdownItem[] = [
    {
      status: "sent",
      count: sent,
      percentage: total > 0 ? Number(((sent / divisor) * 100).toFixed(1)) : 0,
    },
    {
      status: "scheduled",
      count: scheduled,
      percentage: total > 0 ? Number(((scheduled / divisor) * 100).toFixed(1)) : 0,
    },
    {
      status: "failed",
      count: failed,
      percentage: total > 0 ? Number(((failed / divisor) * 100).toFixed(1)) : 0,
    },
  ];

  // 6. Top Recipients activity
  const recipientsRes = await query<{
    recipient: string;
    emails: number;
    sent: number;
    failed: number;
  }>(
    `SELECT
       recipient,
       COUNT(*)::int AS emails,
       COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM emails
     WHERE user_id = $1 ${timeFilterSql}
     GROUP BY recipient
     ORDER BY emails DESC
     LIMIT 5`,
    [userId]
  );
  const topRecipients: TopRecipientItem[] = recipientsRes.rows;

  return {
    scheduled,
    sent,
    failed,
    total,
    successRate,
    hourlySent,
    hourlyLimit,
    resetsInMinutes,
    daily,
    statusBreakdown,
    topRecipients,
  };
}
