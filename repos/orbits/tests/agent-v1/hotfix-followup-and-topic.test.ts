import assert from "node:assert/strict";
import { test } from "node:test";

import { asksWhoToFollowUp, isWholeQuote, realTopicOf } from "../../features/agent-v1/functions/basis";
import { contact, fnWorld, runFn } from "./functions-kit";

/**
 * Hotfix 2026-11-20 part 2 (the App's suggested question todayVm.questionFollowup, live site): 「哪些人值得先跟进？」 was ranked by
 * the topic 「值得先跟进」 — three arbitrary contacts, each 「记录里看不出和这个主题直接相关」, their free-text notes (phone numbers,
 * addresses) in the lines. It is the follow-up ranking of 「这周该跟进谁」 without a week: follow-ups due, to-dos past their
 * planned day. Rule 3: the whole message, or only question words from it, is never the ranking topic.
 */

const ACTOR = "actor:a";

function world() {
  const base = fnWorld();
  // 田中 has free-text notes on his contact record: they never go into an answer.
  const tanaka = base.records.findIndex((record) => record.id === "contact:c30");
  base.records[tanaka] = contact(ACTOR, "contact:c30", "田中浩", { notes: "手机 090-1234-5678，住大阪市北区梅田 1-2-3", organization: "东和商事", role: "采购主管" });
  return base;
}

test("who to follow up with, in the App's three languages and plain variants; a topic question is not it", () => {
  for (const words of ["哪些人值得先跟进？", "该先跟进谁？", "先联系谁比较好", "这周该跟进谁？", "誰を優先してフォローしますか？", "Who should I follow up with first?", "告诉我现在该联系谁、原因和下一步。", "Who should I contact now, why, and what is the next step?"]) assert.equal(asksWhoToFollowUp(words), true, words);
  for (const words of ["跟进田中的分期方案到哪一步了？", "最适合聊独立出版的人是谁？", "最近有哪些活动适合我？"]) assert.equal(asksWhoToFollowUp(words), false, words);
});

test("rule 3: question words, kind words and the whole question are never a topic; real words stay", () => {
  for (const words of ["值得先跟进", "哪些人值得先跟进？", "该先跟进谁", "接下来的会面或活动，该准备什么？", "What should I prepare for upcoming meetings or events?", "次の面会やイベントに何を準備しますか？", "誰を優先してフォローしますか？", "Who should I follow up with first?", "告诉我现在该联系谁、原因和下一步。", "推荐值得参加的活动并说明原因。", "今、誰に連絡すべきか", "今、誰に連絡すべきか、理由と次の一歩を教えて。", "参加する価値があるイベントを、理由とともに教えて。", "Suggest events worth attending and explain why.", "最近おすすめのイベントは？", "Which recent events are a good fit for me?"]) assert.equal(realTopicOf(words), "", words);
  assert.equal(realTopicOf("聊独立出版"), "聊独立出版");
  assert.equal(realTopicOf("SaaS 定价"), "SaaS 定价");
  assert.equal(realTopicOf("a power-semiconductor packaging process lead role"), "power-semiconductor packaging process lead role");
  assert.equal(isWholeQuote("哪些人值得先跟进", "哪些人值得先跟进？"), true);
  assert.equal(isWholeQuote("聊独立出版", "挑三个最适合聊独立出版的人"), false);
});

const signalsOnly = (run: Awaited<ReturnType<typeof runFn>>) => {
  const text = run.result.text;
  assert.doesNotMatch(text, /记录里看不出|这个主题|主题挑/u, "no topic ranking");
  assert.match(text, /依据来自你自己的记录/u, "the history basis line");
  assert.doesNotMatch(text, /090-1234-5678|梅田|备注/u, "no free-text contact notes");
  assert.equal(run.judgeCalls.length, 0, "no judgment over the sentence");
  assert.ok(run.events.some((event) => event.type === "fn.rank"), "the ranking function ran");
};

for (const [label, understood] of [
  ["contact read + fn.rank, the whole question as the basis", { rank: { basis: "哪些人值得先跟进" }, requiredCapabilities: ["contact.read", "fn.rank"] }],
  ["the question words as the basis (live site)", { rank: { basis: "值得先跟进" }, requiredCapabilities: ["contact.read", "view.recentInteraction", "fn.rank"] }],
  ["a contact read only, no rank", { requiredCapabilities: ["contact.read"] }],
  ["to-do read + fn.rank (跟进 read as a to-do word)", { rank: { basis: "值得先跟进" }, requiredCapabilities: ["todo.read", "fn.rank"] }],
] as const) {
  test(`「哪些人值得先跟进？」 — ${label}: the people with follow-ups due first, then to-dos past their planned day`, async () => {
    const message = "哪些人值得先跟进？";
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", sourceQuote: message, ...understood }], { world: world() });
    signalsOnly(run);
    const ranked = run.events.filter((event) => event.type === "fn.rank").at(-1) as { listed?: string[] } | undefined;
    assert.deepEqual(ranked?.listed?.slice(0, 2), ["contact:contact:c30", "contact:contact:c31"], JSON.stringify(ranked));
    assert.match(run.result.text, /田中浩/u);
    assert.match(run.result.text, /李薇/u);
  });
}

