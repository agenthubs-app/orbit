import assert from "node:assert/strict";
import { test } from "node:test";

import { composeStructured, hasMarkdownSymbols, joinBlocks, needsLayout, noteItemOf, replaceInBlocks, recordOfView, recordsBlock, stripMarkdown, textBlocks, type AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { gapWords } from "../../features/agent-v1/answer/gap-copy";
import { resumedAnswer } from "../../features/agent-v1/entry/store";
import { asksUpcomingEvents } from "../../features/agent-v1/functions/basis";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { withBoundaryTail } from "../../features/agent-v1/graph/executor";
import { fieldListLead } from "../../features/agent-v1/graph/nodes/functions";
import { isNotDone } from "../../features/agent-v1/graph/nodes/deliver";
import { handoffWords } from "../../features/agent-v1/route/handoff-copy";
import { agentResultDocumentSchema } from "../../shared/api-schema/agent-v1";
import type { AgentAnswerRecordContract } from "../../shared/contract/agent-v1";
import { byNode, fnWorld, NOW, runFn } from "./functions-kit";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { platformEvent } from "./read-kit";

/**
 * agent-design AG19 (approved visual draft 2026-11-19, D1–D6): the answer's blocks.
 *  - AG19-1: a list answer carries one card per listed record, in the list's order; `text` still says the same;
 *  - AG19-2: more than five: five shown first, the rest under "还有 N 条";
 *  - AG19-3: a discussion answer is laid out by code from plain fields; no Markdown symbol is delivered; the records it
 *    mentions get small cards, a record on one card only;
 *  - AG19-4: what was not done is one note, apart from the answer; none when everything was done;
 *  - AG19-6: "最近有哪些活动" lists only events that have not started, the nearest first;
 *  - AG19-7: a client that reads only `text` loses nothing; a block type it does not know is skipped.
 */

const records = (blocks: readonly AnswerBlock[]) => blocks.filter((block): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records");
const eventPart = (message: string, extra: Record<string, unknown> = {}) => ({ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message, ...extra });

test("D4: Markdown symbols are taken out; a list marker becomes code's point mark", () => {
  const text = stripMarkdown("## 结论\n**建议优先参加第1回**，`第2回`可作为补充。\n* 第1回：成本最低\n- 第2回：再去\n---", "zh");
  assert.equal(hasMarkdownSymbols(text), false);
  assert.equal(text, "结论\n建议优先参加第1回，第2回可作为补充。\n・第1回：成本最低\n・第2回：再去");
  assert.equal(stripMarkdown("5 件のうち #3 が該当します", "ja"), "5 件のうち #3 が該当します", "a # that is not a heading stays");
  assert.equal(hasMarkdownSymbols("没有符号的一句话。"), false);
  assert.equal(hasMarkdownSymbols("**加粗**"), true);
});

test("D4: lead and body become the text version; the layout is read back from it — conclusion, paragraph, points", () => {
  const text = composeStructured({ body: [{ p: "三场是同一系列，重复参加边际收益递减。" }, { points: [{ head: "第1回", text: "先去能判断质量。" }, { head: "**第2回**", text: "若第1回冲突，再去。" }, { text: "第3回是下午场。" }] }, { p: "参加前最好确认主题。" }], lead: "建议优先参加第1回，不必三场都去。" }, "zh")!;
  assert.equal(text, "建议优先参加第1回，不必三场都去。\n三场是同一系列，重复参加边际收益递减。\n・第1回：先去能判断质量。\n・第2回：若第1回冲突，再去。\n・第3回是下午场。\n参加前最好确认主题。");
  assert.deepEqual(textBlocks(text, "zh", { conclusion: true }), [
    { text: "建议优先参加第1回，不必三场都去。", type: "conclusion" },
    { text: "三场是同一系列，重复参加边际收益递减。", type: "paragraph" },
    { items: [{ head: "第1回", text: "先去能判断质量。" }, { head: "第2回", text: "若第1回冲突，再去。" }, { text: "第3回是下午场。" }], type: "points" },
    { text: "参加前最好确认主题。", type: "paragraph" },
  ]);
  // Board 5 note 5: a one- or two-sentence answer is not split: one plain paragraph, no bold conclusion.
  assert.deepEqual(textBlocks(composeStructured({ body: [], lead: "可以，周五前发就行。" }, "zh")!, "zh", { conclusion: true }), [{ text: "可以，周五前发就行。", type: "paragraph" }]);
  // Not in the structure: the whole text as paragraphs, symbols out — never lost.
  assert.equal(composeStructured({ text: "**先准备报价**，再准备案例。" }, "zh"), "先准备报价，再准备案例。");
  assert.equal(composeStructured({ body: "oops", lead: 3 }, "zh"), null);
  // More than five points read better as paragraphs (board 5 note 5).
  const many = textBlocks(["・一", "・二", "・三", "・四", "・五", "・六"].join("\n"), "zh");
  assert.equal(many.every((block) => block.type === "paragraph"), true);
  assert.equal(many.length, 6);
});

test("board 4: a 'not done' sentence is split into the user's words, the reason and what to do now (zh, ja, en)", () => {
  assert.deepEqual(noteItemOf(gapWords("zh").eventSearch("哪些活动？"), "哪些活动？", "zh"), { action: "用 @ 选一场活动，我可以读它的内容。", quote: "哪些活动？", text: "这要按条件在 Orbit 活动目录里找活动，现在还不能这样找，所以这次没有找。" });
  assert.deepEqual(noteItemOf(handoffWords("zh").waiting("你觉得有必要参加？为什么？", "哪些活动？"), "你觉得有必要参加？为什么？", "zh"), { quote: "你觉得有必要参加？为什么？", text: "要等「哪些活动？」有了结果才能做，这次先不做。" });
  assert.deepEqual(noteItemOf(handoffWords("zh").budget("查一下小林"), "查一下小林", "zh"), { action: "再发一次，我就接着处理。", quote: "查一下小林", text: "这次没做完：这一轮能用的处理次数已经用完了，并不是 Orbit 做不了这件事。" });
  // A sentence that does not start with the quote still names the user's words.
  assert.deepEqual(noteItemOf(handoffWords("zh").declined("看看王强的客户名单"), "看看王强的客户名单", "zh"), { quote: "看看王强的客户名单", text: "你要看的是另一位用户的资料。没有那位用户的授权，Orbit 不能读取。" });
  const en = noteItemOf(gapWords("en").eventSearch("which events?"), "which events?", "en");
  assert.equal(en.quote, "which events?");
  assert.equal(en.action, "Attach an event with @ and I can read it.");
  // Japanese "「…」は…" keeps the sentence whole rather than leave a fragment.
  const ja = noteItemOf(handoffWords("ja").waiting("参加すべき？", "どのイベント？"), "参加すべき？", "ja");
  assert.equal(ja.quote, "参加すべき？");
  assert.match(ja.text, /^「参加すべき？」は/u);
  assert.deepEqual(noteItemOf(handoffWords("zh").notUnderstood, null, "zh"), { action: "请再发一次，或者换个说法。", text: "这次没处理成：我没能把这条消息整理成可以处理的样子。" });
});

test("AG19-4: which parts go into the note — refused, failed, unfinished, waiting; a question does not", () => {
  assert.equal(isNotDone({ reason: null, route: "read", status: "declined" }), true);
  assert.equal(isNotDone({ reason: "not_in_this_version", route: "read", status: "unfinished" }), true);
  assert.equal(isNotDone({ reason: "dependency_pending", route: "answer", status: "waiting_dependency" }), true);
  assert.equal(isNotDone({ reason: null, route: "read", status: "answered" }), false);
  assert.equal(isNotDone({ reason: "still_unclear", route: "read", status: "unfinished" }), false);
  assert.equal(isNotDone({ reason: null, route: "clarify", status: "awaiting_clarification" }), false);
  assert.equal(isNotDone({ reason: "nothing_to_write", route: "propose_write", status: "unfinished" }, true), false, "code's own line about the record stays in the answer");
});

test("cards: the three lines of each kind are code's, dates with their weekday; a record is on one card only", () => {
  const context = { language: "zh" as const, now: "2026-11-18T09:00:00.000Z", timeZone: "Asia/Tokyo" };
  const view = (kind: string, id: string, fields: Record<string, unknown>) => ({ fields, id, kind, ref: `${kind}:${id}`, updatedAt: "", version: "1" }) as never;
  assert.deepEqual(recordOfView(view("todo", "task:t44", { dueAt: "2026-11-16T09:00:00.000Z", status: "open", title: "回复田中的询价" }), context), { id: "task:t44", kind: "todo", sub: "已过期2天", subTone: "late", title: "回复田中的询价", top: "截止 11月16日（周一）18:00" });
  assert.deepEqual(recordOfView(view("contact", "contact:c46", { company: "青松物流", displayName: "王强", headline: "运营经理" }), context), { id: "contact:c46", kind: "contact", title: "王强", top: "青松物流 · 运营经理" });
  assert.deepEqual(recordOfView(view("memo", "note:m31", { body: "想先试用三个月，再谈正式合同。他最在意日文客服。", contactIds: ["contact:c30"], createdAt: "2026-11-10T03:00:00.000Z", title: "客户访谈" }), { ...context, nameOf: () => "田中浩" }), { contactId: "contact:c30", id: "note:m31", kind: "memo", sub: "田中浩 · 想先试用三个月，再谈正式合同", title: "客户访谈", top: "11月10日（周二）" });
  assert.deepEqual(recordOfView(view("schedule", "schedule:s1", { location: "涩谷 Stream 3 楼", startsAt: "2026-11-19T03:00:00.000Z", title: "和田中午餐" }), context), { day: "2026-11-19", id: "schedule:s1", kind: "schedule", sub: "涩谷 Stream 3 楼", title: "和田中午餐", top: "11月19日（周四）12:00" });
  assert.deepEqual(recordOfView(view("event", "attendance:a1", { attendedOn: "2026-10-25", eventRefId: "private_event:p1", eventRefKind: "private", kind: "attendance", title: "大学同学聚会" }), context), { day: "2026-10-25", eventId: "private_event:p1", eventKind: "private", id: "attendance:a1", kind: "attendance", sub: "自己记的 · 私人", title: "大学同学聚会", top: "10月25日（周日）" });
  assert.deepEqual(recordOfView(view("event", "event:e1", { location: "涩谷", startsAt: "2026-11-27T10:00:00.000Z", title: "SaaS 定价研讨会" }), context), { eventKind: "platform", id: "event:e1", kind: "event", sub: "涩谷", title: "SaaS 定价研讨会", top: "11月27日（周五）19:00" });
  const card = (id: string): AgentAnswerRecordContract => ({ id, kind: "contact", title: id });
  const eight = recordsBlock(["a", "b", "c", "d", "e", "f", "g", "h", "a"].map(card), "zh");
  assert.ok(eight && eight.type === "records");
  assert.deepEqual([eight.items.length, eight.shown, eight.moreLabel, eight.lessLabel], [8, 5, "还有 3 位", "收起"]);
  const five = recordsBlock(["a", "b", "c", "d", "e"].map(card), "zh");
  assert.ok(five && five.type === "records");
  assert.equal(five.moreLabel, undefined, "five or fewer: no 还有 N 条 line");
  const mini = recordsBlock([{ id: "e1", kind: "event", title: "第1回" }, { id: "e2", kind: "event", title: "第2回" }, { id: "e3", kind: "event", title: "第3回" }, { id: "e4", kind: "event", title: "第4回" }], "zh", { size: "mini" });
  assert.ok(mini && mini.type === "records");
  assert.deepEqual([mini.size, mini.caption, mini.shown, mini.moreLabel], ["mini", "提到的活动", 3, "还有 1 场"]);
  assert.equal(recordsBlock([], "zh"), null);
});

test("AG19-6: 最近／近期／接下来 about events means the ones that have not started; a past period keeps the past", () => {
  for (const words of ["最近有哪些活动适合我？", "近期有什么活动", "接下来有哪些活动", "Any events coming up?", "今後のイベントを教えて"]) assert.equal(asksUpcomingEvents(words), true, words);
  for (const words of ["上个月有哪些活动", "我最近去过哪些活动", "what events did I go to last month", "先月のイベント", "有哪些摄影活动"]) assert.equal(asksUpcomingEvents(words), false, words);
});

test("board 1 note 1: the lead of a field list — how many in all, the order, how many are shown", () => {
  assert.equal(fieldListLead("zh", { direction: "asc", field: "startsAt", listed: 3, noun: "活动", total: 30, unit: "场" }), "共30场，按开始时间从早到晚，先看3场：");
  assert.equal(fieldListLead("zh", { direction: "asc", field: "startsAt", listed: 3, noun: "活动", total: 3, unit: "场", upcoming: true }), "还没开始的活动共3场，按开始时间从早到晚：");
  assert.equal(fieldListLead("zh", { direction: "asc", field: "startsAt", listed: 0, noun: "活动", total: 0, unit: "场", upcoming: true }), "现在没有还没开始的活动。");
  assert.match(fieldListLead("zh", { direction: "asc", field: "lastInteraction", listed: 8, noun: "联系人", total: 26, unit: "位" }), /^共26位，按最近一次往来的日期从远到近.*，先看8位：$/u);
});

test("AG19-1, AG19-6: 「最近有哪些活动适合我？」 → a lead and one card per event, upcoming only, nearest first; text says the same", async () => {
  const world = fnWorld();
  // Two events that already took place (the user's report: three past events were listed).
  world.events.push(platformEvent("event:e090", "第1回 中日创业交流会", "2026-03-22T09:00:00.000Z", "ザ 東京タワーズ"), platformEvent("event:e091", "第2回 中日创业交流会", "2026-04-25T09:30:00.000Z", "ザ 東京タワーズ"));
  const message = "最近有哪些活动适合我？";
  // The first layer read "最近" as the last thirty days: code does not keep a range that ends before now.
  const run = await runFn(message, [eventPart(message, { readFilter: { from: "2026-10-16", to: "2026-11-14" } })], { world });
  const blocks = run.result.blocks;
  const [list] = records(blocks);
  assert.ok(list, "a records block");
  assert.deepEqual(list.items.map((item) => item.kind), list.items.map(() => "event"));
  assert.deepEqual(list.items.map((item) => item.id), ["event:e103", "event:e101", "event:e104", "event:e102", "event:e105", "event:e107"], "upcoming only, the nearest first");
  assert.deepEqual(list.items[0], { eventKind: "platform", id: "event:e103", kind: "event", sub: "丸之内", title: "SaaS 定价研讨会", top: "11月19日（周四）19:00" });
  // AG19-2: six events — five shown first, one under "还有 1 场".
  assert.deepEqual([list.shown, list.moreLabel, list.lessLabel], [5, "还有 1 场", "收起"]);
  assert.equal(blocks[0].type, "paragraph");
  assert.equal(blocks[0].type === "paragraph" ? blocks[0].text : "", "还没开始的活动共6场，按开始时间从早到晚：");
  // The text version says the same, in the same order (App build 18 reads only this).
  const text = run.result.text;
  const at = list.items.map((item) => text.indexOf(item.title));
  assert.equal(at.every((index) => index >= 0), true);
  assert.deepEqual([...at].sort((left, right) => left - right), at);
  assert.doesNotMatch(text, /中日创业交流会/u);
  assert.equal(hasMarkdownSymbols(text), false);
  assert.equal(blocks.some((block) => block.type === "note"), false, "nothing was left undone: no note");
  assert.ok(run.events.some((event) => event.type === "functions.upcoming_only"));
  // The event with no start time is named beside the list and gets a small card of its own, not a place in the order.
  const mini = records(blocks).find((block) => block.size === "mini");
  assert.deepEqual(mini?.items.map((item) => [item.id, item.top]), [["event:e106", "时间未公布"]]);
});

test("AG19-6: 活动 asked about as coming up is the event list, also when the first layer tagged a schedule read", async () => {
  const message = "把接下来的活动按开始时间都列出来。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["schedule.read"], sourceQuote: message }], { world: fnWorld() });
  assert.deepEqual(records(run.result.blocks)[0]?.items.map((item) => item.id), ["event:e103", "event:e101", "event:e104", "event:e102", "event:e105", "event:e107"]);
  // With a word for the schedule beside it, the read the first layer named stands (no event list is forced).
  const both = "接下来的活动和日程安排都列出来。";
  const mixed = await runFn(both, [{ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["schedule.read"], sourceQuote: both }], { answer: () => json({ segments: [{ lead: "接下来没有日程。", partId: "p1" }] }), world: fnWorld() });
  assert.equal(mixed.events.some((event) => event.type === "functions.upcoming_only"), false);
});

test("a point's label ends at a full-width colon or a colon and a space, never inside a time", () => {
  assert.deepEqual(textBlocks("・11月16日（周一）10:00：团队周会，每周重复。\n・11月19日（周四）12:00：和田中午餐。", "zh"), [{ items: [{ head: "11月16日（周一）10:00", text: "团队周会，每周重复。" }, { head: "11月19日（周四）12:00", text: "和田中午餐。" }], type: "points" }]);
  assert.deepEqual(textBlocks("- Mon 10:00 weekly meeting\n- First: prepare the quote", "en"), [{ items: [{ text: "Mon 10:00 weekly meeting" }, { head: "First", text: "prepare the quote" }], type: "points" }]);
});

test("AG19-6: a past period in the words keeps the past events", async () => {
  const world = fnWorld();
  world.events.push(platformEvent("event:e090", "十月摄影散步", "2026-10-20T01:00:00.000Z", "上野"));
  const message = "上个月有哪些活动？按时间列出来";
  const run = await runFn(message, [eventPart(message, { rank: { orderBy: "startsAt" }, readFilter: { from: "2026-10-01", to: "2026-10-31" } })], { world });
  assert.deepEqual(records(run.result.blocks)[0]?.items.map((item) => item.id), ["event:e090"]);
});

test("AG19-3: a discussion answer — conclusion, paragraph, points; no symbol in text or blocks", async () => {
  const message = "要不要三场交流会都参加？";
  const model = deepseekStub(byNode({
    answer: () => json({ segments: [{ body: [{ p: "三场是**同一系列**，重复参加边际收益递减。" }, { points: [{ head: "第1回", text: "先去能判断质量。" }, { head: "第2回", text: "若第1回时间冲突，再去。" }] }], lead: "建议优先参加第1回，不必三场都去。", partId: "p1" }] }),
    understand: () => json({ language: "zh", parts: [part({ sourceQuote: message })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.deepEqual(result.blocks, [
    { text: "建议优先参加第1回，不必三场都去。", type: "conclusion" },
    { text: "三场是同一系列，重复参加边际收益递减。", type: "paragraph" },
    { items: [{ head: "第1回", text: "先去能判断质量。" }, { head: "第2回", text: "若第1回时间冲突，再去。" }], type: "points" },
  ]);
  assert.equal(result.text, "建议优先参加第1回，不必三场都去。\n三场是同一系列，重复参加边际收益递减。\n・第1回：先去能判断质量。\n・第2回：若第1回时间冲突，再去。");
  assert.equal(hasMarkdownSymbols(result.text), false);
});

test("AG19-3: an answer not in the structure is one paragraph, symbols out — the answer is never lost", async () => {
  const message = "帮我想想下周见客户前要准备什么。";
  const model = deepseekStub(byNode({
    answer: () => json({ segments: [{ partId: "p1", text: "**先准备报价**，再准备案例。" }] }),
    understand: () => json({ language: "zh", parts: [part({ sourceQuote: message })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.deepEqual(result.blocks, [{ text: "先准备报价，再准备案例。", type: "paragraph" }]);
  assert.equal(result.text, "先准备报价，再准备案例。");
});

test("AG19-4: a part that was not done is in the note, apart from the answer; the text keeps the sentence", async () => {
  const message = "帮我找几场适合带田中去的摄影活动";
  const model = deepseekStub(byNode({
    understand: () => json({ language: "zh", parts: [part({ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "contact", text: "田中" }], readFilter: { text: "摄影" }, requiredCapabilities: ["event.read"], sourceQuote: message })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(fnWorld()) });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  const note = result.blocks.find((block) => block.type === "note");
  if (!note || note.type !== "note") {
    // The part was read another way (the person's notes): then nothing was left undone, and there is no note.
    assert.equal(result.partResults.every((item) => item.status === "answered"), true);
    return;
  }
  assert.equal(note.title, "这次没做的部分");
  assert.equal(note.items[0].quote, message);
  assert.equal(result.blocks.filter((block) => block.type === "note").length, 1);
  assert.match(result.text, new RegExp(note.items[0].text.slice(0, 12), "u"));
});

test("a resumed answer keeps its blocks and the continuation follows; one note; the boundary's own lines follow as paragraphs", () => {
  const before = { blocks: [{ text: "共2场：", type: "paragraph" as const }, { items: [{ id: "e1", kind: "event" as const, title: "A" }], shown: 1, type: "records" as const }, { items: [{ text: "这次没有找。" }], title: "这次没做的部分", type: "note" as const }], sourceRefs: ["event:e1"], text: "共2场：\n1. A\n\n这次没有找。" };
  const after = { blocks: [{ text: "好，就按这个做法来。", type: "paragraph" as const }, { items: [{ id: "e1", kind: "event" as const, title: "A" }, { id: "e2", kind: "event" as const, title: "B" }], shown: 2, type: "records" as const }], sourceRefs: [], text: "好，就按这个做法来。" };
  const joined = resumedAnswer(before, after);
  assert.deepEqual(joined.blocks?.map((block) => block.type), ["paragraph", "records", "paragraph", "records", "note"]);
  assert.deepEqual(records(joined.blocks ?? []).map((block) => block.items.map((item) => item.id)), [["e1"], ["e2"]], "a record is on one card only");
  // An older answer without blocks joins as paragraphs.
  assert.deepEqual(joinBlocks({ text: "旧的回答。" }, after, "zh")?.[0], { text: "旧的回答。", type: "paragraph" });
  assert.equal(resumedAnswer({ sourceRefs: [], text: "旧" }, { sourceRefs: [], text: "新" }).blocks, undefined, "no blocks on either side: none made up");
  assert.deepEqual(withBoundaryTail([{ text: "答。", type: "paragraph" }], "答。", "答。\n\n这张卡已经关闭。", "zh"), [{ text: "答。", type: "paragraph" }, { text: "这张卡已经关闭。", type: "paragraph" }]);
});

test("AG19-7: the document schema — a client skips a block type it does not know; a document without blocks still parses", () => {
  const base = { partResults: [{ partId: "p1", status: "answered" }], requestId: "agreq_1", revision: 1, schemaVersion: 1, sessionId: "s1", status: "completed", updatedAt: NOW };
  const old = agentResultDocumentSchema.parse({ ...base, answer: { sourceRefs: [], text: "三场活动：…" } });
  assert.equal(old.answer?.blocks, undefined);
  const parsed = agentResultDocumentSchema.parse({ ...base, answer: { blocks: [{ text: "导语", type: "paragraph" }, { type: "chart", values: [1, 2] }, { items: [{ id: "event:e1", kind: "event", title: "A", top: "11月19日（周四）19:00" }], shown: 1, type: "records" }, { items: [{ id: "x", kind: "spaceship", title: "?" }], shown: 1, type: "records" }], sourceRefs: [], text: "导语\n1. A" } });
  assert.deepEqual(parsed.answer?.blocks?.map((block) => block.type), ["paragraph", "records"]);
  assert.equal(parsed.answer?.text, "导语\n1. A");
});

test("D4 (hotfix 2026-11-20, the AG19 decision): a plain-chat reply is shown as it is; a longer one is one paragraph — never a further model call", async () => {
  assert.equal(needsLayout("可以，周五前发就行。", "zh"), false);
  assert.equal(needsLayout("可以。周五前发就行。", "zh"), false);
  assert.equal(needsLayout("先准备报价。再准备案例。最后确认时间。", "zh"), true);
  assert.equal(needsLayout("第一行\n第二行", "zh"), true);
  assert.equal(needsLayout("Sure. Friday works.", "en"), false);
  const message = "第一次拜访客户要准备什么？";
  const long = "建议先把对方的业务和最近的动态看一遍。**然后**准备一页自己的介绍，带上两个相近的案例。最后想好这次拜访想拿到的下一步，比如约下一次演示。";
  const understood = () => json({ language: "zh", parts: [part({ sourceQuote: message })], plainChat: true, reply: long });
  // No answer call (byNode throws on one): the reply itself is delivered as one paragraph, symbols out.
  const plain = deepseekStub(byNode({ understand: understood }));
  const kit = graphKit(plain.fetchImplementation, { now: NOW });
  const second = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(plain.calls.length, 1, "the first layer's call only");
  assert.deepEqual(second.partResults.map((item) => item.status), ["answered"]);
  assert.equal(second.text, long.replace(/\*\*/gu, ""));
  assert.deepEqual(second.blocks, [{ text: long.replace(/\*\*/gu, ""), type: "paragraph" }]);
  // A short reply: no second call.
  const short = deepseekStub(byNode({ understand: () => json({ language: "zh", parts: [part({ sourceQuote: message })], plainChat: true, reply: "可以，周五前发就行。" }) }));
  const shortKit = graphKit(short.fetchImplementation, { now: NOW });
  const third = await runAgentGraph(shortKit.deps, shortKit.input(message));
  assert.deepEqual(third.blocks, [{ text: "可以，周五前发就行。", type: "paragraph" }]);
});

test("repair round 1: when a card is frozen again, its line changes in the text and in the blocks together", async () => {
  const blocks: AnswerBlock[] = [{ text: "查到了。", type: "paragraph" }, { text: "下面这张卡等你确认：把待办改到11月20日（周五）。", type: "paragraph" }];
  assert.deepEqual(replaceInBlocks(blocks, "下面这张卡等你确认：把待办改到11月20日（周五）。", "下面这张卡等你确认：把待办改到11月21日（周六）。")[1], { text: "下面这张卡等你确认：把待办改到11月21日（周六）。", type: "paragraph" });
  assert.deepEqual(replaceInBlocks(blocks, "", "x"), blocks);
  const note: AnswerBlock[] = [{ items: [{ action: "旧的一句。", text: "旧的一句。原因。" }], title: "这次没做的部分", type: "note" }, { items: [{ head: "旧的一句。", text: "x" }, { text: "y" }], type: "points" }];
  assert.deepEqual(replaceInBlocks(note, "旧的一句。", "新的一句。"), [{ items: [{ action: "新的一句。", text: "新的一句。原因。" }], title: "这次没做的部分", type: "note" }, { items: [{ head: "新的一句。", text: "x" }, { text: "y" }], type: "points" }]);
});
