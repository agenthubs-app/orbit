import assert from "node:assert/strict";
import test from "node:test";

import { ownEventsOf } from "../../features/agent-v1/domains/event/read";
import { createDomainRegistry } from "../../features/agent-v1/domains/registry";
import { createMemoryRecordSource } from "../../features/agent-v1/domains/source";
import { authorizeReferences } from "../../features/agent-v1/references/authorize";
import { AI_READ_PERMISSIONS, projectReadFields, validateAiReadFields } from "../../features/orbit-ai/data-query/permission-registry";
import { A, B, CURSOR_KEY, scopeOf, smallWorld } from "./read-kit";

/**
 * Repair at a seam found when the lines were integrated (2026-11-20): AG20a made the event reader carry `allDay` for an
 * all-day private event, but the read allow-list for events (features/orbit-ai/data-query/permission-registry.ts,
 * "events.query") did not know the field, so every read of such an event through the record reader threw UNKNOWN_FIELD
 * — an @ of it was "not accessible", and it dropped out of the preparation answer. AG20a's own tests built the view by
 * hand and never went through the reader.
 */

const NOW = "2026-11-15T01:00:00.000Z";

function world() {
  const base = smallWorld();
  const privateEvents = new Map([
    // 11月19日 in Tokyo, the whole day: that day's local midnight with the flag.
    ["private_event:offsite", { accountId: A, allDay: true, id: "private_event:offsite", startsAt: "2026-11-18T15:00:00.000Z", title: "团队外出日", updatedAt: "2026-11-10T00:00:00.000Z", venue: "箱根", version: 1 }],
    ["private_event:reunion", { accountId: A, endsAt: "2026-11-18T13:00:00.000Z", id: "private_event:reunion", startsAt: "2026-11-18T10:00:00.000Z", title: "大学同学聚会", updatedAt: "2026-11-01T00:00:00.000Z", version: 1 }],
  ]);
  const attendance = new Map([
    ["attendance:offsite", { accountId: A, attendedOn: "2026-11-19", eventRef: { id: "private_event:offsite", kind: "private" as const }, id: "attendance:offsite", selfNote: "一整天都在外面", updatedAt: "2026-11-20T00:00:00.000Z", version: 1 }],
  ]);
  const byIds = async (ids: readonly string[]) => base.events.filter((event) => ids.includes(event.eventId));
  const own = ownEventsOf({
    attendance: { async get(actorId, id) { const note = attendance.get(id); return note && note.accountId === actorId ? note : null; } },
    byIds,
    privateEvents: { async get(actorId, id) { const event = privateEvents.get(id); return event && event.accountId === actorId ? event : null; } },
  });
  const registry = createDomainRegistry({ cursorKey: CURSOR_KEY, events: { byIds, own }, now: () => NOW, source: createMemoryRecordSource(base.records) });
  return { base, registry };
}

test("an all-day private event is read through the record reader, with its flag", async () => {
  const { registry } = world();
  const read = await registry.read("event", scopeOf(A), { id: "private_event:offsite" });
  assert.equal(read.items.length, 1);
  assert.deepEqual(read.items[0].fields, { allDay: true, kind: "private_event", location: "箱根", startsAt: "2026-11-18T15:00:00.000Z", title: "团队外出日" });
});

test("an event without the flag reads exactly as before: no allDay field appears", async () => {
  const { base, registry } = world();
  const timed = await registry.read("event", scopeOf(A), { id: "private_event:reunion" });
  assert.deepEqual(Object.keys(timed.items[0].fields).sort(), ["endsAt", "kind", "startsAt", "title"]);
  const platform = base.events[0];
  const listed = await registry.read("event", scopeOf(A), { id: platform.eventId });
  assert.equal(listed.items.length, 1);
  assert.equal("allDay" in listed.items[0].fields, false, "a platform event has no such field");
});

test("«我去过» about an all-day event carries the event's flag; another account reads neither", async () => {
  const { registry } = world();
  const note = await registry.read("event", scopeOf(A), { id: "attendance:offsite" });
  assert.equal(note.items[0].fields.allDay, true);
  assert.equal(note.items[0].fields.kind, "attendance");
  // Another account's read by id is "not found", as for any private record.
  for (const id of ["private_event:offsite", "attendance:offsite"]) await assert.rejects(registry.read("event", scopeOf(B), { id }), /READ_NOT_FOUND/u, id);
});

test("an @ of an all-day private event is authorised and read", async () => {
  const { registry } = world();
  const mine = await authorizeReferences(registry, scopeOf(A), [{ eventKind: "private", id: "private_event:offsite", type: "event" }]);
  assert.deepEqual(mine.map((item) => [item.id, item.accessible, item.name]), [["private_event:offsite", true, "团队外出日"]]);
  assert.equal(mine[0].view?.fields.allDay, true);
  const theirs = await authorizeReferences(registry, scopeOf(B), [{ eventKind: "private", id: "private_event:offsite", type: "event" }]);
  assert.deepEqual([theirs[0].accessible, theirs[0].reason], [false, "REFERENCE_NOT_ACCESSIBLE"]);
});

test("the events allow-list: allDay is an optional true/false and nothing else changed", () => {
  const events = AI_READ_PERMISSIONS.find((entry) => entry.tool === "events.query")!;
  assert.ok((events.fields as readonly string[]).includes("allDay"));
  // Additive: a row without the field is projected and validated to the same fields as before.
  const row = { kind: "private_event", startsAt: "2026-11-18T10:00:00.000Z", title: "大学同学聚会" };
  assert.deepEqual(validateAiReadFields("events.query", projectReadFields(row, events.fields)), row);
  assert.deepEqual(validateAiReadFields("events.query", projectReadFields({ ...row, allDay: true }, events.fields)), { ...row, allDay: true });
  assert.throws(() => validateAiReadFields("events.query", { ...row, allDay: "yes" }));
  // A field nobody allowed is still refused.
  assert.throws(() => projectReadFields({ ...row, organizerEmail: "x@example.test" }, events.fields), /UNKNOWN_FIELD/u);
});
