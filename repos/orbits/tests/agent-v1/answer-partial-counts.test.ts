import assert from "node:assert/strict";
import test from "node:test";

import { exactCountsIn, withoutPartialCounts } from "../../features/agent-v1/answer/counts";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { smallWorld } from "./read-kit";

/**
 * agent-design AG09 run-02 (coordinator, AE-RD-005 at 07381abeb): when this turn's read of the subject is partial (some
 * records could not be read, or a page whose total is unknown), a sentence stating an exact or total count of records or
 * interactions ("有一次", "只有一条", "一共3次", "1回だけ", "only once", "just one") is not delivered as such: a lead-in
 * before a colon becomes code's neutral lead, otherwise the count is taken out (zh, ja) or the sentence goes (en). A count
 * equal to a total the read itself gave stays. This extends aadce5173 (seen counts must agree with coverage).
 */

test("exact and total counts are found in zh, ja and en", () => {
  assert.deepEqual(exactCountsIn("这个月记下的和小林健的联系有一次：11月10日他给你打电话。"), [1]);
  assert.deepEqual(exactCountsIn("你们只有一条笔记。"), [1]);
  assert.deepEqual(exactCountsIn("一共3次。"), [3]);
  assert.deepEqual(exactCountsIn("你们只联系过一次。"), [1]);
  assert.deepEqual(exactCountsIn("今月は1回だけ電話がありました。"), [1]);
  assert.deepEqual(exactCountsIn("全部で2件です。"), [2]);
  assert.deepEqual(exactCountsIn("You only talked once this month."), [1]);
  assert.deepEqual(exactCountsIn("There is just one note."), [1]);
  assert.deepEqual(exactCountsIn("11月10日他给你打电话，说小陈在审核。"), [], "dates are not counts");
});

test("partial read: the RD-005 sentence keeps its content, its count goes; a known total stays", () => {
  const said = "这个月记下的和小林健的联系有一次：11月10日他给你打电话，说小陈在审核；你答应11月13日给他发报价。";
  const out = withoutPartialCounts(said, "zh", new Set());
  assert.equal(out.changed.length, 1);
  assert.doesNotMatch(out.text, /有一次/u);
  assert.match(out.text, /11月10日他给你打电话，说小陈在审核；你答应11月13日给他发报价。/u);
  assert.equal(withoutPartialCounts("你们只联系过一次，是11月10日。", "zh", new Set()).text, "你们联系过，是11月10日。");
  assert.equal(withoutPartialCounts("今月は1回だけ電話がありました。", "ja", new Set()).text, "今月は電話がありました。");
  assert.equal(withoutPartialCounts("You only talked once this month. He called on Nov 10.", "en", new Set()).text, "He called on Nov 10.");
  assert.equal(withoutPartialCounts("Only once: he called on Nov 10.", "en", new Set()).text, "In the records that could be read: he called on Nov 10.");
  assert.equal(withoutPartialCounts("全部で64件です。", "ja", new Set([64])).text, "全部で64件です。", "a total the read gave stays");
});

test("graph, AE-RD-005 wording: with one note unreadable, '有一次' is not delivered; the call and the partial line are", async () => {
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  for (const record of world.records) if (record.collection === "notes") (record.payload.note as Record<string, unknown>).accountId = record.userId;
  const records = recordAccessOf(world, { denied: new Set(["note:m31"]) });
  const message = "我和小林这个月都聊过什么？";
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林" }], readFilter: { from: "2026-11-01", to: "2026-11-30" }, requiredCapabilities: ["memo.read"], sourceQuote: "我和小林这个月都聊过什么" })], plainChat: false }),
    (call) => {
      const handle = /(s\d+) — memo/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: handle }], partId: "p1", text: "这个月记下的和小林健的联系有一次：11月10日他给你打电话，说小陈在审核；你答应11月13日给他发报价。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.deepEqual(result.partResults.map((item) => item.gaps), [["partial"]]);
  assert.doesNotMatch(result.text, /有一次/u);
  assert.match(result.text, /说小陈在审核/u);
  assert.match(result.text, /还有一部分相关记录这次读不到/u);
});
