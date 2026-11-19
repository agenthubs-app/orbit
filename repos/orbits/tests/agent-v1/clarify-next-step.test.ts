import assert from "node:assert/strict";
import test from "node:test";

import { decideNextStep, type StepInput } from "../../features/agent-v1/clarify/next-step";
import { DEFAULT_READINGS, mostLikelyReading } from "../../features/agent-v1/clarify/default-readings";
import { runAgentGraph, resumeAgentGraph } from "../../features/agent-v1/graph/build";
import { decideRoute } from "../../features/agent-v1/route/decide";
import { CAPABILITY_TABLE } from "../../features/agent-v1/route/capabilities";
import type { UnderstandPart } from "../../features/agent-v1/understand/schema";
import { captureTrace, deepseekStub, graphKit, json, part } from "./graph-kit";

/**
 * agent-design AG04-1, AG04-2, AG04-3: the next step of an unclear part is decided by code from the
 * six rows of 设计稿 §3.11, never by the model. Model calls are stubs (no real host is ever called).
 */

const step = (overrides: Partial<StepInput>): StepInput => ({
  capabilities: [],
  clarity: "clear",
  hasContactClue: false,
  hypothesis: false,
  intentBasis: "instruction",
  negation: false,
  objectKind: null,
  readings: [],
  ...overrides,
});

const routePart = (overrides: Partial<UnderstandPart>): UnderstandPart => ({
  clarity: "clear",
  constraints: [],
  dataOwner: "self",
  dataSources: [],
  deliverable: "answer",
  dependsOn: [],
  goal: "g",
  intentBasis: "instruction",
  localId: "p1",
  objectClues: [],
  persistence: "this_turn",
  requiredCapabilities: [],
  sourceQuote: "q",
  ...overrides,
});

test("row 1: nothing can be read out of it → not understood; asked once already → still unclear, no second question", () => {
  assert.deepEqual(decideNextStep(step({ clarity: "none" }), { asked: 0 }), { kind: "not_understood" });
  assert.deepEqual(decideNextStep(step({ clarity: "none" }), { asked: 1 }), { kind: "still_unclear", missing: "intent" });
  assert.equal(decideRoute(routePart({ clarity: "none" })).route, "clarify");
});

test("row 2: a statement or a hypothesis is answered, never a write; at most one entry, offered only", () => {
  const statement = decideNextStep(step({ clarity: "statement", hasContactClue: true }), { asked: 0 });
  assert.deepEqual(statement, { conservative: false, entry: "memo.create", kind: "respond" });
  assert.deepEqual(decideNextStep(step({ clarity: "statement" }), { asked: 0 }), { conservative: false, entry: null, kind: "respond" });
  const hypothesis = decideNextStep(step({ capabilities: ["todo.create"], hypothesis: true }), { asked: 0 });
  assert.deepEqual(hypothesis, { conservative: true, entry: "todo.create", kind: "respond" });
  const negated = decideNextStep(step({ capabilities: ["todo.update"], negation: true }), { asked: 0 });
  assert.deepEqual(negated, { conservative: true, entry: null, kind: "respond" }, "after 先别改 nothing is offered");
});

test("row 2 (易错边界 3): a write tag that conflicts with a statement tag is taken conservatively — answered, not propose_write", () => {
  // What fault mistag_write produces: the statement part marked as a change with a write capability.
  const mistagged = routePart({ clarity: "statement", deliverable: "change", requiredCapabilities: ["memo.create"], sourceQuote: "小林今天又来电话催报价了" });
  const decision = decideRoute(mistagged);
  assert.equal(decision.route, "answer");
  assert.equal(decision.verdict, "accept");
  assert.deepEqual(decision.blockedWrites, ["memo.create"]);
  assert.equal(decision.step?.kind, "respond");
  // Only an instruction or a selection, clear or missing one, with no negation/hypothesis, may become a write.
  assert.equal(decideRoute(routePart({ deliverable: "change", requiredCapabilities: ["todo.update"] })).route, "propose_write");
  assert.equal(decideRoute(routePart({ deliverable: "change", intentBasis: "selection", requiredCapabilities: ["memo.create"] })).route, "propose_write");
  assert.equal(decideRoute(routePart({ deliverable: "change", intentBasis: "accepted_context", requiredCapabilities: ["memo.create"] })).route, "answer");
});

