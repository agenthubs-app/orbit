import assert from "node:assert/strict";
import test from "node:test";

import { stripSaveTalk } from "../../features/agent-v1/entry/approval-claims";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { runFn } from "./functions-kit";

/**
 * agent-design AG10 run-02 (coordinator, after the run-01 judging), each a code rule:
 *   1. AE-AMB-012: "小林今天又来电话催报价这件事我记下了" — nothing was written (an offer is not a write); first-person claims of
 *      having recorded or saved something are not delivered (zh, ja, en).
 *   2. AE-RD-008 (a): the lead about how a word was taken quotes the user's own word ("总结" is a summary asked for, not
 *      "整理一下"); (b) a memo that cannot be opened this turn gets no summary lead and no offers that act on its content.
 *   3. AE-AMB-004: a statement about a to-do offers a to-do, not a note.
 */

test("save claims in zh, ja and en are found; the user's own records and plain mentions are kept", () => {
  for (const said of [
    "明白了，小林今天又来电话催报价这件事我记下了。",
    "我记下了。",
    "好，记住了。",
    "已记录。",
    "我帮你记了这件事。",
    "存好了。",
    "その件はメモしました。",
    "記録しました。",
    "覚えておきます。",
    "I've noted it.",
    "I've saved that for you.",
    "I have recorded the call.",
    "Got it, I've noted that down.",
  ]) assert.equal(stripSaveTalk(said).dropped.length, 1, said);
  for (const kept of ["你在 11 月 12 日的笔记里记下了报价初稿。", "笔记里记录了小林的要求。", "You noted on Nov 12 that he wants the fee separate.", "我记得小林希望把实施费单列。"]) {
    assert.equal(stripSaveTalk(kept).dropped.length, 0, kept);
  }
});

test("AE-AMB-012 shape: a statement answered beside an offer does not say it was recorded", async () => {
  const message = "小林今天又来电话催报价了。";
  const model = deepseekStub((call: ModelCall) => (call.node === "understand"
    ? json({ language: "zh", parts: [part({ clarity: "statement", objectClues: [{ entity: "contact", text: "小林" }], sourceQuote: message })], plainChat: false })
    : json({ segments: [{ partId: "p1", text: "明白了，小林今天又来电话催报价这件事我记下了。报价待办计划在周三。" }] })));
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z" });
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input(message));
    assert.doesNotMatch(result.text, /记下了/u);
    assert.match(result.text, /报价待办计划在周三/u);
  } finally {
    trace.restore();
  }
});

test("AE-RD-008: '总结一下 @一篇打不开的笔记' — no '整理一下' lead, no offers on its content; the readable part is answered", async () => {
  const message = "总结一下 @客户笔记，再告诉我 @给小林发修订报价 计划哪天做。";
  const run = await runFn(message, [
    { dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "memo", referenceId: "r1", text: "@客户笔记" }], requiredCapabilities: ["memo.read", "fn.summarize"], sourceQuote: "总结一下 @客户笔记" },
    { dataSources: ["orbit_records"], objectClues: [{ entity: "todo", referenceId: "r2", text: "@给小林发修订报价" }], requiredCapabilities: ["todo.read"], sourceQuote: "@给小林发修订报价 计划哪天做" },
  ], {
    answer: (call) => {
      const handle = /(s\d+) — to-do/u.exec(call.user)?.[1] ?? "s1";
      return JSON.stringify({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p2", text: "计划在 11 月 18 日做。" }] });
    },
    references: [{ accessible: false, id: "note:mb1", name: "", type: "memo" } as never, { id: "task:t42", name: "给小林发修订报价", type: "todo" }],
  });
  assert.doesNotMatch(run.result.text, /整理一下/u);
  assert.doesNotMatch(run.result.text, /整理这篇笔记里的往来|列出我的待办候选/u);
  assert.equal(run.result.clarifications.filter((set) => set.kind === "entry").length, 0);
});

test("AE-RD-008 (a): a summary asked for in words ('总结一下') needs no lead; only '整理一下' is restated, in the user's own words", async () => {
  const references = [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }];
  const answer = (call: ModelCall) => {
    const handle = /(s\d+) — memo/u.exec(call.user)![1];
    return JSON.stringify({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "小林来电，说小陈在审核。" }] });
  };
  const summarize = await runFn("@11 月 10 日笔记 总结一下。", [{ dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }], requiredCapabilities: ["memo.read", "fn.summarize"], sourceQuote: "@11 月 10 日笔记 总结一下。" }], { answer, references });
  assert.doesNotMatch(summarize.result.text, /整理一下|理解成/u);
  const organize = await runFn("@11 月 10 日笔记 帮我整理整理。", [{ dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }], requiredCapabilities: ["memo.read", "fn.summarize"], sourceQuote: "@11 月 10 日笔记 帮我整理整理。" }], { answer, references });
  assert.match(organize.result.text, /我把“整理整理”理解成给这篇笔记写一段摘要/u);
});

test("AE-AMB-004: a conditional plan to add a to-do offers a to-do, not a note", async () => {
  const message = "If Emily doesn't send the dashboard spec by Friday, I should probably add a to-do to chase her.";
  const model = deepseekStub((call: ModelCall) => (call.node === "understand"
    ? json({ language: "en", parts: [part({ clarity: "statement", objectClues: [{ entity: "contact", text: "Emily" }], sourceQuote: message })], plainChat: false })
    : json({ segments: [{ partId: "p1", text: "That sounds reasonable; wait until Friday." }] })));
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf() });
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
    const entries = result.clarifications.filter((set) => set.kind === "entry").flatMap((set) => set.options.map((option) => option.capability));
    assert.deepEqual(entries, ["todo.create"]);
  } finally {
    trace.restore();
  }
});

test("AE-WEB-007 (run-02 gate): 'what does this review say' read from a page only — a summary of the page reads none of the user's records", async () => {
  const { webPartReads } = await import("../../features/agent-v1/graph/nodes/probe");
  const web = (capabilities: string[], dataSources: string[]) => ({ capabilities, plan: { dataSources }, route: "web_lookup" }) as never;
  assert.equal(webPartReads(web(["web.fetch", "fn.summarize"], ["public_web"])), false);
  assert.equal(webPartReads(web(["web.fetch", "fn.compare"], ["public_web", "orbit_records"])), true);
  assert.equal(webPartReads(web(["web.search", "memo.read"], ["public_web"])), true);
  assert.equal(webPartReads(web(["web.search", "contact.read"], ["public_web", "orbit_records"])), true);
});
