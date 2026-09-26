// Loads Next's request stores with AsyncLocalStorage installed; must stay first.
import { nextRequestScope } from "../support/next-request-scope";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import { resolveAuthenticatedApiActorFromSession } from "../../app/api/_shared/authenticated-actor";
import { createContactsGetHandler } from "../../app/api/contacts/handler";
import { createEventsRouteHandlers } from "../../app/api/events/handler";
import { createNoteCollectionHandlers } from "../../app/api/notes/collection-handler";
import { createTaskCollectionHandlers } from "../../app/api/tasks/collection-handler";
import { installConfiguredReadReceipts } from "../../shared/observability/read-receipts-configured";
import { accountFingerprint } from "../../shared/observability/read-receipts-sink";
import { meterPostgresPool } from "../../shared/storage/metered-postgres-pool";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { seedReadCostChains } from "../performance/read-cost-chains";
import { createReadCostLedger, type ReadCost } from "../performance/read-cost-ledger";

/**
 * Read receipts against a real PostgreSQL schema: real migration, real
 * pools, real services and route handlers, and the production receipt wiring
 * (`installConfiguredReadReceipts`) writing real `orbit_read_receipts` rows.
 * Only the Next server itself (its request stores) and the Auth.js cookie
 * decoding are stood in for.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const ACTOR_ID = "account_orbit_generated";
const SESSION_USER_ID = "profile_orbit_generated_operator";
const APP_HEADERS = { "x-orbit-request-method": "GET", "user-agent": "Orbit/1 CFNetwork/1568 Darwin/24.0.0" };

interface ReceiptRow {
  route: string | null;
  source: string;
  account_id: string | null;
  query_count: number;
  row_count: string;
  byte_count: string;
  failed_query_count: number;
}

const schema = `read_receipts_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:read-receipts:${schema}`;
let admin: Pool;
let scoped: Pool;
let client: TransactionalPostgresClient;
let chains: Record<string, () => Promise<unknown>>;
const ledger = createReadCostLedger();
const logs: string[] = [];
const warnings: string[] = [];
const originalInfo = console.info;
const originalWarn = console.warn;
const envKeys = ["ORBIT_READ_RECEIPTS", "ORBIT_FEATURE_MODE", "ORBIT_DATABASE_TARGET", "ORBIT_LOCAL_DATABASE_URL", "ORBIT_LOCAL_WORKSPACE_ID", "ORBIT_PG_READ_METRICS"] as const;
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function scopedUrl(): string {
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

async function receiptRows(where = "true", values: unknown[] = []): Promise<ReceiptRow[]> {
  return (await scoped.query<ReceiptRow>(
    `select route, source, account_id, query_count, row_count, byte_count, failed_query_count
       from orbit_read_receipts where ${where} order by id`,
    values,
  )).rows;
}

function asCost(row: ReceiptRow): ReadCost {
  return { queries: row.query_count, rows: Number(row.row_count), bytes: Number(row.byte_count) };
}

/** Sums the per-query metric lines (ORBIT_PG_READ_METRICS=1), the pre-existing independent accounting path. */
function perQueryLogTotal(lines: readonly string[]): ReadCost {
  const total: ReadCost = { queries: 0, rows: 0, bytes: 0 };
  for (const line of lines) {
    const parsed = JSON.parse(line) as { event?: string; returnedRows: number; approximateSerializedRowBytes: number };
    if (parsed.event !== "postgres_read_metric") continue;
    total.queries += 1;
    total.rows += parsed.returnedRows;
    total.bytes += parsed.approximateSerializedRowBytes;
  }
  return total;
}

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  // Receipts are on as in the Next server; the configured runtime points at this schema.
  Object.assign(process.env, {
    ORBIT_READ_RECEIPTS: "1",
    ORBIT_FEATURE_MODE: "live",
    ORBIT_DATABASE_TARGET: "local",
    ORBIT_LOCAL_DATABASE_URL: scopedUrl(),
    ORBIT_LOCAL_WORKSPACE_ID: workspaceId,
    // Configured clients also emit the per-query metric line; the measured
    // test client uses an explicit ledger observer and does not.
    ORBIT_PG_READ_METRICS: "1",
  });
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  scoped = new Pool({ connectionString: scopedUrl(), max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool, readMetrics: ledger.observer });
  // The production migration entry point creates orbit_read_receipts.
  await runOrbitRecordsMigration(client);
  chains = await seedReadCostChains({ client, databaseUrl: databaseUrl!, schema, workspaceId, actorId: ACTOR_ID });
  console.info = (line?: unknown) => void logs.push(String(line));
  console.warn = (line?: unknown) => void warnings.push(String(line));
  assert.equal(installConfiguredReadReceipts(process.env), true);
}, { timeout: 180_000 });

