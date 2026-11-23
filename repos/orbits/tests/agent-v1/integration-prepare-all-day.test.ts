import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { createDomainRegistry } from "../../features/agent-v1/domains/registry";
import { comesUp } from "../../features/agent-v1/graph/nodes/prepare";
import { fnWorld, runFn } from "./functions-kit";
import { graphKit, recordAccessOf } from "./graph-kit";
import { schedule } from "./read-kit";

/**
 * Integration of the hotfix's preparation answer (graph/nodes/prepare.ts, which lists the user's own private events)
 * and AG20a's all-day private events: the two were built on separate lines.
 *
 * - An all-day private event in 「接下来的会面或活动，该准备什么？」 reads 「全天」 on its card and in its line of the text —
 *   through the same helper every other server-written surface uses (answer/blocks.ts recordOfView) — never 00:00.
 * - An all-day item (a private event or a schedule item) counts as coming up until the end of its day in the user's time
 *   zone, not until its start at midnight: at 10:00 on its day it is still to prepare for.
 */

const ACTOR = "actor:a";
const NOV_15_10AM = "2026-11-15T01:00:00.000Z";
/** 10:00 in Tokyo on 11月19日, the day of the all-day items below. */
const NOV_19_10AM = "2026-11-19T01:00:00.000Z";
const NOV_20_10AM = "2026-11-20T01:00:00.000Z";
const MESSAGE = "接下来的会面或活动，该准备什么？";
// 11月19日 in Tokyo, the whole day: stored as that day's local midnight with the all-day flag (AG20a).
const OFFSITE = { allDay: true, endsAt: undefined, id: "private_event:offsite", kind: "private_event" as const, location: "箱根", startsAt: "2026-11-18T15:00:00.000Z", title: "团队外出日", updatedAt: "2026-11-10T00:00:00.000Z", version: 1 };

async function prepare(now: string, extra: ReturnType<typeof schedule>[] = [], withPrivateEvent = true) {
  const base = fnWorld();
  base.records.push(...extra);
  const kit = graphKit((async () => { throw new Error("replaced"); }) as never, { now, records: recordAccessOf(base) });
  const access = kit.deps.records!;
  access.registeredEventIds = async () => [];
  access.reader = createDomainRegistry({ cursorKey: new Uint8Array(Buffer.from("agent-v1-graph-kit-cursor-key-0123456789")), denied: () => new Set(), events: { byIds: async () => [], own: async (_actor, id) => (id === OFFSITE.id ? OFFSITE : null) }, now: () => now, source: access.source });
  access.privateEvents = { get: async () => null, list: async () => (withPrivateEvent ? [{ accountId: ACTOR, allDay: true, createdAt: OFFSITE.updatedAt, id: OFFSITE.id, startsAt: OFFSITE.startsAt, title: OFFSITE.title, updatedAt: OFFSITE.updatedAt, version: 1 }] : []), references: async () => [] } as never;
  const run = await runFn(MESSAGE, [{ dataSources: ["orbit_records"], deliverable: "answer", requiredCapabilities: ["schedule.read", "event.read"], sourceQuote: MESSAGE }], { session: kit });
  const cards = run.result.blocks.filter((block: AnswerBlock): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records" && (block.size ?? "full") === "full").flatMap((block) => block.items);
  return { cards, text: run.result.text };
}

test("an all-day private event in the preparation answer reads 全天, on the card and in the text, never 00:00", async () => {
  const { cards, text } = await prepare(NOV_15_10AM);
  const card = cards.find((item) => item.id === OFFSITE.id);
  assert.ok(card, `the private event is among the cards: ${cards.map((item) => item.id).join(", ")}`);
  assert.equal(card.eventKind, "private");
  assert.match(card.top ?? "", /11月19日.*全天/u, card.top);
  assert.doesNotMatch(card.top ?? "", /0?0:00/u, "an all-day event shows no time of day");
  const line = text.split("\n").find((part) => part.includes("团队外出日")) ?? "";
  assert.match(line, /全天/u, text);
  assert.doesNotMatch(line, /0?0:00/u, text);
});

test("coming up: a timed item until it starts; an all-day item until the end of its day in the user's time zone", () => {
  const zone = "Asia/Tokyo";
  // Timed: 11月19日 09:00 Tokyo.
  assert.equal(comesUp("2026-11-19T00:00:00.000Z", false, "2026-11-18T23:59:00.000Z", zone), true);
  assert.equal(comesUp("2026-11-19T00:00:00.000Z", false, NOV_19_10AM, zone), false, "a timed item that has started is not coming up");
  // All day on 11月19日 (stored as local midnight).
  assert.equal(comesUp(OFFSITE.startsAt, true, NOV_19_10AM, zone), true, "10:00 on its day");
  assert.equal(comesUp(OFFSITE.startsAt, true, "2026-11-19T14:59:00.000Z", zone), true, "23:59 on its day");
  assert.equal(comesUp(OFFSITE.startsAt, true, "2026-11-19T15:00:00.000Z", zone), false, "midnight after its day");
  // The day is the user's: the same instant is still 11月18日 in Los Angeles, where the day ends 17 hours later.
  assert.equal(comesUp(OFFSITE.startsAt, true, "2026-11-19T07:00:00.000Z", "America/Los_Angeles"), true);
  assert.equal(comesUp(OFFSITE.startsAt, true, "2026-11-19T08:00:00.000Z", "America/Los_Angeles"), false);
});

test("at 10:00 on its day an all-day private event is still to prepare for; the next morning it is not", async () => {
  const today = await prepare(NOV_19_10AM);
  assert.deepEqual(today.cards.map((item) => item.id), [OFFSITE.id]);
  assert.match(today.cards[0].top ?? "", /11月19日.*全天/u);
  const after = await prepare(NOV_20_10AM);
  assert.deepEqual(after.cards.map((item) => item.id), []);
  assert.match(after.text, /没有安排的会面/u);
});

test("at 10:00 an all-day schedule item of today is listed; a meeting that started at 09:00 is not; yesterday's all-day item is not", async () => {
  const items = [
    schedule(ACTOR, "personal:allday", "年度体检", "2026-11-18T15:00:00.000Z", { allDay: true }),
    schedule(ACTOR, "personal:started", "晨会", "2026-11-19T00:00:00.000Z", { endsAt: "2026-11-19T00:30:00.000Z" }),
    schedule(ACTOR, "personal:yesterday", "搬家日", "2026-11-17T15:00:00.000Z", { allDay: true }),
    schedule(ACTOR, "personal:later", "和客户通话", "2026-11-19T06:00:00.000Z", { endsAt: "2026-11-19T07:00:00.000Z" }),
  ];
  const { cards, text } = await prepare(NOV_19_10AM, items, false);
  assert.deepEqual(cards.map((item) => item.id), ["personal:allday", "personal:later"], "today's all-day item first (its day began first), then what starts later today");
  assert.doesNotMatch(text, /晨会|搬家日/u);
  const allDay = cards.find((item) => item.id === "personal:allday")!;
  assert.doesNotMatch(allDay.top ?? "", /0?0:00/u, allDay.top);
});

test("an all-day item that repeats is listed on the day of its occurrence", async () => {
  // Every week from 11月12日, all day: the occurrence of 11月19日 is today.
  const { cards } = await prepare(NOV_19_10AM, [schedule(ACTOR, "personal:weekly", "在家办公日", "2026-11-11T15:00:00.000Z", { allDay: true, recurrence: { frequency: "weekly" } })], false);
  assert.deepEqual(cards.map((item) => item.id), ["personal:weekly"]);
});
