import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { recordOfView } from "../../features/agent-v1/answer/blocks";
import { asksBeyondListing, leftOver, textSaysMore } from "../../features/agent-v1/answer/list-or-text";
import { contact, fnWorld, memo, runFn } from "./functions-kit";
import { graphKit, json, recordAccessOf, type ModelCall } from "./graph-kit";
import { schedule } from "./read-kit";

/**
 * Hotfix 2026-11-20, part 1b item 1 (both judges of the hotfix regression run): the list code writes replaced answers it
 * must not replace — AE-SCL-025 「明天这场周会关联了哪些人和哪篇笔记？」 lost the people and the note; AE-UND-015 「明日予定確認」
 * lost 「11時まで」. The list replaces the model's text only when it says everything that text said; otherwise the text stays
 * and the records go under it as small cards. Schedule cards show start to end, and a changed occurrence its own values.
 */

const ACTOR = "actor:a";
const records = (blocks: readonly AnswerBlock[]) => blocks.filter((block): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records");

test("signal 1: a message that asks beyond which records there are (zh, ja, en)", () => {
  for (const words of ["明天这场周会关联了哪些人和哪篇笔记？", "这几个待办为什么还没做？", "下周的会都是几点到几点？", "笔记里写了什么？", "誰と会う予定？", "Who is in tomorrow's meeting?", "Why are these still open?"]) assert.equal(asksBeyondListing(words), true, words);
  for (const words of ["我有哪些还没完成的待办？", "下周有哪些日程？", "今天先处理哪些事？", "明日予定確認", "列出我记过的竞品", "What's on my schedule next week?"]) assert.equal(asksBeyondListing(words), false, words);
});

const todo = (title: string, top: string, sub?: string) => ({ id: title, kind: "todo" as const, title, top, ...(sub ? { sub } : {}) });

test("signal 2: the model's text says more than the cards — or only restates them", () => {
  const cards = [todo("跟进田中的分期方案", "截止 11月14日（周六）18:00", "已过期1天"), todo("约山本吃饭", "")];
  // Restates the cards, the linked people and the states: the list may replace it.
  assert.equal(textSaysMore("你还有 2 件没完成的待办，其中 1 件已经过期。\n・跟进田中的分期方案：状态为未完成，截止时间是 11月14日（周六）18:00，已逾期一天，关联田中浩。\n・约山本吃饭：状态为未完成，没有计划日期也没有截止时间，关联山本直子。", cards, ["田中浩", "山本直子"]), false);
  // An end time no card shows, and a remark of its own (AE-UND-015 before cards showed the range).
  const meeting = [{ id: "s", kind: "schedule" as const, title: "团队周会", top: "11月16日（月）10:00" }];
  assert.equal(textSaysMore("明日11月16日（月）は10時から11時まで「团队周会」が入っています。毎週繰り返しの予定で、今日の時点で確認できている明日の予定はこれだけです。", meeting, ["weekly"]), true);
  // Prices from the notes are not on the cards.
  assert.equal(textSaysMore("Acme Cloud（竞品笔记 A）：标准版每席每月 1200 日元，年付九折；销售说可以谈到 1000。", [{ id: "m", kind: "memo", title: "竞品笔记 A" }], []), true);
  assert.equal(leftOver("You have 2 open to-dos.\n- Send Priya the JD: due Wed, Nov 18 at 18:00, overdue.", [{ id: "x", kind: "todo", title: "Send Priya the JD", top: "Due Nov 18 18:00" }], ["Priya Raman"]).length < 6, true);
});

test("a schedule card shows start to end; across midnight the end has its day", () => {
  const context = { language: "zh" as const, now: "2026-11-15T01:00:00.000Z", timeZone: "Asia/Tokyo" };
  const view = (fields: Record<string, unknown>) => ({ fields: { title: "团队周会", ...fields }, id: "personal:s10", kind: "schedule", ref: "schedule:personal:s10", updatedAt: "", version: "1" }) as never;
  assert.equal(recordOfView(view({ endsAt: "2026-11-16T02:00:00.000Z", startsAt: "2026-11-16T01:00:00.000Z" }), context).top, "11月16日（周一）10:00–11:00");
  assert.equal(recordOfView(view({ startsAt: "2026-11-16T01:00:00.000Z" }), context).top, "11月16日（周一）10:00");
  assert.match(String(recordOfView(view({ endsAt: "2026-11-17T01:00:00.000Z", startsAt: "2026-11-16T13:00:00.000Z" }), context).top), /22:00 – 11月17日/u);
});

function world() {
  const base = fnWorld();
  base.records.push(
    contact(ACTOR, "contact:xu", "许嘉宁"),
    contact(ACTOR, "contact:gu", "顾远"),
    memo(ACTOR, "note:weekly", "选品周会的议程和上次的结论。", "2026-11-09T03:00:00.000Z", [], { title: "选品周会纪要" }),
    // Every Monday 10:00–11:00 in Tokyo, with two people and a note.
    schedule(ACTOR, "personal:weekly", "选品周会", "2026-11-09T01:00:00.000Z", { contactIds: ["contact:xu", "contact:gu"], endsAt: "2026-11-09T02:00:00.000Z", noteIds: ["note:weekly"], recurrence: { frequency: "weekly" } }),
    // "只改这一次": the 16th is moved to 15:00–16:00 (as personal-schedule/occurrence-exceptions.ts stores it).
    { collection: "personal_schedule_occurrence_exceptions", id: "personal:weekly:occurrence:2026-11-16", payload: { cancelled: false, occurrenceDate: "2026-11-16", patch: { endsAt: "2026-11-16T07:00:00.000Z", startsAt: "2026-11-16T06:00:00.000Z" }, seriesId: "personal:weekly", updatedAt: "2026-11-15T00:50:00.000Z" }, userId: ACTOR, workspaceId: "workspace:test" },
  );
  return base;
}

const answerWith = (lead: string) => (call: ModelCall) => {
  const handle = /(s\d+) — personal schedule item/u.exec(call.user)![1];
  return json({ segments: [{ body: [], cites: [{ sentenceIds: [1], sourceRef: handle }], lead, partId: "p1" }] });
};

test("AE-SCL-025: 「明天这场周会关联了哪些人和哪篇笔记？」 — the model's answer stays, the meeting under it at 15:00–16:00 (the moved occurrence)", async () => {
  const message = "明天这场周会关联了哪些人和哪篇笔记？";
  const lead = "明天的选品周会关联了许嘉宁、顾远两人，还关联了「选品周会纪要」这篇笔记。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-11-16", to: "2026-11-16" }, requiredCapabilities: ["schedule.read"], sourceQuote: message }], { answer: answerWith(lead), session: graphKit((async () => { throw new Error("replaced"); }) as never, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world()) }) });
  assert.match(run.result.text, /许嘉宁、顾远/u);
  assert.doesNotMatch(run.result.text, /有 1 个日程/u, "not replaced by the code-written list");
  assert.ok(run.events.some((event) => event.type === "answer.list_kept_text"));
  assert.deepEqual(run.result.sourceRefs, ["schedule:personal:weekly"]);
  // Hotfix 1c: the meeting the question is about is attached as a small card, with the moved occurrence's time.
  const small = records(run.result.blocks).flatMap((block) => block.items);
  assert.equal(small.find((card) => card.title === "选品周会")?.top, "11月16日（周一）15:00–16:00", JSON.stringify(run.result.blocks));
  // What the model was given is the moved occurrence: 15:00 to 16:00, not the series' 10:00.
  const answerCall = run.modelCalls.find((call) => call.node === "answer")!;
  assert.match(answerCall.user, /Starts: [^\n]*15:00/u);
  assert.match(answerCall.user, /Ends: [^\n]*16:00/u);
  assert.doesNotMatch(answerCall.user, /Starts: [^\n]*10:00/u);
});

