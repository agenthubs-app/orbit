import assert from "node:assert/strict";
import test from "node:test";

import { createCalendarExternalEventsGetHandler } from "../../features/calendar-external/route-handler";
import { getCapabilityRegistration } from "../../shared/services/capability-registry";

const from = "2026-10-18T00:00:00.000Z";
const to = "2026-10-19T00:00:00.000Z";

test("external calendar route authenticates and validates before its reader", async () => {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "live";
  try {
  let reads = 0;
  const reader = { async read() { reads++; return { connection: "not_connected" as const, provider: "google_calendar" as const, events: [], asOf: from }; } };
  const anonymous = createCalendarExternalEventsGetHandler({ resolveActor: async () => null, reader });
  assert.equal((await anonymous(new Request(`https://orbit.test/api/calendar/external-events?from=${from}&to=${to}`))).status, 401);
  const handler = createCalendarExternalEventsGetHandler({ resolveActor: async () => ({ id: "actor-a", workspaceId: "w" }), reader });
  for (const query of [`from=${from}`, `from=${from}&to=${to}&to=${to}`, `from=${from}&to=${to}&extra=1`, `from=${to}&to=${from}`]) {
    const response = await handler(new Request(`https://orbit.test/api/calendar/external-events?${query}`));
    assert.equal(response.status, 400);
  }
  assert.equal(reads, 0);
  const response = await handler(new Request(`https://orbit.test/api/calendar/external-events?from=${from}&to=${to}`));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.connection, "not_connected");
  assert.equal(reads, 1);
  } finally { if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous; }
});

test("external calendar is registered as a read-only API capability", () => {
  const registration = getCapabilityRegistration("calendar-external-events");
  assert.deepEqual(registration.api.routes.map(route => [route.method, route.path]), [["GET", "/api/calendar/external-events"]]);
});
