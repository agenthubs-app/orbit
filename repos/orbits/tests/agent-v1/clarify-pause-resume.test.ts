import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Pool } from "pg";

import { runAgentGraph, resumeAgentGraph } from "../../features/agent-v1/graph/build";
import { CHECKPOINT_SCHEMA, createPostgresCheckpointer } from "../../features/agent-v1/graph/checkpointer";
import { createGraphExecutor } from "../../features/agent-v1/graph/executor";
import { handleAgentV1Send } from "../../features/agent-v1/entry/http";
import { acceptMessage, acceptSelection, getRequestResult, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { AgentEntryError, createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import type { AgentSessionState } from "../../features/agent-v1/context/session-state";
import { createCardKit } from "../services/agent-ledger-card-kit";
import { captureTrace, deepseekStub, graphKit, json, part, type Reply } from "./graph-kit";

/**
 * agent-design AG04-4 (易错边界 6, 7): a question pauses the request's thread (interrupt); a click
 * resumes it from there without the model — no new model call, no question sent twice — and is bound
 * only to an offered option; a text answer resumes the earlier request while the rest of the sentence
 * is this round's own request. The click is stored first and processed in the session's order, and it
 * is not a new request.
 */

const IDLE_NOW = "2026-11-15T11:10:00.000Z";
const STATE: AgentSessionState = {
  lastMentioned: [{ at: "2026-11-15T10:00:00.000Z", id: "contact:c31", name: "李薇", type: "contact" }],
  openItems: [],
  sessionId: "session:resume",
  shownList: null,
  updatedAt: "2026-11-15T10:00:00.000Z",
};
const MESSAGE = "把她的待办改到周五。";
// AG06: after the click the write part goes on to the second layer (one call, inside the thread's budget).
const PROPOSE = json({ operations: [{ dateText: "周五", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", relations: [{ clue: "她", entity: "contact", role: "about" }], selector: { clues: ["待办"] }, verb: "update" }] });
const ASK = json({ parts: [part({ clarity: "missing_one", deliverable: "change", objectClues: [{ entity: "contact", text: "她" }, { entity: "todo", text: "待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "把她的待办改到周五" })], plainChat: false });

test("pause and resume in the graph: the click is bound to the offered person, no model call, the question is not sent again", async () => {
  const model = deepseekStub([ASK, PROPOSE]);
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation, { now: IDLE_NOW, state: STATE });
    await kit.seeded;
    const input = kit.input(MESSAGE, { sessionId: "session:resume" });
    const paused = await runAgentGraph(kit.deps, input);
    assert.equal(paused.status, "waiting_user");
    assert.equal(paused.paused, true);
    const [question] = paused.clarifications;
    assert.equal(question.kind, "question");
    assert.deepEqual(question.options.map((option) => [option.label, option.ref?.id]), [["李薇", "contact:c31"]]);
    assert.match(paused.text, /李薇/u);
    const calls = model.calls.length;
    const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: question.clarificationId, kind: "select", optionId: question.options[0].optionId }, { names: { "contact:c31": "李薇" } });
    assert.equal(model.calls.length, calls + 1, "resuming runs no understand; the one call is the second layer's (AG06)");
    assert.equal(model.calls.at(-1)?.node, "propose");
    assert.equal(resumed.modelCalls, paused.modelCalls + 1, "the budget is the same thread's");
    assert.equal(resumed.partResults[0].route, "propose_write");
    assert.equal(resumed.partResults[0].status, "unfinished");
    assert.doesNotMatch(resumed.text, /指的是哪一位|是李薇吗/u, "the question is not sent again");
    assert.match(resumed.text, /李薇/u);
    assert.equal(resumed.clarifications[0].state, "answered");
    assert.equal(resumed.clarifications[0].selectedOptionId, question.options[0].optionId);
    const handoffs = trace.events.filter((event) => event.type === "first_layer.handoff");
    const last = handoffs[handoffs.length - 1] as { parts: { objectClues: { text: string; recordId: string | null }[] }[] };
    assert.deepEqual(last.parts[0].objectClues.find((clue) => clue.text === "她")?.recordId, "contact:c31", "她 is bound by the click");
    assert.equal(trace.events.filter((event) => event.type === "node.enter" && event.node === "understand").length, 1, "understand is not run again");
    const session = await kit.sessionState.get("actor:a", "session:resume");
    assert.equal(session?.openItems.length, 0, "the answered question is no longer open");
  } finally {
    trace.restore();
  }
});

function entryKit(replies: Reply[], options: { now?: string; state?: AgentSessionState } = {}) {
  const model = deepseekStub(replies);
  const kit = graphKit(model.fetchImplementation, options);
  const store = createMemoryAgentEntryStore();
  const cards = createCardKit();
  const deps: AgentEntryDependencies = { execute: createGraphExecutor("mock", { ...kit.deps, entryStore: store, runtime: cards.runtime }), schedule: (task) => { void task(); }, sessions: null, store };
  return { deps, kit, model, store };
}

test("through the entry: a click is stored and processed in order, resumes the same request, and is never a new request", async () => {
  const { deps, kit, model, store } = entryKit([ASK, PROPOSE], { now: IDLE_NOW, state: STATE });
  await kit.seeded;
  const { receipt } = await acceptMessage(deps, { actorId: "actor:a", body: { clientMessageId: "m:1", locale: "zh", message: MESSAGE, protocolVersion: 3, references: [], sessionId: "session:resume" } });
  await settleSession("actor:a", "session:resume");
  const asked = (await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId }))!;
  const question = asked.clarifications!.find((set) => set.kind === "question")!;
  const body = { clientSelectionId: "sel:1", protocolVersion: 3 as const, selection: { clarificationId: question.clarificationId, optionId: question.options[0].optionId, requestId: receipt.requestId }, sessionId: "session:resume" };
  const click = await acceptSelection(deps, { actorId: "actor:a", body });
  assert.equal(click.receipt.requestId, receipt.requestId, "the click continues the same request");
  assert.equal(click.replayed, false);
  await settleSession("actor:a", "session:resume");
  const done = (await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId }))!;
  assert.equal(model.calls.length, 2, "AG06: understand, then the second layer after the click");
  assert.equal(done.status, "completed");
  assert.equal(done.partResults[0].status, "unfinished");
  assert.ok(done.answer?.text.startsWith(asked.answer!.text), "what was delivered stays; the continuation follows it");
  assert.match(done.answer!.text.slice(asked.answer!.text.length), /李薇/u);
  assert.equal((await store.lane("actor:a", "session:resume"))?.receivedSeq, 1, "no new request was received");
  // The same click sent again returns the first one; another option, or a second click, is refused.
  const again = await acceptSelection(deps, { actorId: "actor:a", body });
  assert.equal(again.replayed, true);
  await assert.rejects(acceptSelection(deps, { actorId: "actor:a", body: { ...body, clientSelectionId: "sel:2" } }), (error: unknown) => error instanceof AgentEntryError && error.code === "CLARIFICATION_CLOSED");
});

test("a click on an option that was not offered is refused at the entry and changes nothing", async () => {
  const { deps, kit } = entryKit([ASK, PROPOSE], { now: IDLE_NOW, state: STATE });
  await kit.seeded;
  const { receipt } = await acceptMessage(deps, { actorId: "actor:a", body: { clientMessageId: "m:1", locale: "zh", message: MESSAGE, protocolVersion: 3, references: [], sessionId: "session:resume" } });
  await settleSession("actor:a", "session:resume");
  const before = (await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId }))!;
  const question = before.clarifications!.find((set) => set.kind === "question")!;
  await assert.rejects(acceptSelection(deps, { actorId: "actor:a", body: { clientSelectionId: "sel:x", protocolVersion: 3, selection: { clarificationId: question.clarificationId, optionId: "contact:c17", requestId: receipt.requestId }, sessionId: "session:resume" } }), (error: unknown) => error instanceof AgentEntryError && error.code === "OPTION_NOT_OFFERED");
  const after = (await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId }))!;
  assert.deepEqual(after, before);
  const previous = process.env.ORBIT_AGENT_V1_MODE;
  process.env.ORBIT_AGENT_V1_MODE = "on";
  try {
    const response = await handleAgentV1Send({ actorId: "actor:a", body: { clientSelectionId: "sel:y", protocolVersion: 3, selection: { clarificationId: question.clarificationId, optionId: "contact:c17", requestId: receipt.requestId }, sessionId: "session:resume" }, dependencies: deps, mode: "mock" });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.context?.reason, "OPTION_NOT_OFFERED");
    const ok = await handleAgentV1Send({ actorId: "actor:a", body: { clientSelectionId: "sel:z", protocolVersion: 3, selection: { clarificationId: question.clarificationId, optionId: question.options[0].optionId, requestId: receipt.requestId }, sessionId: "session:resume" }, dependencies: deps, mode: "mock" });
    assert.equal(ok.status, 202);
    assert.equal((await ok.json()).data.agentSelection.requestId, receipt.requestId);
  } finally {
    if (previous === undefined) delete process.env.ORBIT_AGENT_V1_MODE;
    else process.env.ORBIT_AGENT_V1_MODE = previous;
  }
});

