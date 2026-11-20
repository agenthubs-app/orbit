import assert from "node:assert/strict";
import { test } from "node:test";

import { countsIn, seenCountsIn, withoutUnsourcedCounts, withoutWrongSeenCounts } from "../../features/agent-v1/answer/counts";
import { withoutUnsourcedDates } from "../../features/agent-v1/answer/dates";
import { withCodeLateness, withListedPointsTrimmed, withoutFalseReadClaims, withoutFieldLabels, withoutInternalWords } from "../../features/agent-v1/answer/list-or-text";
import { combinedLead } from "../../features/agent-v1/graph/nodes/wider-read";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { dayOfWords, onlyWindowWords, swapsPeriod } from "../../features/agent-v1/understand/read-window";
import { fnWorld, runFn } from "./functions-kit";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { schedule } from "./read-kit";

const ACTOR = "actor:a";

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

test("AE-ENT-005: words of only a date, a time of day and a kind of record are a window, never search words", () => {
  for (const words of ["11 月 19 日中午", "11月19日中午的安排", "明天上午", "下周的日程", "Nov 19 at noon", "tomorrow morning", "11月19日"]) assert.equal(onlyWindowWords(words), true, words);
  for (const words of ["和田中午餐", "周会", "报价", "11月19日的周会", "lunch with Tanaka"]) assert.equal(onlyWindowWords(words), false, words);
  assert.equal(dayOfWords("11 月 19 日中午", "2026-11-15"), "2026-11-19");
  assert.equal(dayOfWords("Nov 19 at noon", "2026-11-15"), "2026-11-19");
  assert.equal(dayOfWords("12月28日", "2027-01-03"), "2026-12-28");
});

test("AE-ENT-005: the two caveats the coverage does not support are not delivered (variance runs 1 and 3)", () => {
  const one = "11月19日（周四）中午12:00到13:00，你跟田中浩约了「和田中午餐」。\n我只读到从今天起的日程，更早的日程没有读到。";
  assert.equal(withoutFalseReadClaims(one, true).text, "11月19日（周四）中午12:00到13:00，你跟田中浩约了「和田中午餐」。");
  const three = "11月19日（周四）中午12:00到13:00，你有一个日程叫「和田中午餐」，同行人是田中浩。\n不过，只有这一条日程能看得到，其他日程并没有读到，所以那个中午可能还有别的安排。";
  assert.equal(withoutFalseReadClaims(three, true).text, "11月19日（周四）中午12:00到13:00，你有一个日程叫「和田中午餐」，同行人是田中浩。");
  assert.equal(withoutFalseReadClaims("关于报价，没有读到相关的笔记。", true).text, "关于报价，没有读到相关的笔记。", "an honest 'found no note' stays");
});

for (const withWindow of [false, true]) {
  test(`AE-ENT-005 in the graph: 「11 月 19 日中午我有什么安排？」 with the clue 「11 月 19 日中午」${withWindow ? " and the day's window" : " and no window"} — the lunch is read and cited, never "none"`, async () => {
    const message = "11 月 19 日中午我有什么安排？";
    const world = fnWorld();
    world.records.push(schedule(ACTOR, "personal:lunch", "和田中午餐", "2026-11-19T03:00:00.000Z", { contactIds: ["contact:c30"], endsAt: "2026-11-19T04:00:00.000Z" }), schedule(ACTOR, "personal:weekly", "团队周会", "2026-11-16T01:00:00.000Z", { endsAt: "2026-11-16T02:00:00.000Z", recurrence: { frequency: "weekly" } }));
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "schedule", text: "11 月 19 日中午" }], ...(withWindow ? { readFilter: { from: "2026-11-19", to: "2026-11-19" } } : {}), requiredCapabilities: ["schedule.read"], sourceQuote: message }], {
      answer: (call) => json({ segments: [{ body: [], cites: [...call.user.matchAll(/(s\d+) — personal schedule item/gu)].map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), lead: "11月19日（周四）中午12:00到13:00，你跟田中浩约了「和田中午餐」。", partId: "p1" }] }),
      session: graphKit((async () => { throw new Error("replaced"); }) as never, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world) }),
    });
    assert.deepEqual(run.result.sourceRefs, ["schedule:personal:lunch"]);
    assert.doesNotMatch(run.result.text, /没有|含「11/u, run.result.text);
    assert.equal(run.events.some((event) => event.type === "resolve.clue_as_written" || event.type === "resolve.nothing_under_narrowing"), false);
    assert.ok(run.events.some((event) => event.type === "understand.window_words_not_text"));
  });
}

test("live 1: 「那这周呢？」 only swaps the period; two empty kinds are one sentence, not four statements", () => {
  for (const words of ["那这周呢？", "那下周呢", "来週は？", "What about next week?", "明天呢？"]) assert.equal(swapsPeriod(words), true, words);
  for (const words of ["那小林呢？", "这周有哪些活动适合我？", "那这周的报价呢？"]) assert.equal(swapsPeriod(words), false, words);
  const lead = combinedLead("zh", [
    { count: 20, kind: "todo", late: 20, nothing: "这周到期或计划在这段时间的待办：没有。", status: "open" },
    { count: 1, kind: "schedule", late: null, nothing: "这周的日程：没有。", status: "open" },
  ]);
  assert.equal(lead, "这周到期或计划在这段时间的待办和这周的日程都没有；下面是另外的20 项还没完成的待办（其中 20 项已过期或过了计划日）和接下来的 1 个日程。");
  assert.equal((lead.match(/没有/gu) ?? []).length, 1);
});

