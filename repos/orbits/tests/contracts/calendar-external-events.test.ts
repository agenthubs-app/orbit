import assert from "node:assert/strict";
import test from "node:test";

import { calendarExternalEventsQuerySchema, calendarExternalEventsResponseSchema } from "../../shared/api-schema/calendar-external-events";

test("external calendar query accepts only a bounded ISO interval", () => {
  assert.equal(calendarExternalEventsQuerySchema.safeParse({ from: "2026-10-18T00:00:00Z", to: "2026-10-19T00:00:00Z" }).success, true);
  for (const query of [
    { from: "2026-10-18", to: "2026-10-19" },
    { from: "2026-10-19T00:00:00Z", to: "2026-10-18T00:00:00Z" },
    { from: "2026-10-18T00:00:00Z", to: "2026-11-30T00:00:00Z" },
    { from: "2026-10-18T00:00:00Z", to: "2026-10-19T00:00:00Z", extra: "x" },
  ]) assert.equal(calendarExternalEventsQuerySchema.safeParse(query).success, false);
});

test("external calendar response tolerates additive fields and unknown connection states", () => {
  const parsed = calendarExternalEventsResponseSchema.parse({ connection: "future", provider: "google_calendar", events: [], asOf: "2026-10-18T00:00:00Z", extra: true });
  assert.equal(parsed.connection, "unavailable");
  assert.equal("extra" in parsed, false);
});
