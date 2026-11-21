import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { clueSearchWords } from "../../features/agent-v1/graph/nodes/resolve";
import { scheduleNothingLine, todoNothingLine, todoOthersLine } from "../../features/agent-v1/graph/nodes/wider-read";
import { asksTodaysPlate, ownWindow } from "../../features/agent-v1/understand/read-window";
import { followsShownList } from "../../features/agent-v1/understand/follow-list";
import { fnWorld, runFn, todo, type FnRun } from "./functions-kit";
import { graphKit, json, recordAccessOf, type ModelCall } from "./graph-kit";
import { schedule } from "./read-kit";

/**
 * Hotfix 2026-11-20 (the owner on the live site: 「今天先处理哪些事？」 and 「所有代办都是空吗？」 were both answered
 * 「…：在你的 Orbit 记录里没有找到相关的内容。」 with 20 open to-dos, all past their day):
 *  1. "what to handle today" reads the open to-dos due or planned today or earlier, and today's schedule items;
 *  2. a time window is not carried into a message that sets its own scope or none, unless it goes on from the result;
 *  3. a narrowed read that finds nothing says what was looked for and shows what exists outside the narrowing;
 *  and 代办 is read as 待办.
 */

const ACTOR = "actor:a";
/** Friday 2026-11-20, 10:00 in Tokyo: every dated to-do of the world is past its day. */
const FRIDAY = "2026-11-20T01:00:00.000Z";
const TODAY = "2026-11-20";

function world() {
  const base = fnWorld();
  base.records.push(
    todo(ACTOR, "task:t47", "约山本吃饭", { relatedContactId: "contact:c41" }),
    todo(ACTOR, "task:t50", "准备十二月的报价模板", { plannedDate: "2026-11-25" }),
    schedule(ACTOR, "personal:s20", "和王强对合同", "2026-11-20T05:00:00.000Z"),
    schedule(ACTOR, "personal:s21", "下周的评审会", "2026-11-26T05:00:00.000Z"),
    // Every Monday: no occurrence on Friday the 20th.
    schedule(ACTOR, "personal:s10", "团队周会", "2026-11-16T01:00:00.000Z", { recurrence: { frequency: "weekly" } }),
  );
  return base;
}

const OVERDUE = ["todo:task:f1", "todo:task:t42", "todo:task:t44", "todo:task:t45"];
const ALL_OPEN = [...OVERDUE, "todo:task:t47", "todo:task:t50"];

const citeAll = (call: ModelCall) => {
  const handles = [...new Set(call.user.slice(call.user.indexOf("Items to answer")).match(/\bs\d+\b/gu) ?? [])];
  return json({ segments: [{ cites: handles.map((sourceRef) => ({ sentenceIds: [1], sourceRef })), lead: "好的。", partId: "p1" }] });
};

const session = () => graphKit((async () => { throw new Error("replaced by runFn"); }) as never, { now: FRIDAY, records: recordAccessOf(world()) });
const records = (blocks: readonly AnswerBlock[]) => blocks.filter((block): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records");
const sorted = (refs: readonly string[]) => [...refs].sort();

/** answer.text and the blocks agree (the eval's answer_blocks_in_sync, on the result itself). */
function assertInSync(run: FnRun): void {
  const flat = (text: string) => text.replace(/\s+/gu, " ").trim();
  const { text, blocks } = run.result;
  const pieces: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "conclusion") pieces.push(block.text);
    if (block.type === "records") for (const card of block.items) {
      pieces.push(card.title);
      if ((block.size ?? "full") === "full") assert.ok(text.includes(card.title), `card ${card.title} is in the text`);
    }
  }
  for (const block of blocks) if (block.type === "paragraph") assert.ok(flat(text).includes(flat(block.text)), `paragraph in the text: ${block.text}`);
  for (const line of text.split("\n").map(flat).filter(Boolean)) assert.ok(pieces.some((piece) => line.includes(flat(piece)) || flat(piece).includes(line)), `a block shows: ${line}`);
}

/* ── rule 1: today's plate ─────────────────────────────────────────── */

