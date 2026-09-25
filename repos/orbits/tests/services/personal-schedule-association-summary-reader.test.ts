import assert from "node:assert/strict";
import test from "node:test";
import { createAssociationSummaryReader } from "../../features/personal-schedule/association-summary-reader";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

const owned = { id: "note:one", title: "林悦会议", userId: "actor-1", lifecycleState: "active", schemaVersion: 2, accountId: "actor-1", ownerUserId: "actor-1", version: 1, createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z", recordId: "note:one" };
function fixture(candidates: unknown[]) {
  const calls: { sql: string; values: readonly unknown[] | undefined }[] = [];
  const client: LiveRecordSqlClient = { async query(sql, values) { calls.push({ sql, values }); return { rows: [{ source_version: "revision-1", candidates }] as never }; } };
  return { read: createAssociationSummaryReader({ client, workspaceId: "workspace-1" }), calls };
}

test("summary reader emits a bounded actor/workspace query and exposes no private note body", async () => {
  const f = fixture([owned]);
  const page = await f.read({ actorId: "actor-1", kind: "note", limit: 20 });
  assert.deepEqual(page.candidates, [{ id: "note:one", title: "林悦会议" }]);
  assert.deepEqual(f.calls[0]!.values, ["workspace-1", "notes", "", "actor-1", "connections", 21]);
  // Assert the SQL emitted at the storage boundary, not source-file text.
  assert.match(f.calls[0]!.sql, /c\.workspace_id = \$1/);
  assert.match(f.calls[0]!.sql, /c\.user_id = \$4/);
  assert.match(f.calls[0]!.sql, /limit \$6/i);
  assert.equal(f.calls[0]!.sql.includes("c.payload as"), false);
  assert.equal(/'body'\s*,/.test(f.calls[0]!.sql), false);
  assert.match(f.calls[0]!.sql, /substring\(c\.payload->'note'->>'body' from/);
});

test("summary reader rejects cross-actor metadata, deletion and malformed identities instead of publishing titles", async () => {
  for (const patch of [{ accountId: "foreign" }, { ownerUserId: "foreign" }, { userId: "foreign" }, { lifecycleState: "deleted" }, { version: 0 }, { schemaVersion: 3 }, { id: "different" }, { title: "" }]) {
    await assert.rejects(fixture([{ ...owned, ...patch }]).read({ actorId: "actor-1", kind: "note", limit: 20 }), /invalid.*summary/i);
  }
});

test("contact summary requires the private contact owner and never grants access through a connection", async () => {
  const f = fixture([{ id: "contact:one", recordId: "contact:one", title: "林悦", lifecycleState: "active" }]);
  assert.deepEqual((await f.read({ actorId: "actor-1", kind: "contact", limit: 20, afterId: "contact:before" })).candidates, [{ id: "contact:one", title: "林悦" }]);
  assert.match(f.calls[0]!.sql, /c\.user_id = \$4/);
  assert.match(f.calls[0]!.sql, /c\.payload->'accountId'=to_jsonb\(\$4::text\)/);
  assert.doesNotMatch(f.calls[0]!.sql, /connection\.payload/);
  assert.equal(f.calls[0]!.values![2], "contact:before");
});

test("note summary metadata preserves JSON types and rejects coercible schema versions", async () => {
  for (const patch of [{ schemaVersion: "2" }, { schemaVersion: true }, { accountId: 1 }, { ownerUserId: {} }, { id: 1 }, { title: {} }]) {
    await assert.rejects(fixture([{ ...owned, ...patch }]).read({ actorId: "actor-1", kind: "note", limit: 20 }), /invalid.*summary/i);
  }
});
