import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { createSyncDomainHandlers } from "../../app/api/sync/domain-handlers";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import { SYNC_REVISION_MIGRATION_SQL } from "../../features/sync/migrations";
import { domainManifestSchema, domainPageSchema, offlineReadEnvelopeSchema } from "../../shared/api-schema/universal-read";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";

// Three-layer topology, server side: the host holds A and B; grants, manifests
// and domain pages are issued per authenticated actor from real rows.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 60_000 };
const W = "workspace:domain-topology";
const A = "actor:a";
const B = "actor:b";
const NOW = "2026-09-18T09:00:00.000Z";
const SECRET = "domain-topology-test-secret-0123456789abcdef0123";
const INSERT = `insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
  values ($1,$2,$3,$4,'manual','topology',$5::jsonb,$6,$6)`;

async function host(t: TestContext) {
  assert.ok(databaseUrl);
  const schema = `domain_topology_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(SYNC_REVISION_MIGRATION_SQL);
  const identity = async (actor: string, at: string) => {
    await client.query(INSERT, [W, "auth_users", `auth_user:${actor}`, actor, JSON.stringify({ id: actor, email: `${actor}@example.test` }), at]);
    await client.query(INSERT, [W, "accounts", actor, actor, JSON.stringify({ id: actor }), at]);
  };
  // Canonical payloads come from the real repository (memory store) and are written under the sync lock.
  const taskUnderLock = async (owner: string, id: string, at: string): Promise<string> => {
    const memory = createMemoryLiveRecordStore<Record<string, unknown>>();
    const created = await createTaskService({ repository: createTaskRepository({ store: memory, workspaceId: W }) })
      .create({ actorId: owner, title: id, category: "work", idempotencyKey: `k:${id}`, now: at });
    const record = memory.listRecords({ workspaceId: W, collectionName: "tasks", limit: "unbounded" }).find((row) => row.recordId === created.task.id)!;
    // The row id must equal the canonical task id: the sync mapper refuses mismatches.
    await client.transaction(async (tx: TransactionalSqlExecutor) => {
      await tx.query("select orbit_records_acquire_sync_write_lock('tasks')");
      await tx.query(INSERT, [W, "tasks", record.recordId, owner, JSON.stringify(record.payload), at]);
    });
    return record.recordId;
  };
  await identity(A, NOW); await identity(B, NOW);
  const aIds: string[] = [];
  const bIds: string[] = [];
  for (let n = 1; n <= 4; n += 1) aIds.push(await taskUnderLock(A, `task:a:${n}`, NOW));
  for (let n = 1; n <= 2; n += 1) bIds.push(await taskUnderLock(B, `task:b:${n}`, NOW));
  const service = createDomainReadService({ client, cursorSecret: SECRET, now: () => NOW });
  // Every SQL statement the manifest path issues, so a test can prove "unchanged" reads no business row.
  const sql: string[] = [];
  const recording = { query: <T,>(text: string, values?: readonly unknown[]) => { sql.push(text); return client.query<T>(text, values); } };
  const handlersFor = (actor: string) => createSyncDomainHandlers({
    resolveActor: async () => ({ id: actor, userId: actor, workspaceId: W }), createService: () => service, now: () => Date.parse(NOW),
    conditionalRead: { client: recording, workspaceId: W, version: "topology-test" },
  });
  const json = async <T,>(response: Response) => (await response.json()) as { success: boolean; data: T; error?: { code: string; context?: Record<string, unknown> } };
  return { client, taskUnderLock, handlersFor, json, aIds, bIds, sql };
}

test("grants, manifest and domain pages are per actor: A never sees B, B cannot use A's cursor", options, async (t) => {
  const h = await host(t);
  const a = h.handlersFor(A);
  const lease = offlineReadEnvelopeSchema.parse((await h.json(await a.lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local")))).data);
  assert.equal(lease.actorId, A);
  assert.equal(lease.grants.length, 3);
  const manifest = domainManifestSchema.parse((await h.json(await a.manifest(new Request("https://orbit.local/api/sync/manifest")))).data);
  const tasks = manifest.domains.find((domain) => domain.domainId === "tasks")!;
  assert.equal(tasks.authorizationEpoch, lease.grants.find((grant) => grant.domainId === "tasks")!.authorizationEpoch);
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const response = await a.domain(new Request(`https://orbit.local/api/sync/domains/tasks?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), "tasks");
    assert.equal(response.status, 200);
    const data = domainPageSchema.parse((await h.json(response)).data);
    ids.push(...data.changes.map((change) => change.id));
    for (const change of data.changes) assert.equal((change.payload as { accountId: string }).accountId, A, "the mapped sync payload carries the owner");
    cursor = data.nextCursor;
    if (!data.hasMore) break;
  }
  assert.deepEqual(ids, h.aIds, "A's pages contain exactly A's canonical tasks in revision order");
  assert.ok(ids.every((id) => !h.bIds.includes(id)));
  const bWithACursor = await h.handlersFor(B).domain(new Request(`https://orbit.local/api/sync/domains/tasks?cursor=${encodeURIComponent(cursor!)}`), "tasks");
  assert.equal(bWithACursor.status, 409, "A's cursor presented by B is a reset, never a page");
  const bManifest = domainManifestSchema.parse((await h.json(await h.handlersFor(B).manifest(new Request("https://orbit.local/api/sync/manifest")))).data);
  assert.notEqual(bManifest.domains.find((domain) => domain.domainId === "tasks")!.watermark, tasks.watermark, "B's watermark is B's own");
});

