import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import {
  RECEIPT_RETENTION_DAYS,
  ROLLUP_FINAL_AFTER_MS,
  ROLLUP_LOOKBACK_DAYS,
  ROLLUP_RETENTION_DAYS,
} from "./config";
import type { NeonUsageReader } from "./neon-usage";

// Daily rollup of orbit_read_receipts (UTC days). Every figure is scaled by
// 1/sample_rate, so a 10 % sample still sums to the full-traffic estimate. A day
// is recomputed with delete + insert inside one transaction: rerunning a day
// gives the same rows, and a rerun after late receipts replaces, never adds.

const DAY_MS = 86_400_000;

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, offset: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00.000Z`) + offset * DAY_MS));
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** The complete UTC days still covered by receipts, oldest first. */
export function pendingDayCandidates(now: Date): string[] {
  const today = utcDay(now);
  return Array.from({ length: ROLLUP_LOOKBACK_DAYS }, (_, index) => addDays(today, index - ROLLUP_LOOKBACK_DAYS));
}

/** Candidate days whose rollup is missing or was computed before the day was final. */
export async function pendingReadCostDays(client: TransactionalSqlExecutor, now: Date): Promise<string[]> {
  const candidates = pendingDayCandidates(now);
  const done = await client.query<{ day: string }>(
    `select day::text as day from orbit_read_cost_reconciliation
      where day = any($1::date[]) and computed_at >= (day::timestamp at time zone 'UTC') + interval '1 day' + ($2::bigint * interval '1 millisecond')`,
    [candidates, ROLLUP_FINAL_AFTER_MS],
  );
  const final = new Set(done.rows.map((row) => row.day));
  return candidates.filter((day) => !final.has(day));
}

// UTC day bounds, independent of the session TimeZone (a bare date would be
// converted with the server's zone).
const DAY_START = "($1::date::timestamp at time zone 'UTC')";
const DAY_END = "(($1::date + 1)::timestamp at time zone 'UTC')";

const ROUTE_ROLLUP_SQL = `
  insert into orbit_read_cost_daily_routes (day, route, source, receipt_count, requests, query_count, row_count,
    byte_count, db_ms, failed_query_count, response_bytes, max_request_bytes, computed_at)
  select $1::date, coalesce(route, '(none)'), source, count(*)::int,
    round(sum(1 / w)), round(sum(query_count / w)), round(sum(row_count / w)), round(sum(byte_count / w)),
    sum(db_ms / w::double precision), round(sum(failed_query_count / w)), round(sum(coalesce(response_bytes, 0) / w)),
    max(byte_count), $2::timestamptz
  from (select *, greatest(sample_rate, 0.0001)::numeric as w from orbit_read_receipts
         where occurred_at >= ${DAY_START} and occurred_at < ${DAY_END}) r
  group by coalesce(route, '(none)'), source`;

const ACCOUNT_ROLLUP_SQL = `
  insert into orbit_read_cost_daily_accounts (day, account_id, receipt_count, requests, query_count, row_count,
    byte_count, db_ms, computed_at)
  select $1::date, account_id, count(*)::int, round(sum(1 / w)), round(sum(query_count / w)),
    round(sum(row_count / w)), round(sum(byte_count / w)), sum(db_ms / w::double precision), $2::timestamptz
  from (select *, greatest(sample_rate, 0.0001)::numeric as w from orbit_read_receipts
         where occurred_at >= ${DAY_START} and occurred_at < ${DAY_END} and account_id is not null) r
  group by account_id`;

export interface ReadCostDayRollup {
  day: string;
  routes: number;
  accounts: number;
  recordedBytes: number;
}

export async function rollupReadCostDay(
  client: TransactionalPostgresClient,
  day: string,
  computedAt: Date = new Date(),
): Promise<ReadCostDayRollup> {
  return client.transaction(async (tx) => {
    await tx.query("delete from orbit_read_cost_daily_routes where day = $1::date", [day]);
    await tx.query("delete from orbit_read_cost_daily_accounts where day = $1::date", [day]);
    await tx.query(ROUTE_ROLLUP_SQL, [day, computedAt.toISOString()]);
    await tx.query(ACCOUNT_ROLLUP_SQL, [day, computedAt.toISOString()]);
    const totals = await tx.query<{ routes: string; bytes: string | null }>(
      "select count(*)::text as routes, sum(byte_count)::text as bytes from orbit_read_cost_daily_routes where day = $1::date",
      [day],
    );
    const accounts = await tx.query<{ n: string }>(
      "select count(*)::text as n from orbit_read_cost_daily_accounts where day = $1::date",
      [day],
    );
    return {
      day,
      routes: Number(totals.rows[0]?.routes ?? 0),
      accounts: Number(accounts.rows[0]?.n ?? 0),
      recordedBytes: Number(totals.rows[0]?.bytes ?? 0),
    };
  });
}

export type ReconciliationStatus = "ok" | "unavailable" | "failed";

/** Writes the day's reconciliation row. No Neon reader means "unavailable": no number is invented. */
export async function reconcileReadCostDay(
  client: TransactionalSqlExecutor,
  input: { day: string; recordedBytes: number; neon: NeonUsageReader | null; computedAt: Date },
): Promise<ReconciliationStatus> {
  const usage = input.neon ? await input.neon(input.day) : { status: "unavailable" as const, reason: "not_configured" };
  const neonBytes = usage.status === "ok" ? usage.bytes : null;
  const coverage = neonBytes && neonBytes > 0 ? input.recordedBytes / neonBytes : null;
  await client.query(
    `insert into orbit_read_cost_reconciliation (day, recorded_bytes, neon_status, neon_bytes, coverage, neon_reason, computed_at)
     values ($1::date, $2, $3, $4, $5, $6, $7)
     on conflict (day) do update set recorded_bytes = excluded.recorded_bytes, neon_status = excluded.neon_status,
       neon_bytes = excluded.neon_bytes, coverage = excluded.coverage, neon_reason = excluded.neon_reason,
       computed_at = excluded.computed_at`,
    [input.day, input.recordedBytes, usage.status, neonBytes, coverage, usage.status === "ok" ? null : usage.reason, input.computedAt.toISOString()],
  );
  return usage.status;
}

const DELETE_BATCH = 10_000;

/** Receipts older than 14 days and rollups older than 1 year; reconciliation rows are kept. */
export async function applyReadCostRetention(
  client: TransactionalSqlExecutor,
  input: { now: Date; deadline: number; clock: () => Date },
): Promise<{ receiptsDeleted: number; rollupsDeleted: number }> {
  const receiptCutoff = new Date(input.now.getTime() - RECEIPT_RETENTION_DAYS * DAY_MS).toISOString();
  let receiptsDeleted = 0;
  for (;;) {
    const deleted = await client.query<{ n: string }>(
      `with gone as (delete from orbit_read_receipts where id in (
         select id from orbit_read_receipts where occurred_at < $1::timestamptz limit ${DELETE_BATCH}) returning 1)
       select count(*)::text as n from gone`,
      [receiptCutoff],
    );
    const n = Number(deleted.rows[0]?.n ?? 0);
    receiptsDeleted += n;
    if (n < DELETE_BATCH || input.clock().getTime() >= input.deadline) break;
  }
  const rollupCutoff = addDays(utcDay(input.now), -ROLLUP_RETENTION_DAYS);
  const routes = await client.query<{ n: string }>(
    "with gone as (delete from orbit_read_cost_daily_routes where day < $1::date returning 1) select count(*)::text as n from gone",
    [rollupCutoff],
  );
  const accounts = await client.query<{ n: string }>(
    "with gone as (delete from orbit_read_cost_daily_accounts where day < $1::date returning 1) select count(*)::text as n from gone",
    [rollupCutoff],
  );
  await client.query("delete from orbit_read_cost_alerts where day < $1::date", [rollupCutoff]);
  return { receiptsDeleted, rollupsDeleted: Number(routes.rows[0]?.n ?? 0) + Number(accounts.rows[0]?.n ?? 0) };
}
