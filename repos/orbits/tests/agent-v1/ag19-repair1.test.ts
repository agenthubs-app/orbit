import assert from "node:assert/strict";
import { test } from "node:test";

import { hasMarkdownSymbols, inListOrder, listSortKey, recordOfView, type AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { eventsNamedIn, unsupportedEventClaim, withoutUnsupportedEventClaims, type EventClaimFacts } from "../../features/agent-v1/answer/event-claims";
import { listAnswer, listLead, recordLine, windowWords } from "../../features/agent-v1/answer/list-answer";
import { listsUpcomingEvents } from "../../features/agent-v1/graph/nodes/functions";
import { feeSentence } from "../../features/agent-v1/answer/materials";
import { asksEventsToGoTo, pointsAtPast, writesADate } from "../../features/agent-v1/functions/basis";
import type { AgentAnswerRecordContract } from "../../shared/contract/agent-v1";
import { fnWorld, runFn } from "./functions-kit";
import { json, type ModelCall } from "./graph-kit";
import { platformEvent } from "./read-kit";

/**
 * agent-design AG19 repair round 1 (the coordinator's decisions of 2026-11-20, before the judges' findings):
 *  1. a list-type read is written by code — the lead says how many, of what kind and for which window, and never names a
 *     listed record (the user's D1: each item is its card, not written out a second time); `text` stays complete;
 *  3. any request to recommend or list events to go to reads only events that have not started, nearest first, with or
 *     without "最近"; past events appear only when the user points at the past.
 */

const records = (blocks: readonly AnswerBlock[]) => blocks.filter((block): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records");
const citeAll = (extra: Record<string, unknown>) => (call: ModelCall) => {
  // The materials' handles of this turn, each cited by its first sentence.
  const handles = [...new Set(call.user.slice(call.user.indexOf("Items to answer")).match(/\bs\d+\b/gu) ?? [])];
  return json({ segments: [{ cites: handles.map((sourceRef) => ({ sentenceIds: [1], sourceRef })), partId: "p1", ...extra }] });
};

test("decision 3: which requests are for events to go to, and what points at the past", () => {
  for (const words of ["有哪些活动适合我？", "推荐几场活动", "最近有哪些活动适合我？", "这周末有什么活动值得去", "Which events would you recommend?", "おすすめのイベントはありますか"]) assert.equal(asksEventsToGoTo(words), true, words);
  for (const words of ["我之前去过哪些活动？", "上个月有哪些活动", "what events did I attend last month"]) {
    assert.equal(asksEventsToGoTo(words), false, words);
    assert.equal(pointsAtPast(words), true, words);
  }
  assert.equal(writesADate("11月10日那天有哪些活动"), true);
  assert.equal(writesADate("events on Nov 10"), true);
  assert.equal(writesADate("有哪些活动适合我"), false);
});

test("decision 3: 「有哪些活动适合我？」 without 最近 — only events that have not started, nearest first; the lead says so", async () => {
  const world = fnWorld();
  world.events.push(platformEvent("event:e090", "十月摄影散步", "2026-10-20T01:00:00.000Z", "上野"), platformEvent("event:e091", "九月读书会", "2026-09-12T01:00:00.000Z", "神保町"));
  const message = "有哪些活动适合我？";
  // Whatever the first layer tagged: with the ranking function …
  const ranked = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", rank: {}, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }], { world });
  // … or as a plain event read (which used to be turned down as a search of the directory).
  const plain = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["event.read"], sourceQuote: message }], { world });
  for (const run of [ranked, plain]) {
    const [list] = records(run.result.blocks);
    assert.deepEqual(list?.items.map((item) => item.id), ["event:e103", "event:e101", "event:e104", "event:e102", "event:e105", "event:e107"]);
    const lead = run.result.blocks[0];
    assert.equal(lead.type === "paragraph" ? lead.text : "", "还没开始的活动共6场，按开始时间从早到晚：");
    assert.doesNotMatch(run.result.text, /十月摄影散步|九月读书会|活动目录/u);
    assert.equal(run.result.partResults[0].status, "answered");
  }
});

