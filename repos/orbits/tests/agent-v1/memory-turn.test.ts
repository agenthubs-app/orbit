/**
 * agent-design AG14 (设计稿 §6): one turn of the request graph with saved memory — the card for "记住……" (and none with
 * 「从对话里记住新的」 off), "这次……" as this turn's own basis, "以后……" as the same entry before → after, "忘掉……",
 * what is saved, the reply-language rule, recall only for the task at hand, and a resumed conversation.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { FORGOTTEN_SOURCE, overruledByTurn, STALE_MEMORY_ANSWER, withholdForgotten } from "../../features/agent-v1/domains/memory/turn";
import { sentenceTopicOf } from "../../features/agent-v1/functions/basis";
import { memorySnapshotOf, runFn, type TestMemory } from "./functions-kit";

const MM1: TestMemory = { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", id: "MM1", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } };
const MM2: TestMemory = { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", id: "MM2" };
const MM3: TestMemory = { appliesTo: ["all"], category: "constraint", content: "回答用日语", id: "MM3" };

const MEMORY_PART = (quote: string, capability = "memory.create") => ({ dataSources: ["turn_material"], deliverable: "memory_change", requiredCapabilities: [capability], sourceQuote: quote });
const EVENT_RANK = (quote: string, extra: Record<string, unknown> = {}) => ({ dataSources: ["orbit_records"], deliverable: "ranked_list", requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: quote, ...extra });
const NEXT_WEEK = { readFilter: { from: "2026-11-16", to: "2026-11-22" } };
const of = (events: Record<string, unknown>[], type: string) => events.filter((event) => event.type === type);
const listed = (events: Record<string, unknown>[]) => (of(events, "fn.rank").at(-1)?.listed ?? []) as string[];
const recalled = (events: Record<string, unknown>[]) => [...new Set(of(events, "memory.recall").flatMap((event) => (event.memories ?? []) as string[]))].sort();
const MORNINGS = ["event:event:e101", "event:event:e102", "event:event:e105"];
/** The events of 11月16日–22日 that have not started, nearest first (the clock of the kit is 11月15日). */
const UPCOMING_NEXT_WEEK = ["event:event:e103", "event:event:e101", "event:event:e104", "event:event:e102", "event:event:e105"];

test("AG14-1 「记住……」 with learning on: one card with the new entry (its words and values from one payload), nothing saved by the turn", async () => {
  const message = "记住，以后给我推荐活动时优先周末上午。";
  const run = await runFn(message, [MEMORY_PART(message)], { memories: [], memorySettings: { allowConversationLearning: true }, requestId: "req-remember" });
  assert.equal(run.frozen.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(run.frozen[0].intents)), [{ capability: "memory.create", partId: "p1", set: { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } }, sourceMessageRef: "request:req-remember" }]);
  const [op] = run.frozen[0].preview.operations as unknown as Record<string, any>[];
  assert.equal(op.capability, "memory.create");
  assert.deepEqual(op.after, { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.equal(op.preview, "新增个人记忆：「推荐活动时优先周末上午」（用在：推荐活动时）");
  // AG14 UI (board 1, D2): 记忆「…」, then 用在 and 归到; no 到期 row when the words carry no limit.
  assert.equal(op.display.record, "记忆「推荐活动时优先周末上午」");
  assert.deepEqual(op.display.rows.map((row: { label: string; after: string }) => `${row.label}:${row.after}`), ["用在:推荐活动时", "归到:酌情参考的"]);
  assert.equal(run.result.partResults[0].status, "awaiting_confirmation");
  // No model call beyond the first layer: the card is code's.
  assert.deepEqual(run.modelCalls.map((call) => call.node), ["understand"]);
  assert.equal(run.judgeCalls.length, 0);
  assert.doesNotMatch(run.result.text, /已记住|已保存|记下了/u);
});

