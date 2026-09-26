import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import { createReadCostAdminHandler } from "../../app/api/admin/read-cost/handler";
import { createInboxNotificationHandler } from "../../app/api/inbox/notifications/handler";
import { createInboxRuntime } from "../../features/notifications/inbox-record-service-factory";
import { runMaintenancePass } from "../../features/operations/maintenance/pass";
import { createReadCostMaintenanceTask } from "../../features/operations/read-cost/maintenance-task";
import { rollupReadCostDay } from "../../features/operations/read-cost/rollup";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import type { InboxNotificationListDTO } from "../../shared/contract/inbox-notifications";

/**
 * Read-cost rollup, retention, reconciliation, alerts and the admin API against
 * a real PostgreSQL schema created by the production migration. The inbox is
 * the real typed-inbox runtime and route handler; only the Auth.js session is
 * stood in for (resolveActor), and the Neon HTTP API is an external boundary
 * replaced by a local fetch function.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `read_cost_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:read-cost:${schema}`;
const ADMIN = "account_read_cost_admin";
const OTHER = "account_read_cost_other";
const MB = 1024 * 1024;
const DAY_MS = 86_400_000;
let admin: Pool;
let client: TransactionalPostgresClient;
// The inbox source check reads the admin list from the process environment.
const savedAdminIds = process.env.ORBIT_READ_COST_ADMIN_ACCOUNT_IDS;

// "Now" is 04:00 UTC on 2026-03-20; the last complete day is 2026-03-19.
const NOW = new Date("2026-03-20T04:00:00.000Z");
const day = (offset: number) => new Date(Date.UTC(2026, 2, 20) + offset * DAY_MS).toISOString().slice(0, 10);

function scopedUrl(): string {
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

interface Receipt {
  at: string;
  route: string | null;
  source?: string;
  account?: string | null;
  queries?: number;
  rows?: number;
  bytes: number;
  dbMs?: number;
  sampleRate?: number;
}

async function insertReceipts(receipts: readonly Receipt[]): Promise<void> {
  for (const r of receipts) {
    await client.query(
      `insert into orbit_read_receipts (occurred_at, route, source, account_id, query_count, row_count, byte_count, db_ms, failed_query_count, response_bytes, status_code, sample_rate)
       values ($1,$2,$3,$4,$5,$6,$7,$8,0,100,200,$9)`,
      [r.at, r.route, r.source ?? "app", r.account ?? null, r.queries ?? 1, r.rows ?? 1, r.bytes, r.dbMs ?? 1, r.sampleRate ?? 1],
    );
  }
}

async function reset(): Promise<void> {
  await client.query("delete from orbit_read_receipts");
  await client.query("delete from orbit_read_cost_daily_routes");
  await client.query("delete from orbit_read_cost_daily_accounts");
  await client.query("delete from orbit_read_cost_reconciliation");
  await client.query("delete from orbit_read_cost_alerts");
  await client.query("delete from orbit_records where collection_name = 'inboxNotifications'");
}

function noFetch(): typeof fetch {
  return (async () => { throw new Error("Neon must not be called when unconfigured"); }) as typeof fetch;
}

function task(env: Record<string, string | undefined>, fetchImpl: typeof fetch = noFetch()) {
  return createReadCostMaintenanceTask({ resolve: () => ({ client, workspaceId }), env, fetch: fetchImpl });
}

async function pass(env: Record<string, string | undefined>, fetchImpl?: typeof fetch) {
  return runMaintenancePass({ tasks: [task(env, fetchImpl)], now: () => NOW, log: () => {} });
}

async function inbox(actorId: string): Promise<InboxNotificationListDTO> {
  const handler = createInboxNotificationHandler({
    resolveActor: async () => ({ id: actorId }),
    enabled: () => true,
    runtime: () => ({ ...createInboxRuntime({ client, workspaceId }), client, workspaceId }) as never,
  });
  const response = await handler("list", new Request("http://localhost/api/inbox/notifications"));
  assert.equal(response.status, 200);
  return (await response.json()).data as InboxNotificationListDTO;
}

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  process.env.ORBIT_READ_COST_ADMIN_ACCOUNT_IDS = ADMIN;
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 3, options: `-c search_path=${schema} -c statement_timeout=20000` });
  client = createTransactionalPostgresClient({ connectionString: scopedUrl(), pool });
  await runOrbitRecordsMigration(client);
}, { timeout: 120_000 });

after(async () => {
  if (savedAdminIds === undefined) delete process.env.ORBIT_READ_COST_ADMIN_ACCOUNT_IDS;
  else process.env.ORBIT_READ_COST_ADMIN_ACCOUNT_IDS = savedAdminIds;
  if (skip) return;
  try { await client.close(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

test("SC-01 rollup sums equal receipt sums (with sample-rate scaling) and a same-day rerun is unchanged", { skip, timeout: 60_000 }, async () => {
  await reset();
  const d = day(-1);
  await insertReceipts([
    { at: `${d}T00:00:00.000Z`, route: "GET /api/contacts", account: ADMIN, queries: 6, rows: 2064, bytes: 1_409_601, dbMs: 12.5 },
    { at: `${d}T10:00:00.000Z`, route: "GET /api/contacts", account: OTHER, queries: 6, rows: 2000, bytes: 1_400_000, dbMs: 11 },
    { at: `${d}T11:00:00.000Z`, route: "GET /api/contacts", source: "web", account: ADMIN, bytes: 5_000 },
    { at: `${d}T12:00:00.000Z`, route: "GET /api/tasks", account: ADMIN, queries: 1, rows: 92, bytes: 125_682, sampleRate: 0.5 },
    { at: `${d}T23:59:59.999Z`, route: null, source: "unattributed", bytes: 777 },
    // Adjacent days must not leak into the rollup of d.
    { at: `${day(-2)}T23:59:59.999Z`, route: "GET /api/contacts", account: ADMIN, bytes: 9_999_999 },
    { at: `${day(0)}T00:00:00.000Z`, route: "GET /api/contacts", account: ADMIN, bytes: 8_888_888 },
  ]);
  const first = await rollupReadCostDay(client, d);
  const expected = await client.query<{ requests: string; queries: string; rows: string; bytes: string; account_bytes: string }>(
    `select round(sum(1 / sample_rate::numeric))::text as requests, round(sum(query_count / sample_rate::numeric))::text as queries,
            round(sum(row_count / sample_rate::numeric))::text as rows, round(sum(byte_count / sample_rate::numeric))::text as bytes,
            round(sum(byte_count / sample_rate::numeric) filter (where account_id is not null))::text as account_bytes
       from orbit_read_receipts where occurred_at >= $1::timestamptz and occurred_at < $2::timestamptz`, [`${d}T00:00:00.000Z`, `${day(0)}T00:00:00.000Z`]);
  const routes = await client.query<{ requests: string; queries: string; rows: string; bytes: string }>(
    `select sum(requests)::text as requests, sum(query_count)::text as queries, sum(row_count)::text as rows, sum(byte_count)::text as bytes
       from orbit_read_cost_daily_routes where day = $1`, [d]);
  const accounts = await client.query<{ bytes: string }>(`select sum(byte_count)::text as bytes from orbit_read_cost_daily_accounts where day = $1`, [d]);
  assert.deepEqual(routes.rows[0], { requests: expected.rows[0]!.requests, queries: expected.rows[0]!.queries, rows: expected.rows[0]!.rows, bytes: expected.rows[0]!.bytes });
  assert.equal(accounts.rows[0]!.bytes, expected.rows[0]!.account_bytes);
  // The 0.5-sampled receipt counts as two requests of 125,682 bytes each.
  const tasks = await client.query<{ requests: string; byte_count: string }>(`select requests::text, byte_count::text from orbit_read_cost_daily_routes where day = $1 and route = 'GET /api/tasks'`, [d]);
  assert.deepEqual(tasks.rows[0], { requests: "2", byte_count: "251364" });
  const unattributed = await client.query(`select 1 from orbit_read_cost_daily_routes where day = $1 and route = '(none)' and source = 'unattributed'`, [d]);
  assert.equal(unattributed.rows.length, 1);
  assert.equal(first.recordedBytes, Number(expected.rows[0]!.bytes));

  const snapshot = async () => (await client.query(`select day::text, route, source, receipt_count, requests::text, query_count::text, row_count::text, byte_count::text, db_ms, max_request_bytes::text from orbit_read_cost_daily_routes where day = $1 order by route, source`, [d])).rows;
  const accountSnapshot = async () => (await client.query(`select account_id, requests::text, byte_count::text from orbit_read_cost_daily_accounts where day = $1 order by account_id`, [d])).rows;
  const before1 = await snapshot();
  const beforeAccounts = await accountSnapshot();
  await rollupReadCostDay(client, d);
  assert.deepEqual(await snapshot(), before1, "rerunning the same day is idempotent");
  assert.deepEqual(await accountSnapshot(), beforeAccounts);
});

test("SC-02 retention deletes receipts older than 14 days and rollups older than 1 year, keeps the rest", { skip, timeout: 60_000 }, async () => {
  await reset();
  await insertReceipts([
    { at: new Date(NOW.getTime() - 15 * DAY_MS).toISOString(), route: "GET /old", bytes: 1 },
    { at: new Date(NOW.getTime() - 14 * DAY_MS - 60_000).toISOString(), route: "GET /old", bytes: 1 },
    { at: new Date(NOW.getTime() - 13 * DAY_MS).toISOString(), route: "GET /kept", bytes: 1 },
    { at: new Date(NOW.getTime() - 60_000).toISOString(), route: "GET /kept", bytes: 1 },
  ]);
  for (const [d, route] of [[day(-366), "GET /old"], [day(-364), "GET /kept"]] as const) {
    await client.query(`insert into orbit_read_cost_daily_routes (day, route, source, receipt_count, requests, query_count, row_count, byte_count, db_ms, failed_query_count, response_bytes, max_request_bytes)
      values ($1,$2,'app',1,1,1,1,1,1,0,0,1)`, [d, route]);
    await client.query(`insert into orbit_read_cost_daily_accounts (day, account_id, receipt_count, requests, query_count, row_count, byte_count, db_ms) values ($1,$2,1,1,1,1,1,1)`, [d, route]);
    await client.query(`insert into orbit_read_cost_reconciliation (day, recorded_bytes, neon_status, computed_at) values ($1, 1, 'unavailable', now())`, [d]);
  }
  const result = await pass({});
  const outcome = result.tasks[0]!;
  assert.equal(outcome.status, "ok", JSON.stringify(outcome));
  assert.equal(outcome.summary?.receiptsDeleted, 2);
  assert.equal(outcome.summary?.rollupsDeleted, 2);
  const receipts = await client.query<{ route: string }>(`select route from orbit_read_receipts order by occurred_at`);
  assert.deepEqual(receipts.rows.map((r) => r.route), ["GET /kept", "GET /kept"]);
  const routes = await client.query<{ route: string }>(`select route from orbit_read_cost_daily_routes where day < $1`, [day(-300)]);
  assert.deepEqual(routes.rows.map((r) => r.route), ["GET /kept"]);
  const accounts = await client.query<{ account_id: string }>(`select account_id from orbit_read_cost_daily_accounts where day < $1`, [day(-300)]);
  assert.deepEqual(accounts.rows.map((r) => r.account_id), ["GET /kept"]);
  // Reconciliation rows are kept for ever.
  const recon = await client.query(`select 1 from orbit_read_cost_reconciliation where day in ($1, $2)`, [day(-366), day(-364)]);
  assert.equal(recon.rows.length, 2);
});

async function seedAlertScenario(): Promise<void> {
  // Seven history days: GET /api/dashboard averages 400 KB; GET /api/tasks 150 KB.
  const receipts: Receipt[] = [];
  for (let offset = -8; offset <= -2; offset++) {
    for (let i = 0; i < 3; i++) {
      receipts.push({ at: `${day(offset)}T0${i + 1}:00:00.000Z`, route: "GET /api/dashboard", account: OTHER, bytes: 400_000 });
      receipts.push({ at: `${day(offset)}T0${i + 1}:30:00.000Z`, route: "GET /api/tasks", account: OTHER, bytes: 150_000 });
    }
  }
  // Yesterday: dashboard doubles to 1 MB per request; tasks stays normal; one 6 MB contacts request.
  for (let i = 0; i < 3; i++) {
    receipts.push({ at: `${day(-1)}T0${i + 1}:00:00.000Z`, route: "GET /api/dashboard", account: OTHER, bytes: 1_000_000 });
    receipts.push({ at: `${day(-1)}T0${i + 1}:30:00.000Z`, route: "GET /api/tasks", account: OTHER, bytes: 160_000 });
  }
  receipts.push({ at: `${day(-1)}T09:00:00.000Z`, route: "GET /api/contacts", account: OTHER, bytes: 6 * MB });
  await insertReceipts(receipts);
}

test("SC-04 a doubled route and a 6 MB request alert once each in the admin inbox; reruns do not repeat", { skip, timeout: 90_000 }, async () => {
  await reset();
  await seedAlertScenario();
  const env = { ORBIT_READ_COST_ADMIN_ACCOUNT_IDS: ` ${ADMIN} ` };
  const first = await pass(env);
  assert.equal(first.tasks[0]!.status, "ok", JSON.stringify(first.tasks[0]));
  assert.equal(first.tasks[0]!.summary?.alertsRaised, 2);
  assert.equal(first.tasks[0]!.summary?.alertsDelivered, 2);

  const alerts = await client.query<{ rule: string; day: string; subject: string; notified: boolean }>(
    `select rule, day::text, subject, notified_at is not null as notified from orbit_read_cost_alerts order by rule`);
  assert.deepEqual(alerts.rows, [
    { rule: "large_request", day: day(-1), subject: "GET /api/contacts", notified: true },
    { rule: "route_average_spike", day: day(-1), subject: "GET /api/dashboard", notified: true },
  ]);

  const adminInbox = await inbox(ADMIN);
  const titles = adminInbox.items.map((n) => n.title).sort();
  assert.equal(adminInbox.items.length, 2, JSON.stringify(titles));
  assert.ok(titles.some((t) => t.includes("GET /api/dashboard")), JSON.stringify(titles));
  assert.ok(titles.some((t) => t.includes("GET /api/contacts")), JSON.stringify(titles));
  assert.ok(adminInbox.items.every((n) => n.kind === "update" && n.target.status === "available" && n.sources[0]!.sourceKind === "read_cost_alert"));
  assert.equal(adminInbox.unreadCount, 2);

  // Isolation: a non-admin account sees nothing.
  assert.equal((await inbox(OTHER)).items.length, 0);

  // Rerun (same day, and after a forced re-rollup) raises and delivers nothing new.
  const second = await pass(env);
  assert.equal(second.tasks[0]!.summary?.alertsRaised, 0);
  assert.equal(second.tasks[0]!.summary?.alertsDelivered, 0);
  await client.query(`delete from orbit_read_cost_reconciliation`);
  const third = await pass(env);
  assert.equal(third.tasks[0]!.summary?.alertsRaised, 0);
  assert.equal((await inbox(ADMIN)).items.length, 2);
  const count = await client.query<{ n: string }>(`select count(*)::text as n from orbit_records where collection_name = 'inboxNotifications'`);
  assert.equal(count.rows[0]!.n, "2");
});

test("alerts wait for a configured admin, then deliver; a removed admin no longer sees them", { skip, timeout: 90_000 }, async () => {
  await reset();
  await seedAlertScenario();
  const unconfigured = await pass({});
  assert.equal(unconfigured.tasks[0]!.summary?.alertsRaised, 2);
  assert.equal(unconfigured.tasks[0]!.summary?.alertsDelivered, 0);
  assert.equal(unconfigured.tasks[0]!.summary?.alertsPending, 2);
  const later = await pass({ ORBIT_READ_COST_ADMIN_ACCOUNT_IDS: ADMIN });
  assert.equal(later.tasks[0]!.summary?.alertsDelivered, 2);
  assert.equal((await inbox(ADMIN)).items.length, 2);
  // The inbox source check reads the same configuration: once the account is no
  // longer an admin its alerts are unavailable and leave the default list.
  process.env.ORBIT_READ_COST_ADMIN_ACCOUNT_IDS = "someone_else";
  try {
    assert.equal((await inbox(ADMIN)).items.length, 0);
  } finally {
    process.env.ORBIT_READ_COST_ADMIN_ACCOUNT_IDS = ADMIN;
  }
});

test("SC-05 Neon unconfigured records 'unavailable' with no number and no request; configured Neon gives coverage and a low-coverage alert", { skip, timeout: 90_000 }, async () => {
  await reset();
  await insertReceipts([{ at: `${day(-1)}T05:00:00.000Z`, route: "GET /api/tasks", account: OTHER, bytes: 600_000 }]);
  await pass({});
  const unavailable = await client.query(`select neon_status, neon_bytes, coverage, recorded_bytes::text from orbit_read_cost_reconciliation where day = $1`, [day(-1)]);
  assert.deepEqual(unavailable.rows[0], { neon_status: "unavailable", neon_bytes: null, coverage: null, recorded_bytes: "600000" });

  // Configured Neon: 1,000,000 bytes transferred against 600,000 recorded -> 60 % coverage.
  await reset();
  await insertReceipts([{ at: `${day(-1)}T05:00:00.000Z`, route: "GET /api/tasks", account: OTHER, bytes: 600_000 }]);
  const requested: string[] = [];
  const neon = (async (input: string | URL | Request, init?: RequestInit) => {
    requested.push(String(input));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer neon-test-key");
    return Response.json({ projects: [{ project_id: "proj-test", periods: [{ consumption: [{ timeframe_start: `${day(-1)}T00:00:00Z`, data_transfer_bytes: 1_000_000 }] }] }] });
  }) as typeof fetch;
  const env = { ORBIT_READ_COST_ADMIN_ACCOUNT_IDS: ADMIN, NEON_API_KEY: "neon-test-key", NEON_PROJECT_ID: "proj-test" };
  const result = await pass(env, neon);
  assert.equal(result.tasks[0]!.status, "ok", JSON.stringify(result.tasks[0]));
  assert.ok(requested.length >= 1 && requested.every((u) => u.startsWith("https://console.neon.tech/api/v2/consumption_history/projects?")));
  const ok = await client.query<{ neon_status: string; neon_bytes: string; coverage: number }>(`select neon_status, neon_bytes::text, coverage from orbit_read_cost_reconciliation where day = $1`, [day(-1)]);
  assert.deepEqual(ok.rows[0], { neon_status: "ok", neon_bytes: "1000000", coverage: 0.6 });
  const coverageAlerts = await client.query(`select subject from orbit_read_cost_alerts where rule = 'low_coverage' and day = $1`, [day(-1)]);
  assert.equal(coverageAlerts.rows.length, 1);
  assert.ok((await inbox(ADMIN)).items.some((n) => n.title.includes("60%")));

  // A failing Neon request records 'failed', not a number, and never fails the pass.
  await reset();
  await insertReceipts([{ at: `${day(-1)}T05:00:00.000Z`, route: "GET /api/tasks", bytes: 1 }]);
  const failing = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  const failed = await pass(env, failing);
  assert.equal(failed.tasks[0]!.status, "ok");
  const row = await client.query(`select neon_status, neon_bytes, coverage from orbit_read_cost_reconciliation where day = $1`, [day(-1)]);
  assert.deepEqual(row.rows[0], { neon_status: "failed", neon_bytes: null, coverage: null });
});

test("SC-03 admin API: unauthenticated 401, non-admin 403, admin sees days, top routes, top accounts and a 30-day trend", { skip, timeout: 60_000 }, async () => {
  await reset();
  await seedAlertScenario();
  await pass({ ORBIT_READ_COST_ADMIN_ACCOUNT_IDS: ADMIN });
  const env = { ORBIT_READ_COST_ADMIN_ACCOUNT_IDS: ADMIN };
  const make = (actor: string | null) => createReadCostAdminHandler({
    resolveActor: async () => (actor ? { id: actor } : null), env, client: () => client, now: () => NOW,
  });
  const request = new Request("http://localhost/api/admin/read-cost?route=GET%20%2Fapi%2Fdashboard");
  assert.equal((await make(null)(request)).status, 401);
  const forbidden = await make(OTHER)(request);
  assert.equal(forbidden.status, 403);
  assert.doesNotMatch(await forbidden.text(), /dashboard|account_/);
  const ok = await make(ADMIN)(request);
  assert.equal(ok.status, 200);
  const data = (await ok.json()).data;
  assert.equal(data.days.length, 7);
  assert.equal(data.days.at(-1).day, day(-1));
  assert.equal(data.days.at(-1).neonStatus, "unavailable");
  // 7-day totals: dashboard 6 x 3 x 400 KB + 3 x 1 MB, contacts one 6 MB request, tasks the rest.
  assert.deepEqual(data.topRoutes.map((r: { route: string }) => r.route), ["GET /api/dashboard", "GET /api/contacts", "GET /api/tasks"]);
  assert.equal(data.topRoutes[0].totalBytes, 18 * 400_000 + 3_000_000);
  assert.equal(data.topRoutes[1].maxRequestBytes, 6 * MB);
  assert.ok(data.topRoutes.length <= 20);
  assert.deepEqual(data.topAccounts.map((a: { accountId: string }) => a.accountId), [OTHER]);
  assert.equal(data.trend.route, "GET /api/dashboard");
  assert.equal(data.trend.points.length, 30);
  const last = data.trend.points.at(-1);
  assert.deepEqual({ day: last.day, requests: last.requests, avgBytes: last.avgBytes }, { day: day(-1), requests: 3, avgBytes: 1_000_000 });
  assert.equal(data.alerts.length, 2);
  // Admin configuration is required: with no admin configured everybody is refused.
  const none = createReadCostAdminHandler({ resolveActor: async () => ({ id: ADMIN }), env: {}, client: () => client, now: () => NOW });
  assert.equal((await none(request)).status, 403);
});
