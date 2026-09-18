import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

// End-to-end through the real configured wiring: env points every configured
// service at one isolated schema, read metrics are captured from the console
// observer, and the six conditional routes are driven as HTTP handlers.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const A = "actor:a";
const B = "actor:b";
const NOW = "2026-09-18T05:00:00.000Z";

type Metric = { returnedRows: number; queryCount: number };

test("six GET routes answer 304 with one watermark row when nothing changed, and 200 the moment anything relevant does", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
  timeout: 120_000,
}, async (t) => {
  assert.ok(databaseUrl);
  const schema = `cond_routes_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${schema}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  const previous = Object.fromEntries(["ORBIT_DATABASE_TARGET", "ORBIT_LOCAL_DATABASE_URL", "ORBIT_LOCAL_WORKSPACE_ID", "ORBIT_FEATURE_MODE", "ORBIT_MODULE_MODE", "ORBIT_PG_READ_METRICS", "ORBIT_READ_ETAG_VERSION"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    ORBIT_DATABASE_TARGET: "local", ORBIT_LOCAL_DATABASE_URL: scoped.toString(), ORBIT_LOCAL_WORKSPACE_ID: workspaceId,
    ORBIT_FEATURE_MODE: "live", ORBIT_PG_READ_METRICS: "1", ORBIT_READ_ETAG_VERSION: "test-v1",
  });
  delete process.env.ORBIT_MODULE_MODE;
  const metrics: Metric[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    const line = typeof args[0] === "string" ? args[0] : "";
    if (line.includes('"postgres_read_metric"')) { metrics.push(JSON.parse(line)); return; }
    originalInfo(...args);
  };
  t.after(async () => {
    console.info = originalInfo;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: scoped.toString(), max: 1 });
  t.after(() => pool.end());
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  const INSERT = `insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
    values ($1,$2,$3,$4,'manual','cond',$5::jsonb,$6,$6)`;
  const seedContact = async (owner: string, id: string, at: string) => {
    const base = { source: { type: "manual", id: "cond" }, evidenceIds: ["evidence:seed"], createdAt: at, updatedAt: at };
    await pool.query(INSERT, [workspaceId, "contacts", id, owner, JSON.stringify({ ...base, id, displayName: `Contact ${id}`, stage: "captured" }), at]);
    await pool.query(INSERT, [workspaceId, "connections", `connection:${id}`, owner, JSON.stringify({ ...base, id: `connection:${id}`, contactId: id, accountId: owner, summary: "s", stage: "active", version: 1, valueTypes: [] }), at]);
  };
  await seedContact(A, "contact:a:1", NOW);
  await seedContact(B, "contact:b:1", NOW);

  const { createTaskCollectionHandlers } = await import("../../app/api/tasks/collection-handler");
  const { createNoteCollectionHandlers } = await import("../../app/api/notes/collection-handler");
  const { createScheduleItemsGetHandler } = await import("../../app/api/schedule-items/handler");
  const { createContactsGetHandler } = await import("../../app/api/contacts/handler");
  const { createEventsRouteHandlers } = await import("../../app/api/events/handler");
  const { createConnectionsGetHandler } = await import("../../app/api/connections/handler");
  const { createConfiguredTaskService } = await import("../../features/tasks/service-factory");
  const resolveActor = async () => ({ id: A, workspaceId });
  const tasks = createTaskCollectionHandlers({ resolveActor, now: () => NOW });
  const notes = createNoteCollectionHandlers({ resolveActor, now: () => NOW });
  const routes: Record<string, (request: Request) => Promise<Response>> = {
    "/api/tasks": tasks.GET,
    "/api/notes": notes.GET,
    "/api/schedule-items?scope=personal": createScheduleItemsGetHandler({ resolveActor }),
    "/api/contacts": createContactsGetHandler(resolveActor),
    "/api/events": createEventsRouteHandlers(resolveActor).GET,
    "/api/connections": createConnectionsGetHandler(resolveActor),
  };
  // Seed one task through the real service so the private domain is non-empty.
  await createConfiguredTaskService().create({ actorId: A, title: "First", category: "work", idempotencyKey: "cond:task:1", now: NOW });

  const call = (path: string, etag?: string) => routes[path]!(new Request(`https://orbit.local${path}`, etag ? { headers: { "If-None-Match": etag } } : undefined));
  const etags: Record<string, string> = {};
  for (const path of Object.keys(routes)) {
    const first = await call(path);
    assert.equal(first.status, 200, `${path} first read`);
    const etag = first.headers.get("ETag");
    assert.match(etag ?? "", /^W\/"[a-f0-9]{64}"$/, `${path} carries a weak ETag`);
    assert.equal(first.headers.get("Cache-Control"), "private, no-cache");
    etags[path] = etag!;

    metrics.length = 0;
    const second = await call(path, etag!);
    assert.equal(second.status, 304, `${path} unchanged → 304`);
    assert.equal(await second.text(), "", `${path} 304 has no body`);
    assert.equal(metrics.length, 1, `${path}: exactly one SQL read on a 304 (got ${metrics.length})`);
    assert.equal(metrics[0]!.returnedRows, 1, `${path}: the watermark is one row`);
  }

  // A's own write moves A's task ETag; B's task write does not (private domain).
  await createConfiguredTaskService().create({ actorId: B, title: "B", category: "work", idempotencyKey: "cond:task:b", now: NOW });
  assert.equal((await call("/api/tasks", etags["/api/tasks"])).status, 304, "B's task must not invalidate A's task list");
  await createConfiguredTaskService().create({ actorId: A, title: "Second", category: "work", idempotencyKey: "cond:task:2", now: "2026-09-18T05:01:00.000Z" });
  const changed = await call("/api/tasks", etags["/api/tasks"]);
  assert.equal(changed.status, 200, "A's write invalidates A's task list");
  assert.notEqual(changed.headers.get("ETag"), etags["/api/tasks"]);
  etags["/api/tasks"] = changed.headers.get("ETag")!;

  // A workspace-wide contact write invalidates contacts and events, not the private task list.
  await seedContact(B, "contact:b:2", "2026-09-18T05:02:00.000Z");
  assert.equal((await call("/api/contacts", etags["/api/contacts"])).status, 200, "contacts see the new contact");
  assert.equal((await call("/api/events", etags["/api/events"])).status, 200, "events depend on contacts");
  assert.equal((await call("/api/connections", etags["/api/connections"])).status, 200, "connections depend on contacts");
  assert.equal((await call("/api/tasks", etags["/api/tasks"])).status, 304, "private task list untouched by contacts");
  for (const path of ["/api/contacts", "/api/events", "/api/connections"]) etags[path] = (await call(path)).headers.get("ETag")!;

  // An authorization collection write invalidates every route.
  await pool.query(INSERT, [workspaceId, "permissions", "permission:1", "actor:admin", JSON.stringify({ id: "permission:1" }), "2026-09-18T05:03:00.000Z"]);
  for (const path of Object.keys(routes)) {
    const response = await call(path, etags[path]);
    assert.equal(response.status, 200, `${path}: authorization change must invalidate`);
    etags[path] = response.headers.get("ETag")!;
  }

  // A code version change invalidates every route; the query string is part of the identity.
  process.env.ORBIT_READ_ETAG_VERSION = "test-v2";
  assert.equal((await call("/api/tasks", etags["/api/tasks"])).status, 200, "version change invalidates");
  const filtered = await routes["/api/tasks"]!(new Request("https://orbit.local/api/tasks?status=open"));
  assert.notEqual(filtered.headers.get("ETag"), (await call("/api/tasks")).headers.get("ETag"), "query string differentiates ETags");
});
