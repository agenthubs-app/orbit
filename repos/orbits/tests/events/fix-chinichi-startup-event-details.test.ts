import assert from "node:assert/strict";
import test from "node:test";

import { payloadFacts } from "../../features/events/assessment/orbit-event-facts";
import { organizerNameFrom } from "../../features/events/journey/live-mapping";
import { ORGANIZER_NAME, TARGETS, planPatch } from "../../scripts/fix-chinichi-startup-event-details";

test("targets: four events, agenda times ascending and parseable by payloadFacts", () => {
  assert.equal(Object.keys(TARGETS).length, 4);
  for (const [eventId, target] of Object.entries(TARGETS)) {
    assert.match(target.title, /^第[1-4]回 中日创业交流会$/, eventId);
    const times = target.agenda.map((item) => item.at);
    assert.deepEqual([...times].sort(), times, `${eventId} times ascending`);
    assert.equal(payloadFacts({ agenda: target.agenda }).agenda.length, target.agenda.length, `${eventId} agenda readable`);
  }
});

test("planPatch fills only what is missing and is a no-op once complete", () => {
  const agenda = TARGETS["d4bb5ca1-ef91-486b-bc89-b9f58c73d8be"]!.agenda;
  assert.deepEqual(planPatch({ feeYen: 4500 }, agenda), { agenda, organizerName: ORGANIZER_NAME });
  assert.deepEqual(planPatch({ agenda: [{ at: "19:00", title: "x" }] }, agenda), { organizerName: ORGANIZER_NAME });
  assert.deepEqual(planPatch({ organizerName: "既存" }, agenda), { agenda });
  assert.equal(planPatch({ agenda, organizerName: ORGANIZER_NAME }, agenda), null);
  // Empty arrays / blank names count as missing.
  assert.deepEqual(Object.keys(planPatch({ agenda: [], organizerName: "  " }, agenda)!).sort(), ["agenda", "organizerName"]);
});

test("after the patch the read path shows the organizer name instead of the opaque label", () => {
  const patched = { feeYen: 4500, ...planPatch({ feeYen: 4500 }, TARGETS["c011f958-4d51-4ada-8881-92f14f5c4db6"]!.agenda) };
  assert.equal(organizerNameFrom(patched, "actor_x"), ORGANIZER_NAME);
  assert.match(organizerNameFrom({ feeYen: 4500 }, "actor_x"), /^Organizer #/);
});
