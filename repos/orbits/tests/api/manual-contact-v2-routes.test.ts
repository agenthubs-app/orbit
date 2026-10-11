/** R12 手入力の路由：未登录 401、mock 全流程、live（注入 PostgreSQL 服务 / 未配置 503）、示例模式拦写、请求体严格。 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import {
  createManualContactCreateHandler,
  createManualContactDuplicatesHandler,
  createManualContactOrganizationsHandler,
  createManualContactUndoHandler,
  type ManualContactHandlerDeps,
} from "../../app/api/contacts/manual/handler";
import { createMemoryManualContactV2Storage, createPostgresManualContactV2Storage } from "../../features/contacts/manual-contact-v2/configured";
import { createManualContactV2Service } from "../../features/contacts/manual-contact-v2/service";
import { runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import { DEMO_ACTOR_ID } from "../../shared/mock/demo-world/fixtures";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresPool } from "../../shared/storage/transactional-postgres";
import { migrateConfiguredTestDatabase } from "../support/migrated-configured-database";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const actor = (id: string) => async () => ({ id });
const anonymous = async () => null;

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://test${path}`, { body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers }, method: "POST" });
}

async function read(response: Response): Promise<{ status: number; data: Record<string, unknown>; error: Record<string, unknown> | undefined }> {
  const body = (await response.json()) as { data?: Record<string, unknown>; error?: Record<string, unknown> };
  return { data: body.data ?? {}, error: body.error, status: response.status };
}

const undoContext = (contactId: string) => ({ params: Promise.resolve({ contactId }) });

function handlers(deps: ManualContactHandlerDeps) {
  return {
    create: createManualContactCreateHandler(deps),
    duplicates: createManualContactDuplicatesHandler(deps),
    organizations: createManualContactOrganizationsHandler(deps),
    undo: createManualContactUndoHandler(deps),
  };
}

test("every manual-contact route requires sign-in (401) and touches no storage", async () => {
  let touched = false;
  const service = new Proxy({}, { get() { touched = true; throw new Error("no service call expected"); } }) as never;
  const h = handlers({ mode: "mock", resolveActor: anonymous, service });
  const responses = [
    await h.create(post("/api/contacts/manual", { displayName: "A", idempotencyKey: "k" })),
    await h.duplicates(post("/api/contacts/manual/duplicates", { displayName: "A" })),
    await h.organizations(new Request("http://test/api/contacts/manual/organizations?q=a")),
    await h.undo(post("/api/contacts/manual/x/undo", {}), undoContext("x")),
  ];
  assert.deepEqual(responses.map((r) => r.status), [401, 401, 401, 401]);
  assert.equal(touched, false);
});

test("mock mode: create → duplicate review → organizations → undo, all contract-shaped", async () => {
  const service = createManualContactV2Service({ storage: createMemoryManualContactV2Storage() });
  const h = handlers({ mode: "mock", resolveActor: actor("actor:mock"), service });
  const created = await read(await h.create(post("/api/contacts/manual", { displayName: "山田 太郎", idempotencyKey: "m1", organization: "Acme" })));
  assert.equal(created.status, 201);
  assert.equal(created.data.outcome, "created");
  assert.equal(typeof created.data.undoUntil, "string");
  const contactId = String(created.data.contactId);

  const dup = await read(await h.duplicates(post("/api/contacts/manual/duplicates", { displayName: "山田太郎" })));
  assert.equal(dup.status, 200);
  assert.deepEqual((dup.data.candidates as Array<{ contactId: string; matchedOn: string[] }>).map((c) => [c.contactId, c.matchedOn]), [[contactId, ["name"]]]);

  const review = await read(await h.create(post("/api/contacts/manual", { displayName: "山田 太郎", idempotencyKey: "m2", organization: "Acme" })));
  assert.equal(review.status, 200);
  assert.equal(review.data.outcome, "duplicate_review");

  const orgs = await read(await h.organizations(new Request("http://test/api/contacts/manual/organizations?q=ac")));
  assert.deepEqual(orgs.data.organizations, [{ contactCount: 1, name: "Acme" }]);
  assert.deepEqual((await read(await h.organizations(new Request("http://test/api/contacts/manual/organizations")))).data.organizations, []);

  const undone = await read(await h.undo(post(`/api/contacts/manual/${encodeURIComponent(contactId)}/undo`, {}), undoContext(contactId)));
  assert.equal(undone.status, 200);
  assert.deepEqual(undone.data, { outcome: "undone" });
  const again = await read(await h.undo(post("/x", {}), undoContext(contactId)));
  assert.equal(again.status, 404);
});

test("request bodies are strict; an empty name or unknown key is a 400", async () => {
  const h = handlers({ mode: "mock", resolveActor: actor("actor:strict"), service: createManualContactV2Service({ storage: createMemoryManualContactV2Storage() }) });
  for (const body of [{ displayName: "  ", idempotencyKey: "k" }, { displayName: "A", idempotencyKey: "k", extra: 1 }, { displayName: "A" }, { displayName: "A", fieldChoices: { role: "incoming" }, idempotencyKey: "k" }]) {
    const res = await read(await h.create(post("/api/contacts/manual", body)));
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal((await h.duplicates(post("/d", { displayName: "A", note: "x" }))).status, 400);
});

test("sample mode: writes from the demo account or a sample screen are refused (403) before storage; reads still work", async () => {
  let writes = 0;
  const inner = createManualContactV2Service({ storage: createMemoryManualContactV2Storage() });
  const service = { ...inner, async create(...args: Parameters<typeof inner.create>) { writes++; return inner.create(...args); }, async undo(...args: Parameters<typeof inner.undo>) { writes++; return inner.undo(...args); } };
  const demo = handlers({ mode: "mock", resolveActor: actor(DEMO_ACTOR_ID), service });
  const blocked = await read(await demo.create(post("/api/contacts/manual", { displayName: "A", idempotencyKey: "s1" })));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.error?.code, "FORBIDDEN");
  assert.deepEqual(blocked.error?.context, { reason: "SAMPLE_READ_ONLY" });
  assert.equal((await demo.undo(post("/x", {}), undoContext("c"))).status, 403);
  assert.equal((await demo.duplicates(post("/d", { displayName: "A" }))).status, 200);
  const real = handlers({ mode: "mock", resolveActor: actor("actor:real"), service });
  assert.equal((await real.create(post("/api/contacts/manual", { displayName: "A", idempotencyKey: "s2" }, { "x-orbit-sample": "1" }))).status, 403);
  assert.equal(writes, 0);
});

test("idempotency conflict and undo-expired map to 409 with a reason", async () => {
  let now = new Date("2026-10-11T00:00:00.000Z");
  const h = handlers({ mode: "mock", resolveActor: actor("actor:c"), service: createManualContactV2Service({ now: () => now, storage: createMemoryManualContactV2Storage() }) });
  const created = await read(await h.create(post("/m", { displayName: "A", idempotencyKey: "c1" })));
  const conflict = await read(await h.create(post("/m", { displayName: "B", idempotencyKey: "c1" })));
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.error?.context, { reason: "IDEMPOTENCY_CONFLICT" });
  now = new Date("2026-10-11T00:11:00.000Z");
  const expired = await read(await h.undo(post("/u", {}), undoContext(String(created.data.contactId))));
  assert.equal(expired.status, 409);
  assert.deepEqual(expired.error?.context, { reason: "UNDO_EXPIRED" });
  assert.match(String(expired.error?.message), /^UNDO_EXPIRED/);
});

test("R12 review: replay after undo is 409 UNDONE; over-long ids are 400 before the service", async () => {
  const h = handlers({ mode: "mock", resolveActor: actor("actor:u"), service: createManualContactV2Service({ storage: createMemoryManualContactV2Storage() }) });
  const created = await read(await h.create(post("/m", { displayName: "A", idempotencyKey: "u1" })));
  assert.equal((await h.undo(post("/u", {}), undoContext(String(created.data.contactId)))).status, 200);
  const replay = await read(await h.create(post("/m", { displayName: "A", idempotencyKey: "u1" })));
  assert.equal(replay.status, 409);
  assert.deepEqual(replay.error?.context, { reason: "UNDONE" });
  const long = "x".repeat(201);
  assert.equal((await h.create(post("/m", { displayName: "A", idempotencyKey: "u2", mergeIntoContactId: long }))).status, 400);
  assert.equal((await h.create(post("/m", { displayName: "A", idempotencyKey: "u3", metContext: { eventId: long, kind: "event" } }))).status, 400);
  assert.equal((await h.undo(post("/u", {}), undoContext(long))).status, 400);
});

test("live mode without a configured database answers 503", async () => {
  const h = handlers({ mode: "live", resolveActor: actor("actor:live"), service: null });
  const res = await read(await h.create(post("/m", { displayName: "A", idempotencyKey: "l1" })));
  assert.equal(res.status, 503);
  assert.equal(res.error?.code, "SERVICE_UNAVAILABLE");
});

const schema = `manual_v2_api_${randomUUID().replaceAll("-", "")}`;
let admin: Pool | undefined;
let pool: Pool | undefined;

before(async () => {
  if (!databaseUrl) return;
  assertLoopbackDatabaseUrl(databaseUrl);
  await migrateConfiguredTestDatabase();
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const client = await pool.connect();
  try {
    await runOrbitRecordsMigration(client);
  } finally {
    client.release();
  }
  await runPlanMatchingMigrations(pool);
});

after(async () => {
  await pool?.end();
  await admin?.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
  await admin?.end();
});

test("live mode over PostgreSQL: create then undo through the routes", databaseTest, async () => {
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool: pool as unknown as TransactionalPostgresPool });
  const service = createManualContactV2Service({ storage: createPostgresManualContactV2Storage({ client, workspaceId: "workspace:api" }) });
  const h = handlers({ mode: "live", resolveActor: actor("actor:live"), service });
  const created = await read(await h.create(post("/m", { displayName: "Live Person", idempotencyKey: "live-1" })));
  assert.equal(created.status, 201);
  const contactId = String(created.data.contactId);
  assert.equal((await pool!.query(`select count(*)::int as n from plan_match_jobs`)).rows[0].n, 1);
  const undone = await read(await h.undo(post("/u", {}), undoContext(contactId)));
  assert.equal(undone.status, 200);
  assert.equal((await pool!.query(`select lifecycle_state from orbit_records where record_id = $1`, [contactId])).rows[0].lifecycle_state, "deleted");
  assert.equal((await pool!.query(`select count(*)::int as n from plan_match_jobs`)).rows[0].n, 0);
  const otherUser = handlers({ mode: "live", resolveActor: actor("actor:other"), service });
  assert.equal((await otherUser.undo(post("/u", {}), undoContext(contactId))).status, 404);
});