test("en and ja: the App's follow-up question is the same ranking", async () => {
  for (const [language, message] of [["en", "Who should I follow up with first?"], ["ja", "誰を優先してフォローしますか？"]] as const) {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: message.replace(/[?？]$/u, "") }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { language, world: world() });
    assert.doesNotMatch(run.result.text, /090-1234-5678|梅田/u);
    assert.equal(run.judgeCalls.length, 0, language);
    const ranked = run.events.filter((event) => event.type === "fn.rank").at(-1) as { listed?: string[] } | undefined;
    assert.equal(ranked?.listed?.[0], "contact:contact:c30", `${language}: ${run.result.text}`);
  }
});

test("1c (AE-ANS-010 on a081afe94): a basis that only names the kind of record and its time is no topic (zh, en, ja)", () => {
  for (const words of ["接下来的活动", "最近的活动", "upcoming events", "今後のイベント", "我的待办", "this week's meetings", "次のイベント", "the next events"]) assert.equal(realTopicOf(words), "", words);
  // AG20b run-04 (AE-JDG-003): a state of the records the read already filters on is no topic either.
  for (const words of ["公開されている", "公開中のイベント", "published events", "open to-dos", "还没完成的待办", "未完了のタスク", "已发布的活动"]) assert.equal(realTopicOf(words), "", words);
});

test("1c (AG20b run-04, AE-JDG-003): 「公開されているイベントを、開始時間が早い順に並べてください。」 with basis 「公開されている」 — no judgment, by start time", async () => {
  const message = "公開されているイベントを、開始時間が早い順に並べてください。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "公開されている", direction: "asc", orderBy: "startsAt" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }], { language: "ja" });
  assert.equal(run.judgeCalls.length, 0);
  const ranked = run.events.filter((event) => event.type === "fn.rank").at(-1) as { listed?: string[] } | undefined;
  assert.deepEqual(ranked?.listed?.slice(0, 3), ["event:event:e103", "event:event:e101", "event:event:e104"], JSON.stringify(ranked));
  assert.doesNotMatch(run.result.text, /「公開されている」/u);
});

for (const [language, message, basis] of [
  ["zh", "把接下来的活动按开始时间都列出来。", "接下来的活动"],
  ["en", "List all my upcoming events by start time.", "upcoming events"],
  ["ja", "今後のイベントを開始時間順に全部並べて。", "今後のイベント"],
] as const) {
  test(`1c (AE-ANS-010, ${language}): fn.rank with basis 「${basis}」 and orderBy startsAt — no judgment, every upcoming event, nearest first`, async () => {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", rank: { basis, direction: "asc", orderBy: "startsAt" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }], { language });
    assert.equal(run.judgeCalls.length, 0, "no topic judgment");
    assert.ok(run.events.some((event) => event.type === "functions.basis_not_a_topic"));
    const ranked = run.events.filter((event) => event.type === "fn.rank").at(-1) as { listed?: string[] } | undefined;
    // Nov 15: E103 (19th) first, then E101, E104 (21st).
    assert.deepEqual(ranked?.listed?.slice(0, 3), ["event:event:e103", "event:event:e101", "event:event:e104"], JSON.stringify(ranked));
    assert.ok((ranked?.listed?.length ?? 0) >= 5, "all of them, not the ones matching a topic");
    assert.doesNotMatch(run.result.text, new RegExp(`「${basis}」|"${basis}"`, "u"), "the lead never says related to the basis");
  });
}

for (const [language, message, basis] of [
  ["zh", "推荐值得参加的活动并说明原因。", "值得参加的活动并说明原因"],
  ["ja", "最近おすすめのイベントは？", "最近おすすめのイベント"],
  ["en", "Suggest events worth attending and explain why.", "events worth attending and explain why"],
] as const) {
  test(`1c (run-04 AE-ANS-030/022/032, ${language}): 「${message}」 — the events coming up, nearest first; no question back, no judgment`, async () => {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }], { language });
    assert.equal(run.result.clarifications.filter((set) => set.kind === "question").length, 0, run.result.text);
    assert.equal(run.judgeCalls.length, 0);
    const ranked = run.events.filter((event) => event.type === "fn.rank").at(-1) as { listed?: string[] } | undefined;
    assert.equal(ranked?.listed?.[0], "event:event:e103", JSON.stringify(ranked));
  });
}

test("1c (run-04 AE-ANS-028): 「今、誰に連絡すべきか、理由と次の一歩を教えて。」 with that as the basis — the follow-up ranking, not a topic", async () => {
  const message = "今、誰に連絡すべきか、理由と次の一歩を教えて。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "今、誰に連絡すべきか" }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { language: "ja", world: world() });
  assert.equal(run.judgeCalls.length, 0);
  const ranked = run.events.filter((event) => event.type === "fn.rank").at(-1) as { listed?: string[] } | undefined;
  assert.equal(ranked?.listed?.[0], "contact:contact:c30", JSON.stringify(ranked));
});

test("a real topic is still a topic ranking (AG08): 「挑两个最适合聊独立出版的人」", async () => {
  const message = "挑两个最适合聊独立出版的人";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "聊独立出版", count: 2 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { world: world() });
  assert.ok(run.events.some((event) => event.type === "functions.basis_not_a_topic") === false);
  assert.match(run.result.text, /聊独立出版/u);
});
