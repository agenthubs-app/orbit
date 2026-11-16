import assert from "node:assert/strict";
import test from "node:test";

import { decideNextStep, type StepInput } from "../../features/agent-v1/clarify/next-step";
import type { AgentSessionState } from "../../features/agent-v1/context/session-state";
import { runAgentGraph, resumeAgentGraph } from "../../features/agent-v1/graph/build";
import { isPronounClue } from "../../features/agent-v1/route/decide";
import { deepseekStub, graphKit, json, part } from "./graph-kit";

/**
 * agent-design AG04 run-02 (设计稿 §3.10 "隔了多久算断开", §3.11 row 4): when the first layer had
 * nothing to resolve a pronoun from — the session was idle past 60 minutes, or there is no conversation
 * yet — and the message names nothing else, a part that needs an object and points at it only with a
 * pronoun or demonstrative is missing its object. Code asks, whatever clarity the model gave; it does
 * not guess. A pronoun the context did bind (shown list, last mentioned) still resolves.
 */

const step = (overrides: Partial<StepInput>): StepInput => ({ capabilities: [], clarity: "clear", hasContactClue: false, hypothesis: false, intentBasis: "instruction", negation: false, objectKind: null, readings: [], ...overrides });

test("the fixed zh/ja/en list: pronouns and demonstratives with only generic words around them", () => {
  for (const text of ["他", "她的", "他的待办", "那个", "这条", "那篇笔记", "它们", "彼女", "それ", "あの件", "彼のToDo", "it", "her", "her meeting", "that one", "this note", "them"]) assert.equal(isPronounClue(text), true, text);
  for (const text of ["小林", "@李薇", "给小林发修订报价这条待办", "那三份竞品笔记", "Emily", "the dashboard spec", "Cirrus Works", "山本さんのメモ", "约山本吃饭这条待办"]) assert.equal(isPronounClue(text), false, text);
});

test("an unbound pronoun on a part that needs an object asks for it, read or write, whatever the clarity", () => {
  assert.deepEqual(decideNextStep(step({ capabilities: ["todo.update"], clarity: "clear", unboundPronoun: true }), { asked: 0 }), { kind: "ask_missing" });
  assert.deepEqual(decideNextStep(step({ capabilities: ["todo.read"], clarity: "clear", unboundPronoun: true }), { asked: 0 }), { kind: "ask_missing" });
  assert.deepEqual(decideNextStep(step({ capabilities: ["todo.update"], clarity: "clear", unboundPronoun: true }), { asked: 1 }), { kind: "still_unclear", missing: "object" });
  assert.equal(decideNextStep(step({ capabilities: [], clarity: "clear", unboundPronoun: true }), { asked: 0 }).kind, "proceed", "a discussion needs no object");
  assert.equal(decideNextStep(step({ clarity: "statement", unboundPronoun: true }), { asked: 0 }).kind, "respond", "a statement about him is still a statement");
  assert.equal(decideNextStep(step({ capabilities: ["todo.create"], hypothesis: true, unboundPronoun: true }), { asked: 0 }).kind, "respond");
});

