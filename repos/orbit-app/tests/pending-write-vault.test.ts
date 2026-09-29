import assert from "node:assert/strict";
import test from "node:test";

import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { NodeTestDatabase } from "./helpers/node-sync-database";

async function database() {
  const value = new NodeTestDatabase();
  await initializeLocalSyncDatabase(value);
  return value;
}

test("vault round trip preserves outbox and aliases but not mirror records", async t => {
  const source = await database();
  const vault = await database();
  t.after(() => source.close());
  t.after(() => vault.close());
  await source.run(`INSERT INTO sync_outbox(mutation_id,workspace_id,domain_id,kind,record_id,operation,state,request_json,depends_on,patch_json,base_revision,created_at,retry_count,next_retry_at,last_error_code,attempt_count,first_attempt_at,server_snapshot_json)
    VALUES('m1','w','notes','note','local:n1','create','queued','{"id":"m1"}',NULL,'{"title":"draft"}',NULL,'2026-09-16T00:00:00.000Z',0,NULL,NULL,0,NULL,NULL)`);
  await source.run("INSERT INTO sync_aliases VALUES('w','notes','local:old','canonical','2026-09-16T00:00:00.000Z','2026-10-16T00:00:00.000Z')");
  const { archivePendingWrites, restorePendingWrites } = await import("../src/data/sync/pending-write-vault");
  const hash = async (text: string) => `hash:${text.length}`;
  const archived = await archivePendingWrites({ source, vault, identityDigest: "a".repeat(64), now: "2026-09-20T00:00:00.000Z", hash });
  assert.equal(archived.mutationCount, 1);
  assert.equal(archived.aliasCount, 1);
  await source.run("DELETE FROM sync_outbox");
  await source.run("DELETE FROM sync_aliases");
  const restored = await restorePendingWrites({ source, vault, identityDigest: "a".repeat(64), now: "2026-09-21T00:00:00.000Z", hash });
  assert.deepEqual(restored, { status: "restored", mutationCount: 1, aliasCount: 1 });
  assert.equal((await source.get<{ mutation_id: string }>("SELECT mutation_id FROM sync_outbox"))?.mutation_id, "m1");
  assert.equal((await source.get<{ canonical_id: string }>("SELECT canonical_id FROM sync_aliases"))?.canonical_id, "canonical");
  assert.equal(await source.get("SELECT record_id FROM sync_records"), null);
});

test("vault write failure leaves the source queue untouched and expiry deletes the vault", async t => {
  const source = await database();
  const vault = await database();
  t.after(() => source.close());
  t.after(() => vault.close());
  await source.run(`INSERT INTO sync_outbox(mutation_id,workspace_id,domain_id,kind,record_id,operation,created_at)
    VALUES('m1','w','notes','note','local:n1','create','2026-09-16T00:00:00.000Z')`);
  const { archivePendingWrites, restorePendingWrites } = await import("../src/data/sync/pending-write-vault");
  const hash = async (text: string) => `hash:${text.length}`;
  vault.failWhenSqlIncludes = "INSERT INTO pending_write_vault";
  await assert.rejects(archivePendingWrites({ source, vault, identityDigest: "b".repeat(64), now: "2026-09-20T00:00:00.000Z", hash }), /injected SQL failure/);
  assert.equal((await source.get<{ mutation_id: string }>("SELECT mutation_id FROM sync_outbox"))?.mutation_id, "m1");
  vault.failWhenSqlIncludes = null;
  await archivePendingWrites({ source, vault, identityDigest: "b".repeat(64), now: "2026-09-20T00:00:00.000Z", hash });
  const expired = await restorePendingWrites({ source, vault, identityDigest: "b".repeat(64), now: "2026-10-21T00:00:00.000Z", hash });
  assert.deepEqual(expired, { status: "expired", mutationCount: 0, aliasCount: 0 });
  assert.equal(await vault.get("SELECT id FROM pending_write_vault"), null);
});
