import assert from "node:assert/strict";
import test from "node:test";

import { withoutOnly } from "../../features/agent-v1/answer/gap-copy";
import { decideNextStep } from "../../features/agent-v1/clarify/next-step";
import { stripCardTalk, stripSaveTalk } from "../../features/agent-v1/entry/approval-claims";
import { statusSaidIn } from "../../features/agent-v1/graph/nodes/resolve";
import { reschedulesTo } from "../../features/agent-v1/graph/nodes/route";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deepseekStub, graphKit, json, part } from "./graph-kit";

/**
 * agent-design AG07 run-03 (exception under option A): the AG04 rerun's two model-dependent failures turned into
 * code rules, and three judge notes. Tests first.
 */
test("1 AE-AMB-003: with no write confirmed, a model sentence claiming one (记下了, 記録しました, noted) is not delivered", () => {
  assert.equal(stripSaveTalk("好的，记下了：小林今天来电。需要我把这通电话记成一条笔记吗？").text, "需要我把这通电话记成一条笔记吗？");
  for (const text of ["记下了。", "已记录。", "我记住了。", "メモしておきます。", "記録しました。", "承知しました、控えておきます。", "Noted.", "Got it, I've noted that Kobayashi called.", "I'll keep that in mind."]) {
    assert.equal(stripSaveTalk(text).text, "", text);
  }
  assert.equal(stripSaveTalk("你11月12日的笔记里记下了报价初稿。").text, "你11月12日的笔记里记下了报价初稿。", "what the user's own note records is kept");
});

test("2 AE-AMB-007: a change verb with a new date is a reschedule; with no object, the missing piece is which item", () => {
  const asOf = "2026-11-15T01:00:00.000Z";
  assert.equal(reschedulesTo("把那个改到周五。", asOf, "Asia/Tokyo"), true);
  assert.equal(reschedulesTo("あれを金曜に変更して。", asOf, "Asia/Tokyo"), true);
  assert.equal(reschedulesTo("Move it to Friday.", asOf, "Asia/Tokyo"), true);
  assert.equal(reschedulesTo("周五见。", asOf, "Asia/Tokyo"), false, "a date alone is not a change");
  const base = { capabilities: [], clarity: "none" as const, hasContactClue: false, hypothesis: false, intentBasis: "instruction", negation: false, objectKind: null, readings: [], unboundPronoun: false, namedObjectWithDate: false, reschedule: true };
  assert.equal(decideNextStep(base as never, { asked: 0, pageKind: null, topicKind: null }).kind, "ask_missing");
  assert.deepEqual(decideNextStep(base as never, { asked: 1, pageKind: null, topicKind: null }), { kind: "still_unclear", missing: "object" });
});

test("2b AE-AMB-007 through the graph: the first reply asks which item, and an unhelpful answer names that slot", async () => {
  const model = deepseekStub(() => json({ language: "zh", parts: [part({ clarity: "none", dataSources: ["orbit_records"], deliverable: "change", sourceQuote: "把那个改到周五。" })], plainChat: false }));
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z" });
  const first = await runAgentGraph(kit.deps, kit.input("把那个改到周五。"));
  assert.doesNotMatch(first.text, /想让我做什么|查我的资料、记一笔/u, first.text);
  assert.match(first.text, /哪一条|哪一个|哪个/u, first.text);
});

test("3 AE-SCL-008: overdue to-dos are open ones, so both reads count the same to-dos", () => {
  assert.equal(statusSaidIn("期限を過ぎているものがあれば挙げてください。"), "open");
  assert.equal(statusSaidIn("有过期的吗"), "open");
  assert.equal(statusSaidIn("any overdue ones?"), "open");
});

test("4 AE-CTX-005: when a sentence is dropped, a lead-in that only introduced it goes too", () => {
  const text = "お礼の前に一件だけ。前の確認カードはまだ未確定なので、11月20日でよければ「以上1件を確定」を押してください。\n\n初めての編集者さんへのメールは、少し硬めが安全です。";
  assert.equal(stripCardTalk(text).text, "初めての編集者さんへのメールは、少し硬めが安全です。");
  assert.equal(stripCardTalk("One more thing first. Press Confirm on the confirmation card. Keep the email short.").text, "Keep the email short.");
  assert.equal(stripCardTalk("邮件要短。确认卡上点确认。").text, "邮件要短。", "a real sentence before it stays");
});

test("5 AE-RD-005: when some records could not be read, the answer does not say 'only'", () => {
  assert.equal(withoutOnly("这个月关于小林的记录只有11月10日的一条：小林给你打电话。", "zh"), "这个月关于小林的记录有11月10日的一条：小林给你打电话。");
  assert.equal(withoutOnly("There is only one note from Nov 10.", "en"), "There is one note from Nov 10.");
  assert.equal(withoutOnly("11月10日の記録が1件だけあります。", "ja"), "11月10日の記録が1件あります。");
  assert.equal(withoutOnly("11月10日の記録しかありません。", "ja"), "11月10日の記録があります。");
});
