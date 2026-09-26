import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import type { ReadCostAlertRule } from "./alerts";
import { addDays, utcDay } from "./rollup";

// Admin read model for the 读取量 page: four bounded reads over the rollup
// tables (never over receipts), each capped at a fixed row count.

export interface ReadCostDaySummary {
  day: string;
  requests: number;
  recordedBytes: number;
  neonStatus: "ok" | "unavailable" | "failed" | "pending";
  neonBytes: number | null;
  coverage: number | null;
}
export interface ReadCostRouteSummary { route: string; requests: number; avgBytes: number; totalBytes: number; maxRequestBytes: number }
export interface ReadCostAccountSummary { accountId: string; requests: number; avgBytes: number; totalBytes: number }
export interface ReadCostTrendPoint { day: string; requests: number; avgBytes: number; totalBytes: number }
export interface ReadCostAlertSummary { rule: ReadCostAlertRule; day: string; subject: string; observed: number; threshold: number; notified: boolean }
export interface ReadCostOverview {
  asOf: string;
  window: { from: string; to: string };
  days: ReadCostDaySummary[];
  topRoutes: ReadCostRouteSummary[];
  topAccounts: ReadCostAccountSummary[];
  trend: { route: string | null; points: ReadCostTrendPoint[] };
  alerts: ReadCostAlertSummary[];
}

const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));
const avg = (bytes: number, requests: number) => (requests > 0 ? Math.round(bytes / requests) : 0);

export async function readReadCostOverview(
  client: TransactionalSqlExecutor,
  input: { now: Date; route?: string | null },
): Promise<ReadCostOverview> {
  const today = utcDay(input.now);
  const from = addDays(today, -7);
  const to = addDays(today, -1);
  const dayRows = await client.query<{ day: string; requests: string | null; bytes: string | null; neon_status: string | null; neon_bytes: string | null; coverage: number | null; recorded_bytes: string | null }>(
    `select d::date::text as day, r.requests::text, r.bytes::text, c.neon_status, c.neon_bytes::text, c.coverage, c.recorded_bytes::text
       from generate_series($1::date, $2::date, interval '1 day') d
       left join (select day, sum(requests) as requests, sum(byte_count) as bytes from orbit_read_cost_daily_routes
                   where day between $1::date and $2::date group by day) r on r.day = d::date
       left join orbit_read_cost_reconciliation c on c.day = d::date
      order by d`,
    [from, to],
  );
  const days = dayRows.rows.map((row): ReadCostDaySummary => ({
    day: row.day,
    requests: num(row.requests),
    recordedBytes: row.recorded_bytes !== null ? num(row.recorded_bytes) : num(row.bytes),
    neonStatus: (row.neon_status ?? "pending") as ReadCostDaySummary["neonStatus"],
    neonBytes: row.neon_bytes === null ? null : num(row.neon_bytes),
    coverage: row.coverage,
  }));
  const routeRows = await client.query<{ route: string; requests: string; bytes: string; max: string }>(
    `select route, sum(requests)::text as requests, sum(byte_count)::text as bytes, max(max_request_bytes)::text as max
       from orbit_read_cost_daily_routes where day between $1::date and $2::date
      group by route order by sum(byte_count) desc, route limit 20`,
    [from, to],
  );
  const topRoutes = routeRows.rows.map((row) => ({
    route: row.route, requests: num(row.requests), totalBytes: num(row.bytes),
    avgBytes: avg(num(row.bytes), num(row.requests)), maxRequestBytes: num(row.max),
  }));
  const accountRows = await client.query<{ account_id: string; requests: string; bytes: string }>(
    `select account_id, sum(requests)::text as requests, sum(byte_count)::text as bytes
       from orbit_read_cost_daily_accounts where day between $1::date and $2::date
      group by account_id order by sum(byte_count) desc, account_id limit 20`,
    [from, to],
  );
  const topAccounts = accountRows.rows.map((row) => ({
    accountId: row.account_id, requests: num(row.requests), totalBytes: num(row.bytes), avgBytes: avg(num(row.bytes), num(row.requests)),
  }));
  const trendRoute = input.route?.trim() || topRoutes[0]?.route || null;
  let points: ReadCostTrendPoint[] = [];
  if (trendRoute) {
    const trendRows = await client.query<{ day: string; requests: string | null; bytes: string | null }>(
      `select d::date::text as day, r.requests::text, r.bytes::text
         from generate_series($1::date, $2::date, interval '1 day') d
         left join (select day, sum(requests) as requests, sum(byte_count) as bytes from orbit_read_cost_daily_routes
                     where route = $3 and day between $1::date and $2::date group by day) r on r.day = d::date
        order by d`,
      [addDays(today, -30), to, trendRoute],
    );
    points = trendRows.rows.map((row) => ({
      day: row.day, requests: num(row.requests), totalBytes: num(row.bytes), avgBytes: avg(num(row.bytes), num(row.requests)),
    }));
  }
  const alertRows = await client.query<{ rule: ReadCostAlertRule; day: string; subject: string; observed: number; threshold: number; notified: boolean }>(
    `select rule, day::text as day, subject, observed, threshold, notified_at is not null as notified
       from orbit_read_cost_alerts where day >= $1::date order by day desc, rule, subject limit 20`,
    [addDays(today, -30)],
  );
  return {
    asOf: input.now.toISOString(),
    window: { from, to },
    days,
    topRoutes,
    topAccounts,
    trend: { route: trendRoute, points },
    alerts: [...alertRows.rows],
  };
}
