import assert from "node:assert/strict";
import test from "node:test";

import { groundedField, leavesItToAgent, memoriesFor, timePreferenceIn, topicWordsOf } from "../../features/agent-v1/functions/basis";
import { graphKit } from "./graph-kit";
import { ACTOR, fnWorld, NOW, runFn } from "./functions-kit";
import { graded } from "./judgment-kit";
import { recordAccessOf } from "./graph-kit";

/**
 * agent-design AG10-1: a ranking's basis comes from now (this turn, @, the session), then saved memory, then history
 * signals computed from the user's own records; several stack. With none, one question; "随便" gives the natural order;
 * "最好的" is not a basis; only listing never asks.
 */

const EVENT_RANK = (quote: string, extra: Record<string, unknown> = {}) => ({ dataSources: ["orbit_records"], deliverable: "ranked_list", requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: quote, ...extra });
const fnRank = (events: Record<string, unknown>[]) => events.filter((event) => event.type === "fn.rank");

test("the words: '最好的' and '最值得' are not a basis; a topic, a time preference and a field said in the words are", () => {
  assert.equal(topicWordsOf("帮我挑三场最好的活动。"), "");
  assert.equal(topicWordsOf("这个月剩下的活动里，哪两场最值得去？"), "");
  assert.equal(topicWordsOf("这周该跟进谁？"), "");
  assert.equal(topicWordsOf("Pick the three best events for me."), "");
  assert.notEqual(topicWordsOf("挑三个最适合聊独立出版的人"), "");
  assert.deepEqual(timePreferenceIn("优先周末上午", "turn"), { days: "weekend", exclude: false, hard: false, part: "morning", source: "turn", words: "优先周末上午" });
  assert.equal(timePreferenceIn("不要推荐晚上的活动", "memory")?.exclude, true);
  assert.equal(groundedField("startsAt", "这个月剩下的活动里，哪两场最值得去？"), null, "AE-FN-005: the model's start-time order is not in the user's words");
  assert.equal(groundedField("startsAt", "把相关的几场按时间先后排一下"), "startsAt");
  assert.equal(groundedField("dueAt", "过期最久的排前面"), "dueAt");
  assert.ok(leavesItToAgent("随便，都行。"));
  assert.ok(leavesItToAgent("whatever"));
  assert.ok(!leavesItToAgent("按开始时间"));
});

test("memory (read only until AG14): only preferences and constraints that name the domain; a constraint is hard", () => {
  const picked = memoriesFor("event", [
    { category: "preference", content: "推荐活动时优先周末上午", id: "MM1" },
    { category: "constraint", content: "不要推荐晚上的活动", id: "MM2" },
    { category: "constraint", content: "回答用日语", id: "MM3" },
    { category: "fact", content: "我喜欢活动", id: "MM4" },
  ]);
  assert.deepEqual(picked.map((item) => item.memory.id), ["MM1", "MM2"]);
  assert.equal(picked[0].time?.hard, false);
  assert.equal(picked[1].time?.hard, true);
  assert.equal(picked[1].time?.exclude, true);
});

test("AE-FN-004: no basis at all ('挑三场最好的活动'): one question with the orderings available now; no ranking, no judgment", async () => {
  const message = "帮我挑三场最好的活动。";
  const run = await runFn(message, [EVENT_RANK(message, { rank: { count: 3 } })]);
  assert.equal(run.result.status, "waiting_user");
  assert.equal(run.result.partResults[0].status, "awaiting_clarification");
  assert.equal(run.result.clarifications.length, 1);
  assert.ok(run.result.clarifications[0].options.length >= 2, "two or more ways of ordering");
  assert.ok(run.result.clarifications[0].options.every((option) => option.capability === "fn.rank"));
  assert.match(run.result.text, /按什么来挑/u);
  assert.match(run.result.text, /我不替你定标准/u);
  assert.equal(fnRank(run.events).length, 0, "fn.rank did not run");
  assert.equal(run.judgeCalls.length, 0);
  assert.equal(run.result.sourceRefs.length, 0, "no list was given");
});

