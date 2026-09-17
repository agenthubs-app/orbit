import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createHash } from "node:crypto";
import type { DomainPage, ReadScope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase, type LocalSyncDatabase, type LocalSyncSqlValue } from "../src/data/sync/local-sync-database";
import { createLocalSyncRepository } from "../src/data/sync/local-sync-repository";

class ReadTestDatabase implements LocalSyncDatabase {
  readonly raw = new DatabaseSync(":memory:");
  failOn: string | null = null;
  private check(sql: string) { if (this.failOn && sql.includes(this.failOn)) { this.failOn = null; throw Error("injected storage failure"); } }
  async execute(sql: string) { this.check(sql); this.raw.exec(sql); }
  async run(sql: string, params: readonly LocalSyncSqlValue[] = []) { this.check(sql); return { changes: Number(this.raw.prepare(sql).run(...params).changes) }; }
  async get<T>(sql: string, params: readonly LocalSyncSqlValue[] = []): Promise<T | null> { this.check(sql); return (this.raw.prepare(sql).get(...params) as T) ?? null; }
  async all<T>(sql: string, params: readonly LocalSyncSqlValue[] = []): Promise<T[]> { this.check(sql); return this.raw.prepare(sql).all(...params) as T[]; }
  async transaction<T>(work: () => Promise<T>): Promise<T> { this.raw.exec("BEGIN IMMEDIATE"); try { const result = await work(); this.raw.exec("COMMIT"); return result; } catch (error) { this.raw.exec("ROLLBACK"); throw error; } }
}

const baseUrl = "https://fixture.example";
const scope: ReadScope = { baseUrl, actorId: "a", workspaceId: "w", domainId: "notes", authorizationEpoch: "e1" };
function page(overrides: Partial<DomainPage> = {}): DomainPage { return { domainId: "notes", authorizationEpoch: "e1", schemaVersion: 1, registryVersion: 1, changes: [{ id: "r", revision: "r1", operation: "upsert", payload: { title: "one" } }], nextCursor: "c1", highWatermark: "r1", hasMore: false, generation: "g1", serverTime: "2026-09-16T00:00:00Z", ...overrides }; }
async function fixture(t: { after(fn: () => void): void }) {
  const db = new ReadTestDatabase(); t.after(() => db.raw.close()); await initializeLocalSyncDatabase(db);
  const scopes = [scope, { ...scope, domainId: "tasks" }, { ...scope, workspaceId: "w2" }, { ...scope, authorizationEpoch: "e2" }];
  // Runtime port expectations also make this test runnable before the new methods exist.
  const repo = createLocalSyncRepository({ actorId: "a", database: db, baseUrl, registeredDomainIds: ["notes", "tasks"], activeReadScopes: () => scopes, hashPayload: async json => createHash("sha256").update(json).digest("hex") }) as ReturnType<typeof createLocalSyncRepository> & {
    applyDomainPage(scope: ReadScope, page: DomainPage): Promise<void>;
    resetDomain(scope: ReadScope): Promise<void>;
  };
  return { db, scopes, repo };
}

test("independent domain and epoch cursors coexist in the replacement schema", async t => {
  const { db } = await fixture(t);
  await db.run("INSERT INTO sync_cursors(workspace_id,domain_id,authorization_epoch,cursor,last_successful_sync_at,bootstrap_state,completeness,generation) VALUES(?,?,?,?,?,?,?,?)", ["w", "notes", "e1", "n", "2026-09-16T00:00:00Z", "complete", "complete", "g"]);
  await db.run("INSERT INTO sync_cursors(workspace_id,domain_id,authorization_epoch,cursor,last_successful_sync_at,bootstrap_state,completeness,generation) VALUES(?,?,?,?,?,?,?,?)", ["w", "tasks", "e1", "t", "2026-09-16T00:00:00Z", "complete", "complete", "g"]);
  await db.run("INSERT INTO sync_cursors(workspace_id,domain_id,authorization_epoch,cursor,last_successful_sync_at,bootstrap_state,completeness,generation) VALUES(?,?,?,?,?,?,?,?)", ["w", "notes", "e2", "n2", "2026-09-16T00:00:00Z", "complete", "complete", "g"]);
  assert.equal((await db.all("SELECT * FROM sync_cursors")).length, 3);
});

