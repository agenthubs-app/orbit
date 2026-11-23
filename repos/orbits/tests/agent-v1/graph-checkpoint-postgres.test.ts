import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Pool } from "pg";

import { CHECKPOINT_SCHEMA, createPostgresCheckpointer } from "../../features/agent-v1/graph/checkpointer";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deepseekStub, graphKit, json, part } from "./graph-kit";

/**
 * agent-design AG03-4 on the real checkpointer: LangGraph's Postgres checkpointer in its own schema
 * of a local test database keeps one thread per request (thread id = requestId) with references and
 * progress only — no message text, no context text, no model output.
 * Needs ORBIT_LIFECYCLE_TEST_DATABASE_URL (a local, isolated database).
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const pools: Pool[] = [];

after(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
});

test("Postgres checkpoints of a request: thread = requestId, no text of the turn, the context or the model", { skip }, async () => {
  assert.match(new URL(databaseUrl!).hostname, /^(localhost|127\.0\.0\.1|::1)$/u, "only a local database");
  const saver = await createPostgresCheckpointer(databaseUrl!);
  const message = "@田中浩 是东和商事的采购主管吧？";
  const history = "上次和小林聊的那篇笔记还在吗？";
  const goal = "确认田中浩的职位和公司（采购主管）";
  const model = deepseekStub([json({ parts: [part({ dataSources: ["orbit_records"], goal, objectClues: [{ entity: "contact", referenceId: "r1", text: "@田中浩" }], requiredCapabilities: ["contact.read"], sourceQuote: message })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { messages: [{ createdAt: "2026-11-15T09:58:00.000Z", role: "user", text: history }, { createdAt: "2026-11-15T09:58:20.000Z", role: "assistant", text: "在，是 11 月 12 日那篇。" }], references: [{ id: "contact:c30", name: "田中浩", type: "contact" }] });
  const input = kit.input(message, { references: [{ id: "contact:c30", type: "contact" }], requestId: `agreq_pg_${Date.now()}` });
  await runAgentGraph({ ...kit.deps, checkpointer: saver }, input);
  const pool = new Pool({ connectionString: databaseUrl });
  pools.push(pool);
  const rows = await pool.query(`select thread_id, checkpoint::text as checkpoint, metadata::text as metadata from "${CHECKPOINT_SCHEMA}".checkpoints where thread_id = $1`, [input.requestId]);
  const blobs = await pool.query(`select convert_from(blob, 'UTF8') as blob from "${CHECKPOINT_SCHEMA}".checkpoint_blobs where thread_id = $1 and blob is not null`, [input.requestId]);
  const writes = await pool.query(`select convert_from(blob, 'UTF8') as blob from "${CHECKPOINT_SCHEMA}".checkpoint_writes where thread_id = $1`, [input.requestId]);
  assert.ok(rows.rows.length >= 5, `one checkpoint per step (${rows.rows.length})`);
  const stored = JSON.stringify([rows.rows, blobs.rows, writes.rows]);
  for (const text of [message, "东和商事", history, goal, "11 月 12 日那篇", "田中浩"]) assert.equal(stored.includes(text), false, `checkpoint contains "${text}"`);
  assert.ok(stored.includes("contact:c30"), "the reference is kept");
  await saver.end();
});
