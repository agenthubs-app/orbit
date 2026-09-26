import { createHash } from "node:crypto";
import type { InboxNotificationUpsert } from "../../notifications/inbox-record-service";
import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import {
  LARGE_REQUEST_BYTES,
  LOW_COVERAGE_BELOW,
  ROUTE_SPIKE_FACTOR,
  ROUTE_SPIKE_HISTORY_DAYS,
  ROUTE_SPIKE_MIN_AVERAGE_BYTES,
  ROUTE_SPIKE_MIN_HISTORY_DAYS,
} from "./config";
import { addDays, median } from "./rollup";

// Three alert rules over the daily rollup. The alert ledger's (rule, day,
// subject) uniqueness makes each alert fire once however many passes run; its
// notified_at column makes delivery retry until every admin inbox has it.

export type ReadCostAlertRule = "route_average_spike" | "large_request" | "low_coverage";
export const READ_COST_ALERT_SOURCE_KIND = "read_cost_alert";
export const READ_COST_ALERT_SOURCE_REVISION = "1";

interface Candidate {
  rule: ReadCostAlertRule;
  subject: string;
  observed: number;
  threshold: number;
}

export function readCostAlertId(rule: ReadCostAlertRule, day: string, subject: string): string {
  return "read-cost:" + createHash("sha256").update(JSON.stringify([rule, day, subject])).digest("hex").slice(0, 32);
}

async function candidates(client: TransactionalSqlExecutor, day: string): Promise<Candidate[]> {
  const found: Candidate[] = [];
  const averages = await client.query<{ route: string; day: string; avg: number }>(
    `select route, day::text as day, sum(byte_count)::double precision / nullif(sum(requests), 0) as avg
       from orbit_read_cost_daily_routes where day between $1::date and $2::date
      group by route, day`,
    [addDays(day, -ROUTE_SPIKE_HISTORY_DAYS), day],
  );
  const byRoute = new Map<string, { today: number | null; history: number[] }>();
  for (const row of averages.rows) {
    if (row.avg === null) continue;
    const entry = byRoute.get(row.route) ?? { today: null, history: [] };
    if (row.day === day) entry.today = row.avg;
    else entry.history.push(row.avg);
    byRoute.set(row.route, entry);
  }
  for (const [route, { today, history }] of byRoute) {
    if (today === null || history.length < ROUTE_SPIKE_MIN_HISTORY_DAYS) continue;
    const baseline = median(history)!;
    if (today >= ROUTE_SPIKE_MIN_AVERAGE_BYTES && today > baseline * ROUTE_SPIKE_FACTOR) {
      found.push({ rule: "route_average_spike", subject: route, observed: today, threshold: baseline * ROUTE_SPIKE_FACTOR });
    }
  }
  const large = await client.query<{ route: string; max: string }>(
    `select route, max(max_request_bytes)::text as max from orbit_read_cost_daily_routes
      where day = $1::date group by route having max(max_request_bytes) > $2`,
    [day, LARGE_REQUEST_BYTES],
  );
  for (const row of large.rows) {
    found.push({ rule: "large_request", subject: row.route, observed: Number(row.max), threshold: LARGE_REQUEST_BYTES });
  }
  const coverage = await client.query<{ coverage: number }>(
    `select coverage from orbit_read_cost_reconciliation where day = $1::date and neon_status = 'ok' and coverage < $2`,
    [day, LOW_COVERAGE_BELOW],
  );
  if (coverage.rows[0]) {
    found.push({ rule: "low_coverage", subject: "all", observed: coverage.rows[0].coverage, threshold: LOW_COVERAGE_BELOW });
  }
  return found;
}

/** Evaluates the three rules for one rolled-up day; returns how many alerts are new. */
export async function evaluateReadCostAlerts(client: TransactionalSqlExecutor, day: string): Promise<number> {
  let raised = 0;
  for (const alert of await candidates(client, day)) {
    const inserted = await client.query(
      `insert into orbit_read_cost_alerts (alert_id, rule, day, subject, observed, threshold)
       values ($1, $2, $3::date, $4, $5, $6) on conflict do nothing returning alert_id`,
      [readCostAlertId(alert.rule, day, alert.subject), alert.rule, day, alert.subject, alert.observed, alert.threshold],
    );
    raised += inserted.rows.length;
  }
  return raised;
}