const IDLE: AgentSessionState = { lastMentioned: [{ at: "2026-11-15T10:00:00.000Z", id: "contact:c17", name: "小林健", type: "contact" }], openItems: [], sessionId: "session:a", shownList: null, updatedAt: "2026-11-15T10:00:00.000Z" };
const HE = (clarity: string, referenceId?: string) => json({ parts: [part({ clarity, deliverable: "change", objectClues: [{ entity: "contact", text: "他", ...(referenceId ? { referenceId } : {}) }, { entity: "todo", text: "他的待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "把他的待办改到周五" })], plainChat: false });

test("idle 70 minutes, the model says clear: code still asks who 他 is, the one mentioned last first; a click resumes it", async () => {
  const model = deepseekStub([HE("clear"), json({ operations: [{ dateText: "周五", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", relations: [{ clue: "他", entity: "contact", role: "about" }], selector: { clues: ["待办"] }, verb: "update" }] })]);
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T11:10:00.000Z", state: IDLE });
  await kit.seeded;
  const input = kit.input("把他的待办改到周五。");
  const asked = await runAgentGraph(kit.deps, input);
  assert.equal(asked.partResults[0].status, "awaiting_clarification");
  assert.equal(asked.status, "waiting_user");
  const [question] = asked.clarifications;
  assert.equal(question.asks, "object");
  assert.equal(question.options[0].ref?.id, "contact:c17");
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: question.clarificationId, kind: "select", optionId: question.options[0].optionId }, { names: { "contact:c17": "小林健" } });
  assert.equal(resumed.partResults[0].route, "propose_write", "after the click the object is no longer missing");
  assert.equal(model.calls.length, 2, "AG06: the second layer's one call after the click");
  assert.match(resumed.text, /没有找到小林健的待办/u, "the person picked is the one looked for");
});

test("not idle: a pronoun the context bound resolves; one it left unbound is not second-guessed inside the 60-minute window", async () => {
  const recent = [{ createdAt: "2026-11-15T09:58:00.000Z", role: "user" as const, text: "小林健是北辰软件的吧？" }, { createdAt: "2026-11-15T09:58:20.000Z", role: "assistant" as const, text: "这一版还不能读。" }];
  const state: AgentSessionState = { ...IDLE, updatedAt: "2026-11-15T09:58:20.000Z" };
  const bound = deepseekStub([(call) => HE("clear", /r1 contact 小林健/u.test(call.user) ? "r1" : undefined)]);
  const one = graphKit(bound.fetchImplementation, { messages: recent, state });
  await one.seeded;
  const result = await runAgentGraph(one.deps, one.input("把他的待办改到周五。"));
  assert.equal(result.partResults[0].route, "propose_write");
  assert.equal(result.clarifications.length, 0);
  const unbound = deepseekStub([HE("clear")]);
  const two = graphKit(unbound.fetchImplementation, { messages: recent, state });
  await two.seeded;
  assert.equal((await runAgentGraph(two.deps, two.input("把他的待办改到周五。"))).partResults[0].route, "propose_write", "within the window the first layer reads the conversation; code does not ask");
});

test("a pronoun that points at someone named in the same message is not missing (AE-AMB-012 shape)", async () => {
  const message = "小林今天又来电话催报价了。帮我看看给他的修订报价那条待办排在哪天。";
  const model = deepseekStub([
    json({ parts: [
      part({ clarity: "statement", localId: "p1", objectClues: [{ entity: "contact", text: "小林" }], sourceQuote: "小林今天又来电话催报价了" }),
      part({ dataSources: ["orbit_records"], localId: "p2", objectClues: [{ entity: "contact", text: "他" }, { entity: "todo", text: "给他的修订报价那条待办" }], requiredCapabilities: ["todo.read"], sourceQuote: "帮我看看给他的修订报价那条待办排在哪天" }),
    ], plainChat: false }),
    json({ segments: [{ partId: "p1", text: "可以先给个明确的时间。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.deepEqual(result.partResults.map((item) => item.route), ["answer", "read"]);
  assert.equal(result.clarifications.some((set) => set.kind === "question"), false);
});

test("a new conversation and only a demonstrative: asked (AE-AMB-007, AE-CTX-008 shape, clarity clear)", async () => {
  const model = deepseekStub([json({ parts: [part({ clarity: "clear", deliverable: "change", objectClues: [{ entity: "todo", text: "it" }], requiredCapabilities: ["todo.update"], sourceQuote: "Move it to Friday." })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input("Move it to Friday.", { locale: "en" }));
  assert.equal(result.partResults[0].status, "awaiting_clarification");
  assert.match(result.text, /what "it" refers to/u);
});

test("AG05: only a clue like 她的待办 (no person clue): the people mentioned last are still offered (AE-AMB-008 shape)", async () => {
  const model = deepseekStub([json({ parts: [part({ clarity: "missing_one", deliverable: "change", objectClues: [{ entity: "todo", text: "她的待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "把她的待办改到周五" })], plainChat: false })]);
  const state: AgentSessionState = { ...IDLE, lastMentioned: [{ at: "2026-11-15T10:00:00.000Z", id: "contact:c31", name: "李薇", type: "contact" }, { at: "2026-11-15T10:00:00.000Z", id: "note:m40", name: "李薇推荐了", type: "memo" }] };
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T11:10:00.000Z", state });
  await kit.seeded;
  const result = await runAgentGraph(kit.deps, kit.input("把她的待办改到周五。"));
  const question = result.clarifications.find((set) => set.kind === "question");
  assert.deepEqual(question?.options.map((option) => option.ref?.id), ["contact:c31"]);
});
