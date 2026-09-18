import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

// Through the real configured wiring: a tiny read budget makes the contacts
// list fail closed with a reason, while account reads and writes keep working.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const A = "actor:a";
const NOW = "2026-09-18T07:00:00.000Z";

test("non-critical reads fail closed with a reason once the read budget is spent; critical reads and writes continue", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
  timeout: 120_000,
}, async (t) => {
  assert.ok(databaseUrl);
  const schema = `budget_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${schema}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  const keys = ["ORBIT_DATABASE_TARGET", "ORBIT_LOCAL_DATABASE_URL", "ORBIT_LOCAL_WORKSPACE_ID", "ORBIT_FEATURE_MODE", "ORBIT_MODULE_MODE", "ORBIT_READ_BUDGET_ROWS_PER_MINUTE", "ORBIT_READ_BUDGET_BYTES_PER_MINUTE"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    ORBIT_DATABASE_TARGET: "local", ORBIT_LOCAL_DATABASE_URL: scoped.toString(), ORBIT_LOCAL_WORKSPACE_ID: workspaceId,
    ORBIT_FEATURE_MODE: "live", ORBIT_READ_BUDGET_ROWS_PER_MINUTE: "100",
  });
  delete process.env.ORBIT_MODULE_MODE;
  delete process.env.ORBIT_READ_BUDGET_BYTES_PER_MINUTE;
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { const line = String(args[0]); if (line.includes('"read_budget_gate"')) warnings.push(line); else originalWarn(...args); };
  t.after(async () => {
    console.warn = originalWarn;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: scoped.toString(), max: 1 });
  t.after(() => pool.end());
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  const INSERT = `insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
    values ($1,$2,$3,$4,'manual','budget',$5::jsonb,$6,$6)`;
  const base = { source: { type: "manual", id: "budget" }, evidenceIds: ["evidence:seed"], createdAt: NOW, updatedAt: NOW };
  for (let n = 1; n <= 12; n += 1) {
    await pool.query(INSERT, [workspaceId, "contacts", `contact:${n}`, A, JSON.stringify({ ...base, id: `contact:${n}`, displayName: `Contact ${n}`, stage: "captured" }), NOW]);
    await pool.query(INSERT, [workspaceId, "connections", `connection:${n}`, A, JSON.stringify({ ...base, id: `connection:${n}`, contactId: `contact:${n}`, accountId: A, summary: "s", stage: "active", version: 1, valueTypes: [] }), NOW]);
  }
  await pool.query(INSERT, [workspaceId, "accounts", A, A, JSON.stringify({ id: A, displayName: "A" }), NOW]);

  const { createContactsGetHandler } = await import("../../app/api/contacts/handler");
  const { createTaskCollectionHandlers } = await import("../../app/api/tasks/collection-handler");
  const { createConfiguredPostgresLiveRecordStore } = await import("../../shared/storage/configured-live-record-store");
  const resolveActor = async () => ({ id: A, workspaceId });
  const contacts = createContactsGetHandler(resolveActor);
  const tasks = createTaskCollectionHandlers({ resolveActor, now: () => NOW });

  const first = await contacts(new Request("https://orbit.local/api/contacts"));
  assert.equal(first.status, 200, "the first list is served (one list is ~25 rows against a 100-row budget)");
  let rejected: Response | null = null;
  for (let attempt = 0; attempt < 10 && !rejected; attempt += 1) {
    const response = await contacts(new Request("https://orbit.local/api/contacts"));
    if (response.status === 503) rejected = response;
    else assert.equal(response.status, 200, `attempt ${attempt} within budget`);
  }
  assert.ok(rejected, "repeated lists must eventually exhaust the budget and fail closed");
  const body = await rejected.json() as { success: boolean; error: { code: string; message: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
  assert.match(body.error.message, /read budget exceeded: rows \d+\/100 in 60000ms window \(collection contacts\)/);
  assert.equal(warnings.length, 1, "one open transition logged");
  assert.match(warnings[0]!, /"state":"open"/);

  const configured = createConfiguredPostgresLiveRecordStore();
  assert.ok(configured);
  const accounts = await configured.store.listRecords({ workspaceId, collectionName: "accounts", limit: "unbounded" });
  assert.equal(accounts.length, 1, "critical account reads keep working while the gate is open");
  const created = await tasks.POST(new Request("https://orbit.local/api/tasks", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Still writable", category: "work", idempotencyKey: "budget:task:1" }),
  }));
  assert.equal(created.status, 201, "writes are never gated");
  await assert.rejects(async () => configured.store.listRecords({ workspaceId, collectionName: "contacts", limit: "unbounded" }), /read budget exceeded/);
});