export interface ReadCostAlertRow {
  alert_id: string;
  rule: ReadCostAlertRule;
  day: string;
  subject: string;
  observed: number;
  threshold: number;
  created_at: Date | string;
}

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString("en-US")} KB`;
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const PAGE = "/app/admin/read-cost";

export function readCostAlertNotification(alert: ReadCostAlertRow, actorId: string): InboxNotificationUpsert {
  const at = new Date(alert.created_at).toISOString();
  const { subject, day } = alert;
  const copy = alert.rule === "route_average_spike"
    ? {
        zh: { title: `读取量翻倍：${subject}`, reason: `${day} 平均每次读取 ${kb(alert.observed)}，超过过去 7 天中位数的两倍（${kb(alert.threshold)}）。详情见网页管理后台 ${PAGE}。` },
        en: { title: `Read volume doubled: ${subject}`, reason: `On ${day} the average read per request was ${kb(alert.observed)}, above twice the 7-day median (${kb(alert.threshold)}). Details: ${PAGE} in the web admin.` },
        ja: { title: `読み取り量が倍増：${subject}`, reason: `${day} の 1 リクエスト平均読み取りは ${kb(alert.observed)} で、過去 7 日の中央値の 2 倍（${kb(alert.threshold)}）を超えました。詳細は Web 管理画面 ${PAGE}。` },
      }
    : alert.rule === "large_request"
      ? {
          zh: { title: `单次请求读取超过 5 MB：${subject}`, reason: `${day} 有请求单次读取 ${mb(alert.observed)}。详情见网页管理后台 ${PAGE}。` },
          en: { title: `A single request read over 5 MB: ${subject}`, reason: `On ${day} one request read ${mb(alert.observed)}. Details: ${PAGE} in the web admin.` },
          ja: { title: `1 リクエストで 5 MB 超を読み取り：${subject}`, reason: `${day} に 1 回で ${mb(alert.observed)} を読み取ったリクエストがありました。詳細は Web 管理画面 ${PAGE}。` },
        }
      : {
          zh: { title: `读取记录覆盖率 ${pct(alert.observed)}，低于 70%`, reason: `${day} 我们记录的读取量只占 Neon 传输量的 ${pct(alert.observed)}，有较大的读取没有记到。详情见网页管理后台 ${PAGE}。` },
          en: { title: `Read coverage ${pct(alert.observed)}, below 70%`, reason: `On ${day} recorded reads were only ${pct(alert.observed)} of Neon's data transfer. Details: ${PAGE} in the web admin.` },
          ja: { title: `読み取り記録のカバー率 ${pct(alert.observed)}（70% 未満）`, reason: `${day} の記録済み読み取りは Neon の転送量の ${pct(alert.observed)} でした。詳細は Web 管理画面 ${PAGE}。` },
        };
  return {
    actorId,
    semanticKey: `read-cost-alert:${alert.alert_id}`,
    kind: "update",
    origin: "automation",
    ...copy.zh,
    copy,
    occurredAt: at,
    sources: [{ sourceKind: READ_COST_ALERT_SOURCE_KIND, sourceId: alert.alert_id, sourceRevision: READ_COST_ALERT_SOURCE_REVISION, occurredAt: at, readAt: at }],
    // The page is web-only; the App has no such route, so no link is offered.
    target: { kind: "source", id: alert.alert_id, href: null, status: "available" },
    actions: ["read", "dismiss", "handle"],
  };
}

/**
 * Writes pending alerts (last 7 days) to every admin inbox through the typed
 * inbox upsert. An alert is marked notified only after all admins have it; with
 * no admin configured alerts stay pending.
 */
export async function deliverReadCostAlerts(input: {
  client: TransactionalSqlExecutor;
  adminIds: readonly string[];
  upsert: (notification: InboxNotificationUpsert) => Promise<unknown>;
  today: string;
  now: Date;
}): Promise<{ delivered: number; pending: number; failed: number }> {
  const pending = await input.client.query<ReadCostAlertRow>(
    `select alert_id, rule, day::text as day, subject, observed, threshold, created_at
       from orbit_read_cost_alerts where notified_at is null and day >= $1::date
      order by day, rule, subject limit 50`,
    [addDays(input.today, -7)],
  );
  if (input.adminIds.length === 0) return { delivered: 0, pending: pending.rows.length, failed: 0 };
  let delivered = 0;
  let failed = 0;
  for (const alert of pending.rows) {
    try {
      for (const adminId of input.adminIds) await input.upsert(readCostAlertNotification(alert, adminId));
      await input.client.query("update orbit_read_cost_alerts set notified_at = $2 where alert_id = $1", [alert.alert_id, input.now.toISOString()]);
      delivered++;
    } catch {
      failed++;
    }
  }
  return { delivered, pending: pending.rows.length - delivered, failed };
}

/** Inbox source check: the alert exists and the reader is a configured admin. */
export async function readCostAlertSourceState(
  client: TransactionalSqlExecutor,
  input: { actorId: string; sourceId: string; sourceRevision: string; isAdmin: (actorId: string) => boolean },
): Promise<"available" | "changed" | "unavailable"> {
  if (!input.isAdmin(input.actorId)) return "unavailable";
  const found = await client.query("select 1 from orbit_read_cost_alerts where alert_id = $1", [input.sourceId]);
  if (found.rows.length === 0) return "unavailable";
  return input.sourceRevision === READ_COST_ALERT_SOURCE_REVISION ? "available" : "changed";
}
