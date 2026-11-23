import assert from "node:assert/strict";
import test from "node:test";

import { attributeMessage, attributeSelection } from "../../features/agent-v1/clarify/attribution";
import type { SessionOpenItem } from "../../features/agent-v1/context/session-state";
import { createGraphExecutor } from "../../features/agent-v1/graph/executor";
import { acceptMessage, getRequestResult, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore, type AgentEntryStore } from "../../features/agent-v1/entry/store";
import type { AgentClarificationContract } from "../../shared/contract/agent-v1";
import { createCardKit } from "../services/agent-ledger-card-kit";
import { captureTrace, deepseekStub, graphKit, json, part, type Reply } from "./graph-kit";

/**
 * agent-design AG04-4, AG04-5 (易错边界 5, 6): which matter a new message continues is checked by code
 * against the open items; a click is bound without the model and only to an option that was offered;
 * a part is asked at most once; a question left unanswered for two unrelated messages is shelved and
 * the earlier request's part is written back as unfinished.
 */

const item = (overrides: Partial<SessionOpenItem>): SessionOpenItem => ({ createdAt: "2026-11-15T09:59:00.000Z", kind: "clarification", partId: "p1", ref: "clarification:agreq_1:p1", requestId: "agreq_1", summary: "s", unrelatedMessages: 0, ...overrides });

test("attributeMessage: continues must name an open item of that kind; anything else is a new request", () => {
  const open = [item({}), item({ kind: "alternative", partId: "p2", ref: "alternative:agreq_1:p2" })];
  const result = attributeMessage([
    { clarity: "clear", continues: { kind: "clarification", ref: "clarification:agreq_1:p1" }, localId: "p1" },
    { clarity: "clear", continues: { kind: "clarification", ref: "clarification:agreq_9:p1" }, localId: "p2" },
    { clarity: "clear", continues: { kind: "card", ref: "alternative:agreq_1:p2" }, localId: "p3" },
    { clarity: "clear", localId: "p4" },
  ], open);
  assert.equal(result.get("p1")?.kind, "clarification");
  assert.equal(result.get("p2")?.kind, "new", "not an open item");
  assert.equal(result.get("p3")?.kind, "new", "the kind must match the item");
  assert.equal(result.get("p4")?.kind, "new");
});

test("attributeMessage: an item is continued by one part only; an unreadable reply right after a question answers it", () => {
  const open = [item({})];
  const twice = attributeMessage([
    { clarity: "clear", continues: { kind: "clarification", ref: "clarification:agreq_1:p1" }, localId: "p1" },
    { clarity: "clear", continues: { kind: "clarification", ref: "clarification:agreq_1:p1" }, localId: "p2" },
  ], open);
  assert.equal(twice.get("p1")?.kind, "clarification");
  assert.equal(twice.get("p2")?.kind, "new");
  const vague = attributeMessage([{ clarity: "none", localId: "p1" }], open);
  assert.deepEqual([vague.get("p1")?.kind, (vague.get("p1") as { fallback?: boolean }).fallback], ["clarification", true]);
  assert.equal(attributeMessage([{ clarity: "none", localId: "p1" }], [item({ unrelatedMessages: 1 })]).get("p1")?.kind, "new", "only right after the question");
  assert.equal(attributeMessage([{ clarity: "clear", localId: "p1" }], open).get("p1")?.kind, "new", "a clear new message is not taken as the answer");
});

const offered: AgentClarificationContract[] = [{
  clarificationId: "agreq_1:p1:q",
  kind: "question",
  options: [{ capability: "todo.update", label: "李薇", optionId: "o1", ref: { id: "contact:c31", name: "李薇", type: "contact" } }],
  partId: "p1",
  state: "open",
}];

test("attributeSelection: a click binds only to an option that was offered, under an open question", () => {
  const ok = attributeSelection(offered, { clarificationId: "agreq_1:p1:q", optionId: "o1" });
  assert.equal(ok.ok, true);
  assert.deepEqual(attributeSelection(offered, { clarificationId: "agreq_1:p1:q", optionId: "contact:c99" }), { ok: false, reason: "OPTION_NOT_OFFERED" });
  assert.deepEqual(attributeSelection(offered, { clarificationId: "nope", optionId: "o1" }), { ok: false, reason: "CLARIFICATION_NOT_FOUND" });
  assert.deepEqual(attributeSelection([{ ...offered[0], state: "answered" }], { clarificationId: "agreq_1:p1:q", optionId: "o1" }), { ok: false, reason: "CLARIFICATION_CLOSED" });
});

function entry(replies: Reply[]) {
  const model = deepseekStub(replies);
  const kit = graphKit(model.fetchImplementation);
  const store: AgentEntryStore = createMemoryAgentEntryStore();
  const cards = createCardKit();
  const deps: AgentEntryDependencies = { execute: createGraphExecutor("mock", { ...kit.deps, entryStore: store, runtime: cards.runtime }), schedule: (task) => { void task(); }, sessions: null, store };
  let n = 0;
  const send = async (message: string, sessionId = "session:attr", locale: "zh" | "en" = "zh") => {
    n += 1;
    const { receipt } = await acceptMessage(deps, { actorId: "actor:a", body: { clientMessageId: `m:${n}`, locale, message, protocolVersion: 3, references: [], sessionId } });
    await settleSession("actor:a", sessionId);
    return (await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId }))!;
  };
  return { deps, kit, model, send, store };
}

