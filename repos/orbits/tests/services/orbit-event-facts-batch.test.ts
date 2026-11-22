import { strict as assert } from "node:assert";
import { test } from "node:test";

import { emptyJudgeContext } from "../../features/events/assessment/judge";
import { createOrbitEventFactsReader, type OrbitEventBase, type OrbitEventReaders, type OrbitEventRegistrant } from "../../features/events/assessment/orbit-event-facts";

const base = (eventId: string): OrbitEventBase => ({ description: "AI 起業家の交流会", endsAt: null, eventId, sourcePayload: { feeYen: 1000 }, startsAt: "2026-12-01T10:00:00.000Z", title: `Event ${eventId}`, venue: "東京" });
const roster: Record<string, OrbitEventRegistrant[]> = { e1: [{ name: "山田", org: "IT", role: "CEO" }], e2: [], e3: [{ name: "佐藤", org: null, role: null }, { name: "鈴木", org: null, role: null }] };

function readers(calls: string[]): OrbitEventReaders {
  return {
    async event(id) { calls.push(`event:${id}`); return id === "missing" ? null : base(id); },
    async registrants(id) { calls.push(`registrants:${id}`); return roster[id] ?? []; },
    async eventsMany(ids) { calls.push(`eventsMany:${ids.join(",")}`); return new Map(ids.filter((id) => id !== "missing").map((id) => [id, base(id)])); },
    async registrantsMany(ids) { calls.push(`registrantsMany:${ids.join(",")}`); return new Map(ids.map((id) => [id, roster[id] ?? []])); },
  };
}

test("factsMany returns the same facts as facts, in two batched reads", async () => {
  const context = emptyJudgeContext("ja", [{ id: "c1", name: "山田" }]);
  const single = createOrbitEventFactsReader(readers([]));
  const calls: string[] = [];
  const batched = createOrbitEventFactsReader(readers(calls));
  const many = await batched.factsMany("actor", ["e1", "e2", "e3", "missing", "e1"], context);
  assert.deepEqual(calls, ["eventsMany:e1,e2,e3,missing", "registrantsMany:e1,e2,e3,missing"]);
  assert.deepEqual([...many.keys()], ["e1", "e2", "e3"]);
  for (const id of ["e1", "e2", "e3"]) assert.deepEqual(many.get(id), await single.facts("actor", id, context));
});

test("factsMany re-reads rosters but not cached events", async () => {
  const context = emptyJudgeContext("ja");
  const calls: string[] = [];
  const reader = createOrbitEventFactsReader(readers(calls));
  await reader.factsMany("actor", ["e1", "e2"], context);
  calls.length = 0;
  await reader.factsMany("actor", ["e1", "e2", "e3"], context);
  assert.deepEqual(calls, ["eventsMany:e3", "registrantsMany:e1,e2,e3"]);
});

test("factsMany falls back to per-event reads without batched readers", async () => {
  const calls: string[] = [];
  const { eventsMany: _e, registrantsMany: _r, ...plain } = readers(calls);
  const reader = createOrbitEventFactsReader(plain);
  const many = await reader.factsMany("actor", ["e1", "missing"], emptyJudgeContext("ja"));
  assert.deepEqual([...many.keys()], ["e1"]);
  assert.ok(calls.includes("event:e1") && calls.includes("event:missing"));
});