test("AE-FN-005: the question, then '随便，都行' — the natural order (start time) with the reason, no second question", async () => {
  const message = "这个月剩下的活动里，哪两场最值得去？";
  const session = graphKit(fetch, { now: NOW, records: recordAccessOf(fnWorld()) });
  const first = await runFn(message, [EVENT_RANK(message, { rank: { count: 2, direction: "asc", orderBy: "startsAt" }, readFilter: { from: "2026-11-15", to: "2026-11-30" } })], { session });
  assert.equal(first.result.clarifications.length, 1, "asked once (the model's start-time order is not the user's)");
  const reply = "随便，都行。";
  const second = await runFn(reply, [{ clarity: "statement", sourceQuote: reply }], { session });
  assert.equal(second.result.clarifications.filter((set) => set.kind !== "entry").length, 0, "not asked again (AG12 run-03: the ranking entries are not questions)");
  assert.deepEqual(second.result.sourceRefs.slice(0, 2), ["event:event:e103", "event:event:e101"]);
  assert.match(second.result.text, /因为没有指定标准，这次是按开始时间先后给的/u);
  assert.equal(fnRank(second.events).length, 1);
  assert.equal(second.judgeCalls.length, 0);
});

test("AE-FN-001: this turn's words stack — weekend morning first, then the @ note's topic; the lead says both", async () => {
  const message = "从 @东京街头摄影展 @街拍工作坊 @SaaS 定价研讨会 @设计师之夜 @独立出版市集 里挑三场，优先周末上午，最好跟 @兴趣笔记 的主题有关。";
  const refs = [["event:e101", "东京街头摄影展", "event"], ["event:e102", "街拍工作坊", "event"], ["event:e103", "SaaS 定价研讨会", "event"], ["event:e104", "设计师之夜", "event"], ["event:e105", "独立出版市集", "event"], ["note:m36", "兴趣笔记", "memo"]].map(([id, name, type]) => ({ id, name, type }));
  const run = await runFn(message, [EVENT_RANK(message, { objectClues: refs.map((ref, index) => ({ entity: ref.type, referenceId: `r${index + 1}`, text: `@${ref.name}` })), rank: { basis: "跟 @兴趣笔记 的主题有关", count: 3, within: "周末上午" }, requiredCapabilities: ["event.read", "memo.read", "fn.rank"] })], { judge: (id) => (id.includes("c") ? graded(0.1, 0.3, 0.6) : undefined), references: refs });
  const listed = fnRank(run.events).at(-1)!.listed as string[];
  assert.equal(listed.length, 3);
  assert.deepEqual([...listed].sort(), ["event:event:e101", "event:event:e102", "event:event:e105"]);
  assert.match(run.result.text, /^先看是不是周末上午，再看和你的笔记「兴趣笔记」的主题有多相关/u);
  assert.ok(run.judgeCalls.length <= 1);
  assert.ok((run.judgeCalls[0]?.body ? Object.keys(run.judgeCalls[0].body.questions).length : 0) <= 5, "at most the five chosen events judged");
  assert.equal(run.result.clarifications.filter((set) => set.kind !== "entry").length, 0, "no question (AG12 run-03: the ranking entries beside the answer are not questions)");
});

test("saved memory: the constraint removes evenings, the preference ranks weekend mornings first; the lead names both and the entry to change them", async () => {
  const message = "11 月 21 日和 22 日有哪些活动值得去？帮我挑两场。";
  const run = await runFn(message, [EVENT_RANK(message, { rank: { count: 2 }, readFilter: { from: "2026-11-21", to: "2026-11-22" } })], { memories: [{ category: "preference", content: "推荐活动时优先周末上午", id: "MM1" }, { category: "constraint", content: "不要推荐晚上的活动", id: "MM2" }] });
  const listed = fnRank(run.events).at(-1)!.listed as string[];
  assert.equal(listed.length, 2);
  for (const ref of listed) assert.ok(["event:event:e101", "event:event:e102", "event:event:e105"].includes(ref), ref);
  assert.ok(!listed.includes("event:event:e104"), "the evening event is removed by the constraint");
  assert.match(run.result.text, /你存过的「推荐活动时优先周末上午」和「不要推荐晚上的活动」/u);
  assert.match(run.result.text, /想换个依据重新排/u);
  assert.ok(run.events.some((event) => event.type === "memory.recall"));
  // Asked again: the same two in the same order (stable key).
  const again = await runFn(message, [EVENT_RANK(message, { rank: { count: 2 }, readFilter: { from: "2026-11-21", to: "2026-11-22" } })], { memories: [{ category: "preference", content: "推荐活动时优先周末上午", id: "MM1" }, { category: "constraint", content: "不要推荐晚上的活动", id: "MM2" }] });
  assert.deepEqual(fnRank(again.events).at(-1)!.listed, listed);
});