test("rule 1: which words ask what to handle today, now or first (zh, ja, en) — and which do not", () => {
  // The App's own suggested question (todayVm.questionTasks) in zh, ja and en is among them.
  for (const words of ["今天先处理哪些事？", "今日は何から進めますか？", "What should I handle first today?", "今天要做什么", "现在该做什么？", "今天最先处理哪个", "先做哪几件事", "今日やることは？", "まず何から手を付ければいい？", "What should I do today?", "What should I work on first?", "what's on my plate today"]) assert.equal(asksTodaysPlate(words), true, words);
  for (const words of ["今天有哪些日程？", "今天做了什么？", "明天有哪些安排", "今天到期的待办有哪些？", "What did I do today?", "Do I have any meetings today?", "田中先生的邮件", "先週のメモ"]) assert.equal(asksTodaysPlate(words), false, words);
});

for (const capabilities of [["todo.read", "schedule.read"], ["todo.read"], ["schedule.read"]]) {
  test(`rule 1: 「今天先处理哪些事？」 tagged ${capabilities.join(" + ")} with a window of today — the overdue to-dos and today's schedule item, never only records dated today`, async () => {
    const message = "今天先处理哪些事？";
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: TODAY, to: TODAY }, requiredCapabilities: capabilities, sourceQuote: message }], { answer: citeAll, session: session() });
    assert.deepEqual(sorted(run.result.sourceRefs), sorted([...OVERDUE, "schedule:personal:s20"]));
    const [part] = run.result.partResults;
    assert.deepEqual(part.gaps ?? [], []);
    assert.ok(run.events.some((event) => event.type === "understand.todays_plate"));
    assert.ok(run.events.some((event) => event.type === "resolve.todays_plate"));
    const [list] = records(run.result.blocks);
    assert.equal(list.items.length, 5);
    assert.doesNotMatch(run.result.text, /没有找到/u);
    // The weekly meeting has no occurrence today: it is no match, so no "共1条，这次看的是最新的0条" line (dev run hotfix-dev1).
    assert.doesNotMatch(run.result.text, /共\s*\d+\s*条，这次看的是/u);
    assert.equal(run.result.sourceRefs.includes("schedule:personal:s10"), false);
    assertInSync(run);
  });
}

test("1c (AE-ANS-019 run-05): the answer names 1 of the overdue to-dos — every to-do read for today's plate is still shown", async () => {
  const message = "今天先处理哪些事？";
  const citeOne = (call: ModelCall) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — to-do/u.exec(call.user)![1] }], lead: "先处理最早过期的那一项。", partId: "p1" }] });
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: TODAY, to: TODAY }, requiredCapabilities: ["todo.read", "schedule.read"], sourceQuote: message }], { answer: citeOne, session: session() });
  assert.deepEqual(sorted(run.result.sourceRefs), sorted([...OVERDUE, "schedule:personal:s20"]));
  assert.ok(run.events.some((event) => event.type === "answer.all_read_shown"));
});

test("rule 1 (en): 「What should I do first today?」 — the overdue to-dos, the undated and future ones left out", async () => {
  const message = "What should I do first today?";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: TODAY, to: TODAY, status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: message }], { answer: citeAll, language: "en", session: session() });
  assert.deepEqual(sorted(run.result.sourceRefs), sorted([...OVERDUE, "schedule:personal:s20"]));
});

test("rule 1 keeps one day's meaning for schedule items: 「今天有哪些日程？」 reads today's only, no to-dos", async () => {
  const message = "今天有哪些日程？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: TODAY, to: TODAY }, requiredCapabilities: ["schedule.read"], sourceQuote: message }], { answer: citeAll, session: session() });
  assert.deepEqual(run.result.sourceRefs, ["schedule:personal:s20"]);
  assert.equal(run.events.some((event) => event.type === "understand.todays_plate"), false);
});

/* ── rule 2: a window is not inherited ─────────────────────────────── */