test("decision 3: past events appear only when the user points at the past — in words, or by a date that has passed", async () => {
  const world = fnWorld();
  world.events.push(platformEvent("event:e090", "十月摄影散步", "2026-10-20T01:00:00.000Z", "上野"), platformEvent("event:e092", "十一月十日茶会", "2026-11-10T05:00:00.000Z", "神乐坂"));
  const before = "之前有过哪些活动？按时间列出来";
  const past = await runFn(before, [{ dataSources: ["orbit_records"], deliverable: "list", rank: { orderBy: "startsAt" }, readFilter: { to: "2026-11-14" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: before }], { world });
  assert.deepEqual(records(past.result.blocks)[0]?.items.map((item) => item.id), ["event:e090", "event:e092"]);
  const dated = "11月10日那天有哪些活动？";
  const onDay = await runFn(dated, [{ dataSources: ["orbit_records"], deliverable: "list", rank: { orderBy: "startsAt" }, readFilter: { from: "2026-11-10", to: "2026-11-10" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: dated }], { world });
  assert.deepEqual(records(onDay.result.blocks)[0]?.items.map((item) => item.id), ["event:e092"]);
  // A range the first layer made up for a question that names no date and no past is not kept (the user's report).
  const recent = "近期有什么活动？";
  const upcoming = await runFn(recent, [{ dataSources: ["orbit_records"], deliverable: "list", rank: { orderBy: "startsAt" }, readFilter: { from: "2026-10-15", to: "2026-11-14" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: recent }], { world });
  assert.equal(records(upcoming.result.blocks)[0]?.items.some((item) => item.id === "event:e090" || item.id === "event:e092"), false);
});

test("decision 3 leaves AG10-1 alone: a pick with no standard still asks what to pick by, once", async () => {
  const message = "哪两场活动最值得去？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { count: 2 }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }], { world: fnWorld() });
  assert.equal(run.result.clarifications.filter((set) => set.kind === "question").length, 1);
  assert.equal(records(run.result.blocks).length, 0);
});

test("decision 1: the lead of a list — how many, of what kind, for which window; never a record's name", () => {
  const schedule: AgentAnswerRecordContract[] = [{ day: "2026-11-16", id: "schedule:s10", kind: "schedule", title: "团队周会", top: "11月16日（周一）10:00" }, { day: "2026-11-19", id: "schedule:s11", kind: "schedule", sub: "涩谷 Stream 3 楼", title: "和田中午餐", top: "11月19日（周四）12:00" }];
  assert.equal(windowWords("zh", "下周我有哪些日程？", "2026-11-16", "2026-11-22"), "下周（11月16日至22日）");
  assert.equal(windowWords("zh", "月底前后的安排", "2026-11-25", "2026-12-02"), "11月25日至12月2日");
  assert.equal(windowWords("en", "what is on next week?", "2026-11-16", "2026-11-22"), "next week (Nov 16–22)");
  assert.equal(windowWords("zh", "我有哪些日程"), "");
  const lead = listLead({ cards: schedule, from: "2026-11-16", language: "zh", quote: "下周我有哪些日程？", to: "2026-11-22" });
  assert.equal(lead, "下周（11月16日至22日）有 2 个日程：");
  for (const card of schedule) assert.equal(lead.includes(card.title), false);
  const todos: AgentAnswerRecordContract[] = [
    { id: "task:t45", kind: "todo", sub: "计划日已过", title: "给李薇寄样片", top: "计划日 11月10日（周二）" },
    { id: "task:f1", kind: "todo", sub: "已过期", subTone: "late", title: "跟进田中的分期方案", top: "截止 11月14日（周六）18:00" },
    { id: "task:t44", kind: "todo", title: "回复田中的询价", top: "截止 11月17日（周二）18:00" },
    { id: "task:t42", kind: "todo", title: "给小林发修订报价", top: "计划日 11月18日（周三）" },
    { id: "task:t47", kind: "todo", title: "约山本吃饭" },
  ];
  assert.equal(listLead({ cards: todos, language: "zh", quote: "我有哪些还没完成的待办？", status: "open" }), "你有 5 项还没完成的待办，其中 2 项已过期或过了计划日：");
  assert.equal(listLead({ cards: todos.slice(2), language: "zh", quote: "我的待办" }), "你有 3 项待办：");
  assert.equal(listLead({ cards: [{ id: "note:m1", kind: "memo", title: "客户访谈" }], language: "zh", quote: "我记过哪些笔记" }), "找到 1 篇笔记：");
  assert.equal(listLead({ cards: todos.map((card) => (card.sub === "计划日已过" ? { ...card, sub: "Planned day has passed" } : card)), language: "en", quote: "what is still open?", status: "open" }), "You have 5 open to-dos, 2 of them past their deadline or planned day:");
  // The text version: the lead, then one line per record with the card's own facts.
  assert.equal(recordLine(todos[1], "zh"), "跟进田中的分期方案（截止 11月14日（周六）18:00，已过期）");
  assert.equal(recordLine(todos[4], "zh"), "约山本吃饭");
  const written = listAnswer({ cards: schedule, from: "2026-11-16", language: "zh", quote: "下周我有哪些日程？", to: "2026-11-22" });
  assert.equal(written.text, "下周（11月16日至22日）有 2 个日程：\n1. 团队周会（11月16日（周一）10:00）\n2. 和田中午餐（11月19日（周四）12:00，涩谷 Stream 3 楼）");
  assert.deepEqual(written.blocks.map((block) => block.type), ["paragraph", "records"]);
});

test("decision 1: a to-do past its planned day says so on its card, in the ordinary tone; a passed deadline keeps the late mark", () => {
  const context = { language: "zh" as const, now: "2026-11-15T01:00:00.000Z", timeZone: "Asia/Tokyo" };
  const view = (id: string, fields: Record<string, unknown>) => ({ fields, id, kind: "todo", ref: `todo:${id}`, updatedAt: "", version: "1" }) as never;
  assert.deepEqual(recordOfView(view("task:t45", { plannedDate: "2026-11-10", status: "open", title: "给李薇寄样片" }), context), { id: "task:t45", kind: "todo", sub: "计划日已过", title: "给李薇寄样片", top: "计划日 11月10日（周二）" });
  assert.equal(recordOfView(view("task:f1", { dueAt: "2026-11-14T09:00:00.000Z", status: "open", title: "跟进" }), context).subTone, "late");
  assert.equal(recordOfView(view("task:t42", { plannedDate: "2026-11-18", status: "open", title: "报价" }), context).sub, undefined, "a planned day still ahead says nothing");
  assert.equal(recordOfView(view("task:t46", { plannedDate: "2026-11-01", status: "completed", title: "发票" }), context).sub, "已完成");
});

test("decision 1: 「我有哪些还没完成的待办？」 answered through the model — the delivered lead and lines are code's, the model's sentences are not", async () => {
  const message = "我有哪些还没完成的待办？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: message }], {
    // The model enumerates the to-dos in its lead and points, as it did in run-01.
    answer: citeAll({ body: [{ points: [{ head: "给小林发修订报价", text: "计划 11月18日。" }, { head: "回复田中的询价", text: "11月17日截止。" }] }], lead: "你有几项待办：给小林发修订报价、回复田中的询价等。" }),
    world: fnWorld(),
  });
  const { blocks, text } = run.result;
  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "records"]);
  const [list] = records(blocks);
  assert.deepEqual(list.items.map((item) => item.id), ["task:t45", "task:f1", "task:t44", "task:t42"], "the read's own order (deadline, then planned day)");
  const lead = blocks[0].type === "paragraph" ? blocks[0].text : "";
  assert.equal(lead, "你有 4 项还没完成的待办，其中 2 项已过期或过了计划日：");
  for (const item of list.items) assert.equal(lead.includes(item.title), false, `the lead does not name ${item.title}`);
  assert.equal(text, "你有 4 项还没完成的待办，其中 2 项已过期或过了计划日：\n1. 给李薇寄样片（计划日 11月10日（周二），计划日已过）\n2. 跟进田中的分期方案（截止 11月14日（周六）18:00，已过期）\n3. 回复田中的询价（截止 11月17日（周二）18:00）\n4. 给小林发修订报价（计划日 11月18日（周三））");
  assert.doesNotMatch(text, /你有几项待办|等。/u);
  assert.equal(hasMarkdownSymbols(text), false);
  assert.ok(run.events.some((event) => event.type === "answer.list_by_code"));
  assert.deepEqual(run.result.sourceRefs.slice().sort(), ["todo:task:f1", "todo:task:t42", "todo:task:t44", "todo:task:t45"]);
});