test("AE-FN-003: '这周该跟进谁' — history signals from the user's own records, no judgment; the reasons say due vs planned rightly", async () => {
  const message = "这周该跟进谁？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "这周该跟进" }, readFilter: { from: "2026-11-15", to: "2026-11-21" }, requiredCapabilities: ["contact.read", "view.recentInteraction", "fn.extractFollowUps", "fn.rank"], sourceQuote: message }]);
  const listed = fnRank(run.events).at(-1)!.listed as string[];
  assert.ok(listed.includes("contact:contact:c30") && listed.includes("contact:contact:c31"), listed.join(","));
  assert.equal(run.judgeCalls.length, 0);
  assert.equal(run.result.clarifications.filter((set) => set.kind !== "entry").length, 0, "no question (AG12 run-03: the ranking entries beside the answer are not questions)");
  assert.ok(!run.events.some((event) => event.type === "fn.extractFollowUps"), "no memo: no extraction");
  assert.match(run.result.text, /^依据来自你自己的记录：已到期没做的跟进、过了计划日的待办/u);
  assert.match(run.result.text, /跟进「跟进田中的分期方案」在11月14日（周六）到期，还没完成/u);
  assert.match(run.result.text, /待办「给李薇寄样片」的计划日11月10日（周二）已过（它没有截止时间）/u);
  assert.doesNotMatch(run.result.text, /给李薇寄样片[^。\n]*(过期|截止日已过)/u);
  assert.match(run.result.text, /想换个依据重新排/u);
});

test("dev run 1: the first layer's other shapes of the same asks still rank — '跟进谁' with to-do and schedule reads; five @ events with no event read", async () => {
  const who = "这周该跟进谁？";
  const people = await runFn(who, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "这周该跟进" }, readFilter: { from: "2026-11-15", status: "open", to: "2026-11-21" }, requiredCapabilities: ["contact.read", "todo.read", "schedule.read", "view.recentInteraction", "fn.rank"], sourceQuote: who }]);
  const listed = fnRank(people.events).at(-1)?.listed as string[] | undefined;
  assert.ok(listed?.includes("contact:contact:c30") && listed.includes("contact:contact:c31"), String(listed));
  // Stability run d: no rank from the first layer at all (and last week's dates) — the words still ask whom to follow up.
  const bare = await runFn(who, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", readFilter: { from: "2026-11-09", to: "2026-11-15" }, requiredCapabilities: ["contact.read", "view.recentInteraction", "fn.extractFollowUps", "fn.rank"], sourceQuote: who }]);
  const bareListed = fnRank(bare.events).at(-1)?.listed as string[] | undefined;
  assert.ok(bareListed?.includes("contact:contact:c30") && bareListed.includes("contact:contact:c31"), String(bareListed));
  const message = "从 @东京街头摄影展 @街拍工作坊 @SaaS 定价研讨会 @设计师之夜 @独立出版市集 里挑三场，优先周末上午，最好跟 @兴趣笔记 的主题有关。";
  const refs = [["event:e101", "东京街头摄影展", "event"], ["event:e102", "街拍工作坊", "event"], ["event:e103", "SaaS 定价研讨会", "event"], ["event:e104", "设计师之夜", "event"], ["event:e105", "独立出版市集", "event"], ["note:m36", "兴趣笔记", "memo"]].map(([id, name, type]) => ({ id, name, type }));
  const events = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", objectClues: refs.map((ref, index) => ({ entity: ref.type, referenceId: `r${index + 1}`, text: `@${ref.name}` })), rank: { basis: "跟 @兴趣笔记 的主题有关", count: 3, within: "周末上午" }, requiredCapabilities: ["fn.rank", "memo.read"], sourceQuote: message }], { references: refs });
  assert.deepEqual([...(fnRank(events.events).at(-1)!.listed as string[])].sort(), ["event:event:e101", "event:event:e102", "event:event:e105"]);
});