test("rule 2: a window is kept when the message sets one or goes on from the result; dropped otherwise (zh, ja, en)", () => {
  const window = { from: TODAY, status: "open" as const, to: TODAY };
  for (const message of ["今天有哪些日程？", "下周有哪些待办", "这些里面哪几条还没做？", "其中哪些是给田中的？", "还有吗？", "11月25日那天呢", "今日のタスクは？", "What's due this week?", "Which of these are for Tanaka?"]) assert.equal(ownWindow(window, message).dropped, false, message);
  for (const message of ["我有哪些还没完成的待办？", "所有代办都是空吗？", "这些全部列出来", "列一下全部待办", "タスクを全部見せて", "Show me all my to-dos.", "What open to-dos do I have?"]) {
    const kept = ownWindow(window, message);
    assert.equal(kept.dropped, true, message);
    assert.deepEqual(kept.filter, { status: "open" }, `${message}: only the window goes`);
  }
});

test("rule 2: the three turns on the live site — the window of 「今天先处理哪些事？」 is not carried into 「所有代办都是空吗？」 or 「我有哪些还没完成的待办？」", async () => {
  const shared = session();
  const first = "今天先处理哪些事？";
  await runFn(first, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: TODAY, to: TODAY }, requiredCapabilities: ["todo.read", "schedule.read"], sourceQuote: first }], { answer: citeAll, session: shared });
  // The first layer carries today's window into the next two (it saw the earlier turn), on some runs.
  const second = "所有代办都是空吗？";
  const two = await runFn(second, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "todo", text: "所有代办" }], readFilter: { from: TODAY, to: TODAY }, requiredCapabilities: ["todo.read"], sourceQuote: second }], { answer: citeAll, session: shared });
  assert.deepEqual(sorted(two.result.sourceRefs), sorted(ALL_OPEN), "all open to-dos, not the ones dated today and not a word search for 所有代办");
  assert.ok(two.events.some((event) => event.type === "understand.window_not_inherited"));
  assert.doesNotMatch(two.result.text, /没有找到/u);
  const third = "我有哪些还没完成的待办？";
  const three = await runFn(third, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: TODAY, status: "open", to: TODAY }, requiredCapabilities: ["todo.read"], sourceQuote: third }], { answer: citeAll, session: shared });
  assert.deepEqual(sorted(three.result.sourceRefs), sorted(ALL_OPEN));
  assert.deepEqual(three.result.partResults[0].gaps ?? [], []);
  assert.match(three.result.text, /^你有 6 项还没完成的待办，其中 4 项已过期或过了计划日：/u);
  assertInSync(three);
});

/* ── 代办 and the whole-set words ──────────────────────────────────── */

test("代办 is read as 待办, and 所有、全部、all name the whole set — never words to search for", () => {
  for (const clue of ["所有代办", "所有待办", "全部的待办", "代办", "那些代办", "all my to-dos", "すべてのタスク"]) assert.equal(clueSearchWords(clue), undefined, clue);
  assert.equal(clueSearchWords("所有报价笔记"), "报价");
  const shown = [{ id: "task:t42", type: "todo" }, { id: "task:t44", type: "todo" }];
  assert.equal(followsShownList({ hasReferences: false, message: "代办哪个更值得先做？", namesPerson: false, shown, writesOrContinues: false }), "todo");
});

/* ── rule 3: nothing under the narrowing, but records outside it ───── */

