import assert from "node:assert/strict";
import { test } from "node:test";

import { countsIn, seenCountsIn, withoutUnsourcedCounts, withoutWrongSeenCounts } from "../../features/agent-v1/answer/counts";
import { withoutUnsourcedDates } from "../../features/agent-v1/answer/dates";
import { withCodeLateness, withoutFalseReadClaims, withoutFieldLabels } from "../../features/agent-v1/answer/list-or-text";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deepseekStub, graphKit, json, part } from "./graph-kit";

/**
 * Hotfix 1c (judge of 20261120-140053-2f51749-hotfix-regression-run-03):
 *  - AE-UND-006: a discussion lost its opening sentence over 「3つ」 — advice points are not a count of records;
 *  - AE-RD-012 turn 2: 「已逾期一天」 beside a card saying 已过期5天 — lateness is code's;
 *  - AE-SCL-008: a raw 「Notes: 已过期」 label; 「10件だけ」 beside code's 「50件を見ました」;
 *  - AE-UND-015: "could not be read" though the read was complete;
 *  - English answers: lines glued into 「latest.He」 and 「.- 」 runs by the sentence rules.
 */

test("AE-UND-006: a discussion that says how many points to check keeps its opening sentence (ja, en)", async () => {
  assert.deepEqual(countsIn("確認すべき点は3つあります。"), []);
  assert.deepEqual(countsIn("There are three things to check first."), []);
  const message = "上司から「山本さんとの食事の件は全部キャンセルしておいて」ってメッセージが来たんだけど、これってどういうつもりだと思う？";
  const reply = "確認すべき点は3つあります。\n①自分も含めて全部なのか。\n②相手には何と伝えるのか。\n③店の予約も含むのか。";
  const model = deepseekStub([json({ language: "ja", parts: [part({ sourceQuote: message })], plainChat: true, reply })]);
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "ja" }));
  assert.equal(result.text, reply);
  assert.equal(model.calls.length, 1);
});

test("AE-RD-012 turn 2: how late a to-do is, where the answer names it, is the card's figure", () => {
  const cards = [{ id: "f1", kind: "todo" as const, sub: "已过期5天", subTone: "late" as const, title: "跟进田中的分期方案", top: "截止 11月14日（周六）18:00" }];
  assert.equal(withCodeLateness("・跟进田中的分期方案：状态为未完成，已逾期一天。\n・回复田中的询价：已逾期两天。", cards).text, "・跟进田中的分期方案：状态为未完成，已过期5天。\n・回复田中的询价：已逾期两天。");
  const en = [{ id: "f1", kind: "todo" as const, sub: "5 days overdue", subTone: "late" as const, title: "Follow up on the plan" }];
  assert.equal(withCodeLateness("Follow up on the plan: 1 day overdue.", en).text, "Follow up on the plan: 5 days overdue.");
  assert.deepEqual(withCodeLateness("跟进田中的分期方案已经逾期。", cards).changed, [], "no number of days: left alone");
});

test("AE-SCL-008: a field label of the material is not shown in a zh or ja answer; a seen count disagreeing with coverage goes", () => {
  assert.equal(withoutFieldLabels("（11月4日の記録には「Notes: 已过期」とも書かれています。）", "ja"), "（11月4日の記録には「已过期」とも書かれています。）");
  assert.equal(withoutFieldLabels("Notes: overdue", "en"), "Notes: overdue");
  assert.deepEqual(seenCountsIn("ただし、いま読み取れているのは期限が近い10件だけで、64件すべてではありません。"), [10]);
  assert.equal(withoutWrongSeenCounts("全部で64件です。\nいま読み取れているのは期限が近い10件だけです。\n期限切れは3件です。", new Set([50])).text, "全部で64件です。\n期限切れは3件です。");
});

test("AE-UND-015: 'could not be read' goes when every read was complete; it stays when a read was not", () => {
  const text = "明日は10時から「团队周会」があります。\nカレンダーの予定は添付がなかったため読めておらず、確認できたのはこの1件だけです。ほかの予定はここからは分かりません。";
  assert.equal(withoutFalseReadClaims(text, true).text, "明日は10時から「团队周会」があります。\nほかの予定はここからは分かりません。");
  assert.equal(withoutFalseReadClaims(text, false).text, text);
  assert.equal(withoutFalseReadClaims("I couldn't read your calendar. You have one meeting.", true).text, "You have one meeting.");
});

test("English answers keep their lines: the sentence rules never glue lines or points together", () => {
  const text = "You last talked with Priya on Tue, Nov 10, the latest.\nHe called on Nov 3 about the role.\n- Send the JD: due Wed, Nov 18.\n- Confirm the on-site date: planned Tue, Nov 17.\nI see 9 notes.";
  assert.equal(withoutUnsourcedCounts(text, [9]), "You last talked with Priya on Tue, Nov 10, the latest.\nHe called on Nov 3 about the role.\n- Send the JD: due Wed, Nov 18.\n- Confirm the on-site date: planned Tue, Nov 17.");
  assert.equal(withoutUnsourcedDates(text, ["11-3"]), "You last talked with Priya on Tue, Nov 10, the latest.\n- Send the JD: due Wed, Nov 18.\n- Confirm the on-site date: planned Tue, Nov 17.\nI see 9 notes.");
  assert.doesNotMatch(withoutWrongSeenCounts("I looked at 4 notes. Then more.\n- One.\n- Two.", new Set([1])).text, /\.-|\.[A-Z]/u);
});
