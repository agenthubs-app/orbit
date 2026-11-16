import assert from "node:assert/strict";
import test from "node:test";

import { parseAnswerOutput, type Material } from "../../features/agent-v1/answer/schema";
import { verifyCitations } from "../../features/agent-v1/answer/verify";
import { splitSentences } from "../../features/agent-v1/text/sentences";

/**
 * agent-design AG05-3 (PLANNER 易错边界 4): every citation is checked by code — the handle is a record
 * read in this request and each sentence number exists in it. A records part without a valid citation is
 * dropped; a discussion part cites nothing. (The graph tests check the one repair and the budget.)
 */

const M31: Material = { handle: "s1", header: "memo, written 2026-11-12", kind: "memo", partId: "p1", ref: "memo:note:m31", sentences: splitSentences("和小林聊了报价初稿。小林希望把实施费单列，下周再对一次。"), version: "3" };

test("splitSentences numbers Chinese, Japanese and English sentences", () => {
  assert.deepEqual(M31.sentences, [{ id: 1, text: "和小林聊了报价初稿。" }, { id: 2, text: "小林希望把实施费单列，下周再对一次。" }]);
  assert.deepEqual(splitSentences("山本さんと打ち合わせ。原稿は12月5日までに送ると約束した。").map((item) => item.id), [1, 2]);
  assert.deepEqual(splitSentences("Call with Emily. She will send the dashboard spec by Friday. Version 3.5 is out.").map((item) => item.text), ["Call with Emily.", "She will send the dashboard spec by Friday.", "Version 3.5 is out."]);
  assert.deepEqual(splitSentences("第一行\n第二行！").map((item) => item.text), ["第一行", "第二行！"]);
});

test("valid citations map back to the record ref", () => {
  const output = parseAnswerOutput(JSON.stringify({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: "s1" }], partId: "p1", text: "11 月 12 日聊了报价初稿，小林希望实施费单列。" }] }));
  assert.equal(output.ok, true);
  const result = verifyCitations(output.ok ? output.value : { gaps: [], segments: [] }, { materials: [M31], readParts: new Set(["p1"]), wanted: new Set(["p1"]) });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.segments.get("p1")?.cites, [{ ref: "memo:note:m31", sentenceIds: [1, 2] }]);
});

test("a cited record not read in this request, or a sentence that does not exist, is refused", () => {
  const output = { gaps: [], segments: [{ cites: [{ sentenceIds: [1], sourceRef: "s9" }, { sentenceIds: [7], sourceRef: "s1" }], partId: "p1", text: "上次聊了降价。" }] };
  const result = verifyCitations(output, { materials: [M31], readParts: new Set(["p1"]), wanted: new Set(["p1"]) });
  assert.equal(result.segments.has("p1"), false, "nothing valid is left: the segment is dropped");
  assert.deepEqual(result.missing, ["p1"]);
  assert.ok(result.problems.some((problem) => problem.includes("\"s9\"")));
  assert.ok(result.problems.some((problem) => problem.includes("sentence 7")));
});

test("a records part with no citation is dropped; a discussion part keeps its text and cites nothing", () => {
  const output = { gaps: [], segments: [{ cites: [], partId: "p1", text: "上次聊了报价。" }, { cites: [], partId: "p2", text: "开头可以先感谢对方。" }] };
  const result = verifyCitations(output, { materials: [M31], readParts: new Set(["p1"]), wanted: new Set(["p1", "p2"]) });
  assert.equal(result.segments.has("p1"), false);
  assert.equal(result.segments.get("p2")?.text, "开头可以先感谢对方。");
  const cited = verifyCitations({ gaps: [], segments: [{ cites: [{ sentenceIds: [1], sourceRef: "s1" }], partId: "p2", text: "x" }] }, { materials: [M31], readParts: new Set(), wanted: new Set(["p2"]) });
  assert.ok(cited.problems.some((problem) => problem.includes("discussion")));
});

test("partly valid: the valid citations stay, the problem is still reported (for the one repair)", () => {
  const output = { gaps: [], segments: [{ cites: [{ sentenceIds: [2, 5], sourceRef: "s1" }], partId: "p1", text: "小林希望实施费单列。" }] };
  const result = verifyCitations(output, { materials: [M31], readParts: new Set(["p1"]), wanted: new Set(["p1"]) });
  assert.deepEqual(result.segments.get("p1")?.cites, [{ ref: "memo:note:m31", sentenceIds: [2] }]);
  assert.equal(result.problems.length, 1);
});