test("only listing records is not ranking: natural order, no question (AE-SCL-017 shape: formal follow-ups by due date)", async () => {
  const world = fnWorld();
  world.records.push({ ...world.records.find((record) => record.id === "task:f1")!, id: "task:f2", payload: { task: { accountId: ACTOR, createdAt: "2026-11-01T00:00:00.000Z", dueAt: "2026-11-10T09:00:00.000Z", id: "task:f2", source: "contact", status: "open", title: "跟进南窗茶空间的年度订单", updatedAt: "2026-11-02T00:00:00.000Z" } } });
  const message = "列出已经过期、或者 11 月 22 日之前到期的正式跟进，过期最久的排前面，只要前三条。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "正式跟进", count: 3, direction: "asc", orderBy: "dueAt" }, readFilter: { status: "open", text: "正式跟进", to: "2026-11-22" }, requiredCapabilities: ["todo.read", "fn.rank"], sourceQuote: message }], { world });
  assert.deepEqual(fnRank(run.events).at(-1)!.listed, ["todo:task:f2", "todo:task:f1"], "formal follow-ups only, the most overdue first");
  // Dev run 2: the first layer added a note read and an extraction; the words name follow-ups, so it is the same ranking.
  const other = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { count: 3, direction: "asc", orderBy: "dueAt" }, readFilter: { status: "open", to: "2026-11-22" }, requiredCapabilities: ["memo.read", "todo.read", "fn.extractFollowUps", "fn.rank"], sourceQuote: message }], { world });
  assert.deepEqual(fnRank(other.events).at(-1)!.listed, ["todo:task:f2", "todo:task:f1"]);
  assert.equal(run.result.clarifications.filter((set) => set.kind !== "entry").length, 0, "no question (AG12 run-03: the ranking entries beside the answer are not questions)");
  assert.equal(run.judgeCalls.length, 0);
  assert.match(run.result.text, /按截止时间，过期最久的排前面/u);
  assert.match(run.result.text, /符合条件的一共2条/u);
});

test("AE-FN-008: '@笔记 帮我整理一下' — a summary only: code's lead says so, two registered entries, no function runs, only the memo is read", async () => {
  const message = "@11 月 10 日笔记 帮我整理一下。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }], requiredCapabilities: ["memo.read", "fn.summarize"], sourceQuote: message }], {
    answer: (call) => {
      const handle = /(s\d+) — memo/u.exec(call.user)![1];
      return JSON.stringify({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: handle }], partId: "p1", text: "11 月 10 日小林来电，说小陈在审核；你答应 11 月 13 日给小林发报价。" }] });
    },
    references: [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }],
  });
  assert.match(run.result.text, /^你没说要整理成什么，我把“整理一下”理解成给这篇笔记写一段摘要/u);
  assert.match(run.result.text, /小林来电/u);
  const entries = run.result.clarifications.filter((set) => set.kind === "entry");
  assert.deepEqual(entries.flatMap((set) => set.options.map((option) => option.capability)), ["fn.extractInteractions", "fn.extractFollowUps"]);
  assert.ok(!run.events.some((event) => ["fn.rank", "fn.extractInteractions", "fn.extractFollowUps"].includes(String(event.type))));
  assert.deepEqual(run.result.sourceRefs, ["memo:note:m32"]);
  // Stability run e: the first layer offered readings (change the memo / summarize / follow-ups) — still only a summary, no question.
  const readings = await runFn(message, [{ clarity: "multiple_readings", dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "memo", referenceId: "r1", text: "11 月 10 日笔记" }], readings: [{ capabilities: ["memo.update"], deliverable: "change", label: "改" }, { capabilities: ["fn.summarize"], deliverable: "summary", label: "摘要" }, { capabilities: ["fn.extractFollowUps"], deliverable: "list", label: "跟进" }], requiredCapabilities: ["memo.update", "memo.read", "fn.summarize"], sourceQuote: message }], {
    answer: (call) => {
      const handle = /(s\d+) — memo/u.exec(call.user)![1];
      return JSON.stringify({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: handle }], partId: "p1", text: "11 月 10 日小林来电，说小陈在审核；你答应 11 月 13 日给小林发报价。" }] });
    },
    references: [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }],
  });
  assert.equal(readings.result.clarifications.filter((set) => set.kind === "question").length, 0);
  assert.match(readings.result.text, /^你没说要整理成什么/u);
  assert.equal(readings.frozen.length, 0);
});
