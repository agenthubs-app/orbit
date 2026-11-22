import assert from "node:assert/strict";
import test from "node:test";

import { eventFactsOf } from "../../features/agent-v1/domains/event/read";
import { group } from "../../features/agent-v1/functions/group";
import { runFn } from "./functions-kit";

/**
 * agent-design AG10 (设计稿 §3.5 比较、分组与汇总; AE-FN-014): compared and grouped from the records' own fields by code; an
 * event whose fee the organizer did not fill in is "no price listed", never free; a group total counts unique records.
 */

test("a fee the organizer did not fill in is 'unstated', not free; the topics come from the description", () => {
  assert.deepEqual(eventFactsOf({ description: "主题：定价、SaaS", sourcePayload: { host: {} } }), { fee: { kind: "unstated" }, topics: ["定价", "SaaS"] });
  assert.deepEqual(eventFactsOf({ description: "主题：摄影", sourcePayload: { host: { feeKind: "free" } } }).fee, { kind: "free" });
  assert.deepEqual(eventFactsOf({ description: null, sourcePayload: { host: { feeAmountYen: 3000, feeKind: "amount" } } }).fee, { amountYen: 3000, kind: "amount" });
  // A published event holds feeKind "free" when the organizer never filled the fee in: the organizer's own fee line decides.
  assert.deepEqual(eventFactsOf({ description: "主题：定价、SaaS\n费用：未标价", sourcePayload: { host: { feeKind: "free" } } }).fee, { kind: "unstated" });
  assert.deepEqual(eventFactsOf({ description: "主题：摄影\n费用：免费", sourcePayload: { host: { feeKind: "free" } } }).fee, { kind: "free" });
  assert.deepEqual(eventFactsOf({ description: "费用：3000 日元", sourcePayload: { host: { feeKind: "free" } } }).fee, { amountYen: 3000, kind: "amount" });
});

test("group(): a record in several groups is in each, the total counts it once", () => {
  const { groups, total } = group([{ id: "m1", tags: ["a", "b"] }, { id: "m2", tags: ["a"] }, { id: "m1", tags: ["a", "b"] }], (item) => item.tags, ["a", "b"]);
  assert.equal(total, 2);
  assert.deepEqual(groups.map((item) => [item.key, item.items.map((entry) => entry.id)]), [["a", ["m1", "m2"]], ["b", ["m1"]]]);
});

test("AE-FN-014: compare two chosen events, then group 11-19..22 by fee — E103 is unpriced in both, never free; no ranking or extraction runs", async () => {
  const message = "对比一下 @街拍工作坊 和 @SaaS 定价研讨会 的时间、费用和主题，再把 11 月 19 日到 22 日的活动按免费和收费分个组。";
  const refs = [{ id: "event:e102", name: "街拍工作坊", type: "event" }, { id: "event:e103", name: "SaaS 定价研讨会", type: "event" }];
  const run = await runFn(message, [
    { dataSources: ["orbit_records"], deliverable: "comparison", objectClues: [{ entity: "event", referenceId: "r1", text: "@街拍工作坊" }, { entity: "event", referenceId: "r2", text: "@SaaS 定价研讨会" }], requiredCapabilities: ["event.read", "fn.compare"], sourceQuote: "对比一下 @街拍工作坊 和 @SaaS 定价研讨会 的时间、费用和主题" },
    { dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "event", text: "11 月 19 日到 22 日的活动" }], rank: { basis: "按免费和收费分组" }, readFilter: { from: "2026-11-19", to: "2026-11-22" }, requiredCapabilities: ["event.read", "fn.group"], sourceQuote: "再把 11 月 19 日到 22 日的活动按免费和收费分个组" },
  ], { references: refs });
  const text = run.result.text;
  assert.match(text, /「街拍工作坊」：时间：11月22日（周日） 09:30；费用：3000 日元；主题：摄影、街拍/u);
  assert.match(text, /「SaaS 定价研讨会」：时间：11月19日（周四） 19:00；费用：未标价（不等于免费）；主题：定价、SaaS/u);
  assert.match(text, /免费（2场）：\n- 「东京街头摄影展」，11月21日（周六） 10:00\n- 「独立出版市集」，11月22日（周日） 10:00/u);
  assert.match(text, /收费（2场）：\n- 「设计师之夜」，11月21日（周六） 19:00，2000 日元\n- 「街拍工作坊」，11月22日（周日） 09:30，3000 日元/u);
  assert.match(text, /未标价（不算免费）（1场）：\n- 「SaaS 定价研讨会」/u);
  assert.equal(run.result.partResults.every((part) => part.status === "answered"), true);
  assert.ok(!run.events.some((event) => ["fn.rank", "fn.extractInteractions", "fn.extractFollowUps"].includes(String(event.type))));
  assert.equal(run.modelCalls.length, 1, "only the first layer");
});
