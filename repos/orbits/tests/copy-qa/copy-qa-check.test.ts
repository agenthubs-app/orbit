import assert from "node:assert/strict";
import test from "node:test";
import { checkCopy, RULES, visualLength } from "../../scripts/copy-qa/check.mjs";

// R03 (RD-13, PLANNER F): the automatic check of the translation loop. Each
// rule fires on a bad sample and stays quiet on the approved design wording.
const ok = { id: "ok", kind: "toast", ja: "完了にしました", zh: "已完成", en: "Marked as done" };
const rulesHit = (entry: { id: string; kind?: string; ja?: string; zh?: string; en?: string }) => [...new Set(checkCopy([entry]).issues.map((issue: { rule: string }) => issue.rule))].sort();

test("approved design wording passes every rule", () => {
  const approved = [
    ok,
    { id: "a", kind: "banner", ja: "送信はしません · 送信はあなたが行います", zh: "不会替你发送 · 由你自己发送", en: "Orbit won't send it · You send it yourself" },
    { id: "b", kind: "label", ja: "iOrbit に聞く…", zh: "问 iOrbit…", en: "Ask iOrbit…" },
    { id: "c", kind: "sentence", ja: "通信状況を確認して、もう一度お試しください。", zh: "请检查网络后重试。", en: "Check your connection and try again." },
    { id: "d", kind: "fullButton", ja: "再分析する（1回使います）", zh: "重新分析（使用1次）", en: "Reanalyze (uses 1)" },
    { id: "e", kind: "chip", ja: "保存", zh: "保存", en: "Save" },
    { id: "f", kind: "label", ja: "22:00〜7:30 は送りません", zh: "22:00〜7:30 不推送", en: "Quiet from 22:00 to 7:30" },
    { id: "g", kind: "chip", ja: "シリーズA", zh: "A 轮", en: "Series A" },
  ];
  const { issues } = checkCopy(approved);
  assert.deepEqual(issues, []);
  assert.equal(RULES.length, 10);
});

test("each rule fires on its bad sample", () => {
  assert.deepEqual(rulesHit({ ...ok, en: "" }), ["empty"]);
  assert.deepEqual(rulesHit({ id: "p", kind: "label", ja: "{name}さん", zh: "{name}", en: "{who}" }), ["placeholders"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "エラーが発生しました" }), ["forbidden"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "メールを送信しました" }), ["forbidden"]);
  assert.deepEqual(rulesHit({ ...ok, en: "Something went wrong" }), ["forbidden"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "コンタクトを追加しました" }), ["glossary"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "カレンダに追加しました" }), ["glossary"]);
  assert.deepEqual(rulesHit({ id: "l", kind: "chip", ja: "今日中に必ず確認が必要です", zh: "需要今天确认", en: "Today" }), ["length", "tone"].filter((r) => r === "length"));
  assert.deepEqual(rulesHit({ ...ok, ja: "设置しました" }), ["simplified-in-ja"]);
  assert.deepEqual(rulesHit({ id: "u", kind: "label", ja: "受信箱", zh: "受信箱", en: "Inbox" }), ["untranslated"]);
  assert.deepEqual(rulesHit({ id: "t", kind: "button", ja: "保存します", zh: "保存", en: "Save" }), ["tone"]);
  assert.deepEqual(rulesHit({ id: "t2", kind: "button", ja: "下書き", zh: "草稿", en: "Create Draft" }), ["tone"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "１件追加しました" }), ["width"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "iOrbitに追加しました" }), ["width"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "22:00～7:30" }), ["width"]);
  assert.deepEqual(rulesHit({ ...ok, zh: "已完成,谢谢" }), ["width"]);
  assert.deepEqual(rulesHit({ id: "zs", kind: "chip", ja: "あと{count}日", zh: "还剩 {count} 天", en: "{count}d left" }), ["width"]);
  assert.deepEqual(rulesHit({ id: "pl", kind: "label", ja: "{count}件を表示", zh: "显示{count}项", en: "Show {count} items" }), ["tone"]);
  assert.deepEqual(rulesHit({ id: "en", kind: "chip", ja: "推定", zh: "推测", en: "Estimated by your assistant" }), ["length"]);
  // sub-rules (R03 review m5): one bad sample each
  assert.deepEqual(rulesHit({ id: "k", needsKind: true, ja: "保存", zh: "保存", en: "Save" } as never), ["kind"]);
  assert.deepEqual(rulesHit({ id: "q", kind: "confirmTitle", ja: "削除します", zh: "要删除吗？", en: "Delete?" }), ["tone"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "私たちが保存しました" }), ["forbidden"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "保存させていただきました" }), ["forbidden"]);
  assert.deepEqual(rulesHit({ ...ok, en: "We saved it" }), ["forbidden"]);
  assert.deepEqual(rulesHit({ id: "zs2", kind: "toast", ja: "完了にしました", zh: "已发送", en: "Done" }), ["forbidden"]);
  assert.deepEqual(rulesHit({ id: "zs3", kind: "sentence", ja: "完了にしました。", zh: "对方已发送交换申请。", en: "Done." }), [], "narrative 已发送 is fine outside buttons and toasts");
  assert.deepEqual(rulesHit({ ...ok, ja: "Google コンタクトに追加しました" }), [], "external service names are whitelisted");
  assert.deepEqual(rulesHit({ ...ok, ja: "ドラフトにしました" }), ["glossary"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "10 月 7 日に移動しました" }), ["width"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "（完了）しました。" }), ["tone"]);
  assert.deepEqual(rulesHit({ id: "s", kind: "sentence", ja: "保存した", zh: "已保存。", en: "Saved." }), ["tone"]);
  assert.deepEqual(rulesHit({ ...ok, ja: "完了にしました?" }), ["width"]);
});

test("length counts full-width as 1, half-width as 0.5, a placeholder as 2, and skips a trailing parenthetical", () => {
  assert.equal(visualLength("期限超過"), 4);
  assert.equal(visualLength("To-do"), 2.5);
  assert.equal(visualLength("あと{count}日"), 5);
  assert.equal(visualLength("再分析する（1回使います）"), 5);
});