test("decision 1 is for lists only: a question answered from records (not a list) keeps the model's answer, laid out by code", async () => {
  const message = "田中的分期方案跟进到哪一步了？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", readFilter: { status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: message }], {
    answer: citeAll({ body: [], lead: "跟进田中的分期方案这条待办已经过了截止时间，还没完成。" }),
    world: fnWorld(),
  });
  assert.match(run.result.text, /跟进田中的分期方案这条待办已经过了截止时间/u);
  assert.equal(run.events.some((event) => event.type === "answer.list_by_code"), false);
});

/* ── the judges' findings on run-01 (AE-ANS-003 R3) ─────────────────── */

const E103: EventClaimFacts = { endsAt: "2026-11-19T13:00:00.000Z", fee: { kind: "unstated" }, startsAt: "2026-11-19T10:00:00.000Z", title: "SaaS 定价研讨会" };
const E101: EventClaimFacts = { endsAt: "2026-11-21T04:00:00.000Z", fee: { kind: "free" }, startsAt: "2026-11-21T01:00:00.000Z", title: "东京街头摄影展" };
const E104: EventClaimFacts = { endsAt: "2026-11-21T13:00:00.000Z", fee: { amountYen: 2000, kind: "amount" }, startsAt: "2026-11-21T10:00:00.000Z", title: "设计师之夜" };
const THREE = [E103, E101, E104];
const check = (text: string, events: readonly EventClaimFacts[] = THREE) => withoutUnsupportedEventClaims(text, events, "Asia/Tokyo");

