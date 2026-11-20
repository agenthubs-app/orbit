import assert from "node:assert/strict";
import test from "node:test";

import { countsIn, numbersIn, unsourcedCounts, withoutUnsourcedCounts } from "../../features/agent-v1/answer/counts";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deepseekStub, graphKit, json, part, type ModelCall } from "./graph-kit";

/**
 * agent-design AG08, AG07 交接 (a) (AE-UND-006): a count of the user's records in an answer must come from a read made
 * this turn; otherwise the sentence is not delivered. Advice that happens to be numbered is not a count of records.
 */

test("record counts are found in zh, ja and en; numbered advice is not a count", () => {
  assert.deepEqual(countsIn("山本さんとの食事は3件あります。"), [3]);
  assert.deepEqual(countsIn("你一共有 3 条没做完的待办。"), [3]);
  assert.deepEqual(countsIn("有两篇笔记提到了报价。"), [2]);
  assert.deepEqual(countsIn("You have 3 open to-dos with Emily."), [3]);
  assert.deepEqual(countsIn("There are two notes about the quote."), [2]);
  assert.deepEqual(countsIn("全部で5件です。"), [5]);
  assert.deepEqual(countsIn("分五点说：第一，先了解客户。"), []);
  assert.deepEqual(countsIn("给你三个开场话题。"), []);
  assert.deepEqual(countsIn("Here are three tips for short emails."), []);
  // Hotfix 2026-11-20 (AE-UND-006 run-03): points of advice are not a count of the user's records; the sentence stays.
  assert.deepEqual(countsIn("確認すべき点は3つあります。"), []);
  assert.deepEqual(countsIn("There are three things to check first."), []);
  assert.deepEqual(countsIn("山本さんとの食事は3件あります。"), [3], "a count of records still counts");
});

test("a count no source gives is dropped with its sentence; one the read gives stays", () => {
  const text = "上司の方は予定を整理したいのだと思います。山本さんとの食事は3件あります。まずは意図を確認しましょう。";
  const dropped = unsourcedCounts(text, numbersIn(["上司から「山本さんとの食事の件は全部キャンセルしておいて」ってメッセージが来た"]));
  assert.deepEqual(dropped, [3]);
  assert.equal(withoutUnsourcedCounts(text, dropped), "上司の方は予定を整理したいのだと思います。まずは意図を確認しましょう。");
  assert.deepEqual(unsourcedCounts("你有 2 条待办。", new Set([2])), [], "a count the read gave stays");
  assert.equal(withoutUnsourcedCounts("You have 3 open to-dos. Start with the oldest.", [3]), "Start with the oldest.");
});

test("AE-UND-006 graph: a discussion that read nothing does not state how many records there are", async () => {
  const message = "上司から「山本さんとの食事の件は全部キャンセルしておいて」ってメッセージが来たんだけど、これってどういうつもりだと思う？";
  const replies: Record<string, (call: ModelCall) => string> = {
    answer: () => json({ segments: [{ partId: "p1", text: "おそらく予定を一度整理したいという意味だと思います。山本さんとの食事は3件あります。キャンセルする前に意図を確認するのがよいでしょう。" }] }),
    understand: () => json({ language: "ja", parts: [part({ clarity: "statement", sourceQuote: message })], plainChat: false }),
  };
  const model = deepseekStub((call) => replies[call.node ?? ""](call));
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z" });
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "ja" }));
  assert.doesNotMatch(result.text, /3件/u);
  assert.match(result.text, /意図を確認する/u);
});

test("AE-UND-006 graph: the same holds for a plain-chat reply of the first layer", async () => {
  const message = "上司から「山本さんとの食事の件は全部キャンセルしておいて」ってメッセージが来たんだけど、これってどういうつもりだと思う？";
  const model = deepseekStub([json({ language: "ja", parts: [part({ sourceQuote: message })], plainChat: true, reply: "予定を整理したいのでしょう。山本さんとの食事は3件あります。まず確認しましょう。" })]);
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z" });
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "ja" }));
  assert.doesNotMatch(result.text, /3件/u);
  assert.match(result.text, /まず確認しましょう/u);
});