after(async () => {
  console.info = originalInfo;
  console.warn = originalWarn;
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (skip) return;
  try { await client.close(); } catch { /* already closed */ }
  try { await scoped.end(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

test("each read-cost ledger chain yields one receipt row whose queries, rows and bytes equal the ledger", { skip, timeout: 120_000 }, async () => {
  const routes: Record<string, string> = {
    "contacts.list": "/api/contacts",
    "tasks.list": "/api/tasks",
    "notes.list": "/api/notes",
    "dashboard": "/api/dashboard",
    "contacts.dashboard": "/api/mobile/contacts-dashboard",
    "events.list": "/api/events",
  };
  for (const [chain, run] of Object.entries(chains)) {
    const scope = nextRequestScope(routes[chain]!, APP_HEADERS);
    const { cost } = await ledger.measure(chain, () => scope.run(run));
    assert.equal(scope.afterTasks.length, 1, `${chain}: one after() registration`);
    await scope.runAfter();
    const rows = await receiptRows("route = $1", [`GET ${routes[chain]}`]);
    assert.equal(rows.length, 1, `${chain}: exactly one receipt row`);
    assert.equal(rows[0]!.source, "app");
    assert.deepEqual(asCost(rows[0]!), cost, `${chain}: receipt equals the ledger measurement`);
  }
});

test("real route handlers: receipts carry route, account and totals equal to the per-query metric log", { skip, timeout: 120_000 }, async () => {
  const resolveActor = () => resolveAuthenticatedApiActorFromSession({ userId: SESSION_USER_ID });
  const handlers: Record<string, (request: Request) => Promise<Response>> = {
    "/api/tasks": createTaskCollectionHandlers({ resolveActor }).GET,
    "/api/notes": createNoteCollectionHandlers({ resolveActor }).GET,
    "/api/contacts": createContactsGetHandler(resolveActor),
    "/api/events": createEventsRouteHandlers(resolveActor).GET,
  };
  await scoped.query("delete from orbit_read_receipts");
  for (const [route, handler] of Object.entries(handlers)) {
    const from = logs.length;
    const scope = nextRequestScope(route, APP_HEADERS);
    const response = await scope.run(() => handler(new Request(`http://orbit.test${route}`)));
    assert.equal(response.status, 200, `${route} ${await response.clone().text()}`);
    await scope.runAfter();
    const lines = logs.slice(from);
    const rows = await receiptRows("route = $1", [`GET ${route}`]);
    assert.equal(rows.length, 1, `${route}: one receipt row`);
    assert.equal(rows[0]!.account_id, ACTOR_ID, `${route}: raw account id stays in the database row`);
    assert.deepEqual(asCost(rows[0]!), perQueryLogTotal(lines), `${route}: receipt equals the per-query log`);
    assert.ok(rows[0]!.query_count >= 2, `${route}: identity resolution and the list read are both counted`);
    const receiptLine = lines.map((line) => JSON.parse(line) as Record<string, unknown>).find((line) => line.event === "read_receipt");
    assert.ok(receiptLine, `${route}: one receipt log line`);
    assert.equal(receiptLine.account, accountFingerprint(ACTOR_ID));
    assert.ok(!lines.some((line) => line.includes(ACTOR_ID)), `${route}: raw account id never reaches the log`);
  }
});

test("a failing receipt insert leaves the route's status and body unchanged and only warns", { skip, timeout: 60_000 }, async () => {
  const handler = createTaskCollectionHandlers({
    resolveActor: () => resolveAuthenticatedApiActorFromSession({ userId: SESSION_USER_ID }),
  }).GET;
  const call = async () => {
    const scope = nextRequestScope("/api/tasks", APP_HEADERS);
    const response = await scope.run(() => handler(new Request("http://orbit.test/api/tasks")));
    const result = { status: response.status, body: await response.text() };
    await scope.runAfter();
    return result;
  };
  await scoped.query("delete from orbit_read_receipts");
  const healthy = await call();
  assert.equal((await receiptRows()).length, 1);

  const warningsBefore = warnings.length;
  await admin.query(`alter table ${schema}.orbit_read_receipts rename to orbit_read_receipts_off`);
  try {
    const broken = await call();
    assert.deepEqual(broken, healthy, "status and body are identical while the receipt insert fails");
    const newWarnings = warnings.slice(warningsBefore).map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.deepEqual(newWarnings, [{ event: "read_receipt_write_failed", error: "42P01" }]);
  } finally {
    await admin.query(`alter table ${schema}.orbit_read_receipts_off rename to orbit_read_receipts`);
  }
  const recovered = await call();
  assert.deepEqual(recovered, healthy);
  assert.equal((await receiptRows()).length, 2, "receipts resume once the table is back");
});

test("a feature pool wrapped by meterPostgresPool is measured through a real connection; reads outside any request are unattributed", { skip, timeout: 60_000 }, async () => {
  await scoped.query("delete from orbit_read_receipts");
  const pool = meterPostgresPool(new Pool({ connectionString: scopedUrl(), max: 1 }));
  try {
    const scope = nextRequestScope("/api/probe/[id]", APP_HEADERS);
    await scope.run(async () => {
      await pool.query("select generate_series(1, 3) as n");
      const connection = await pool.connect();
      try {
        await connection.query("select generate_series(1, 2) as n");
      } finally {
        connection.release();
      }
    });
    await scope.runAfter();
    const [row] = await receiptRows("route = $1", ["GET /api/probe/[id]"]);
    assert.ok(row);
    assert.deepEqual(asCost(row), { queries: 2, rows: 5, bytes: Buffer.byteLength('{"n":1}') * 5 });

    await pool.query("select 1 as background");
    const { flushUnattributedReadReceipts } = await import("../../shared/observability/read-receipts");
    await flushUnattributedReadReceipts();
    const unattributed = await receiptRows("source = 'unattributed'");
    assert.equal(unattributed.length, 1);
    assert.equal(unattributed[0]!.route, null);
    assert.ok(unattributed[0]!.query_count >= 1);
  } finally {
    await pool.end();
  }
});