test("page plus cursor roll back together, reset isolates workspace domain epoch and preserves local evidence", async t => {
  const { db, scopes, repo } = await fixture(t);
  for (const s of scopes) await repo.applyDomainPage(s, page({ domainId: s.domainId, authorizationEpoch: s.authorizationEpoch }));
  db.failOn = "INSERT INTO sync_cursors";
  await assert.rejects(repo.applyDomainPage(scope, page({ changes: [{ id: "new", revision: "r2", operation: "upsert", payload: {} }], nextCursor: "c2" })), /injected storage failure/);
  assert.equal((await db.all("SELECT * FROM sync_records WHERE record_id='new'")).length, 0);
  assert.equal((await db.get<{ cursor: string }>("SELECT cursor FROM sync_cursors WHERE workspace_id='w' AND domain_id='notes' AND authorization_epoch='e1'"))?.cursor, "c1");
  await db.run("UPDATE sync_records SET sync_state='conflicted',payload_json=? WHERE workspace_id='w' AND domain_id='notes' AND authorization_epoch='e1'", [' { "draft": true } ']);
  const before = await db.all("SELECT * FROM sync_records WHERE sync_state='conflicted'");
  await repo.resetDomain(scope);
  assert.equal((await db.all("SELECT * FROM sync_cursors")).length, 3);
  assert.equal((await db.all("SELECT * FROM sync_records WHERE sync_state='synced'")).length, 3);
  assert.deepEqual(await db.all("SELECT * FROM sync_records WHERE sync_state='conflicted'"), before);
});

test("unknown domain, unbound epoch, actor, server and mismatched page fail before writing", async t => {
  const { db, repo } = await fixture(t);
  for (const bad of [{ ...scope, domainId: "unknown" }, { ...scope, authorizationEpoch: "e9" }, { ...scope, actorId: "other" }, { ...scope, baseUrl: "https://other.example" }]) {
    await assert.rejects(repo.applyDomainPage(bad, page()));
    await assert.rejects(repo.resetDomain(bad));
  }
  await assert.rejects(repo.applyDomainPage(scope, page({ authorizationEpoch: "e9" })));
  await assert.rejects(repo.applyDomainPage(scope, page({ domainId: "tasks" })));
  assert.deepEqual(await db.all("SELECT * FROM sync_records"), []);
  assert.deepEqual(await db.all("SELECT * FROM sync_cursors"), []);
});

test("revocation hides pending overlays without deleting conflict bytes", async t => {
  const { db, scopes, repo } = await fixture(t);
  await repo.applyDomainPage(scope, page());
  await db.run("UPDATE sync_records SET sync_state='pending'");
  const before = await db.all("SELECT * FROM sync_records");
  scopes.splice(0, scopes.length);
  await assert.rejects(repo.listRecords({ workspaceId: "w", kind: "note" }));
  assert.deepEqual(await db.all("SELECT * FROM sync_records"), before);
});