test("a list of schedule items shows the moved occurrence's own time on its card", async () => {
  const message = "下周一有哪些日程？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-11-16", to: "2026-11-16" }, requiredCapabilities: ["schedule.read"], sourceQuote: message }], { answer: (call) => json({ segments: [{ body: [], cites: [...call.user.matchAll(/(s\d+) — personal schedule item/gu)].map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), lead: "下周一有这些日程。", partId: "p1" }] }), session: graphKit((async () => { throw new Error("replaced"); }) as never, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world()) }) });
  const cards = records(run.result.blocks).flatMap((block) => block.items);
  assert.equal(cards.find((card) => card.title === "选品周会")?.top, "11月16日（周一）15:00–16:00", JSON.stringify(run.result.blocks));
});

test("AE-UND-015: a plain list question about tomorrow keeps its list only when the cards say all — the card now says 10:00–11:00", async () => {
  const message = "明日予定確認";
  const plain = world();
  plain.records = plain.records.filter((record) => record.collection !== "personal_schedule_occurrence_exceptions");
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-11-16", to: "2026-11-16" }, requiredCapabilities: ["schedule.read"], sourceQuote: message }], { answer: answerWith("明日11月16日（月）は10時から11時まで「选品周会」が入っています。"), language: "ja", session: graphKit((async () => { throw new Error("replaced"); }) as never, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(plain) }) });
  const cards = records(run.result.blocks).flatMap((block) => block.items);
  assert.equal(cards.find((card) => card.title === "选品周会")?.top, "11月16日（月）10:00–11:00", JSON.stringify(run.result.blocks));
  assert.match(run.result.text, /10:00–11:00|11時まで/u, "the end time is said");
});
