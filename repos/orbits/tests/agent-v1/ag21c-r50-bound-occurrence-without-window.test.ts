/**
 * AG21c R50: a repeating schedule item bound by id with the day inside the object clue ("明天这场例会关联了谁？") had no read
 * window, so the occurrence step was skipped and the card showed the series' time instead of the moved one. A repeating
 * item bound by id is always one occurrence: the one in the window, else the one the clue's own date words name, else the
 * next one from now — with that occurrence's changes applied. Invented items and sentences (zh, ja, en).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { boundOccurrenceWindow } from "../../features/agent-v1/graph/nodes/resolve";
import { contact, runFn } from "./functions-kit";
import { graphKit, json, recordAccessOf, type ModelCall } from "./graph-kit";
import { schedule } from "./read-kit";

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z"; // Sunday 10:00 in Tokyo
const cards = (blocks: readonly AnswerBlock[]) => blocks.filter((block): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records").flatMap((block) => block.items);

function world() {
  return {
    events: [],
    records: [
      contact(ACTOR, "contact:o1", "岑"),
      contact(ACTOR, "contact:o2", "Mara Quist"),
      // Every Tuesday 09:30–10:30 in Tokyo; the 17th moved to 14:00–15:00 for that one time.
      schedule(ACTOR, "personal:sync", "包装打样例会", "2026-11-10T00:30:00.000Z", { contactIds: ["contact:o1", "contact:o2"], endsAt: "2026-11-10T01:30:00.000Z", recurrence: { frequency: "weekly" } }),
      { collection: "personal_schedule_occurrence_exceptions", id: "personal:sync:occurrence:2026-11-17", payload: { cancelled: false, occurrenceDate: "2026-11-17", patch: { endsAt: "2026-11-17T06:00:00.000Z", startsAt: "2026-11-17T05:00:00.000Z" }, seriesId: "personal:sync", updatedAt: "2026-11-14T00:00:00.000Z" }, userId: ACTOR, workspaceId: "workspace:test" },
    ],
  };
}

const answerWith = (lead: string) => (call: ModelCall) => {
  const handle = /(s\d+) — personal schedule item/u.exec(call.user)![1];
  return json({ segments: [{ body: [], cites: [{ sentenceIds: [1], sourceRef: handle }], lead, partId: "p1" }] });
};

async function ask(message: string, clue: string, language: "zh" | "ja" | "en") {
  const references = [{ id: "personal:sync", name: "包装打样例会", type: "schedule" }];
  const session = graphKit((async () => { throw new Error("replaced"); }) as never, { now: NOW, records: recordAccessOf(world() as never), references: references as never });
  // No read window from the first layer: the day sits inside the clue.
  return runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "schedule", referenceId: "r1", text: clue }], requiredCapabilities: ["schedule.read"], sourceQuote: message }], { answer: answerWith("x"), language, references, session });
}

test("the window: the clue's day, then the part's words, else from now", () => {
  assert.deepEqual(boundOccurrenceWindow(["后天这场例会"], NOW, "Asia/Tokyo"), { from: "2026-11-16T15:00:00.000Z", to: "2026-11-17T15:00:00.000Z" });
  assert.deepEqual(boundOccurrenceWindow(["这场例会", "11月24日那场呢"], NOW, "Asia/Tokyo"), { from: "2026-11-23T15:00:00.000Z", to: "2026-11-24T15:00:00.000Z" });
  assert.deepEqual(boundOccurrenceWindow(["这场例会", "关联了谁"], NOW, "Asia/Tokyo"), { from: NOW });
});

for (const [language, message, clue] of [
  ["zh", "后天这场例会关联了谁？", "后天这场例会"],
  ["ja", "明後日の定例には誰が関係してる？", "明後日の定例"],
  ["zh", "这场例会关联了谁？", "这场例会"],
] as const) {
  test(`${language} 「${message}」 with no window: the moved occurrence on the 17th, 14:00`, async () => {
    const run = await ask(message, clue, language);
    assert.ok(run.events.some((event) => event.type === "resolve.bound_occurrence"), "the occurrence step ran");
    const card = cards(run.result.blocks).find((item) => item.title === "包装打样例会");
    assert.match(String(card?.top), /11月17日.*14:00/u, JSON.stringify(card));
    const answerCall = run.modelCalls.find((call) => call.node === "answer")!;
    assert.doesNotMatch(answerCall.user, /Starts: [^\n]*09:30/u);
  });
}

test("en 「Who is on the Nov 24 sync?」: that day's occurrence keeps the series' own time", async () => {
  const run = await ask("Who is on the Nov 24 sync?", "the Nov 24 sync", "en");
  const answerCall = run.modelCalls.find((call) => call.node === "answer")!;
  assert.match(answerCall.user, /Starts: 2026-11-24/u, answerCall.user);
});