test("one sentence, two uses: the answer resumes the earlier request, the new request is answered too", async () => {
  const first = "帮我想想回访邮件的开头怎么写比较自然；另外田中那件事帮我处理一下。";
  const second = "看看他上次访谈说了什么就行。顺便再给这封邮件起个标题。";
  const { deps, model } = entryKit([
    json({ parts: [
      part({ localId: "p1", sourceQuote: "帮我想想回访邮件的开头怎么写比较自然" }),
      part({ clarity: "multiple_readings", localId: "p2", objectClues: [{ entity: "contact", text: "田中" }], readings: [{ capabilities: ["view.recentInteraction"], deliverable: "summary", label: "a" }, { capabilities: ["todo.update"], deliverable: "change", label: "b" }], requiredCapabilities: ["todo.update"], sourceQuote: "田中那件事帮我处理一下" }),
    ], plainChat: false }),
    json({ segments: [{ partId: "p1", text: "可以先感谢对方上次抽时间。" }] }),
    json({ parts: [
      part({ continues: { kind: "clarification", ref: "o1" }, dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "他" }], requiredCapabilities: ["memo.read"], sourceQuote: "看看他上次访谈说了什么就行" }),
      part({ localId: "p2", sourceQuote: "顺便再给这封邮件起个标题" }),
    ], plainChat: false }),
    json({ segments: [{ partId: "p2", text: "标题可以用「感谢您上次的访谈」。" }] }),
  ]);
  const send = async (message: string, n: number) => {
    const { receipt } = await acceptMessage(deps, { actorId: "actor:a", body: { clientMessageId: `m:${n}`, locale: "zh", message, protocolVersion: 3, references: [], sessionId: "session:two" } });
    await settleSession("actor:a", "session:two");
    return receipt.requestId;
  };
  const one = await send(first, 1);
  const afterOne = (await getRequestResult(deps, { actorId: "actor:a", requestId: one }))!;
  assert.deepEqual(afterOne.partResults.map((item) => item.status), ["answered", "awaiting_clarification"]);
  assert.equal(afterOne.clarifications?.filter((set) => set.kind === "question").length, 1, "only 田中那件事 is asked");
  const two = await send(second, 2);
  const doc = (await getRequestResult(deps, { actorId: "actor:a", requestId: two }))!;
  assert.equal(model.calls.length, 4);
  // AG05: the answered matter goes on and reads: "他" is the matter's person (田中), looked up in the account (empty here).
  assert.match(doc.answer!.text, /我不确定你说的是哪一位联系人/u, "the answered matter goes on and reads for the matter's person");
  assert.match(doc.answer!.text, /接着「田中那件事帮我处理一下」/u, "it says which earlier matter this goes on with");
  assert.match(doc.answer!.text, /感谢您上次的访谈/u, "and the new request is answered");
  assert.equal(doc.partResults.some((item) => item.route === "clarify"), false);
  const earlier = (await getRequestResult(deps, { actorId: "actor:a", requestId: one }))!;
  assert.equal(earlier.partResults[1].status, "answered", "the earlier part is written back from where it was continued");
  assert.equal(earlier.partResults[1].route, "read", "with the route it took there");
  assert.equal(earlier.clarifications?.find((set) => set.kind === "question")?.state, "answered");
  assert.equal(earlier.status, "completed");
});

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const pools: Pool[] = [];
after(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
});

