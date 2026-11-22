import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { ACTOR, createCardKit, decide, freeze } from "../services/agent-ledger-card-kit";

/**
 * agent-design AG06-3/5 against a real PostgreSQL schema (local test database only): the memo.create item
 * of a card.
 * - Nothing is written before the click; after it, one memo with the user's words, its links and its
 *   interaction, marked so the automatic extraction never runs on it.
 * - The actual contacts must be among the memo's contacts: otherwise nothing is written (permanent).
 * - Run again with the same operation key: still one memo.
 * - No contact detail state (the stored "last interaction") is written.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `agent_v1_memo_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:agent-v1-memo:${schema}`;

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

async function notes() {
  const result = await pool.query("select record_id, payload from orbit_records where collection_name = 'notes' and lifecycle_state <> 'deleted'");
  return result.rows.map((row) => (row.payload as { note: Record<string, unknown> }).note);
}

const interaction = { actualContactIds: ["contact:c17"], channel: "phone" as const, direction: "incoming" as const, occurredOn: "2026-11-15", precision: "day" as const };

test("after the click: one memo with the user's words, both people linked, only the caller as the actual contact, extraction suppressed", { skip, timeout: 60_000 }, async () => {
  const kit = createCardKit({ client, workspaceId });
  const card = await freeze(kit, [{ capability: "memo.create", partId: "p1", set: { body: "小林今天来电话了，说小陈还在审合同", contactIds: ["contact:c17", "contact:c21"], interaction, names: { "contact:c17": "小林健", "contact:c21": "陈立" }, title: "小林今天来电话了，说小陈还在审合同" } }]);
  assert.equal(card.title, "新增1项");
  assert.match(card.operations[0].preview, /实际往来对象 小林健，11月15日（周日），对方来电；另关联 陈立（只是提到）/u);
  assert.equal((await notes()).length, 0, "nothing before the click");
  assert.equal((await decide(kit, card, "confirm", "decision:1"))?.accepted, true);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const [note] = await notes();
  assert.equal(note.body, "小林今天来电话了，说小陈还在审合同");
  assert.deepEqual(note.contactIds, ["contact:c17", "contact:c21"]);
  assert.deepEqual(note.interaction, interaction);
  assert.equal(note.autoExtraction, "suppressed");
  const details = await pool.query("select count(*)::int as n from orbit_records where collection_name in ('contact_detail_states', 'memo_extractions')");
  assert.equal(details.rows[0].n, 0, "no contact detail state and no extraction job");
});

test("an actual contact that is not linked to the memo is refused: nothing is written and it is not retried", { skip, timeout: 60_000 }, async () => {
  const kit = createCardKit({ client, workspaceId: `${workspaceId}:bad` });
  const card = await freeze(kit, [{ capability: "memo.create", partId: "p1", set: { body: "张伟今天来过电话", contactIds: ["contact:other"], interaction: { ...interaction, actualContactIds: ["contact:lc02"] }, names: {}, title: "张伟今天来过电话" } }]);
  await decide(kit, card, "confirm", "decision:1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const action = (await kit.runtime.getAction(card.actionId))!;
  assert.equal(action.status, "failed");
  kit.advance(60 * 60 * 1000);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal(kit.executorCalls.filter((call) => call.key === "memo.create").length, 1, "a refused memo is not tried again");
  const written = await pool.query("select count(*)::int as n from orbit_records where collection_name = 'notes' and workspace_id = $1", [`${workspaceId}:bad`]);
  assert.equal(written.rows[0].n, 0);
});

test("the same operation key run again gives the same memo, never a second one", { skip, timeout: 60_000 }, async () => {
  const kit = createCardKit({ client, workspaceId: `${workspaceId}:replay` });
  const card = await freeze(kit, [{ capability: "memo.create", partId: "p1", set: { body: "Emily called me today.", contactIds: ["contact:c40"], interaction: { ...interaction, actualContactIds: ["contact:c40"] }, names: { "contact:c40": "Emily Carter" }, title: "Emily called me today." } }], undefined, "en");
  assert.match(card.operations[0].preview, /^New interaction note "Emily called me today\.": with Emily Carter, Sun, Nov 15, they called$/u);
  await decide(kit, card, "confirm", "decision:1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const executor = (await import("../../features/agent-v1/domains/writes")).cardWriteExecutors({ actorId: ACTOR, notes: kit.notes, tasks: null })[0];
  const op = card.operations[0];
  await executor.execute(op.payload, { actionId: card.actionId, idempotencyKey: op.idempotencyKey, now: kit.now(), operationId: op.operationId, runId: card.runId });
  const written = await pool.query("select count(*)::int as n from orbit_records where collection_name = 'notes' and workspace_id = $1", [`${workspaceId}:replay`]);
  assert.equal(written.rows[0].n, 1);
});
