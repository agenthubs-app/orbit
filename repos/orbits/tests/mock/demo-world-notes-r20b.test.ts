import assert from "node:assert/strict";
import test from "node:test";

import { demoNotes } from "../../shared/mock/demo-world/fixtures";

test("R20b demo notes cover event mentions, legacy kind and voice without changing real records", () => {
  assert.equal(demoNotes.length, 5);
  assert.ok(demoNotes.every((note) => note.sample === true));
  const event = demoNotes.find((note) => note.id === "demo-note-cfo-night");
  assert.deepEqual(event?.mentions, [{ entityType: "event", eventId: "demo-event-cfo-night", start: 0, end: 10, displayText: "@CFO Night" }]);
  assert.deepEqual(event?.eventIds, ["demo-event-cfo-night"]);
  assert.ok(event?.body.slice(0, 10) === event?.mentions[0]?.displayText);
  const legacy = demoNotes.find((note) => note.id === "demo-note-legacy");
  assert.ok(legacy);
  assert.equal(Object.hasOwn(legacy, "noteKind"), false);
  assert.equal(Object.hasOwn(legacy, "usedForPlan"), false);
  assert.equal(demoNotes.find((note) => note.id === "demo-note-voice")?.noteKind, "voice");
});
