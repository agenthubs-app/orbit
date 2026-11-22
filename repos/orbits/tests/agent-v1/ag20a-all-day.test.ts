import assert from "node:assert/strict";
import { test } from "node:test";

import { recordOfView } from "../../features/agent-v1/answer/blocks";
import { materialOf } from "../../features/agent-v1/answer/materials";
import { prepareEventOperation } from "../../features/agent-v1/domains/private-event/ops";
import { resolveEventIntent } from "../../features/agent-v1/propose/events-resolve";
import type { ResolveContext } from "../../features/agent-v1/propose/resolve";
import type { StoredIntent } from "../../features/agent-v1/propose/schema";
import { ACTOR as KIT_ACTOR, createCardKit, decide, freeze } from "../services/agent-ledger-card-kit";
import { recordAccessOf } from "./graph-kit";

/**
 * agent-design AG20a follow-up (coordinator review of R5): an all-day private event (a day said without a clock time) never
 * shows 00:00. Where its time is written by the server — the confirmation card's rows, the answer's record card, what the
 * answer step reads — it shows its day and 全天 / 終日 / All day in the place of the clock time. A schedule item made from
 * an all-day event is all day too (local midnight to the next), never 00:00–00:00.
 */

const ZONE = "Asia/Tokyo";
// 2027-02-06 00:00 in Tokyo.
const SAT = "2027-02-05T15:00:00.000Z";

const op = (intent: object, locale: "zh" | "ja" | "en" = "zh") => prepareEventOperation({ actionId: "card:x", index: 0, intent: intent as never, locale, revision: 1, timeZone: ZONE });
const timeRow = (prepared: ReturnType<typeof op>) => prepared.display?.rows.find((row) => row.field === "startsAt" || row.field === "occurrenceDate");

test("confirmation card: a new all-day private event shows its day and 全天 (zh, ja, en); a timed one its time", () => {
  assert.equal(timeRow(op({ capability: "privateEvent.create", set: { allDay: true, startsAt: SAT, title: "陶艺市集" } }))?.after, "2月6日（周六）全天");
  assert.equal(timeRow(op({ capability: "privateEvent.create", set: { allDay: true, startsAt: SAT, title: "陶芸市" } }, "ja"))?.after, "2月6日（土）終日");
  assert.equal(timeRow(op({ capability: "privateEvent.create", set: { allDay: true, startsAt: SAT, title: "Pottery fair" } }, "en"))?.after, "Sat, Feb 6 All day");
  assert.equal(timeRow(op({ capability: "privateEvent.create", set: { allDay: true, startsAt: SAT, title: "陶艺市集" } }))?.label, "时间", "the same row, a different string");
  assert.equal(timeRow(op({ capability: "privateEvent.create", set: { startsAt: "2027-02-06T05:00:00.000Z", title: "陶艺市集" } }))?.after, "2月6日（周六）14:00");
  assert.doesNotMatch(op({ capability: "privateEvent.create", set: { allDay: true, startsAt: SAT, title: "陶艺市集" } }).preview, /00:00/u);
});

test("confirmation card: deleting or moving an all-day event shows 全天, not 00:00; a time set on it clears allDay without a row of its own", () => {
  assert.equal(timeRow(op({ capability: "privateEvent.delete", expectedVersion: 1, shown: { allDay: true, references: 0, startsAt: SAT, title: "陶艺市集" }, targetId: "private_event:p1" }))?.after, "2月6日（周六）全天");
  const moved = op({ capability: "privateEvent.update", expectedVersion: 1, set: { startsAt: "2027-02-06T15:00:00.000Z" }, shown: { allDay: true, before: { startsAt: SAT }, title: "陶艺市集" }, targetId: "private_event:p1" });
  assert.deepEqual([timeRow(moved)?.before, timeRow(moved)?.after], ["2月6日（周六）全天", "2月7日（周日）全天"]);
  const timed = op({ capability: "privateEvent.update", expectedVersion: 1, set: { allDay: null, startsAt: "2027-02-06T05:00:00.000Z" }, shown: { allDay: true, before: { allDay: "true", startsAt: SAT }, title: "陶艺市集" }, targetId: "private_event:p1" });
  assert.deepEqual(timed.display?.rows.map((row) => [row.field, row.before, row.after]), [["startsAt", "2月6日（周六）全天", "2月6日（周六）14:00"]]);
});

