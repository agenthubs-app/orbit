import assert from "node:assert/strict";
import test from "node:test";

import { readCalendarExternalChunks } from "../src/screens/calendar/calendar-external-state";

const connected = (events: unknown[]) => ({ connection: "connected", provider: "google_calendar", events, asOf: "2026-10-18T00:00:00.000Z" });
const event = { id: "g1", titlePreview: "Team call", startsAt: "2026-10-18T01:00:00.000Z", endsAt: "2026-10-18T02:00:00.000Z", allDay: false };

test("external chunks deduplicate boundary events and never persist or elevate them into Orbit records", () => {
  assert.deepEqual(readCalendarExternalChunks([connected([event]), connected([event])]), { connection: "connected", events: [event] });
});

test("a missing or malformed range is unavailable, not an empty connected calendar", () => {
  assert.deepEqual(readCalendarExternalChunks([connected([]), null]), { connection: "unavailable", events: [] });
  assert.deepEqual(readCalendarExternalChunks([connected([]), { ...connected([]), provider: "other" }]), { connection: "unavailable", events: [] });
  assert.deepEqual(readCalendarExternalChunks([connected([event]), connected([{ ...event, titlePreview: "Changed" }])]), { connection: "unavailable", events: [] });
  assert.deepEqual(readCalendarExternalChunks([{ ...connected([event]), connection: "not_connected" }]), { connection: "not_connected", events: [] });
  assert.deepEqual(readCalendarExternalChunks([{ ...connected([event]), connection: "needs_reconnect" }]), { connection: "needs_reconnect", events: [] });
});