test("live 1 in the graph: 「今天先处理哪些事？」 then 「那这周呢？」 — the same question for this week, no reading line", async () => {
  const FRIDAY = "2026-11-20T01:00:00.000Z";
  const world = fnWorld();
  world.records.push(schedule(ACTOR, "personal:s20", "和王强对合同", "2026-11-20T05:00:00.000Z"));
  // The turn before, as the conversation holds it.
  const messages = [{ createdAt: "2026-11-20T00:58:00.000Z", role: "user" as const, text: "今天先处理哪些事？" }, { createdAt: "2026-11-20T00:58:10.000Z", role: "assistant" as const, text: "今天你有 4 项还没完成的待办，其中 4 项已过期或过了计划日：" }];
  const kit = graphKit((async () => { throw new Error("replaced"); }) as never, { messages, now: FRIDAY, records: recordAccessOf(world) });
  const citeAll = (call: { user: string }) => json({ segments: [{ cites: [...new Set(call.user.slice(call.user.indexOf("Items to answer")).match(/\bs\d+\b/gu) ?? [])].map((sourceRef) => ({ sentenceIds: [1], sourceRef })), lead: "好的。", partId: "p1" }] });
  // The first layer reads 「那这周呢？」 as unclear between a summary and a list, with this week's window.
  const run = await runFn("那这周呢？", [{ clarity: "multiple_readings", dataSources: ["orbit_records"], deliverable: "summary", readFilter: { from: "2026-11-16", to: "2026-11-22" }, readings: [{ capabilities: ["memo.read", "fn.summarize"], deliverable: "summary", label: "看摘要" }, { capabilities: ["todo.read"], deliverable: "list", label: "列待办" }], requiredCapabilities: ["memo.read"], sourceQuote: "那这周呢" }], { answer: citeAll, session: kit });
  assert.doesNotMatch(run.result.text, /我按|来理解/u, run.result.text);
  assert.ok(run.events.some((event) => event.type === "understand.period_swapped" && event.plate === true));
  assert.ok(run.result.sourceRefs.includes("todo:task:t45") && run.result.sourceRefs.includes("schedule:personal:s20"), JSON.stringify(run.result.sourceRefs));
});

test("live 2: our words 材料 and 我读到的 are not shown; the user's words are", () => {
  assert.equal(withoutInternalWords("这个日程是 14:00 到 15:00。材料里没有显示关联的人。我读到的这条日程只有时间。", "zh"), "这个日程是 14:00 到 15:00。记录里没有写关联的人。这条日程只有时间。");
  assert.equal(withoutInternalWords("資料には参加者が書かれていません。", "ja"), "記録には参加者が書かれていません。");
  assert.equal(withoutInternalWords("The materials show no one linked.", "en"), "your records show no one linked.".replace(/^y/u, "y"));
});

test("live 3: 16 to-dos — the past-deadline ones stay as points, the other 12 are the cards", () => {
  const card = (index: number, late: boolean) => ({ id: `t${index}`, kind: "todo" as const, title: `待办${String(index).padStart(2, "0")}号`, ...(late ? { sub: "已过期9天", subTone: "late" as const } : { sub: "计划日已过" }) });
  const cards = Array.from({ length: 16 }, (_, index) => card(index + 1, index < 4));
  const text = ["今天先处理这 16 项，已过期的 4 项最急：", ...cards.map((item) => `・${item.title}：${item.sub}。`)].join("\n");
  const trimmed = withListedPointsTrimmed(text, cards, "zh");
  assert.equal(trimmed.dropped, 12);
  assert.deepEqual(trimmed.text.split("\n"), ["今天先处理这 16 项，已过期的 4 项最急：", "・待办01号：已过期9天。", "・待办02号：已过期9天。", "・待办03号：已过期9天。", "・待办04号：已过期9天。", "其余 12 项在下面的卡片里，按计划日期排。"]);
  assert.equal(withListedPointsTrimmed(["你有 3 项：", "・待办01号", "・待办02号", "・待办03号"].join("\n"), cards, "zh").dropped, 0, "a short walk-through stays");
});

test("English answers keep their lines: the sentence rules never glue lines or points together", () => {
  const text = "You last talked with Priya on Tue, Nov 10, the latest.\nHe called on Nov 3 about the role.\n- Send the JD: due Wed, Nov 18.\n- Confirm the on-site date: planned Tue, Nov 17.\nI see 9 notes.";
  assert.equal(withoutUnsourcedCounts(text, [9]), "You last talked with Priya on Tue, Nov 10, the latest.\nHe called on Nov 3 about the role.\n- Send the JD: due Wed, Nov 18.\n- Confirm the on-site date: planned Tue, Nov 17.");
  assert.equal(withoutUnsourcedDates(text, ["11-3"]), "You last talked with Priya on Tue, Nov 10, the latest.\n- Send the JD: due Wed, Nov 18.\n- Confirm the on-site date: planned Tue, Nov 17.\nI see 9 notes.");
  assert.doesNotMatch(withoutWrongSeenCounts("I looked at 4 notes. Then more.\n- One.\n- Two.", new Set([1])).text, /\.-|\.[A-Z]/u);
});