test("judges (a): 'the shortest' is not delivered when the events read run equally long; it stands when one really is", () => {
  // All three run three hours: the statement both judges failed.
  const said = "建议先去 SaaS 定价研讨会。\n・东京街头摄影展：时长最短，上午半天就结束。\n・设计师之夜：晚上的社交场合。";
  const result = check(said);
  assert.equal(result.text, "建议先去 SaaS 定价研讨会。\n・设计师之夜：晚上的社交场合。", "the sentence goes, and the point left with only its label goes with it");
  assert.equal(result.dropped.length, 1);
  assert.match(result.dropped[0].reason, /shortest.*cannot be derived/u);
  // One event really is the shortest: naming it stands, naming another does not.
  const shorter = [E103, { ...E101, endsAt: "2026-11-21T02:00:00.000Z" }, E104];
  assert.equal(check("东京街头摄影展时长最短。", shorter).dropped.length, 0);
  assert.match(check("设计师之夜时长最短。", shorter).dropped[0].reason, /is 东京街头摄影展, not the event named/u);
  // An end time that was not read: not derivable.
  assert.equal(check("东京街头摄影展是最短的一场。", [E103, { ...E101, endsAt: null }, E104]).dropped.length, 1);
  assert.equal(check("The photo walk is the shortest of the three.", THREE).dropped.length, 1);
});

