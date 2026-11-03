import assert from "node:assert/strict";
import test from "node:test";

import { commonGround } from "../../features/plans/prep/common-ground";
import { fallbackCard, hookValid, longestCommonSubstring, markedReason, reconcileDraft, reconcilePicks, underlineMatches } from "../../features/plans/prep/reconcile";
import type { PlanPrepContactCard, PlanPrepProfile } from "../../features/plans/prep/types";

const sources = {
  answers: new Map([["q1", "产品已上线、还没有付费客户"]]),
  facts: new Map([["f1", "聊到他在上海工作过 3 年"], ["f2", "他们还在用 Excel 管客户"]]),
  fields: new Map([["met", "2025/09/18 扫的名片，关联活动：JETRO 创业交流会"], ["profile.organization", "星桥科技"]]),
};

test("underlines may rephrase the person (他 → 您) but must overlap the source by ≥60%", () => {
  assert.equal(longestCommonSubstring("abcde", "xxbcdyy"), 3);
  assert.equal(underlineMatches("您在上海工作过 3 年", "聊到他在上海工作过 3 年"), true);
  assert.equal(underlineMatches("JETRO 创业交流会", sources.fields.get("met")!), true);
  assert.equal(underlineMatches("在北京待过十年", "聊到他在上海工作过 3 年"), false);
  assert.equal(underlineMatches("上", "上海"), false, "one character is not evidence");
});

test("reconcileDraft: a missing factId or an underline not in its source drops that sentence only; offsets are UTF-16", () => {
  const result = reconcileDraft([
    { text: "我是星桥科技的 X。", underlines: [{ ref: { field: "profile.organization", kind: "card" }, text: "星桥科技" }] },
    { text: "当时聊到您在上海工作过 3 年。", underlines: [{ ref: { factId: "f1", kind: "fact" }, text: "您在上海工作过 3 年" }] },
    { text: "您说过喜欢滑雪。", underlines: [{ ref: { factId: "f9", kind: "fact" }, text: "喜欢滑雪" }] },
    { text: "听说您在北京待过十年。", underlines: [{ ref: { factId: "f1", kind: "fact" }, text: "在北京待过十年" }] },
    { text: "我们产品已上线、还没有付费客户。", underlines: [{ ref: { kind: "answer", questionKey: "q1" }, text: "产品已上线、还没有付费客户" }] },
    { text: "30 分钟就好。", underlines: [] },
  ], sources);
  assert.equal(result.removed, 2);
  assert.equal(result.draft.text, "我是星桥科技的 X。当时聊到您在上海工作过 3 年。我们产品已上线、还没有付费客户。30 分钟就好。");
  for (const span of result.draft.refs) assert.ok(result.draft.text.slice(span.start, span.end).length > 0);
  assert.deepEqual(result.draft.refs.map((span) => result.draft.text.slice(span.start, span.end)), ["星桥科技", "您在上海工作过 3 年", "产品已上线、还没有付费客户"]);
  assert.deepEqual(result.factIds, ["f1"]);
  assert.deepEqual(result.answerKeys, ["q1"]);
});

test("reconcileDraft: an underline that is not a substring of its own sentence fails; everything removed → empty text", () => {
  const result = reconcileDraft([{ text: "您好。", underlines: [{ ref: { factId: "f1", kind: "fact" }, text: "上海工作过" }] }], sources);
  assert.equal(result.draft.text, "");
  assert.equal(result.removed, 1);
});

test("reconcileDraft keeps the draft ≤160 characters by dropping whole trailing sentences", () => {
  const long = "あ".repeat(100);
  const result = reconcileDraft([{ text: `${long}。`, underlines: [] }, { text: `${long}。`, underlines: [] }], sources);
  assert.equal(Array.from(result.draft.text).length, 101);
  assert.equal(result.removed, 1);
});

test("fallback template: 'who you are + a small ask', no underlines, in three languages", () => {
  for (const language of ["ja", "zh", "en"] as const) {
    const card = fallbackCard(language, { goal: "シード資金", me: "李", name: "佐藤", organization: "星桥科技" });
    assert.equal(card.draft.refs.length, 0);
    assert.match(card.draft.text, /李/);
    assert.match(card.draft.text, /星桥科技/);
    assert.ok(hookValid(card.hook), `${language} fallback hook within limits`);
  }
});

test("reconcilePicks: out-of-range / duplicate numbers and over-limit titles are dropped; ≤3; bold must be a substring", () => {
  const picks = reconcilePicks({
    lead: "这一阶段的目标，是让你的数字经得起投资人追问。",
    picks: [
      { bold: "收入预测怎么来的", no: 1, reason: "投资人会追问收入预测怎么来的。", title: "和佐藤健聊聊财务模型" },
      { bold: null, no: 9, reason: "越界", title: "越界" },
      { bold: null, no: 1, reason: "重复", title: "重复" },
      { bold: "不在理由里", no: 2, reason: "她和你一样在日本做 SaaS。", title: "和山本彩聊聊合同" },
      { bold: null, no: 3, reason: "x", title: "这个标题实在是太长了已经超过了十八个字的上限" },
      { bold: null, no: 4, reason: "活动介绍写着投资人与创业者自由交流。", title: "去 Startup Night 看看" },
      { bold: null, no: 5, reason: "第四件", title: "第四件" },
    ],
  }, 5);
  assert.deepEqual(picks.picks.map((pick) => pick.index), [0, 1, 3]);
  assert.equal(picks.picks[0]!.reason.text.slice(picks.picks[0]!.reason.marks[0]!.start, picks.picks[0]!.reason.marks[0]!.end), "收入预测怎么来的");
  assert.deepEqual(picks.picks[1]!.reason.marks, [], "bold not in the reason is removed");
  assert.equal(picks.dropped, 4);
  assert.equal(picks.lead, "这一阶段的目标，是让你的数字经得起投资人追问。");
  assert.equal(reconcilePicks({ lead: "あ".repeat(41), picks: [] }, 3).lead, null, "lead over 40 → not shown");
  assert.deepEqual(markedReason("abc", "zz").marks, []);
});

const PROFILE: PlanPrepProfile = { homeMarket: "CN", industry: "SaaS", name: "李", organization: "星桥科技", role: "CEO", spokenLanguages: ["中文", "日本語"] };
const CONTACT: PlanPrepContactCard = { createdAt: "2025-09-18T03:00:00Z", id: "c1", industry: null, lastInteractionAt: null, lastInteractionLabel: null, name: "佐藤 健", organization: "ミライ会計", role: "元 CFO", sourceEventTitle: "JETRO 创业交流会", sourceLabel: "card" };

test("common ground is rule-based: home market × a place in the facts, then language, then same industry; otherwise null", () => {
  assert.match(commonGround({ contact: CONTACT, facts: [{ date: null, id: "f1", memoId: null, text: "聊到他在上海工作过 3 年" }], language: "zh", profile: PROFILE })!.text, /你来自中国.*上海/u);
  assert.match(commonGround({ contact: CONTACT, facts: [{ date: null, id: "f1", memoId: null, text: "中文がとても上手" }], language: "ja", profile: { ...PROFILE, homeMarket: null } })!.text, /中文/u);
  assert.match(commonGround({ contact: { ...CONTACT, industry: "SaaS" }, facts: [], language: "zh", profile: { ...PROFILE, homeMarket: null } })!.text, /都在SaaS行业/u);
  assert.equal(commonGround({ contact: CONTACT, facts: [], language: "zh", profile: { ...PROFILE, homeMarket: null, industry: null } }), null);
});