test("rule 3: the sentences say what was looked for and what exists (zh, ja, en)", () => {
  const today = { fromDay: TODAY, statusSaid: false, toDay: TODAY };
  assert.equal(todoNothingLine("zh", "今天到期的待办有哪些？", today), "今天到期或计划在今天的待办：没有。");
  // "open" beside a day says nothing more (dev run hotfix-dev1: 「今天到期或计划在今天的还没完成的待办」); alone it is the narrowing.
  assert.equal(todoNothingLine("zh", "今天到期的待办有哪些？", { ...today, status: "open", statusSaid: true }), "今天到期或计划在今天的待办：没有。");
  assert.equal(todoNothingLine("zh", "我有哪些还没完成的待办？", { status: "open", statusSaid: true }), "还没完成的待办：没有。");
  assert.equal(todoOthersLine("zh", 20, "open", 16), "另有 20 项还没完成的待办，其中 16 项已过期或过了计划日。");
  assert.equal(todoNothingLine("ja", "今日が期限のタスクは？", today), "今日が期限または予定日のタスク：ありません。");
  assert.equal(todoOthersLine("ja", 20, "open", 16), "未完了のタスクはほかに20件あります（うち16件は期限または予定日を過ぎています）。");
  assert.equal(todoNothingLine("en", "Which to-dos are due today?", today), "To-dos due or planned today: none.");
  assert.equal(todoOthersLine("en", 1, "open", 0), "You do have 1 open to-do.");
  assert.equal(todoNothingLine("zh", "下周三到期的待办", { fromDay: "2026-11-25", statusSaid: false, toDay: "2026-11-25" }), "下周（11月25日）到期或计划在这天的待办：没有。");
  assert.equal(todoNothingLine("zh", "有哪些已完成的报价待办", { status: "completed", statusSaid: true, text: "报价" }), "含「报价」的已完成的待办：没有。");
  assert.equal(scheduleNothingLine("zh", "明天有什么日程", { fromDay: "2026-11-21", toDay: "2026-11-21" }), "明天的日程：没有。");
  for (const line of [todoNothingLine("zh", "今天到期的待办", today), todoOthersLine("zh", 3, "open", 2)]) assert.doesNotMatch(line, /来源|证据|授权|引用|范围|记录里没有找到/u);
});

test("rule 3: 「今天到期的待办有哪些？」 with none due today — code's sentence and the open to-dos as cards, no answer call", async () => {
  const message = "今天到期的待办有哪些？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: TODAY, to: TODAY }, requiredCapabilities: ["todo.read"], sourceQuote: message }], { session: session() });
  assert.equal(run.modelCalls.length, 1, "only the first layer");
  const lead = "今天到期或计划在今天的待办：没有。另有 6 项还没完成的待办，其中 4 项已过期或过了计划日。";
  assert.equal(run.result.text.split("\n")[0], lead);
  assert.deepEqual(run.result.blocks.map((block) => block.type), ["paragraph", "records"]);
  assert.equal(run.result.blocks[0].type === "paragraph" && run.result.blocks[0].text, lead);
  assert.deepEqual(records(run.result.blocks)[0].items.map((item) => item.id), ["task:t45", "task:f1", "task:t44", "task:t42", "task:t50", "task:t47"]);
  assert.deepEqual(sorted(run.result.sourceRefs), sorted(ALL_OPEN));
  assert.deepEqual(run.result.partResults[0].gaps, ["no_record"], "the narrowed read itself found nothing");
  assert.ok(run.events.some((event) => event.type === "resolve.nothing_under_narrowing"));
  assertInSync(run);
});

test("rule 3: a schedule day with nothing on it says so and shows what is coming", async () => {
  const message = "明天有什么日程？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-11-21", to: "2026-11-21" }, requiredCapabilities: ["schedule.read"], sourceQuote: message }], { session: session() });
  assert.match(run.result.text, /^明天的日程：没有。接下来还有 \d+ 个日程。/u);
  assert.ok(records(run.result.blocks)[0].items.some((item) => item.id === "personal:s21"));
  assertInSync(run);
});

test("rule 3: nothing of the kind at all — the plain sentence stays", async () => {
  const empty = fnWorld();
  empty.records = empty.records.filter((record) => record.collection !== "tasks");
  const message = "今天到期的待办有哪些？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: TODAY, to: TODAY }, requiredCapabilities: ["todo.read"], sourceQuote: message }], { session: graphKit((async () => { throw new Error("x"); }) as never, { now: FRIDAY, records: recordAccessOf(empty) }) });
  // AG21c (R53): the plain sentence says which kind is empty that day, not the generic "nothing related found".
  assert.match(run.result.text, /今天没有待办/u);
  assert.deepEqual(records(run.result.blocks), []);
});