test("judges (b): 'no ticket price is given' is not delivered when the events read state a fee; about an unpriced event it stands", () => {
  const result = check("这三场的名称、时间和地点都已知。这些活动的信息里没有票价。可以把重点放在其中一场。");
  assert.equal(result.text, "这三场的名称、时间和地点都已知。可以把重点放在其中一场。");
  assert.match(result.dropped[0].reason, /a fee is stated for 东京街头摄影展, 设计师之夜/u);
  assert.equal(check("SaaS 定价研讨会没有标明费用。").dropped.length, 0, "that one is unpriced");
  assert.equal(check("设计师之夜没有写票价。").dropped.length, 1, "2000 日元 is stated");
  assert.equal(check("No ticket price is given for these events.").dropped.length, 1);
  assert.equal(check("材料里没有票价。", [E103]).dropped.length, 0, "nothing read states one");
});

test("other comparatives are held to the fields the same way: cheapest, the only one that …, earliest", () => {
  assert.match(String(unsupportedEventClaim("设计师之夜最便宜。", [E104], THREE, "Asia/Tokyo")), /cheapest.*cannot be derived/u, "one fee is not stated");
  const priced = [{ ...E103, fee: { amountYen: 5000, kind: "amount" } }, E101, E104];
  assert.equal(unsupportedEventClaim("东京街头摄影展最便宜。", [E101], priced, "Asia/Tokyo"), null);
  assert.match(String(unsupportedEventClaim("设计师之夜最便宜。", [E104], priced, "Asia/Tokyo")), /is 东京街头摄影展/u);
  assert.equal(unsupportedEventClaim("东京街头摄影展是唯一免费的一场。", [E101], priced, "Asia/Tokyo"), null);
  assert.match(String(unsupportedEventClaim("设计师之夜是唯一在晚上的活动。", [E104], THREE, "Asia/Tokyo")), /2 of the events read are so/u, "E103 is in the evening too");
  assert.match(String(unsupportedEventClaim("东京街头摄影展是唯一值得去的。", [E101], THREE, "Asia/Tokyo")), /nothing that the fields read can show/u);
  assert.equal(unsupportedEventClaim("SaaS 定价研讨会最早开始。", [E103], THREE, "Asia/Tokyo"), null);
  assert.match(String(unsupportedEventClaim("设计师之夜最早开始。", [E104], THREE, "Asia/Tokyo")), /is SaaS 定价研讨会/u);
  // Sentences that make no such claim are untouched, and so is a text with no event read.
  assert.deepEqual(check("三场时间不冲突，想去的都可以去。"), { dropped: [], text: "三场时间不冲突，想去的都可以去。" });
  assert.deepEqual(check("最短的一条待办明天到期。", []), { dropped: [], text: "最短的一条待办明天到期。" });
});

test("an event is read in full: the follow-up after a list gets each event's topics and fee, and its statements are checked", async () => {
  assert.equal(feeSentence("amount", "2000"), "JPY 2,000");
  assert.equal(feeSentence("unstated", null), "not stated (this does not mean free)");
  const world = fnWorld();
  const session = (await import("./graph-kit")).graphKit((async () => { throw new Error("no model call expected here"); }) as never, { now: "2026-11-15T01:00:00.000Z", records: (await import("./graph-kit")).recordAccessOf(world) });
  const first = "最近有哪些活动适合我？";
  await runFn(first, [{ dataSources: ["orbit_records"], deliverable: "list", rank: { count: 3 }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: first }], { session, world });
  // Release-2 gate 2: 「你觉得有必要参加？为什么？」 is now written by code (part 3's reasons, ag19-follow-list.test.ts), so the
  // answer step's materials and its checked statements are tested with a follow-up that still goes to it.
  const second = "这几场里哪场更适合先去？";
  const calls: ModelCall[] = [];
  const run = await runFn(second, [{ dataSources: ["orbit_records"], deliverable: "answer", requiredCapabilities: ["event.read"], sourceQuote: second }], {
    answer: (call) => {
      calls.push(call);
      // The two statements of run-01, word for word in kind: one event 'the shortest', and 'no ticket price'.
      return json({ segments: [{ body: [{ p: "东京街头摄影展是三场里时长最短的。" }, { p: "这些活动的信息里没有票价。" }, { p: "三场时间不冲突。" }], cites: [{ sentenceIds: [1], sourceRef: "s1" }, { sentenceIds: [1], sourceRef: "s2" }], lead: "建议先去 SaaS 定价研讨会。", partId: "p1" }] });
    },
    session,
    world,
  });
  // The materials carry what the ranking knows: topics and the fee as stated (2000 日元, free, not stated).
  const prompt = calls[0].user;
  for (const words of ["Topics: 摄影", "Fee: free", "Fee: JPY 2,000", "Fee: not stated (this does not mean free)"]) assert.ok(prompt.includes(words), words);
  assert.equal(run.result.text, "建议先去 SaaS 定价研讨会。\n三场时间不冲突。");
  const dropped = run.events.find((event) => event.type === "answer.event_claims_dropped") as { dropped?: { sentence: string }[] } | undefined;
  assert.deepEqual(dropped?.dropped?.map((item) => item.sentence), ["东京街头摄影展是三场里时长最短的。", "这些活动的信息里没有票价。"]);
});

