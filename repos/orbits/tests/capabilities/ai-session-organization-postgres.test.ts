import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  createOrbitAgentChatOrganizationStore,
  createTransactionalOrbitAgentChatOrganizationStore,
  OrbitAgentChatOrganizationError,
} from "../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_AGENT_SESSION_TEST_DATABASE_URL;
const databaseTest = {
  skip: databaseUrl ? false : "ORBIT_AGENT_SESSION_TEST_DATABASE_URL is not configured",
};

test("PostgreSQL organization transactions provide CAS, actor isolation, atomic ungroup, and rollback", databaseTest, async () => {
  assert.ok(databaseUrl, "An explicit isolated test database URL is required");
  const schema = `agent_organization_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${randomUUID()}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 4,
    options: `-c search_path=${schema} -c statement_timeout=5000`,
  });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, max: 4, pool });

  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const alice = createTransactionalOrbitAgentChatOrganizationStore({ actorId: "actor:alice", client, workspaceId });
    const alicePeer = createTransactionalOrbitAgentChatOrganizationStore({ actorId: "actor:alice", client, workspaceId });
    const bob = createTransactionalOrbitAgentChatOrganizationStore({ actorId: "actor:bob", client, workspaceId });
    const group = await alice.createGroup({ id: "group:shared", mutationId: "mutation:create", name: "Shared" });
    assert.equal(await bob.getGroup(group.id), null);

    const results = await Promise.allSettled([
      alice.mutateGroup(group.id, { expectedRevision: 1, mutationId: "mutation:rename:a", name: "A" }),
      alicePeer.mutateGroup(group.id, { expectedRevision: 1, mutationId: "mutation:rename:b", name: "B" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(
      (results.find((result) => result.status === "rejected") as PromiseRejectedResult).reason instanceof OrbitAgentChatOrganizationError,
      true,
    );

    const current = await alice.getGroup(group.id);
    assert.ok(current);
    for (let index = 0; index < 61; index += 1) {
      await alice.mutateSessionOrganization(`session:${index}`, {
        expectedRevision: 0,
        mutationId: `mutation:move:${index}`,
        patch: { groupId: group.id },
      });
    }
    const deleted = await alice.deleteGroup(group.id, {
      expectedRevision: current.revision,
      mutationId: "mutation:delete",
    });
    assert.equal(deleted.ungroupedCount, 61);
    const organizations = await alice.listSessionOrganizations();
    assert.equal(organizations.size, 61);
    assert.equal([...organizations.values()].every((value) => value.groupId === null), true);

    const rollbackStore = createOrbitAgentChatOrganizationStore({
      actorId: "actor:rollback",
      runTransaction: (operation) =>
        client.transaction(async (transaction) => {
          const value = await operation(createPostgresLiveRecordStore({ client: transaction }));
          throw Object.assign(new Error("injected rollback"), { value });
        }),
      workspaceId,
    });
    await assert.rejects(
      rollbackStore.createGroup({ id: "group:rollback", mutationId: "mutation:rollback", name: "Rollback" }),
      /injected rollback/,
    );
    assert.equal(await alice.getGroup("group:rollback"), null);
  } finally {
    await client.close();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});