const MOVE = json({ parts: [part({ clarity: "missing_one", deliverable: "change", objectClues: [{ entity: "todo", text: "那个" }], requiredCapabilities: ["todo.update"], sourceQuote: "把那个改到周五" })], plainChat: false });

test("asked once: a reply that still does not say which one is not asked again; the part is unfinished in both documents", async () => {
  const vague = (call: { user: string }) => {
    const handle = /o1 \(clarification\)/u.test(call.user) ? "o1" : null;
    return json({ parts: [part({ clarity: "none", sourceQuote: "就那个啊，你知道的", ...(handle ? { continues: { kind: "clarification", ref: handle } } : {}) })], plainChat: false });
  };
  const { model, send } = entry([MOVE, vague]);
  const first = await send("把那个改到周五。");
  assert.equal(first.status, "waiting_user");
  assert.equal(first.clarifications?.filter((set) => set.kind === "question").length, 1);
  const second = await send("就那个啊，你知道的。");
  assert.equal(model.calls.length, 2, "no answer call either: the sentence is code's");
  assert.equal(second.clarifications?.some((set) => set.kind === "question" || set.kind === "not_understood") ?? false, false, "not asked a second time");
  assert.equal(second.partResults[0].status, "unfinished");
  assert.match(second.answer?.text ?? "", /还缺一项：要改的是哪一条/u, "what is missing is what the question asked for");
  assert.match(second.answer?.text ?? "", /把那个改到周五/u, "it says which matter is still missing what");
  assert.match(second.answer?.text ?? "", /什么都没有改/u);
});

test("a question for a missing object with no clue words asks which one it is, nothing else", async () => {
  const noClue = json({ parts: [part({ clarity: "missing_one", deliverable: "change", requiredCapabilities: ["todo.update"], sourceQuote: "把那个改到周五" })], plainChat: false });
  const { send } = entry([noClue]);
  const first = await send("把那个改到周五。", "session:noclue");
  assert.match(first.answer?.text ?? "", /「把那个改到周五」要改的是哪一条/u);
  assert.doesNotMatch(first.answer?.text ?? "", /没看懂/u);
});

test("the earlier request is written back: its part is unfinished and its question answered by the later request", async () => {
  const vague = json({ parts: [part({ clarity: "none", continues: { kind: "clarification", ref: "o1" }, sourceQuote: "就那个啊，你知道的" })], plainChat: false });
  const { deps, send } = entry([MOVE, vague]);
  const first = await send("把那个改到周五。");
  const second = await send("就那个啊，你知道的。");
  const earlier = (await getRequestResult(deps, { actorId: "actor:a", requestId: first.requestId }))!;
  assert.equal(earlier.partResults[0].status, "unfinished");
  assert.equal(earlier.status, "completed", "nothing waits for the user any more");
  assert.equal(earlier.clarifications?.[0].state, "answered");
  assert.equal(earlier.clarifications?.[0].answeredBy, second.requestId);
  assert.ok(earlier.revision > first.revision);
});

test("not answered: one unrelated message later the question still waits; after two it is shelved and written back", async () => {
  const chat = (quote: string, reply: string) => json({ parts: [part({ sourceQuote: quote })], plainChat: true, reply });
  const trace = captureTrace();
  try {
    const { deps, send } = entry([
      json({ parts: [part({ clarity: "missing_one", deliverable: "change", objectClues: [{ entity: "todo", text: "it" }], requiredCapabilities: ["todo.update"], sourceQuote: "Move it to Friday." })], plainChat: false }),
      chat("what's a polite way to turn down a meeting invite?", "Thank them and decline briefly."),
      chat("And how early is too early to send a calendar invite?", "More than a month ahead is early."),
    ]);
    const first = await send("Move it to Friday.", "session:shelf", "en");
    await send("Actually, unrelated: what's a polite way to turn down a meeting invite?", "session:shelf", "en");
    const stillWaiting = (await getRequestResult(deps, { actorId: "actor:a", requestId: first.requestId }))!;
    assert.equal(stillWaiting.partResults[0].status, "awaiting_clarification", "one unrelated message: still waiting");
    assert.equal(stillWaiting.status, "waiting_user");
    const third = await send("And how early is too early to send a calendar invite?", "session:shelf", "en");
    assert.equal(third.answer?.text, "More than a month ahead is early.", "the new question is answered normally");
    const shelved = (await getRequestResult(deps, { actorId: "actor:a", requestId: first.requestId }))!;
    assert.equal(shelved.partResults[0].status, "unfinished");
    assert.equal(shelved.partResults[0].reason, "shelved");
    assert.equal(shelved.clarifications?.[0].state, "shelved");
    assert.equal(shelved.status, "completed");
    assert.ok(trace.events.some((event) => event.type === "open_item.shelved"));
  } finally {
    trace.restore();
  }
});

test("clarify_max_per_part: each question is traced once with its subgoal", async () => {
  const trace = captureTrace();
  try {
    const vague = json({ parts: [part({ clarity: "missing_one", continues: { kind: "clarification", ref: "o1" }, deliverable: "change", objectClues: [{ entity: "todo", text: "那个" }], requiredCapabilities: ["todo.update"], sourceQuote: "就是那个" })], plainChat: false });
    const { send } = entry([MOVE, vague]);
    await send("把那个改到周五。", "session:max");
    await send("就是那个", "session:max");
    const asked = trace.events.filter((event) => event.type === "clarify.asked");
    assert.equal(asked.length, 1);
    assert.match(String(asked[0].subgoal), /^clarification:agreq_[0-9a-f]+:p1$/u);
  } finally {
    trace.restore();
  }
});