test("row 3: several readings that only read → the most likely one is done; the others are entries (at most two)", () => {
  const readings = [
    { capabilities: ["memo.read", "fn.extractFollowUps"], deliverable: "list" },
    { capabilities: ["memo.read", "fn.summarize"], deliverable: "summary" },
    { capabilities: ["memo.read", "fn.compare"], deliverable: "comparison" },
    { capabilities: ["memo.read", "fn.extractInteractions"], deliverable: "list" },
  ] as StepInput["readings"];
  const next = decideNextStep(step({ capabilities: ["memo.read"], clarity: "multiple_readings", objectKind: "memo", readings }), { asked: 0 });
  assert.equal(next.kind, "most_likely");
  if (next.kind !== "most_likely") return;
  assert.deepEqual(next.reading.capabilities, DEFAULT_READINGS.memo.capabilities, "a note's registered default is its summary");
  assert.equal(next.basis, "default");
  assert.ok(next.others.length <= 2);
  assert.ok(next.others.every((reading) => !reading.capabilities.includes("fn.summarize")), "the chosen reading is not offered again");
  assert.equal(decideRoute(routePart({ clarity: "multiple_readings", readings, requiredCapabilities: ["memo.read"] } as never), { objectKind: "memo" }).route, "read");
});

test("row 3: the four registered defaults and the order page → session topic → record kind", () => {
  assert.deepEqual(DEFAULT_READINGS.memo.capabilities, ["memo.read", "fn.summarize"]);
  assert.deepEqual(DEFAULT_READINGS.contact.capabilities, ["view.recentInteraction", "todo.read"]);
  assert.deepEqual(DEFAULT_READINGS.event.capabilities, ["event.read", "attendance.read"]);
  assert.deepEqual(DEFAULT_READINGS.todo.capabilities, ["todo.read", "contact.read"]);
  const readings = [{ capabilities: ["todo.read"], deliverable: "list" }, { capabilities: ["memo.read", "fn.summarize"], deliverable: "summary" }] as never;
  assert.equal(mostLikelyReading({ objectKind: "memo", pageKind: "contact", readings })?.basis, "page");
  assert.deepEqual(mostLikelyReading({ objectKind: "memo", pageKind: "contact", readings })?.reading.capabilities, DEFAULT_READINGS.contact.capabilities);
  assert.equal(mostLikelyReading({ objectKind: "memo", readings, topicKind: "todo" })?.basis, "topic");
  assert.equal(mostLikelyReading({ objectKind: "memo", readings })?.basis, "default");
  // Picking and ranking have no registered default: with no basis at all, ask.
  assert.equal(mostLikelyReading({ objectKind: null, readings: [{ capabilities: ["contact.read", "fn.rank"], deliverable: "ranked_list" }] as never }), null);
  assert.equal(decideNextStep(step({ capabilities: ["contact.read", "fn.rank"], clarity: "multiple_readings", readings: [{ capabilities: ["contact.read", "fn.rank"], deliverable: "ranked_list" }] as never }), { asked: 0 }).kind, "ask_readings");
});

