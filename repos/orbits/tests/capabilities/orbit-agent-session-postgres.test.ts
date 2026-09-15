import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createTransactionalOrbitAgentChatRequestStore } from "../../features/orbit-ai/storage/orbit-agent-chat-request-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_AGENT_SESSION_TEST_DATABASE_URL;
const databaseTest = {
  skip: databaseUrl ? false : "ORBIT_AGENT_SESSION_TEST_DATABASE_URL is not configured",
};

test("PostgreSQL serializes duplicate request reservations and isolates actors", databaseTest, async () => {
  assert.ok(databaseUrl, "An explicit isolated test database URL is required");
  const schema = `agent_session_${randomUUID().replaceAll("-", "")}`;
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
    const alice = createTransactionalOrbitAgentChatRequestStore({ actorId: "actor:alice", client, workspaceId });
    const alicePeer = createTransactionalOrbitAgentChatRequestStore({ actorId: "actor:alice", client, workspaceId });
    const bob = createTransactionalOrbitAgentChatRequestStore({ actorId: "actor:bob", client, workspaceId });

    const reservations = await Promise.all([
      alice.reserve("request:one", "fingerprint:one", "session:one"),
      alicePeer.reserve("request:one", "fingerprint:one", "session:one"),
    ]);
    assert.deepEqual([...reservations].sort(), ["existing", "started"]);

    const revisionClaims = await Promise.allSettled([
      alice.claimSessionRevision("session:shared", 0, "request:revision:a"),
      alicePeer.claimSessionRevision("session:shared", 0, "request:revision:b"),
    ]);
    assert.equal(
      revisionClaims.filter((claim) => claim.status === "fulfilled").length,
      1,
    );
    assert.equal(
      revisionClaims.filter((claim) => claim.status === "rejected").length,
      1,
    );
    assert.match(
      String(
        revisionClaims.find((claim) => claim.status === "rejected")?.reason,
      ),
      /SESSION_REVISION_CONFLICT/,
    );

    await alice.complete("request:one", "fingerprint:one", { answer: "唯一结果" });
    assert.deepEqual(await alicePeer.get("request:one"), {
      fingerprint: "fingerprint:one",
      requestId: "request:one",
      result: { answer: "唯一结果" },
      sessionId: "session:one",
      state: "completed",
    });
    await assert.rejects(
      alicePeer.reserve("request:one", "fingerprint:changed", "session:one"),
      /REQUEST_ID_REUSED/,
    );

    assert.equal(await bob.reserve("request:one", "fingerprint:bob", "session:bob"), "started");
    assert.equal((await bob.get("request:one"))?.sessionId, "session:bob");

    assert.equal(await alice.reserve("request:retry", "fingerprint:retry", "session:retry"), "started");
    await alice.markFailedBeforeExecution("request:retry", "fingerprint:retry");
    assert.equal(await alice.reserve("request:retry", "fingerprint:retry", "session:retry"), "started");
    assert.equal((await alice.get("request:retry"))?.state, "pending");
  } finally {
    await client.close();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});
