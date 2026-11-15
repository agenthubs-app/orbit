import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient, type TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import { createCardKit, decide, freeze } from "./agent-ledger-card-kit";

/**
 * agent-design AG02-1 against a real PostgreSQL schema (local test database only): two processes
 * confirm the same card at once with different clientDecisionIds — exactly one approval and one set
 * of outbox events; the other click reads that result. The approval, its outbox events and the
 * decision record are one transaction: a failure in the middle leaves none of them.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `agent_ledger_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:agent-ledger:${schema}`;

let admin: Pool;
let pool: Pool;
let client: TransactionalPostgresClient;

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  pool = new Pool({ connectionString: databaseUrl, max: 8, options: `-c search_path=${schema} -c statement_timeout=20000` });
  client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  await runOrbitRecordsMigration(client);
}, { timeout: 120_000 });

after(async () => {
  if (skip) return;
  try { await client.close(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

async function rows(collection: string, like: string) {
  const result = await pool.query("select record_id, payload from orbit_records where collection_name = $1 and record_id like $2", [collection, like]);
  return result.rows as { record_id: string; payload: { entity: Record<string, unknown> } }[];
}

test("two processes confirm at once: one approval, one outbox set, one to-do; the other reads the result", { skip, timeout: 60_000 }, async () => {
  const webProcess = createCardKit({ client, workspaceId });
  const appProcess = createCardKit({ client, workspaceId });
  const card = await freeze(webProcess, [{ capability: "todo.create", set: { plannedDate: "2026-11-17", title: "交停车费" } }]);
  const [web, app] = await Promise.all([
    decide(webProcess, card, "confirm", "decision:web"),
    decide(appProcess, card, "confirm", "decision:app"),
  ]);
  const outcomes = [web?.outcome, app?.outcome].sort();
  assert.deepEqual(outcomes, ["accepted", "already_decided"]);
  assert.equal([web, app].filter((result) => result?.accepted).length, 1);
  const outbox = await rows("agentOutbox", `outbox:${card.actionId}:%`);
  assert.equal(outbox.length, 1);
  const decisions = await pool.query("select payload from orbit_records where collection_name = 'agentActionDecisions'");
  assert.equal(decisions.rows.filter((row) => (row.payload as { entity: { actionId: string; outcome: string } }).entity.actionId === card.actionId && row.payload.entity.outcome === "accepted").length, 1);
  await Promise.all([webProcess.runtime.processOutbox({ actionId: card.actionId }), appProcess.runtime.processOutbox({ actionId: card.actionId })]);
  assert.equal((await webProcess.listTasks()).filter((task) => task.title === "交停车费").length, 1);
  assert.equal((await webProcess.runtime.getAction(card.actionId))?.status, "completed");
  assert.equal(webProcess.executorCalls.length + appProcess.executorCalls.length, 1);
});

test("a failure in the middle of the approval leaves neither the approval nor its outbox events", { skip, timeout: 60_000 }, async () => {
  let failNext = false;
  const failing: TransactionalPostgresClient = {
    ...client,
    close: () => client.close(),
    query: (text, values) => client.query(text, values),
    transaction: (operation, options) => client.transaction(async (tx) => {
      const wrapped: TransactionalSqlExecutor = {
        query: async (text, values) => {
          if (failNext && /^\s*insert/iu.test(text) && JSON.stringify(values ?? []).includes("agentActionsV2")) {
            failNext = false;
            throw new Error("simulated failure while writing the approved card");
          }
          return tx.query(text, values);
        },
      };
      return operation(wrapped);
    }, options),
  };
  const kit = createCardKit({ client: failing, workspaceId });
  const card = await freeze(kit, [{ capability: "todo.create", set: { plannedDate: "2026-11-30", title: "续订域名" } }]);
  failNext = true;
  await assert.rejects(() => decide(kit, card, "confirm", "decision:interrupted"), /simulated failure/u);
  assert.equal((await rows("agentOutbox", `outbox:${card.actionId}:%`)).length, 0, "no outbox event survived");
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "awaiting_confirmation", "the card is not approved");
  assert.equal(await kit.repository.getDecision!(card.actionId, "decision:interrupted"), null, "no decision record");
  // The same click again succeeds once.
  const retried = await decide(kit, card, "confirm", "decision:interrupted");
  assert.equal(retried?.outcome, "accepted");
  assert.equal((await rows("agentOutbox", `outbox:${card.actionId}:%`)).length, 1);
});