test("rows 4 and 5: a write missing one item asks for it; readings that include a write are never guessed", () => {
  assert.deepEqual(decideNextStep(step({ capabilities: ["todo.update"], clarity: "missing_one" }), { asked: 0 }), { kind: "ask_missing" });
  assert.deepEqual(decideNextStep(step({ capabilities: ["todo.update"], clarity: "missing_one" }), { asked: 1 }), { kind: "still_unclear", missing: "object" });
  const readings = [{ capabilities: ["view.recentInteraction"], deliverable: "summary" }, { capabilities: ["todo.update"], deliverable: "change" }] as StepInput["readings"];
  const next = decideNextStep(step({ capabilities: ["view.recentInteraction", "todo.update"], clarity: "multiple_readings", objectKind: "contact", readings }), { asked: 0 });
  assert.equal(next.kind, "ask_readings", "a contact default exists, but one reading writes: ask, do not guess");
  assert.deepEqual(decideNextStep(step({ capabilities: ["todo.update"], clarity: "multiple_readings", readings }), { asked: 1 }), { kind: "still_unclear", missing: "reading" });
  const decision = decideRoute(routePart({ clarity: "multiple_readings", readings, requiredCapabilities: ["todo.update"] } as never));
  assert.equal(decision.route, "clarify");
  assert.equal(decision.waitReason, "object_ambiguous");
  assert.equal(decideRoute(routePart({ clarity: "missing_one", deliverable: "change", requiredCapabilities: ["todo.update"] }), { asked: 1 }).route, "clarify");
});

test("AG07 gate (AE-XL-005): 'missing_one' on a write whose object is named in its own words and whose new date is said is not asked; code finds the record (and asks with candidates if several fit)", () => {
  assert.deepEqual(decideNextStep(step({ capabilities: ["todo.update"], clarity: "missing_one", namedObjectWithDate: true }), { asked: 0 }), { kind: "proceed" });
  assert.deepEqual(decideNextStep(step({ capabilities: ["todo.update"], clarity: "missing_one", namedObjectWithDate: false }), { asked: 0 }), { kind: "ask_missing" }, "no named object or no date: still asked");
  assert.equal(decideRoute(routePart({ clarity: "missing_one", deliverable: "change", requiredCapabilities: ["todo.update"] }), { asked: 0, namedObjectWithDate: true }).route, "propose_write");
  assert.equal(decideRoute(routePart({ clarity: "missing_one", deliverable: "change", requiredCapabilities: ["todo.update"] }), { asked: 0 }).route, "clarify");
});

const NOW = "2026-11-15T10:00:00.000Z";

test("AG04-1: only a name → one fixed sentence and two or three registered directions about it; no read, no second model call", async () => {
  const model = deepseekStub([json({ parts: [part({ clarity: "none", objectClues: [{ entity: "contact", text: "小林" }], sourceQuote: "小林" })], plainChat: false })]);
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation, { now: NOW });
    const result = await runAgentGraph(kit.deps, kit.input("小林"));
    assert.equal(model.calls.length, 1, "no answer call: the sentence is code's");
    assert.match(result.text, /没看懂/u);
    const [set] = result.clarifications;
    assert.equal(set.kind, "not_understood");
    assert.ok(set.options.length >= 2 && set.options.length <= 3);
    assert.ok(set.options.every((option) => option.label.includes("小林")), "directions carry the clue's words");
    assert.ok(set.options.every((option) => option.capability && option.capability in CAPABILITY_TABLE), "every direction is an Appendix A capability");
    assert.equal(trace.events.some((event) => /^(read\.|web\.)/u.test(String(event.type))), false, "nothing read to find out who 小林 is");
  } finally {
    trace.restore();
  }
});

