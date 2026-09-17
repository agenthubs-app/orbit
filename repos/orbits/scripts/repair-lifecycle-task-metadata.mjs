// One explicit record only; no inferred evidence, reseed, version or status change.
// Requires DATABASE_URL, ORBIT_WORKSPACE_ID and explicit --actor/--task.
// Dry-run by default. --write exports a private before-image before committing.
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";

const { values } = parseArgs({ options: { actor: { type: "string" }, task: { type: "string" }, write: { type: "boolean", default: false } } });
assert.ok(values.actor && values.task && process.env.ORBIT_WORKSPACE_ID && process.env.ORBIT_EVENT_DATABASE_URL);
const client = new pg.Client({ connectionString: process.env.ORBIT_EVENT_DATABASE_URL });
await client.connect();
try {
  await client.query(values.write ? "begin isolation level serializable" : "begin read only");
  await client.query("set local statement_timeout = '5s'");
  const scope = [process.env.ORBIT_WORKSPACE_ID, values.task, values.actor];
  const { rows } = await client.query("select * from orbit_records where workspace_id=$1 and collection_name='tasks' and record_id=$2 and user_id=$3 and lifecycle_state <> 'deleted'" + (values.write ? " for update" : ""), scope);
  assert.equal(rows.length, 1, "exactly one owned task is required");
  const record = rows[0];
  const payload = record.payload;
  assert.equal(payload.id, values.task);
  assert.ok(["follow_up", "maintenance"].includes(payload.relationshipPurpose));
  assert.ok(payload.accountId === undefined || payload.accountId === values.actor, "never replace conflicting ownership");
  assert.ok(Array.isArray(payload.evidenceIds) && payload.evidenceIds.length === 1, "requires existing explicit lifecycle evidence");
  const evidenceId = payload.evidenceIds[0];
  assert.ok(Array.isArray(record.evidence_ids) && (record.evidence_ids.length === 0 || JSON.stringify(record.evidence_ids) === JSON.stringify(payload.evidenceIds)));
  const evidence = await client.query("select payload from orbit_records where workspace_id=$1 and collection_name='evidence' and record_id=$2 and user_id=$3 and source_id=$4 and lifecycle_state <> 'deleted'", [scope[0], evidenceId, values.actor, record.source_id]);
  assert.equal(evidence.rows.length, 1);
  assert.equal(evidence.rows[0].payload.createdBy, values.actor);
  assert.equal(evidence.rows[0].payload.id, evidenceId);
  assert.equal(payload.source?.id, record.source_id);
  const connection = await client.query("select record_id from orbit_records where workspace_id=$1 and collection_name='connections' and record_id=$2 and user_id=$3 and payload->>'accountId'=$3 and payload->>'contactId'=$4 and lifecycle_state <> 'deleted'", [scope[0], payload.connectionId, values.actor, payload.contactId]);
  assert.equal(connection.rows.length, 1);
  const changed = payload.accountId !== values.actor || record.evidence_ids.length === 0;
  let snapshotPath;
  if (values.write && changed) {
    const directory = await mkdtemp(join(tmpdir(), "orbit-lifecycle-metadata-before-"));
    snapshotPath = join(directory, "record.json");
    await writeFile(snapshotPath, JSON.stringify({ capturedAt: new Date().toISOString(), record }, null, 2), { mode: 0o600, flag: "wx" });
    const result = await client.query("update orbit_records set payload=jsonb_set(payload,'{accountId}',to_jsonb($3::text)), evidence_ids=$4 where workspace_id=$1 and collection_name='tasks' and record_id=$2 and user_id=$3 returning record_id", [...scope, payload.evidenceIds]);
    assert.equal(result.rowCount, 1);
  }
  await client.query(values.write ? "commit" : "rollback");
  console.log(JSON.stringify({ mode: values.write ? "write" : "dry-run", taskId: values.task, changed, snapshotPath, versionUnchanged: true, statusUnchanged: true }));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
