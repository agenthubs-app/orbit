import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { contact, fnWorld, memo, runFn } from "./functions-kit";
import { graphKit, json, recordAccessOf, type ModelCall } from "./graph-kit";
import { schedule } from "./read-kit";

/**
 * Release-2 gate 2 (AE-EVT-005, AE-SCL-025): since AG20a a card's schedule item is a mentioned record, so the next turn's
 * 「明天这场周会」 / 「11 月 30 日的团队周会」 comes bound to the item by id. The read by id gave the series as stored (11月16日
 * 10:00) — the hotfix's occurrence rule (a changed occurrence shows its own time) only ran on the search path. A repeating
 * item read by id is now given as its occurrence in the period said, with what was changed for that one time.
 */

const ACTOR = "actor:a";
const records = (blocks: readonly AnswerBlock[]) => blocks.filter((block): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records");

function world() {
  const base = fnWorld();
  base.records.push(
    contact(ACTOR, "contact:xu", "许嘉宁"),
    contact(ACTOR, "contact:gu", "顾远"),
    memo(ACTOR, "note:weekly", "选品周会的议程和上次的结论。", "2026-11-09T03:00:00.000Z", [], { title: "选品周会纪要" }),
    // Every Monday 10:00–11:00 in Tokyo; the 16th moved to 15:00–16:00 ("只改这一次").
    schedule(ACTOR, "personal:weekly", "选品周会", "2026-11-09T01:00:00.000Z", { contactIds: ["contact:xu", "contact:gu"], endsAt: "2026-11-09T02:00:00.000Z", noteIds: ["note:weekly"], recurrence: { frequency: "weekly" } }),
    { collection: "personal_schedule_occurrence_exceptions", id: "personal:weekly:occurrence:2026-11-16", payload: { cancelled: false, occurrenceDate: "2026-11-16", patch: { endsAt: "2026-11-16T07:00:00.000Z", startsAt: "2026-11-16T06:00:00.000Z" }, seriesId: "personal:weekly", updatedAt: "2026-11-15T00:50:00.000Z" }, userId: ACTOR, workspaceId: "workspace:test" },
  );
  return base;
}

const answerWith = (lead: string) => (call: ModelCall) => {
  const handle = /(s\d+) — personal schedule item/u.exec(call.user)![1];
  return json({ segments: [{ body: [], cites: [{ sentenceIds: [1], sourceRef: handle }], lead, partId: "p1" }] });
};

async function ask(message: string, clue: string, period: { from: string; to: string }, lead: string) {
  const references = [{ id: "personal:weekly", name: "选品周会", type: "schedule" }];
  const session = graphKit((async () => { throw new Error("replaced"); }) as never, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world()), references: references as never });
  return runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "schedule", referenceId: "r1", text: clue }], readFilter: period, requiredCapabilities: ["schedule.read"], sourceQuote: message }], { answer: answerWith(lead), references, session });
}

test("AE-SCL-025 「明天这场周会关联了哪些人和哪篇笔记？」 bound to the item: the moved occurrence, 15:00–16:00", async () => {
  const run = await ask("明天这场周会关联了哪些人和哪篇笔记？", "明天这场周会", { from: "2026-11-16", to: "2026-11-16" }, "明天的选品周会关联了许嘉宁、顾远两人，还关联了「选品周会纪要」这篇笔记。");
  assert.ok(run.events.some((event) => event.type === "resolve.bound_occurrence"), "read by id");
  const card = records(run.result.blocks).flatMap((block) => block.items).find((item) => item.title === "选品周会");
  assert.equal(card?.top, "11月16日（周一）15:00–16:00", JSON.stringify(run.result.blocks));
  const answerCall = run.modelCalls.find((call) => call.node === "answer")!;
  assert.match(answerCall.user, /Starts: [^\n]*15:00/u);
  assert.doesNotMatch(answerCall.user, /Starts: [^\n]*10:00/u);
});

test("AE-EVT-005 「11 月 30 日的团队周会是几点？」 bound to the item: that day's occurrence, the series' own time", async () => {
  const run = await ask("11 月 30 日的团队周会是几点？", "团队周会", { from: "2026-11-30", to: "2026-11-30" }, "11月30日（周一）的周会是上午10:00到11:00。");
  const card = records(run.result.blocks).flatMap((block) => block.items).find((item) => item.title === "选品周会");
  assert.equal(card?.top, "11月30日（周一）10:00–11:00", JSON.stringify(run.result.blocks));
  const answerCall = run.modelCalls.find((call) => call.node === "answer")!;
  assert.match(answerCall.user, /Starts: 2026-11-30/u);
});