test("AG14-1 the same in Japanese: the entry's words are written from its values in the card's language", async () => {
  const message = "覚えておいて。これからイベントをおすすめするときは、週末の午前中を優先してほしい。";
  const run = await runFn(message, [MEMORY_PART(message)], { language: "ja", memories: [], memorySettings: { allowConversationLearning: true } });
  assert.equal(run.frozen.length, 1);
  const [op] = run.frozen[0].preview.operations as unknown as Record<string, any>[];
  assert.deepEqual(op.after, { appliesTo: ["event.recommend"], category: "preference", content: "イベントをおすすめするときは週末の午前を優先", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.match(op.preview, /個人メモリーを追加/u);
});

test("AG14-1 learning off: no card, nothing to save; the words are used for this turn's pick and the answer says so and how to keep it", async () => {
  const first = "记住，以后给我推荐活动时优先周末上午。";
  const second = "先按这个给我推荐几场下周的活动。";
  const run = await runFn(`${first}${second}`, [MEMORY_PART(first), { ...EVENT_RANK(second, NEXT_WEEK), dependsOn: ["p1"], localId: "p2" }], { memories: [] });
  assert.equal(run.frozen.length, 0);
  // AG14 UI (board 4, D3): the grey note — what happened, the two ways to keep it, 「去设置 ›」 — and the same words in the text.
  assert.match(run.result.text, /只用在这一次，没有存下来。「推荐活动时优先周末上午」下次不会自动用。想让我一直记着：打开「从对话里记住新的」再说一次，或者到设置里自己加一条。/u);
  const notes = run.result.blocks.filter((block) => block.type === "note");
  assert.deepEqual(notes, [{ go: { label: "去设置", to: "memory_settings" }, items: [{ action: "打开「从对话里记住新的」再说一次，或者到设置里自己加一条。", text: "「推荐活动时优先周末上午」下次不会自动用。想让我一直记着：" }], title: "只用在这一次，没有存下来", type: "note" }]);
  assert.equal(run.result.blocks.at(-1)?.type, "note", "the note comes after the answer");
  assert.deepEqual(run.result.memoryUse, [], "nothing was saved: no memory chip");
  // The pick of the same message is not held back by the part before it, and uses its words.
  assert.deepEqual(listed(run.events).slice(0, 3).sort(), MORNINGS);
  assert.deepEqual(recalled(run.events), []);
  assert.doesNotMatch(run.result.text, /你存过的/u);
  assert.equal(run.result.partResults.find((part) => part.partId === "p1")?.reason, "memory_learning_off");
});

test("AG14-2 a new conversation: the saved preference and rule are recalled for recommending events, named at the top, with where to change them", async () => {
  const message = "给我推荐几场下周的活动。";
  const run = await runFn(message, [EVENT_RANK(message, NEXT_WEEK)], { memories: [MM1, MM2, MM3] });
  assert.deepEqual(recalled(run.events), ["MM1", "MM2", "MM3"]);
  assert.deepEqual(listed(run.events).sort(), MORNINGS);
  assert.ok(!listed(run.events).includes("event:event:e103") && !listed(run.events).includes("event:event:e104"), "the rule removes the evening events");
  // A plain ask names no topic: no judgment is asked about the sentence itself.
  assert.equal(run.judgeCalls.length, 0);
  // The every-task rule decides the language of code's words; it is not a ranking condition and is not named.
  assert.match(run.result.text, /保存済みの「推荐活动时优先周末上午」と「不要推荐晚上的活动」/u);
  assert.doesNotMatch(run.result.text, /回答用日语/u);
  // AG14 UI (board 5, D4–D6): the chips at the start — the preference used, and the rule because it took two evening
  // events away; the every-task rule is not named. The old "where to change" line is gone (the chip has 「修正 ›」).
  assert.deepEqual(run.result.memoryUse.map((chip) => [chip.kind, chip.text]), [["used", "保存した好み「週末午前」で選びました"], ["rule", "決めたルールで、夜のものは外しました"]]);
  assert.doesNotMatch(run.result.text, /保存済みのメモリーです。変更したいときは/u);
  const entries = of(run.events, "memory.recall").flatMap((event) => (event.entries ?? []) as { memoryId: string; revision: number }[]);
  assert.ok(entries.every((entry) => entry.revision === 1));
  assert.equal(JSON.stringify(of(run.events, "memory.recall")).includes("周末上午"), false, "the trace holds ids and revisions, never an entry's words");
});

test("AG14-2 a task the entries do not apply to: only the rule for every task is in force; the event preference is not taken", async () => {
  const message = "我还有哪些待办没做完？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: message }], { answer: () => JSON.stringify({ segments: [{ partId: "p1", text: "（テスト）" }] }), memories: [MM1, MM2, MM3] });
  assert.deepEqual(recalled(run.events), ["MM3"]);
  assert.equal(run.result.state.language, "ja");
  assert.doesNotMatch(run.result.text, /周末上午|晚上的活动/u);
});

test("AG14-2 「回答时参考这些」 off: nothing is recalled, the rule included; a recommendation with no basis lists what is coming up in the period named", async () => {
  const message = "给我推荐几场下周的活动。";
  const run = await runFn(message, [EVENT_RANK(message, NEXT_WEEK)], { memories: [MM1, MM2, MM3], memorySettings: { enabled: false } });
  assert.deepEqual(recalled(run.events), []);
  assert.equal(run.result.state.language, "zh");
  assert.doesNotMatch(run.result.text, /你存过的|保存済み/u);
  // Coordinator's decision, 2026-11-20 (integration of the hotfix and AG14): a request to recommend events that names no
  // standard, no count and no topic, with nothing saved that applies — here the switch is off — is answered with the list
  // of what is coming up in the period named, nearest first, and no question back. (Before: asked once what to pick by.)
  // The lead says what the order is and claims no fit; a pick with a count still asks once (AG10).
  assert.equal(run.result.clarifications.filter((set) => set.kind === "question").length, 0);
  assert.deepEqual(listed(run.events), UPCOMING_NEXT_WEEK);
  assert.match(run.result.text, /^还没开始的活动共5场，按开始时间从早到晚：/u);
  assert.doesNotMatch(run.result.text, /适合你|为你挑|推荐给你/u);
  // …and under the list the standing line that invites another basis: nothing is decided for the user.
  assert.match(run.result.text, /\n想换个依据重新排，直接告诉我新的标准就行（例如「按开始时间」「跟 @某篇笔记 的主题有关」）。$/u);
});

test("AG14-3 「这次看周四晚上的」: no card and no change; this turn's words overrule the saved preference", async () => {
  const message = "这次看周四晚上的。";
  const state = { lastMentioned: [], lastRanking: { at: "2026-11-15T00:59:00.000Z", count: 3, domain: "event" as const, from: "2026-11-16", listed: MORNINGS, memories: [{ memoryId: "MM1", revision: 1 }], requestId: "req-before", to: "2026-11-22", topic: false, turnBasis: false }, openItems: [], sessionId: "session:a", shownList: null, updatedAt: "2026-11-15T00:59:00.000Z" };
  // The first layer tagged it as a change of the saved entry: code does not take that.
  const run = await runFn(message, [MEMORY_PART(message, "memory.update")], { memories: [MM1], state });
  assert.equal(run.frozen.length, 0);
  assert.equal(listed(run.events)[0], "event:event:e103");
  assert.ok(!listed(run.events).some((ref) => MORNINGS.includes(ref)), "only that Thursday is looked at");
  assert.doesNotMatch(run.result.text, /你存过的/u);
  assert.deepEqual(of(run.events, "memory.recall").flatMap((event) => (event.overruled ?? []) as string[]), ["MM1"]);
  assert.deepEqual(recalled(run.events), []);
  assert.equal(of(run.events, "memory.this_time").length, 1);
  // The sentence itself is not a topic to match events against (dev run 1): no judgment, no "和「这次看……」有多相关".
  assert.equal(run.judgeCalls.length, 0);
  assert.doesNotMatch(run.result.text, /有多相关|这次看周四晚上的/u);
  // AG14 UI (board 5, note 3): the same place at the start reads "只这一次", with no 「修改」 (nothing was changed).
  assert.deepEqual(run.result.memoryUse, [{ kind: "skipped", memoryId: "MM1", text: "只这一次：没按你存的「周末上午」" }]);
});

test("dev run 1: 「记住，以后……」 tagged as a rule (even 'keep going without an end') is a memory card; a rule with a schedule is not taken", async () => {
  const message = "记住，以后给我推荐活动时优先周末上午。";
  const run = await runFn(message, [{ clarity: "statement", dataSources: ["turn_material"], deliverable: "rule", persistence: "until_satisfied", requiredCapabilities: ["rule.create"], sourceQuote: message }], { memories: [], memorySettings: { allowConversationLearning: true } });
  assert.equal(run.frozen.length, 1);
  assert.equal((run.frozen[0].preview.operations[0] as unknown as { capability: string }).capability, "memory.create");
  assert.equal(run.result.partResults[0].status, "awaiting_confirmation");
  assert.equal(run.result.clarifications.length, 0, "no alternative is offered for it");
  // Learning off with the pick in the same message, the first part tagged the same way: used this turn, said so.
  const second = "先按这个给我推荐几场下周的活动。";
  const off = await runFn(`${message}${second}`, [{ clarity: "statement", deliverable: "rule", persistence: "until_satisfied", requiredCapabilities: ["rule.create"], sourceQuote: message }, { ...EVENT_RANK(second, NEXT_WEEK), dependsOn: ["p1"], localId: "p2" }], { memories: [] });
  assert.equal(off.frozen.length, 0);
  assert.match(off.result.text, /只用在这一次，没有存下来/u);
  assert.deepEqual(listed(off.events).slice(0, 3).sort(), MORNINGS);
  // A task to run later is a rule, not a memory: the memory rules leave it alone.
  const scheduled = "记住，以后每周一提醒我看有没有新的摄影活动。";
  const rule = await runFn(scheduled, [{ deliverable: "rule", requiredCapabilities: ["rule.create"], sourceQuote: scheduled }], { memories: [], memorySettings: { allowConversationLearning: true } });
  assert.equal(of(rule.events, "memory.remember").length, 0);
  assert.equal(rule.frozen.length, 0);
});

test("dev run 1 (AE-FN-002): a question about events and a bare pick after it are one ranking", async () => {
  const question = "11 月 21 日和 22 日有哪些活动值得去？";
  const pick = "帮我挑两场。";
  const run = await runFn(`${question}${pick}`, [
    { dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-11-21", to: "2026-11-22" }, requiredCapabilities: ["event.read"], sourceQuote: question },
    { deliverable: "ranked_list", dependsOn: ["p1"], localId: "p2", requiredCapabilities: ["fn.rank"], sourceQuote: pick },
  ], { memories: [MM1, MM2] });
  assert.equal(run.result.partResults.length, 1);
  assert.equal(listed(run.events).length, 2);
  for (const ref of listed(run.events)) assert.ok(MORNINGS.includes(ref), ref);
  assert.match(run.result.text, /你存过的「推荐活动时优先周末上午」和「不要推荐晚上的活动」/u);
  // A time that is left out is not said as a reason next to the events kept.
  assert.doesNotMatch(run.result.text, /——周末上午、晚上/u);
  assert.match(run.result.text, /——周末上午/u);
  assert.deepEqual(of(run.events, "understand.pick_merged_into_question").map((event) => [event.partId, event.into]), [["p2", "p1"]]);
  // Dev run 2: the pick came tagged with the same read as the question it depends on — still one ranking.
  const again = await runFn(`${question}${pick}`, [
    { dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-11-21", to: "2026-11-22" }, requiredCapabilities: ["event.read"], sourceQuote: question },
    { deliverable: "ranked_list", dependsOn: ["p1"], localId: "p2", requiredCapabilities: ["fn.rank", "event.read"], sourceQuote: pick },
  ], { memories: [MM1, MM2] });
  assert.equal(again.result.partResults.length, 1);
  assert.deepEqual(listed(again.events), listed(run.events));
  // Two rankings of their own (each names its set and does not depend on the other) stay two parts.
  const first = "11 月 21 日有哪些活动值得去？";
  const other = "再从 22 日的活动里挑一场。";
  const two = await runFn(`${first}${other}`, [EVENT_RANK(first, { readFilter: { from: "2026-11-21", to: "2026-11-21" } }), { ...EVENT_RANK(other, { readFilter: { from: "2026-11-22", to: "2026-11-22" } }), localId: "p2" }], { memories: [MM1] });
  assert.equal(two.result.partResults.length, 2);
});

test("AG14-3 what this turn says against what is saved: a preference gives way to any time named; a rule only to the very slot it leaves out", async () => {
  const prefer = { days: "weekend" as const, exclude: false, hard: false, part: "morning" as const };
  const noEvening = { exclude: true, hard: true, part: "evening" as const };
  assert.equal(overruledByTurn(prefer, null), false);
  assert.equal(overruledByTurn(prefer, { exclude: false, part: "evening" }), true);
  assert.equal(overruledByTurn(noEvening, null), false);
  // "优先周末上午" in this turn does not lift "不要晚上的"; "这次看周四晚上" does, for this turn.
  assert.equal(overruledByTurn(noEvening, { days: "weekend", exclude: false, part: "morning" }), false);
  assert.equal(overruledByTurn(noEvening, { exclude: false, part: "evening" }), true);
  assert.equal(overruledByTurn(noEvening, { exclude: true, part: "evening" }), false);
  // In the graph: the rule stays while the turn names another time.
  const message = "给我推荐几场下周的活动，优先周末上午。";
  const run = await runFn(message, [EVENT_RANK(message, NEXT_WEEK)], { memories: [MM2] });
  assert.deepEqual(recalled(run.events), ["MM2"]);
  assert.ok(!listed(run.events).includes("event:event:e103") && !listed(run.events).includes("event:event:e104"));
});

test("AG14-3 「以后……」 on an entry already saved: one card with the same entry before and after, at its revision; learning off does not stand in the way", async () => {
  const message = "From now on, when you recommend events, prefer weekend afternoons instead of weekend mornings.";
  const run = await runFn(message, [MEMORY_PART(message, "memory.create")], { language: "en", memories: [MM1] });
  assert.equal(run.frozen.length, 1);
  const [intent] = JSON.parse(JSON.stringify(run.frozen[0].intents));
  assert.equal(intent.capability, "memory.update");
  assert.equal(intent.targetId, "MM1");
  assert.equal(intent.expectedRevision, 1);
  const [op] = run.frozen[0].preview.operations as unknown as Record<string, any>[];
  assert.deepEqual(op.targetRef, { collection: "agentMemories", id: "MM1" });
  assert.deepEqual(op.before, { content: "推荐活动时优先周末上午", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.deepEqual(op.after, { content: "When recommending events, prefer weekend afternoons", structured: { dayPart: "afternoon", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.deepEqual(op.payload, { expectedRevision: 1, memoryId: "MM1", patch: op.after });
  assert.equal(op.display.rows[0].before, "推荐活动时优先周末上午");
  assert.equal(op.display.rows[0].after, "When recommending events, prefer weekend afternoons");
  // The Chinese follow-up of the GOAL: "以后改成周末下午".
  const zh = await runFn("以后改成周末下午", [MEMORY_PART("以后改成周末下午", "memory.update")], { memories: [MM1, MM2] });
  const [zhOp] = zh.frozen[0].preview.operations as unknown as Record<string, any>[];
  assert.equal(zhOp.capability, "memory.update");
  assert.equal(zhOp.targetRef.id, "MM1");
  assert.equal(zhOp.after.content, "推荐活动时优先周末下午");
  assert.equal(zhOp.preview, "修改个人记忆：「推荐活动时优先周末上午」→「推荐活动时优先周末下午」（用在：推荐活动时）");
});

test("AG14-3 the same thing said again: nothing new, said so; no card", async () => {
  const message = "记住，以后给我推荐活动时优先周末上午。";
  const run = await runFn(message, [MEMORY_PART(message)], { memories: [MM1], memorySettings: { allowConversationLearning: true } });
  assert.equal(run.frozen.length, 0);
  assert.match(run.result.text, /这条已经记着了：「推荐活动时优先周末上午」（用在：推荐活动时）/u);
});

test("AG14-4 「忘掉……」: a card naming the entry and where it is used; with nothing saved, said so and no card", async () => {
  const message = "忘掉我的活动时段偏好。";
  const run = await runFn(message, [MEMORY_PART(message, "memory.delete")], { memories: [MM1, MM2] });
  assert.equal(run.frozen.length, 1);
  const [op] = run.frozen[0].preview.operations as unknown as Record<string, any>[];
  assert.equal(op.capability, "memory.delete");
  assert.deepEqual(op.targetRef, { collection: "agentMemories", id: "MM1" });
  assert.deepEqual(op.payload, { expectedRevision: 1, memoryId: "MM1" });
  assert.equal(op.preview, "删除个人记忆：「推荐活动时优先周末上午」（用在：推荐活动时）");
  // Another account (nothing saved): no card, and the words say there is nothing to forget.
  const other = await runFn(message, [MEMORY_PART(message, "memory.delete")], { memories: [] });
  assert.equal(other.frozen.length, 0);
  assert.match(other.result.text, /没有保存任何记忆，所以没有可以忘掉的条目/u);
  assert.equal(other.result.partResults[0].reason, "memory_not_found");
  // AG14 UI (board 3, board 8): 「没有找到这样一条记忆」 as a grey note with the way to the settings page.
  const note = other.result.blocks.find((block) => block.type === "note");
  assert.equal(note?.type === "note" && note.title, "没有找到这样一条记忆");
  assert.deepEqual(note?.type === "note" && note.go, { label: "去设置", to: "memory_settings" });
  assert.match(other.result.text, /^没有找到这样一条记忆。/u);
});

test("AG14-4 the message a deleted entry came from never proposes it again; the same words in a new message do", async () => {
  const message = "记住，以后给我推荐活动时优先周末上午。";
  const marks = [{ appliesTo: ["event.recommend" as const], category: "preference" as const, deletedAt: "2026-11-15T00:30:00.000Z", memoryId: "gone", revision: 2, sourceMessageRef: "request:req-old" }];
  const replay = await runFn(message, [MEMORY_PART(message)], { memories: [], memoryMarks: marks, memorySettings: { allowConversationLearning: true }, requestId: "req-old" });
  assert.equal(replay.frozen.length, 0);
  const again = await runFn(message, [MEMORY_PART(message)], { memories: [], memoryMarks: marks, memorySettings: { allowConversationLearning: true }, requestId: "req-new" });
  assert.equal(again.frozen.length, 1);
});

test("AG14-5 what is saved: the two groups in plain words; nothing saved is said plainly", async () => {
  const message = "你现在记着我哪些偏好和规矩？";
  const run = await runFn(message, [{ clarity: "clear", sourceQuote: message }], { memories: [MM1, MM2] });
  assert.match(run.result.text, /你现在存了2条：/u);
  assert.match(run.result.text, /一直遵守的：\n- 不要推荐晚上的活动（用在：推荐活动时）/u);
  assert.match(run.result.text, /酌情参考的：\n- 推荐活动时优先周末上午（用在：推荐活动时）/u);
  assert.deepEqual(run.modelCalls.map((call) => call.node), ["understand"]);
  const none = await runFn("你记着我哪些偏好？", [{ clarity: "clear", sourceQuote: "你记着我哪些偏好？" }], { memories: [] });
  assert.equal(none.result.text, "你现在没有保存任何记忆。");
});

test("dev run 2 (AE-MEM-002): asking which events are recommended is a ranking, also when it came tagged as a plain read", async () => {
  const message = "来週のおすすめイベントを教えて。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-11-16", to: "2026-11-22" }, requiredCapabilities: ["event.read"], sourceQuote: message }], { language: "ja", memories: [MM1] });
  assert.deepEqual(of(run.events, "understand.recommend_is_ranking").map((event) => event.partId), ["p1"]);
  assert.deepEqual(listed(run.events).sort(), MORNINGS);
  // With nothing saved — coordinator's decision, 2026-11-20 (integration of the hotfix and AG14): the list of what is coming
  // up in the period named, nearest first, and no question back; never "the directory cannot be searched". (Before: asked
  // once what to pick by.) The lead says the order and claims no fit.
  const none = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-11-16", to: "2026-11-22" }, requiredCapabilities: ["event.read"], sourceQuote: message }], { language: "ja", memories: [] });
  assert.equal(none.result.clarifications.filter((set) => set.kind === "question").length, 0);
  assert.deepEqual(listed(none.events), UPCOMING_NEXT_WEEK);
  assert.match(none.result.text, /^これから開催されるイベントは全部で5件、開始時間の早い順です：/u);
  assert.doesNotMatch(none.result.text, /あなたに合う|おすすめは/u);
  assert.match(none.result.text, /\n別の基準で並べ直したいときは、基準を教えてください（例：「開始時間の順」「@メモ のテーマに合うもの」）。$/u);
  // A pick with a count still asks once what to pick by (AG10-1), as before.
  const three = "来週のイベントを3つ選んで。";
  const counted = await runFn(three, [EVENT_RANK(three, { ...NEXT_WEEK, rank: { count: 3 } })], { language: "ja", memories: [] });
  assert.equal(counted.result.clarifications.filter((set) => set.kind === "question").length, 1);
  // A read that asks for no recommendation stays what it was.
  const plain = "来週のイベントを一覧で見せて。";
  const listing = await runFn(plain, [{ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["event.read"], sourceQuote: plain }], { answer: () => JSON.stringify({ segments: [] }), language: "ja", memories: [MM1] });
  assert.equal(of(listing.events, "understand.recommend_is_ranking").length, 0);
  assert.doesNotMatch(listing.result.text, /別の基準で並べ直したいとき/u, "a plain list is not a recommendation: no line about another basis");
});

test("dev run 2 (AE-MEM-007): a preferred time none of the events meets is said so; nothing is called a match", async () => {
  const afternoons: TestMemory = { appliesTo: ["event.recommend"], category: "preference", content: "When recommending events, prefer weekend afternoons", id: "MM1", revision: 2, structured: { dayPart: "afternoon", preferredDays: ["Sat", "Sun"], strength: "prefer" } };
  const message = "Which events would you recommend for next week?";
  const run = await runFn(message, [EVENT_RANK(message, NEXT_WEEK)], { language: "en", memories: [afternoons] });
  assert.match(run.result.text, /^Picked by your saved preference "When recommending events, prefer weekend afternoons"\.\nNone of the events in this period is on a weekend in the afternoon, so none below meets that preference/u);
  assert.match(run.result.text, /There are 5 in this period; these are the first 3\./u);
  assert.doesNotMatch(run.result.text, /in all match/u);
  assert.equal(run.judgeCalls.length, 0);
  assert.deepEqual(recalled(run.events), ["MM1"]);
});

test("dev run 2 (AE-SCL-027): basis words that only say 'worth going' do not overrule the saved topics", async () => {
  const message = "11月21日（土）と22日（日）のイベントから、行く価値がありそうなものを3つ選んでください。";
  const topics: TestMemory = { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先和摄影有关的", id: "TOPIC", structured: { strength: "prefer", topics: ["摄影"] } };
  const run = await runFn(message, [EVENT_RANK(message, { rank: { basis: "行く価値がありそう", count: 3 }, readFilter: { from: "2026-11-21", to: "2026-11-22" } })], { judge: () => undefined, language: "ja", memories: [topics, MM2] });
  assert.deepEqual(recalled(run.events), ["MM2", "TOPIC"]);
  assert.deepEqual(of(run.events, "memory.recall").flatMap((event) => (event.overruled ?? []) as string[]), []);
  assert.doesNotMatch(run.result.text, /行く価値がありそう」にどれだけ合うか/u);
  // The judgment is asked about the saved topics, not about the user's "worth going".
  assert.match(String(run.judgeCalls[0]?.body.input[0]?.text ?? ""), /摄影/u);
});

test("a sentence that only asks names no topic; one that names something does", () => {
  for (const words of ["这次看周四晚上的。", "今回は木曜の夜のを見せて", "Just this once, show me Thursday evening.", "给我推荐几场下周的活动。", "再给我推荐一次下周的活动。", "Which events would you recommend for next week?", "来週のおすすめイベントを教えて。", "下周（11 月 16 日到 22 日）有什么值得去的活动？挑三场。", "11月21日（土）と22日（日）のイベントから、行く価値がありそうなものを3つ選んでください。", "11 月 21 日和 22 日有哪些活动值得去？帮我挑两场。"]) {
    assert.equal(sentenceTopicOf(words), "", words);
  }
  assert.notEqual(sentenceTopicOf("给我推荐几场和独立出版有关的活动"), "");
  assert.notEqual(sentenceTopicOf("Which events about robotics would you recommend?"), "");
});

test("AG14-4 a resumed conversation: answers made with an entry changed or deleted since, and the message a deleted entry came from, are withheld", () => {
  const messages = [
    { id: "client-1", role: "user" as const, text: "记住，以后给我推荐活动时优先周末上午。" },
    { id: "assistant:req-1", role: "assistant" as const, text: "这是要保存的内容，请在卡片上确认。" },
    { id: "client-2", role: "user" as const, text: "给我推荐几场下周的活动。" },
    { id: "assistant:req-2", role: "assistant" as const, text: "按你存过的「推荐活动时优先周末上午」来挑。1. 东京街头摄影展…" },
    { id: "client-3", role: "user" as const, text: "我还有哪些待办没做完？" },
    { id: "assistant:req-3", role: "assistant" as const, text: "还有四条没做完。" },
  ];
  const uses = [{ memories: [{ memoryId: "new", revision: 1 }], requestId: "req-2" }];
  // The entry is still what it was: nothing is withheld.
  const untouched = withholdForgotten(messages, uses, memorySnapshotOf([{ category: "preference", content: "推荐活动时优先周末上午", id: "new", sourceMessageRef: "request:req-1" }]));
  assert.deepEqual(untouched.withheld, { sources: 0, stale: 0 });
  assert.deepEqual(untouched.messages.map((message) => message.text), messages.map((message) => message.text));
  // Deleted since: the answer that used it and the message it came from are not handed back; the rest is.
  const deleted = withholdForgotten(messages, uses, memorySnapshotOf([], {}, [{ appliesTo: ["event.recommend"], category: "preference", deletedAt: "2026-11-15T00:30:00.000Z", memoryId: "new", revision: 2, sourceMessageRef: "request:req-1" }]));
  assert.deepEqual(deleted.withheld, { sources: 1, stale: 1 });
  assert.equal(deleted.messages[0].text, FORGOTTEN_SOURCE);
  assert.equal(deleted.messages[3].text, STALE_MEMORY_ANSWER);
  assert.equal(deleted.messages[2].text, "给我推荐几场下周的活动。");
  assert.equal(deleted.messages[5].text, "还有四条没做完。");
  assert.equal(JSON.stringify(deleted.messages).includes("周末上午"), false);
  // Changed since (another revision): the answer made with the old one is stale too.
  const changed = withholdForgotten(messages, uses, memorySnapshotOf([{ category: "preference", content: "推荐活动时优先周末下午", id: "new", revision: 2 }]));
  assert.deepEqual(changed.withheld, { sources: 0, stale: 1 });
});

test("AG14-4 after forgetting, the conversation's next pick uses nothing of it and the session keeps references only", async () => {
  const message = "再给我推荐一次下周的活动。";
  const state = { lastMentioned: [], memoryUses: [{ memories: [{ memoryId: "MM1", revision: 1 }], requestId: "req-1" }], memoryVersion: 1, openItems: [], sessionId: "session:a", shownList: null, updatedAt: "2026-11-15T00:59:00.000Z" };
  const marks = [{ appliesTo: ["event.recommend" as const], category: "preference" as const, deletedAt: "2026-11-15T00:59:30.000Z", memoryId: "MM1", revision: 2, sourceMessageRef: null }];
  const run = await runFn(message, [EVENT_RANK(message, NEXT_WEEK)], { memories: [], memoryMarks: marks, messages: [{ id: "client-1", role: "user", text: "给我推荐几场下周的活动。" }, { id: "assistant:req-1", role: "assistant", text: "按你存过的「推荐活动时优先周末上午」来挑。" }], state });
  assert.deepEqual(recalled(run.events), []);
  assert.doesNotMatch(run.result.text, /你存过的|周末上午/u);
  const rebuilt = of(run.events, "memory.context_rebuilt");
  assert.equal(rebuilt.length, 1);
  assert.deepEqual(rebuilt[0].withheld, { sources: 0, stale: 1 });
  // What the first layer was given no longer holds the answer made with the deleted entry.
  const understand = run.modelCalls.find((call) => call.node === "understand")!;
  assert.equal(JSON.stringify(understand).includes("周末上午"), false);
});

test("AG14-2 「为什么排第一」 is answered from what the last ranking used: the saved entry and the event's own start", async () => {
  const state = { lastMentioned: [], lastRanking: { at: "2026-11-15T00:59:00.000Z", count: 3, domain: "event" as const, from: "2026-11-16", listed: ["event:event:e102", "event:event:e101", "event:event:e105"], memories: [{ memoryId: "MM1", revision: 1 }], requestId: "req-before", to: "2026-11-22", topic: false, turnBasis: false }, openItems: [], sessionId: "session:a", shownList: null, updatedAt: "2026-11-15T00:59:00.000Z" };
  const message = "你为什么把第一场排在最前面？";
  const run = await runFn(message, [{ clarity: "clear", sourceQuote: message }], { memories: [MM1], state });
  assert.match(run.result.text, /排在最前面的是「街拍工作坊」，11月22日（周日） 09:30 开始。/u);
  assert.match(run.result.text, /用的是你存的这条：「推荐活动时优先周末上午」——它正好在周末上午。/u);
  assert.deepEqual(run.result.sourceRefs, ["event:event:e102"]);
  assert.deepEqual(recalled(run.events), ["MM1"]);
  assert.deepEqual(run.modelCalls.map((call) => call.node), ["understand"]);
  // The entry was changed since: its words are not quoted.
  const changed = await runFn(message, [{ clarity: "clear", sourceQuote: message }], { memories: [{ ...MM1, content: "推荐活动时优先周末下午", revision: 2 }], state });
  assert.doesNotMatch(changed.result.text, /周末下午|周末上午/u);
  assert.match(changed.result.text, /后来改过或删掉了/u);
});