test("an authorization change rotates the epoch (old cursor → reset); revocation removes grants and refuses pages", options, async (t) => {
  const h = await host(t);
  const a = h.handlersFor(A);
  const first = domainPageSchema.parse((await h.json(await a.domain(new Request("https://orbit.local/api/sync/domains/tasks"), "tasks"))).data);
  assert.equal(first.hasMore, false);
  // A permission row for A changes A's epoch; B's epoch is untouched.
  const bEpoch = offlineReadEnvelopeSchema.parse((await h.json(await h.handlersFor(B).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local")))).data).grants[0]!.authorizationEpoch;
  await h.client.query(INSERT, [W, "permissions", "permission:a:1", A, JSON.stringify({ id: "permission:a:1" }), "2026-09-18T09:05:00.000Z"]);
  const stale = await a.domain(new Request(`https://orbit.local/api/sync/domains/tasks?cursor=${encodeURIComponent(first.nextCursor)}`), "tasks");
  assert.equal(stale.status, 409);
  assert.equal((await h.json(stale)).error?.context?.syncErrorCode, "SYNC_RESET_REQUIRED");
  const rebuilt = domainPageSchema.parse((await h.json(await a.domain(new Request("https://orbit.local/api/sync/domains/tasks"), "tasks"))).data);
  assert.notEqual(rebuilt.authorizationEpoch, first.authorizationEpoch);
  assert.equal(rebuilt.changes.length, 4, "a fresh pull under the new epoch is a full rebuild");
  assert.equal(offlineReadEnvelopeSchema.parse((await h.json(await h.handlersFor(B).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local")))).data).grants[0]!.authorizationEpoch, bEpoch, "B's epoch is unaffected by A's authorization change");
  // Revocation: soft-delete A's identity rows.
  await h.client.query("update orbit_records set lifecycle_state = 'deleted', deleted_at = $2, updated_at = $2 where workspace_id = $1 and user_id = $3 and collection_name in ('auth_users', 'accounts')", [W, "2026-09-18T09:10:00.000Z", A]);
  const revokedLease = offlineReadEnvelopeSchema.parse((await h.json(await a.lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local")))).data);
  assert.deepEqual(revokedLease.grants, [], "no grants after revocation");
  assert.deepEqual(domainManifestSchema.parse((await h.json(await a.manifest(new Request("https://orbit.local/api/sync/manifest")))).data).domains, []);
  const refused = await a.domain(new Request("https://orbit.local/api/sync/domains/tasks"), "tasks");
  assert.equal(refused.status, 403);
  assert.equal((await h.json(refused)).error?.context?.syncErrorCode, "SYNC_NOT_AUTHORIZED");
  // B keeps working.
  assert.equal((await h.handlersFor(B).domain(new Request("https://orbit.local/api/sync/domains/tasks"), "tasks")).status, 200);
});

test("an unchanged manifest is a 304 from one watermark row; a new task under the lock moves the watermark and the ETag", options, async (t) => {
  const h = await host(t);
  const a = h.handlersFor(A);
  const first = await a.manifest(new Request("https://orbit.local/api/sync/manifest"));
  assert.equal(first.status, 200);
  const etag = first.headers.get("ETag")!;
  assert.ok(etag.startsWith("W/\""));
  const before = domainManifestSchema.parse((await h.json(first)).data).domains.find((entry) => entry.domainId === "tasks")!.watermark;

  h.sql.length = 0;
  const unchanged = await a.manifest(new Request("https://orbit.local/api/sync/manifest", { headers: { "If-None-Match": etag } }));
  assert.equal(unchanged.status, 304);
  assert.deepEqual(h.sql.map((text) => (text.includes("domain:watermark:user") ? "watermark" : "business")), ["watermark"], "304 costs exactly one watermark statement and no business read");

  await h.taskUnderLock(A, "task:a:5", "2026-09-18T09:20:00.000Z");
  const changed = await a.manifest(new Request("https://orbit.local/api/sync/manifest", { headers: { "If-None-Match": etag } }));
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("ETag"), etag);
  const after = domainManifestSchema.parse((await h.json(changed)).data).domains.find((entry) => entry.domainId === "tasks")!.watermark;
  assert.ok(BigInt(after) > BigInt(before), "the tasks watermark advanced with the new row");

  // B's own manifest is unaffected by A's write only in content, not in ETag semantics: B gets its own ETag.
  const b = await h.handlersFor(B).manifest(new Request("https://orbit.local/api/sync/manifest", { headers: { "If-None-Match": etag } }));
  assert.equal(b.status, 200, "A's ETag never validates B's manifest");
});
