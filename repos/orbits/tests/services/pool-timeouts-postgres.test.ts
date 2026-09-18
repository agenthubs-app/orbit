import assert from "node:assert/strict";
import test from "node:test";
import { poolTimeoutOptions, resolveDatabaseRuntimeProfile } from "../../shared/storage/database-runtime-profile";
import { createPgLiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

// A hung statement must not hold a pool slot forever: the client gives up on
// its own clock, and a direct connection also asks the server to cancel.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 30_000 };

test("client-side query timeout rejects a slow statement and the same pool answers immediately afterwards", options, async () => {
  const client = createPgLiveRecordSqlClient({
    connectionString: databaseUrl!, max: 1,
    timeouts: { ...poolTimeoutOptions(resolveDatabaseRuntimeProfile({ VERCEL: "1" })), query_timeout: 200 },
  });
  try {
    const started = Date.now();
    await assert.rejects(client.query("select pg_sleep(1)"), /Query read timeout/);
    assert.ok(Date.now() - started < 900, "must give up well before the statement finishes");
    const result = await client.query<{ ok: number }>("select 1 as ok");
    assert.equal(result.rows[0]?.ok, 1, "the single pool slot is usable again");
  } finally {
    await client.close();
  }
});

test("direct-connection profiles also cancel on the server with statement_timeout (57014)", options, async () => {
  const client = createTransactionalPostgresClient({
    connectionString: databaseUrl!, max: 1,
    timeouts: { ...poolTimeoutOptions(resolveDatabaseRuntimeProfile({})), statement_timeout: 200, query_timeout: 5_000 },
  });
  try {
    await assert.rejects(client.query("select pg_sleep(1)"), (error: unknown) => (error as { code?: string }).code === "57014");
    assert.equal((await client.query<{ ok: number }>("select 1 as ok")).rows[0]?.ok, 1);
    // Inside a transaction the same server-side limit applies.
    await assert.rejects(client.transaction(async (tx) => { await tx.query("select pg_sleep(1)"); }), (error: unknown) => (error as { code?: string }).code === "57014");
  } finally {
    await client.close();
  }
});

test("the serverless profile sends no statement_timeout startup parameter (pooler-safe)", () => {
  const serverless = poolTimeoutOptions(resolveDatabaseRuntimeProfile({ VERCEL: "1" }));
  assert.equal("statement_timeout" in serverless, false);
  assert.equal(serverless.query_timeout, 15_000);
  const local = poolTimeoutOptions(resolveDatabaseRuntimeProfile({}));
  assert.equal(local.statement_timeout, 30_000);
});
