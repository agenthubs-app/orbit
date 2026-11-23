import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { ACTOR, createCardKit, decide, freeze } from "../services/agent-ledger-card-kit";

/**
 * agent-design AG10-3/5 against a real PostgreSQL schema (local test database only): the memo.update item of a card —
 * the interaction an existing memo records (设计稿 §3.5 从笔记到联系人往来).
 * - Nothing is written before the click; after it, the memo holds the interaction, its text and links unchanged, and is
 *   marked so the automatic extraction never runs on it; no contact detail state is written.
 * - The memo changed after the card was frozen: nothing is written, and it is not retried.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `agent_v1_memo_update_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:agent-v1-memo-update:${schema}`;

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

const interaction = { actualContactIds: ["contact:c17"], channel: "phone" as const, direction: "incoming" as const, occurredOn: "2026-11-10", precision: "day" as const };
const shown = (title: string) => ({ before: null, contactIds: ["contact:c17", "contact:c21"], names: { "contact:c17": "小林健", "contact:c21": "陈一鸣" }, sentence: "11 月 10 日小林给我打电话，说小陈在审核。", title });

test("after the click: the memo records the interaction; its text and links are kept; extraction stays suppressed", { skip, timeout: 60_000 }, async () => {
  const kit = createCardKit({ client, workspaceId });
  const memo = await kit.notes.create({ actorId: ACTOR, body: "11 月 10 日小林给我打电话，说小陈在审核。我答应 11 月 13 日给小林发报价。", contactIds: ["contact:c17", "contact:c21"], idempotencyKey: "seed:m32", now: "2026-11-10T11:00:00.000Z" });
  const card = await freeze(kit, [{ capability: "memo.update", expectedVersion: memo.version, partId: "p1", set: { interaction }, shown: shown("11月10日的笔记"), targetId: memo.id }]);
  assert.equal(card.title, "修改1项");
  assert.match(card.operations[0].preview, /在笔记「11月10日的笔记」上补记往来：实际往来对象 小林健，11月10日（周二），对方来电（陈一鸣只是提到）/u);
  assert.equal((await kit.notes.get({ actorId: ACTOR, noteId: memo.id }))?.interaction, undefined, "nothing before the click");
  assert.equal((await decide(kit, card, "confirm", "decision:1"))?.accepted, true);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const note = (await kit.notes.get({ actorId: ACTOR, noteId: memo.id }))!;
  assert.deepEqual(note.interaction, interaction);
  assert.equal(note.body, memo.body);
  assert.deepEqual(note.contactIds, ["contact:c17", "contact:c21"]);
  assert.equal(note.autoExtraction, "suppressed");
  assert.equal(note.version, memo.version + 1);
  const details = await pool.query("select count(*)::int as n from orbit_records where collection_name in ('contact_detail_states', 'memo_extractions') and workspace_id = $1", [workspaceId]);
  assert.equal(details.rows[0].n, 0, "no contact detail state and no extraction job");
});

test("a to-do from a memo keeps its person, the memo and its version, and the memo's sentence (AG10-4/5)", { skip, timeout: 60_000 }, async () => {
  const kit = createCardKit({ client, workspaceId: `${workspaceId}:todo` });
  const sentence = "我答应 11 月 20 日把合同草稿发给他，发票最迟 11 月 25 日补齐。";
  const card = await freeze(kit, [
    { capability: "todo.create", partId: "p1", set: { dueAt: null, notes: `「${sentence}」（王强通话）`, plannedDate: "2026-11-20", relatedContactIds: ["contact:c46"], sourceNoteId: "note:m91", sourceNoteVersion: 1, title: "把合同草稿发给王强" }, shown: { names: { "contact:c46": "王强" }, sentence, sourceTitle: "王强通话" } },
    { capability: "todo.create", partId: "p1", set: { dueAt: "2026-11-25T14:59:00.000Z", notes: `「${sentence}」（王强通话）`, plannedDate: null, relatedContactIds: ["contact:c46"], sourceNoteId: "note:m91", sourceNoteVersion: 1, title: "补齐发票" }, shown: { dueDayOnly: true, names: { "contact:c46": "王强" }, sentence, sourceTitle: "王强通话" } },
  ]);
  assert.equal(card.title, "新增2项");
  assert.match(card.operations[1].preview, /新增待办「补齐发票」，最迟 11月25日（周三）/u);
  await decide(kit, card, "confirm", "decision:1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const rows = await pool.query("select payload from orbit_records where collection_name = 'tasks' and workspace_id = $1", [`${workspaceId}:todo`]);
  const tasks = rows.rows.map((row) => (row.payload as { task: Record<string, unknown> }).task).sort((left, right) => String(left.title).localeCompare(String(right.title)));
  assert.equal(tasks.length, 2);
  for (const task of tasks) {
    assert.equal(task.relatedContactId, "contact:c46");
    assert.equal(task.sourceNoteId, "note:m91");
    assert.equal(task.sourceNoteVersion, 1);
    assert.match(String(task.notes), /我答应 11 月 20 日把合同草稿发给他/u);
  }
  assert.deepEqual(tasks.map((task) => [task.title, task.plannedDate ?? null, task.dueAt ?? null]).sort(), [["把合同草稿发给王强", "2026-11-20", null], ["补齐发票", null, "2026-11-25T14:59:00.000Z"]].sort());
});

test("the memo changed since the card was frozen: nothing is written and it is not retried", { skip, timeout: 60_000 }, async () => {
  const kit = createCardKit({ client, workspaceId: `${workspaceId}:changed` });
  const memo = await kit.notes.create({ actorId: ACTOR, body: "11 月 10 日小林给我打电话。", contactIds: ["contact:c17"], idempotencyKey: "seed:m32b", now: "2026-11-10T11:00:00.000Z" });
  const card = await freeze(kit, [{ capability: "memo.update", expectedVersion: memo.version, partId: "p1", set: { interaction }, shown: shown("11月10日的笔记"), targetId: memo.id }]);
  await kit.notes.update({ actorId: ACTOR, body: "11 月 10 日小林给我打电话，又改了一句。", expectedVersion: memo.version, idempotencyKey: "edit:1", noteId: memo.id, now: "2026-11-11T00:00:00.000Z" });
  await decide(kit, card, "confirm", "decision:1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal((await kit.runtime.getAction(card.actionId))!.status, "failed");
  kit.advance(60 * 60 * 1000);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal(kit.executorCalls.filter((call) => call.key === "memo.update").length, 1, "not tried again");
  assert.equal((await kit.notes.get({ actorId: ACTOR, noteId: memo.id }))?.interaction, undefined);
});
