import assert from "node:assert/strict";
import test from "node:test";

import { stripSaveTalk } from "../../features/agent-v1/entry/approval-claims";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";

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