test("visibility deletion hides local overlay, removes its index/assets, and leaves other scopes and outbox untouched", async t => {
  const { db, scopes, repo } = await fixture(t);
  await repo.applyDomainPage(scope, page());
  await repo.applyDomainPage(scopes[1]!, page({ domainId: "tasks" }));
  await db.run("UPDATE sync_records SET sync_state='pending' WHERE domain_id='notes'");
  await db.run("INSERT INTO local_read_index VALUES(?,?,?,?,?)", ["w", "notes", "e1", "r", "private"]);
  await db.run("INSERT INTO local_read_assets VALUES(?,?,?,?,?,?)", ["w", "notes", "e1", "asset", "r", "{}"]);
  await db.run("INSERT INTO sync_outbox VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["m", "w", "note", "r", "update", ' { "ink": [1,2] } ', "r1", "2026-09-16T00:00:00Z", 2, null, "CONFLICT"]);
  const outbox = await db.all("SELECT * FROM sync_outbox");
  const payload = (await db.get<{ payload_json: string }>("SELECT payload_json FROM sync_records WHERE domain_id='notes'"))?.payload_json;
  await repo.applyDomainPage(scope, page({ changes: [{ id: "r", revision: "r2", operation: "visibility-delete", payload: null }] }));
  assert.equal((await db.get<{ visible: number }>("SELECT visible FROM sync_records WHERE domain_id='notes'"))?.visible, 0);
  assert.equal((await db.get<{ payload_json: string }>("SELECT payload_json FROM sync_records WHERE domain_id='notes'"))?.payload_json, payload);
  assert.deepEqual(await db.all("SELECT * FROM local_read_index"), []);
  assert.deepEqual(await db.all("SELECT * FROM local_read_assets"), []);
  assert.deepEqual(await db.all("SELECT * FROM sync_outbox"), outbox);
  assert.equal((await db.all("SELECT * FROM sync_records WHERE domain_id='tasks'")).length, 1);
});

test("revocation during asynchronous page preparation rejects the late page and cursor", async t => {
  const { db, scopes } = await fixture(t);
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const repo = createLocalSyncRepository({ actorId: "a", database: db, baseUrl, registeredDomainIds: ["notes"], activeReadScopes: () => scopes, hashPayload: async json => { began(); await barrier; return createHash("sha256").update(json).digest("hex"); } });
  const apply = repo.applyDomainPage(scope, page());
  await started; scopes.splice(0, scopes.length); release();
  await assert.rejects(apply, /not bound/);
  assert.deepEqual(await db.all("SELECT * FROM sync_records"), []);
  assert.deepEqual(await db.all("SELECT * FROM sync_cursors"), []);
});

test("reset hides retained overlays until a new page and never deletes another scope's assets or index", async t => {
  const { db, scopes, repo } = await fixture(t);
  scopes.splice(1); // One bound notes scope for the legacy adapter.
  await repo.applyDomainPage(scope, page());
  await db.run("UPDATE sync_records SET sync_state='pending'");
  await db.run("INSERT INTO local_read_assets VALUES(?,?,?,?,?,?)", ["w2", "notes", "e1", "asset", "r", "{}"]);
  await db.run("INSERT INTO local_read_index VALUES(?,?,?,?,?)", ["w2", "notes", "e1", "r", "other"]);
  await repo.resetDomain(scope);
  assert.deepEqual(await repo.listRecords({ workspaceId: "w", kind: "note" }), []);
  assert.equal((await db.all("SELECT * FROM sync_records")).length, 1);
  assert.equal((await db.all("SELECT * FROM local_read_assets")).length, 1);
  assert.equal((await db.all("SELECT * FROM local_read_index")).length, 1);
});

test("an awaited page binds a snapshot of its scope rather than a caller's mutable object", async t => {
  const { db, scopes } = await fixture(t);
  const mutable = { ...scope };
  const repo = createLocalSyncRepository({ actorId: "a", database: db, baseUrl, registeredDomainIds: ["notes"], activeReadScopes: () => scopes, hashPayload: async json => { mutable.authorizationEpoch = "e2"; return createHash("sha256").update(json).digest("hex"); } });
  await repo.applyDomainPage(mutable, page());
  assert.equal((await db.get<{ authorization_epoch: string }>("SELECT authorization_epoch FROM sync_records"))?.authorization_epoch, "e1");
});

test("revocation while a record query awaits suppresses its late payload", async t => {
  const { db, scopes, repo } = await fixture(t);
  scopes.splice(1); await repo.applyDomainPage(scope, page());
  const get = db.get.bind(db);
  t.mock.method(db, "get", async (sql: string, params: readonly import("../src/data/sync/local-sync-database").LocalSyncSqlValue[] = []) => {
    const row = await get(sql, params);
    if (sql.includes("FROM sync_records")) scopes.splice(0);
    return row;
  });
  await assert.rejects(repo.getRecord({ workspaceId: "w", kind: "note", id: "r" }), /not bound/);
});

test("a new generation marks a replayed revision without rewriting its immutable payload", async t => {
  const { db, repo } = await fixture(t);
  await repo.applyDomainPage(scope, page());
  await repo.applyDomainPage(scope, page({ generation: "g2", changes: [{ id: "r", revision: "r1", operation: "upsert", payload: { title: "must not replace same revision" } }] }));
  const stored = await db.get<{ generation: string; payload_json: string }>("SELECT generation,payload_json FROM sync_records");
  assert.equal(stored?.generation, "g2");
  assert.equal(stored?.payload_json, '{"title":"one"}');
});
