import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initializeLocalSyncDatabase, type LocalSyncDatabase, type LocalSyncSqlValue } from "../src/data/sync/local-sync-database";

// Frozen v1 fixture, independent of the production schema being migrated.
const V1 = `
CREATE TABLE sync_records(workspace_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('contact','note','task','relationship_followup','personal_schedule','inbox_item')),record_id TEXT NOT NULL,revision TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT,payload_json TEXT,sync_state TEXT NOT NULL CHECK(sync_state IN ('synced','pending','conflicted','failed')),ai_visibility TEXT NOT NULL CHECK(ai_visibility IN ('available_when_synced','excluded')),PRIMARY KEY(workspace_id,kind,record_id),CHECK(deleted_at IS NULL OR payload_json IS NULL));
CREATE INDEX sync_records_ordered ON sync_records(workspace_id,kind,updated_at DESC,record_id ASC);
CREATE TABLE sync_cursors(workspace_id TEXT PRIMARY KEY NOT NULL,cursor TEXT NOT NULL,last_successful_sync_at TEXT NOT NULL,bootstrap_state TEXT NOT NULL CHECK(bootstrap_state IN ('pending','complete')));
CREATE TABLE sync_outbox(mutation_id TEXT PRIMARY KEY NOT NULL,workspace_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('contact','note','task','relationship_followup','personal_schedule','inbox_item')),record_id TEXT NOT NULL,operation TEXT NOT NULL CHECK(operation IN ('create','update','delete')),patch_json TEXT,base_revision TEXT,created_at TEXT NOT NULL,retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count>=0),next_retry_at TEXT,last_error_code TEXT);
CREATE INDEX sync_outbox_ordered ON sync_outbox(workspace_id,created_at ASC,mutation_id ASC);
CREATE TABLE sync_meta(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);
CREATE TABLE legacy_api_snapshots(path TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL,status INTEGER NOT NULL,synced_at TEXT NOT NULL);
INSERT INTO sync_meta VALUES('schema_version','1'),('migration_checkpoint','1'),('encryption_state','encrypted');
INSERT INTO sync_cursors VALUES('w','old','2026-09-16T00:00:00Z','complete');
INSERT INTO sync_records VALUES('w','note','canonical','r1','2026-09-16T00:00:00Z',NULL,' { "title": "server" } ','synced','available_when_synced'),('w','note','draft','r0','2026-09-16T00:00:00Z',NULL,' { "title": "draft" } ','pending','excluded'),('w','task','conflict','r0','2026-09-16T00:00:00Z',NULL,' { "title": "conflict" } ','conflicted','excluded');
INSERT INTO sync_outbox VALUES('mutation','w','note','draft','update',' { "title": "draft" } ','r0','2026-09-16T00:00:00Z',2,NULL,'CONFLICT');
INSERT INTO legacy_api_snapshots VALUES('/device/note-drafts',' { "ink": [1,2] } ',200,'2026-09-16T00:00:00Z');`;

class ReadTestDatabase implements LocalSyncDatabase {
  readonly raw: DatabaseSync;
  failOn: string | null = null;
  constructor(path = ":memory:") { this.raw = new DatabaseSync(path); }
  private check(sql: string) { if (this.failOn && sql.includes(this.failOn)) { this.failOn = null; throw Error("injected storage failure"); } }
  async execute(sql: string) { this.check(sql); this.raw.exec(sql); }
  async run(sql: string, params: readonly LocalSyncSqlValue[] = []) { this.check(`${sql} ${params.join(' ')}`); return { changes: Number(this.raw.prepare(sql).run(...params).changes) }; }
  async get<T>(sql: string, params: readonly LocalSyncSqlValue[] = []): Promise<T | null> { this.check(sql); return (this.raw.prepare(sql).get(...params) as T) ?? null; }
  async all<T>(sql: string, params: readonly LocalSyncSqlValue[] = []): Promise<T[]> { this.check(sql); return this.raw.prepare(sql).all(...params) as T[]; }
  async transaction<T>(work: () => Promise<T>): Promise<T> { this.raw.exec("BEGIN IMMEDIATE"); try { const result = await work(); this.raw.exec("COMMIT"); return result; } catch (error) { this.raw.exec("ROLLBACK"); throw error; } }
}

test("real v1 migration quarantines unverifiable canonical data and retains local bytes", async t => {
  const db = new ReadTestDatabase(); t.after(() => db.raw.close()); db.raw.exec(V1);
  const records = await db.all("SELECT * FROM sync_records ORDER BY record_id");
  const outbox = await db.all("SELECT * FROM sync_outbox");
  const drafts = await db.all("SELECT * FROM legacy_api_snapshots");
  await initializeLocalSyncDatabase(db);
  assert.equal((await db.get<{ value: string }>("SELECT value FROM sync_meta WHERE key='schema_version'"))?.value, "2");
  assert.deepEqual(await db.all("SELECT * FROM legacy_read_records ORDER BY record_id"), records);
  assert.deepEqual(await db.all("SELECT * FROM sync_outbox"), outbox);
  assert.deepEqual(await db.all("SELECT * FROM legacy_api_snapshots"), drafts);
  assert.deepEqual(await db.all("SELECT * FROM sync_cursors"), []);
  assert.deepEqual(await db.all("SELECT * FROM sync_records"), []);
  await initializeLocalSyncDatabase(db); await initializeLocalSyncDatabase(db);
  assert.deepEqual(await db.all("SELECT * FROM legacy_read_records ORDER BY record_id"), records);
});

test("copy, swap and checkpoint failures reopen as complete v1 then retry idempotently", async t => {
  const dir = mkdtempSync(join(tmpdir(), "orbit-read-migration-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const fault of ["ALTER TABLE sync_records", "ALTER TABLE sync_cursors", "migration_checkpoint"]) {
    const path = join(dir, `${fault.split(' ').join('-')}.db`);
    let db = new ReadTestDatabase(path); db.raw.exec(V1);
    const records = await db.all("SELECT * FROM sync_records ORDER BY record_id");
    const outbox = await db.all("SELECT * FROM sync_outbox");
    db.failOn = fault;
    await assert.rejects(initializeLocalSyncDatabase(db), /injected storage failure/); db.raw.close();
    db = new ReadTestDatabase(path);
    assert.deepEqual(await db.all("SELECT * FROM sync_records ORDER BY record_id"), records);
    assert.deepEqual(await db.all("SELECT * FROM sync_outbox"), outbox);
    assert.equal((await db.get<{ value: string }>("SELECT value FROM sync_meta WHERE key='schema_version'"))?.value, "1");
    await initializeLocalSyncDatabase(db); await initializeLocalSyncDatabase(db);
    assert.deepEqual(await db.all("SELECT * FROM legacy_read_records ORDER BY record_id"), records); db.raw.close();
  }
});