test("an answer call that fails in transit gets one second chance (records and discussion alike); a second failure still says so", async () => {
  const message = "我有哪些还没完成的待办？";
  let calls = 0;
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: message }], {
    answer: (call) => {
      calls += 1;
      if (calls === 1) throw new Error("terminated");
      return citeAll({ body: [], lead: "你有几项待办。" })(call);
    },
    world: fnWorld(),
  });
  assert.equal(calls, 2);
  assert.equal(run.result.partResults[0].status, "answered");
  assert.ok(run.events.some((event) => event.type === "answer.retry"));
  let failures = 0;
  const failed = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: message }], { answer: () => { failures += 1; throw new Error("terminated"); }, world: fnWorld() });
  assert.equal(failures, 2, "one retry, not more");
  assert.equal(failed.result.partResults[0].status, "failed");
  const talk = "第一次拜访客户要准备什么？";
  let talks = 0;
  const discussed = await runFn(talk, [{ sourceQuote: talk }], { answer: () => { talks += 1; if (talks === 1) throw new Error("terminated"); return json({ segments: [{ body: [], lead: "先了解对方的业务。", partId: "p1" }] }); }, world: fnWorld() });
  assert.equal(discussed.result.text, "先了解对方的业务。");
});

test("a list code writes is in reading order: schedule and events by time, to-dos by deadline then planned day, notes newest first", () => {
  const view = (kind: string, id: string, fields: Record<string, unknown>) => ({ fields, id, kind, ref: `${kind}:${id}`, updatedAt: "", version: "1" }) as never;
  const item = (kind: string, id: string, fields: Record<string, unknown>, index: number) => ({ id, index, key: listSortKey(view(kind, id, fields)), kind });
  // The read returned the lunch (Nov 19) before the weekly meeting (Nov 16): the list shows the calendar's order.
  assert.deepEqual(inListOrder([item("schedule", "s11", { startsAt: "2026-11-19T03:00:00.000Z" }, 0), item("schedule", "s10", { startsAt: "2026-11-16T01:00:00.000Z" }, 1)]).map((entry) => entry.id), ["s10", "s11"]);
  assert.deepEqual(inListOrder([item("todo", "none", {}, 0), item("todo", "planned", { plannedDate: "2026-11-18" }, 1), item("todo", "due", { dueAt: "2026-11-17T09:00:00.000Z" }, 2), item("todo", "old", { plannedDate: "2026-11-10" }, 3)]).map((entry) => entry.id), ["old", "due", "planned", "none"]);
  assert.deepEqual(inListOrder([item("memo", "older", { createdAt: "2026-11-01T00:00:00.000Z" }, 0), item("memo", "newer", { interaction: { occurredOn: "2026-11-12" } }, 1)]).map((entry) => entry.id), ["newer", "older"]);
  // Mixed kinds, or a record with no key (a contact): the read's own order stays.
  assert.deepEqual(inListOrder([item("contact", "b", {}, 0), item("contact", "a", {}, 1)]).map((entry) => entry.id), ["b", "a"]);
  assert.deepEqual(inListOrder([item("schedule", "s", { startsAt: "2026-11-19T03:00:00.000Z" }, 0), item("todo", "t", { dueAt: "2026-11-01T00:00:00.000Z" }, 1)]).map((entry) => entry.id), ["s", "t"]);
});

