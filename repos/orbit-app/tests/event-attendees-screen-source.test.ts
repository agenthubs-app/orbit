import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// Route wiring only; actual behavior has render and interaction coverage.
test("attendees route uses canonical operations, not legacy roster previews", () => {
  const source = readFileSync(new URL("../src/screens/events/EventAttendeesScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /AttendeeOperationsScreen as EventAttendeesScreen/);
  assert.doesNotMatch(source, /eventMatchesPath|eventAttendeesPath|client\.post/);
  const route = readFileSync(new URL("../app/events/[id]/participants/[participantId].tsx", import.meta.url), "utf8");
  assert.match(route, /withOrbitPrivateRoute\(AttendeeOperationsScreen\)/);
});