test("AG04-1: no context at all → exactly the three generic entries", async () => {
  const model = deepseekStub([json({ parts: [part({ clarity: "none", sourceQuote: "えっと…" })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { now: NOW });
  const result = await runAgentGraph(kit.deps, kit.input("えっと…", { locale: "ja" }));
  assert.equal(model.calls.length, 1);
  assert.deepEqual(result.clarifications[0].options.map((option) => option.capability), ["contact.read", "memo.create", "todo.create"]);
  assert.match(result.text, /分かりません|分かりませんでした/u);
});

test("AG04-2: a mistagged statement is answered with at most one entry; clicking the entry makes a selection part that goes to the second layer (AG06)", async () => {
  const message = "小林今天又来电话催报价了。帮我看看给他的修订报价那条待办排在哪天。";
  const model = deepseekStub([
    json({ parts: [
      part({ clarity: "statement", deliverable: "change", localId: "p1", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["memo.create"], sourceQuote: "小林今天又来电话催报价了" }),
      part({ dataSources: ["orbit_records"], localId: "p2", objectClues: [{ entity: "todo", text: "给他的修订报价那条待办" }], requiredCapabilities: ["todo.read"], sourceQuote: "帮我看看给他的修订报价那条待办排在哪天" }),
    ], plainChat: false }),
    json({ segments: [{ partId: "p1", text: "催得这么紧，回电时可以先给一个确定的发送时间。" }] }),
    // AG06: after the click, the second layer's one call for the new memo part.
    json({ operations: [{ channel: "phone", dependsOn: [], direction: "incoming", entity: "memo", fields: [{ name: "body", valueText: "小林今天又来电话催报价了" }], localId: "w1", partId: "p1s1", relations: [{ clue: "小林", entity: "contact", role: "actual_contact" }], verb: "create" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { now: NOW });
  const input = kit.input(message);
  const result = await runAgentGraph(kit.deps, input);
  // AG05: p2 reads (an empty account here: nothing found, still answered, with the no_record gap).
  assert.deepEqual(result.partResults.map((item) => [item.partId, item.route, item.status, item.gaps]), [["p1", "answer", "answered", undefined], ["p2", "read", "answered", ["no_record"]]]);
  assert.equal(result.status, "completed");
  const entries = result.clarifications.flatMap((set) => set.options);
  assert.equal(entries.length, 1, "at most one entry");
  assert.equal(entries[0].capability, "memo.create");
  assert.doesNotMatch(result.text, /已(经)?记(下|好)|记进了/u);
  const entry = result.clarifications[0];
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: entry.clarificationId, kind: "select", optionId: entry.options[0].optionId });
  assert.equal(model.calls.length, 3, "the click runs no understand; the one new call is the second layer's (AG06)");
  assert.equal(model.calls.at(-1)?.node, "propose");
  const created = resumed.partResults.find((item) => item.partId !== "p1" && item.partId !== "p2");
  assert.ok(created, "the click made a new part");
  assert.equal(created!.route, "propose_write");
  // This kit has no contacts: the person is not found, so nothing is proposed and no card is mentioned.
  assert.equal(created!.status, "unfinished");
  assert.match(resumed.text, /我不确定你说的是哪一位联系人/u, "AG06 repair 1: never \"not found\" for a person");
  assert.doesNotMatch(resumed.text, /确认卡/u);
  const handoff = (resumed.state.parts.find((item) => item.localId === created!.partId))!;
  assert.equal(handoff.plan.intentBasis, "selection");
});

test("AG04-2: the answer to a statement never says it was noted or saved; it answers only its own items", async () => {
  const { answerSystemPrompt } = await import("../../features/agent-v1/understand/prompt");
  const prompt = answerSystemPrompt("zh");
  assert.match(prompt, /never say you noted, saved, recorded or will remember/u);
  assert.match(prompt, /Answer only the items listed below/u);
});

test("repair round 1: the first layer lists change readings for 'handle it', and goals stand on their own for the answer step", async () => {
  const { answerSystemPrompt, understandSystemPrompt } = await import("../../features/agent-v1/understand/prompt");
  const understand = understandSystemPrompt();
  assert.match(understand, /handling or taking care of a matter usually means doing something about it/iu);
  assert.match(understand, /goal must stand on its own/u);
  // Repair round 2: only looking at a record reads; the change readings are for handling a matter.
  assert.match(understand, /only to look at or check a record[^.]*has only readings that read — never a change/u);
  // run-02 repair round 1: the answer step now also sees the conversation window; the goal still counts.
  assert.match(answerSystemPrompt("zh"), /work from it and from the item's goal/u);
});

test("AG04-3: a person named only in words is said back by those words in the understanding", async () => {
  const model = deepseekStub([json({ parts: [part({ clarity: "multiple_readings", objectClues: [{ entity: "contact", text: "田中" }], readings: [{ capabilities: ["view.recentInteraction", "todo.read"], deliverable: "summary", label: "a" }, { capabilities: ["memo.read", "fn.summarize"], deliverable: "summary", label: "b" }], requiredCapabilities: ["view.recentInteraction"], sourceQuote: "田中最近怎么样" })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { now: NOW });
  const result = await runAgentGraph(kit.deps, kit.input("田中最近怎么样"));
  assert.match(result.text, /^我按「看和田中最近的往来、还有没做完的事」来理解/u);
});

test("AG04-3: @ a note and 「帮我看看」 → the summary is the reading, said first; the other readings are entries; nothing asked", async () => {
  const message = "@竞品笔记 A 帮我看看";
  const model = deepseekStub([json({ parts: [part({ clarity: "multiple_readings", dataSources: ["orbit_records"], objectClues: [{ entity: "memo", referenceId: "r1", text: "@竞品笔记 A" }], readings: [
    { capabilities: ["memo.read", "fn.summarize"], deliverable: "summary", label: "总结" },
    { capabilities: ["memo.read", "fn.extractFollowUps"], deliverable: "list", label: "找跟进" },
    { capabilities: ["memo.read", "fn.compare"], deliverable: "comparison", label: "对比" },
  ], requiredCapabilities: ["memo.read"], sourceQuote: "帮我看看" })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { now: NOW, references: [{ id: "note:m33", name: "", type: "memo" }] });
  const result = await runAgentGraph(kit.deps, kit.input(message, { references: [{ id: "note:m33", type: "note" }] }));
  assert.equal(model.calls.length, 1);
  assert.equal(result.partResults[0].route, "read");
  assert.match(result.text, /^我按「看这篇笔记的摘要」来理解/u, "the understanding comes first, in code's words");
  const sets = result.clarifications;
  assert.ok(sets.every((set) => set.kind === "entry"), "entries, not a question");
  assert.ok(sets.flatMap((set) => set.options).length <= 2);
  assert.ok(sets.flatMap((set) => set.options).every((option) => !["总结", "找跟进", "对比"].includes(option.label)), "the model's labels are never shown");
});

test("AG04-3: readings that include a write are asked, listed as code's directions; no reading of data to understand them", async () => {
  const model = deepseekStub([json({ parts: [part({ clarity: "multiple_readings", objectClues: [{ entity: "contact", text: "小林" }], readings: [
    { capabilities: ["view.recentInteraction"], deliverable: "summary", label: "x" },
    { capabilities: ["todo.update"], deliverable: "change", label: "y" },
    { capabilities: ["memo.create"], deliverable: "change", label: "z" },
    { capabilities: ["external.otherTool"], deliverable: "answer", label: "not offered" },
  ], requiredCapabilities: ["view.recentInteraction", "todo.update"], sourceQuote: "帮我处理一下小林那件事" })], plainChat: false })]);
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation, { now: NOW });
    const result = await runAgentGraph(kit.deps, kit.input("帮我处理一下小林那件事。"));
    assert.equal(result.partResults[0].status, "awaiting_clarification");
    assert.equal(result.status, "waiting_user");
    const [set] = result.clarifications;
    assert.equal(set.kind, "question");
    assert.deepEqual(set.options.map((option) => option.capability), ["view.recentInteraction", "todo.update", "memo.create"], "external.* is dropped: not an Orbit capability");
    assert.ok(set.options.every((option) => option.label.includes("小林")));
    assert.equal(trace.events.some((event) => /^read\./u.test(String(event.type))), false);
  } finally {
    trace.restore();
  }
});
