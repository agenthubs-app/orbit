import assert from "node:assert/strict";
import test from "node:test";

import { createCalendarExternalReader } from "../../features/calendar-external/reader";

const range = { from: "2026-10-18T00:00:00.000Z", to: "2026-10-19T00:00:00.000Z" };
const active = { provider: "google_calendar", status: "active", capabilities: ["calendar.read"] } as const;

test("connected Google events are read only and cached by actor and interval for at most five minutes", async () => {
  let now = 0;
  let reads = 0;
  const reader = createCalendarExternalReader({ now: () => now, serviceForActor: () => ({
    listAuthorizations: async () => [active],
    listCalendarEvents: async () => { reads++; return [{ providerRecordId: "g1", title: "Meeting", startsAt: "2026-10-18T10:00:00+09:00", endsAt: "2026-10-18T11:00:00+09:00", location: "Tokyo", attendeeCount: 2, evidenceId: "e1" }]; },
  }) });
  const first = await reader.read("actor-a", range);
  assert.equal(first.connection, "connected");
  assert.deepEqual(first.events, [{ id: "g1", titlePreview: "Meeting", startsAt: "2026-10-18T10:00:00+09:00", endsAt: "2026-10-18T11:00:00+09:00", allDay: false, locationPreview: "Tokyo" }]);
  now = 1_000;
  assert.equal((await reader.read("actor-a", range)).asOf, first.asOf);
  assert.equal(reads, 1);
  await reader.read("actor-b", range);
  assert.equal(reads, 2);
  await reader.read("actor-a", { from: range.from, to: "2026-10-20T00:00:00.000Z" });
  assert.equal(reads, 3);
  now = 300_000;
  await reader.read("actor-a", range);
  assert.equal(reads, 4);
});

test("missing authorization skips the provider and a failed expired-token refresh requests reconnection", async () => {
  let reads = 0;
  const serviceForActor = (actorId: string) => ({
    listAuthorizations: async () => actorId === "missing" ? [] : [{ ...active, status: "expired" as const }],
    listCalendarEvents: async () => { reads++; throw Object.assign(new Error("refresh refused"), { status: 401 }); },
  });
  const reader = createCalendarExternalReader({ serviceForActor });
  assert.equal((await reader.read("missing", range)).connection, "not_connected");
  assert.equal((await reader.read("expired", range)).connection, "needs_reconnect");
  assert.equal(reads, 1);
});

test("read budget rejects the external read before provider access", async () => {
  let accessed = false;
  const reader = createCalendarExternalReader({
    gate: { assertAllowed: () => { throw new Error("budget closed"); } },
    serviceForActor: () => { accessed = true; return null; },
  });
  await assert.rejects(reader.read("actor-a", range), /budget closed/);
  assert.equal(accessed, false);
});

test("refreshable expired access tokens reach the existing calendar service and both integration read collections are gated", async () => {
  const checked: string[] = [];
  let reads = 0;
  const reader = createCalendarExternalReader({ gate: { assertAllowed: ({ collectionName }) => { checked.push(collectionName!); } }, serviceForActor: () => ({
    listAuthorizations: async () => [{ ...active, status: "expired" as const }],
    listCalendarEvents: async () => { reads++; return []; },
  }) });
  assert.equal((await reader.read("actor-a", range)).connection, "connected");
  assert.equal(reads, 1);
  assert.deepEqual(new Set(checked), new Set(["integrationTokens", "integrationHealth"]));
});
