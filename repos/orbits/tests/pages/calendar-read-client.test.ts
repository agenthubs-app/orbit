import assert from "node:assert/strict";
import test from "node:test";
import { createCalendarReadClient } from "../../app/(app)/app/orbit-2026/calendar/calendar-read-client";
import { calendarWindow } from "../../app/(app)/app/orbit-2026/calendar/calendar-range";

const item = { id: "p", sourceId: "p", kind: "personal", category: "personal", title: "Personal", startsAt: "2026-11-01T15:00:00Z", state: "upcoming" };
const event = { id: "g", titlePreview: "Google", startsAt: "2026-11-01", endsAt: "2026-11-02", allDay: true };
const external = (events = [event], connection = "connected") => ({ provider: "google_calendar", connection, events, asOf: "2026-10-18T00:00:00Z" });

test("calendar client requests the selected native range, skips unreadable rows visibly and never falls back to default range", async () => {
  const calls: string[] = [];
  const window = calendarWindow("2026-11-01", "month", "America/New_York");
  const client = createCalendarReadClient({ fetch: async (url, init) => {
    calls.push(String(url)); assert.equal(init?.cache, "no-store");
    return Response.json({ success: true, data: { scheduleItems: [item, { ...item, id: "future", kind: "future_kind" }, { ...item, id: "bad", endsAt: "2026-11-01T14:00:00Z" }] } });
  } });
  const result = await client.internal(window, "ja");
  assert.deepEqual(result.items, [item]); assert.equal(result.skipped, 2);
  const query = new URL(calls[0]!, "http://localhost").searchParams;
  assert.deepEqual(Object.fromEntries(query), { scope: "calendar", from: window.from, to: window.to, language: "ja" });
});
test("external split windows merge the whole fall-DST tail and collapse only identical event identities", async () => {
  const window = calendarWindow("2025-11-15", "month", "America/New_York");
  assert.equal(window.externalRanges.length, 2);
  const ranges: unknown[] = [];
  const tail = { ...event, id: "tail", startsAt: "2025-12-07T04:30:00Z", endsAt: "2025-12-07T04:45:00Z", allDay: false };
  let count = 0;
  const client = createCalendarReadClient({ fetch: async url => {
    ranges.push(Object.fromEntries(new URL(String(url), "http://localhost").searchParams));
    return Response.json({ success: true, data: external(count++ ? [event, tail] : [event]) });
  } });
  const result = await client.external(window.externalRanges);
  assert.deepEqual(ranges, window.externalRanges);
  assert.equal(result.connection, "connected"); assert.deepEqual(result.events.map(event => event.id), ["g", "tail"]);
  const conflicted = createCalendarReadClient({ fetch: async () => Response.json({ success: true, data: external([{ ...event, titlePreview: String(count++) }]) }) });
  await assert.rejects(conflicted.external(window.externalRanges), /CALENDAR_RESPONSE_INVALID/);
});
test("external unavailable/reconnect/unknown states clear events, and skipped future rows remain visible as partial", async () => {
  for (const [status, expected] of [["not_connected", "not_connected"], ["needs_reconnect", "needs_reconnect"], ["future_status", "unavailable"]]) {
    const client = createCalendarReadClient({ fetch: async () => Response.json({ success: true, data: external([event], status) }) });
    const result = await client.external([{ from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z" }]);
    assert.equal(result.connection, expected); assert.deepEqual(result.events, []);
  }
  const client = createCalendarReadClient({ fetch: async () => Response.json({ success: true, data: external([event, { ...event, id: "invalid", startsAt: "2026-11-99" }]) }) });
  const result = await client.external([{ from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z" }]);
  assert.equal(result.skipped, 1); assert.deepEqual(result.events.map(event => event.id), ["g"]);
});