test("record card and the answer's materials: day and 全天 / all day, never 00:00", () => {
  const view = { fields: { allDay: true, kind: "private_event", startsAt: SAT, title: "陶艺市集" }, id: "private_event:p1", kind: "event", ref: "event:private_event:p1", updatedAt: SAT, version: "1" } as never;
  assert.match(String(recordOfView(view, { language: "zh", now: "2027-02-10T01:00:00.000Z", timeZone: ZONE }).top), /2月6日（周六）全天$/u, "the card's own date helper, 全天 in the time's place");
  assert.match(String(recordOfView(view, { language: "en", now: "2027-02-10T01:00:00.000Z", timeZone: ZONE }).top), /Feb 6.* All day$/u);
  const timed = { ...(view as object), fields: { kind: "private_event", startsAt: "2027-02-06T05:00:00.000Z", title: "陶艺市集" } } as never;
  assert.match(String(recordOfView(timed, { language: "zh", now: "2027-02-10T01:00:00.000Z", timeZone: ZONE }).top), /14:00/u);
  const material = materialOf(view, "p1", "s1", { names: new Map(), now: "2027-02-10T01:00:00.000Z", timeZone: ZONE });
  const said = material.sentences.map((sentence) => sentence.text).join("\n");
  assert.match(said, /all day; no time of day was given/u);
  assert.doesNotMatch(said, /00:00/u);
});

test("a schedule item made from an all-day private event is all day: midnight to the next midnight, in the user's zone", async () => {
  const records = { ...recordAccessOf({ events: [], records: [] }), privateEvents: { get: async () => null, list: async () => [{ accountId: "user:a", allDay: true, createdAt: SAT, id: "private_event:p1", startsAt: SAT, title: "陶艺市集", updatedAt: SAT, version: 1 }], references: async () => [] } };
  const message = "把陶艺市集加到我的日程";
  const at = message.indexOf("陶艺市集");
  const ctx: ResolveContext = { asOf: "2027-02-01T01:00:00.000Z", asked: new Map(), context: null, language: "zh", message, nameOf: () => null, people: [], records: records as never, scope: { accountId: "user:a", authorizationEpoch: "agent-v1:1", workspaceId: "workspace:test" }, timeZone: ZONE };
  const intent: StoredIntent = { capability: "schedule.create", events: [[at, at + 4]], localId: "w1", relations: [], selector: [] };
  const outcome = await resolveEventIntent(ctx, { localId: "p1", quote: [0, message.length], refs: [] } as never, { intents: [], picks: {} }, intent);
  assert.equal(outcome.kind, "ready", JSON.stringify(outcome));
  const set = (outcome as { ops: { set: Record<string, unknown> }[] }).ops[0].set;
  assert.deepEqual([set.allDay, set.startsAt, set.endsAt, set.timeZone], [true, SAT, "2027-02-06T15:00:00.000Z", ZONE]);
  assert.equal(timeRow(op({ capability: "schedule.create", set, shown: { events: [{ kind: "private", startsAt: SAT, title: "陶艺市集" }] } }))?.after, "2月6日（周六）全天");
  // Confirmed through the real schedule service: an all-day item on the day, no 00:00–00:00.
  const kit = createCardKit({ start: "2027-02-01T01:00:00.000Z" });
  const card = await freeze(kit, [{ capability: "schedule.create", partId: "p1", set: { ...set, eventRefs: undefined }, shown: { events: [] } } as never]);
  await decide(kit, card, "confirm", "d1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "completed");
  const stored = (await kit.store.listRecords({ collectionName: "personal_schedule_items", limit: "unbounded", userId: KIT_ACTOR, workspaceId: kit.workspaceId }))[0].payload as Record<string, unknown>;
  assert.deepEqual([stored.allDay, stored.startsAt, stored.endsAt], [true, SAT, "2027-02-06T15:00:00.000Z"]);
});
