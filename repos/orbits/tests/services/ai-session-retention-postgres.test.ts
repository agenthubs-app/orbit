import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { createTransactionalOrbitAgentChatOrganizationStore } from "../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import { createStorageOrbitAgentChatSessionProvider, orbitAgentChatSessionActorWorkspaceId } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { expireOrbitAgentChatSessions } from "../../features/orbit-ai/storage/orbit-agent-chat-session-retention";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_AGENT_SESSION_TEST_DATABASE_URL;
const localTestUrl = (() => {
  try {
    const url = new URL(databaseUrl ?? "");
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && url.pathname.includes("test") && !url.search;
  } catch { return false; }
})();

test("R21 PostgreSQL deletion undo and 90-day retention preserve actor and pin boundaries", {
  skip: localTestUrl ? false : "Requires explicit localhost test database URL", timeout: 30_000,
}, async () => {
  assert.ok(databaseUrl);
  const schema = `ai_retention_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:retention:${randomUUID()}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4,
    options: `-c search_path=${schema} -c statement_timeout=10000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, max: 4, pool });
  const now = new Date("2026-10-18T00:00:00.000+09:00");
  const age = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const makeProvider = (actorId: string) => createStorageOrbitAgentChatSessionProvider({
      actorId, now: () => now, store: createPostgresLiveRecordStore({ client }),
      transactionClient: client, summaryPageClient: client,
      summaryPageSecret: "local-test-only-ai-retention-cursor-secret", workspaceId,
    });
    const alice = makeProvider("actor:alice");
    const bob = makeProvider("actor:bob");
    const organization = createTransactionalOrbitAgentChatOrganizationStore({ actorId: "actor:alice", client, workspaceId });
    for (const [id, days] of [["old", 91], ["day90", 90], ["pinned", 100]] as const) {
      await alice.upsertSession({ id, title: id, createdAt: age(days), updatedAt: age(days),
        messages: [{ id: `${id}:message`, role: "user", text: id }] });
    }
    await bob.upsertSession({ id: "foreign", title: "foreign", createdAt: age(100), updatedAt: age(100),
      messages: [{ id: "foreign:message", role: "user", text: "foreign" }] });
    await organization.mutateSessionOrganization("pinned", { expectedRevision: 0, mutationId: "pin", patch: { pinned: true } });
    const deletion = await alice.deleteSessionWithUndo("old");
    assert.ok(deletion.undoToken);
    assert.equal(await bob.restoreDeletedSession("old", deletion.undoToken!), false);
    assert.equal(await alice.restoreDeletedSession("old", deletion.undoToken!), true);
    assert.equal((await alice.getSession("old"))?.messages[0]?.text, "old");
    const pass = await expireOrbitAgentChatSessions({ provider: alice, organization, now });
    assert.deepEqual(pass.deletedIds, ["old"]);
    assert.equal(pass.truncated, false);
    assert.equal(await alice.getSession("old"), null);
    assert.equal(await alice.getSession("day90") !== null, true);
    assert.equal(await alice.getSession("pinned") !== null, true);
    assert.equal(await bob.getSession("foreign") !== null, true);
    assert.deepEqual((await expireOrbitAgentChatSessions({ provider: alice, organization, now })).deletedIds, []);
    const { rows } = await client.query<{ count: string }>(`select count(*)::text as count from orbit_records
      where workspace_id = $1 and collection_name = 'orbit_agent_chat_messages' and target_id = 'old'
        and lifecycle_state = 'deleted'`, [orbitAgentChatSessionActorWorkspaceId(workspaceId, "actor:alice")]);
    assert.equal(rows[0]?.count, "1");
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});