test("Postgres checkpointer: a paused thread is resumed by a fresh graph (another process); checkpoints hold no names or words", { skip }, async () => {
  assert.match(new URL(databaseUrl!).hostname, /^(localhost|127\.0\.0\.1|::1)$/u, "only a local database");
  const saver = await createPostgresCheckpointer(databaseUrl!);
  try {
    const model = deepseekStub([ASK, PROPOSE]);
    const kit = graphKit(model.fetchImplementation, { now: IDLE_NOW, state: STATE });
    await kit.seeded;
    const deps = { ...kit.deps, checkpointer: saver };
    const input = kit.input(MESSAGE, { requestId: `agreq_pg_resume_${Date.now()}`, sessionId: "session:resume" });
    const paused = await runAgentGraph(deps, input);
    const question = paused.clarifications[0];
    const resumed = await resumeAgentGraph(deps, input, { clarificationId: question.clarificationId, kind: "select", optionId: question.options[0].optionId }, { names: { "contact:c31": "李薇" } });
    assert.equal(model.calls.length, 2, "AG06: understand, then the second layer after the click");
    assert.equal(resumed.partResults[0].route, "propose_write");
    assert.equal(resumed.paused, false);
    const pool = new Pool({ connectionString: databaseUrl });
    pools.push(pool);
    const rows = await pool.query(`select checkpoint::text as checkpoint, metadata::text as metadata from "${CHECKPOINT_SCHEMA}".checkpoints where thread_id = $1`, [input.requestId]);
    const blobs = await pool.query(`select convert_from(blob, 'UTF8') as blob from "${CHECKPOINT_SCHEMA}".checkpoint_blobs where thread_id = $1 and blob is not null`, [input.requestId]);
    const writes = await pool.query(`select convert_from(blob, 'UTF8') as blob from "${CHECKPOINT_SCHEMA}".checkpoint_writes where thread_id = $1`, [input.requestId]);
    const stored = JSON.stringify([rows.rows, blobs.rows, writes.rows]);
    for (const text of [MESSAGE, "把她的待办改到周五", "李薇"]) assert.equal(stored.includes(text), false, `checkpoint contains "${text}"`);
    assert.ok(stored.includes("contact:c31"), "the bound reference is kept");
  } finally {
    await saver.end();
  }
});