test("the speaker is never a contact to look up: 「最近有哪些活动适合我？」 tagged with a contact clue 我 still lists the events", async () => {
  const message = "最近有哪些活动适合我？";
  // As the first layer once gave it: an event read, a profile read, and "我" as a contact clue.
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "contact", text: "我" }], requiredCapabilities: ["event.read", "profile.read"], sourceQuote: message }], { world: fnWorld() });
  assert.ok(run.events.some((event) => event.type === "understand.speaker_clue"));
  assert.deepEqual(records(run.result.blocks)[0]?.items.map((item) => item.id).slice(0, 3), ["event:e103", "event:e101", "event:e104"]);
  assert.doesNotMatch(run.result.text, /哪一位联系人/u);
});

test("stability run: a statement is held to the event its own clause names, short forms of a title count, and free is never undercut", () => {
  // Delivered by the model on the repaired build and dropped by mistake: the unpriced event is named by a short form, in
  // its own clause; the sentence also names the priced one.
  const said = "所以理由是：摄影展免费，又是周末上午；设计师之夜是当天晚上，可以连着去；定价研讨会是工作日晚上，费用还没写明，需要你确认后再定。";
  assert.deepEqual(check(said), { dropped: [], text: said });
  assert.deepEqual(eventsNamedIn("定价研讨会是工作日晚上", THREE).map((event) => event.title), ["SaaS 定价研讨会"]);
  assert.deepEqual(eventsNamedIn("摄影展免费", THREE).map((event) => event.title), ["东京街头摄影展"]);
  assert.deepEqual(eventsNamedIn("这场研讨会不错", [E103, { ...E101, title: "摄影研讨会" }]), [], "a short form two events share names neither");
  assert.equal(check("摄影展免费；设计师之夜的票价没有写。").dropped.length, 1, "the clause's own event states 2000 日元");
  assert.equal(check("・SaaS 定价研讨会：主题是定价；费用没有注明，这不代表免费。").dropped.length, 0, "a clause that names none speaks of its sentence's event");
  // Free is the floor: said of the free event it stands even though one fee is not stated; said of a priced one it does not.
  assert.equal(check("东京街头摄影展免费，是三场里成本最低、最容易安排的一场。").dropped.length, 0);
  assert.equal(check("设计师之夜是三场里成本最低的。").dropped.length, 1);
  // "夜" in a title is not a statement about the evening.
  assert.match(String(unsupportedEventClaim("设计师之夜是唯一讲设计的一场。", [E104], THREE, "Asia/Tokyo")), /nothing that the fields read can show/u);
});

test("stability run: 「有哪些活动适合我？」 tagged with a contact read too is still the list of events not yet started; words that name another basis keep the old path", async () => {
  const message = "有哪些活动适合我？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", requiredCapabilities: ["profile.read", "event.read", "contact.read", "fn.rank"], sourceQuote: message }], { world: fnWorld() });
  assert.ok(run.events.some((event) => event.type === "functions.upcoming_only"));
  const kinds = records(run.result.blocks)[0]?.items.map((item) => item.kind) ?? [];
  assert.ok(kinds.length >= 3 && kinds.every((kind) => kind === "event"), kinds.join(","));
  const part = (quote: string, capabilities: string[]) => ({ capabilities, plan: {}, quote: [0, quote.length], refs: [], route: "read" }) as never;
  assert.equal(listsUpcomingEvents(part(message, ["event.read", "contact.read", "memo.read"]), message), true);
  for (const words of ["根据我的笔记，有哪些活动适合我？", "按我和田中的往来，推荐几场活动", "有哪些活动适合我认识的联系人？"]) assert.equal(listsUpcomingEvents(part(words, ["event.read", "contact.read", "memo.read"]), words), false, words);
});
