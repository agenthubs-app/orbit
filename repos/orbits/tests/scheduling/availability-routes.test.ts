import assert from "node:assert/strict";
import test from "node:test";

import { createSchedulingAvailabilityRouteHandlers } from "../../app/api/scheduling/availability/route-handler";
import { createSchedulingAvailabilityStore, type SchedulingAvailabilityStore } from "../../features/scheduling/availability-store";
import { schedulingAvailabilitySchema } from "../../shared/api-schema/scheduling-availability";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";

const ALICE = "actor:alice-scheduling", BOB = "actor:bob-scheduling";
const DEFAULTS = {
  weekdays: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "18:00", lunch: null,
  durationMinutes: 60, minimumNotice: "15m", bufferMinutes: 0, timeZoneMode: "device", timeZone: null, updatedAt: null,
};
const VALID = {
  weekdays: ["fri", "mon", "wed"], start: "10:00", end: "18:00", lunch: { start: "12:00", end: "13:00" },
  durationMinutes: 30, minimumNotice: "1d", bufferMinutes: 15, timeZoneMode: "fixed", timeZone: "America/New_York",
};
const put = (body: unknown) => new Request("http://localhost/api/scheduling/availability", {
  method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

async function exercise(storeFor: () => SchedulingAvailabilityStore) {
  let actor: string | null = ALICE;
  const handlers = createSchedulingAvailabilityRouteHandlers({ resolveActor: async () => (actor ? { id: actor } : null), store: storeFor });

  // Never saved → defaults (= the old hard-coded rules).
  const first = await handlers.GET();
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await first.json(), { success: true, data: DEFAULTS });

  // Valid PUT → read back (weekdays stored Monday first).
  const saved = await handlers.PUT(put(VALID));
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.deepEqual({ ...savedBody.data, updatedAt: null }, { ...VALID, weekdays: ["mon", "wed", "fri"], updatedAt: null });
  assert.match(savedBody.data.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  const again = await (await handlers.GET()).json();
  assert.deepEqual(again.data, savedBody.data);
  assert.ok(schedulingAvailabilitySchema.safeParse(again.data).success);

  // Invalid bodies → 400, nothing written.
  const invalid: unknown[] = [
    { ...VALID, start: "18:00", end: "10:00" },
    { ...VALID, start: "10:00", end: "10:00" },
    { ...VALID, lunch: { start: "13:00", end: "12:00" } },
    { ...VALID, lunch: { start: "09:00", end: "10:30" } },
    { ...VALID, lunch: { start: "17:30", end: "18:30" } },
    { ...VALID, weekdays: [] },
    { ...VALID, weekdays: ["mon", "mon"] },
    { ...VALID, weekdays: ["funday"] },
    { ...VALID, durationMinutes: 45 },
    { ...VALID, minimumNotice: "3d" },
    { ...VALID, bufferMinutes: 10 },
    { ...VALID, timeZoneMode: "fixed", timeZone: null },
    { ...VALID, timeZone: "Mars/Olympus" },
    { ...VALID, start: "10:15" },
    { ...VALID, extra: true },
    { ...VALID, lunch: { start: "12:00", end: "13:00", note: "x" } },
    "not an object",
  ];
  for (const body of invalid) {
    const response = await handlers.PUT(put(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
  }
  const broken = await handlers.PUT(new Request("http://localhost/api/scheduling/availability", { method: "PUT", body: "{" }));
  assert.equal(broken.status, 400);
  assert.deepEqual((await (await handlers.GET()).json()).data, savedBody.data);

  // Device mode may keep the last fixed zone or none.
  const device = await handlers.PUT(put({ ...VALID, timeZoneMode: "device", timeZone: null }));
  assert.equal(device.status, 200);
  assert.equal((await device.json()).data.timeZoneMode, "device");

  // Another account reads its own (default) record, never Alice's.
  actor = BOB;
  assert.deepEqual((await (await handlers.GET()).json()).data, DEFAULTS);

  // Signed out → 401 on both verbs.
  actor = null;
  assert.equal((await handlers.GET()).status, 401);
  assert.equal((await handlers.PUT(put(VALID))).status, 401);
}

test("SC-R40-01 GET/PUT with the memory store: defaults, read-back, 400 without writing, per-account, 401", async () => {
  const store = createSchedulingAvailabilityStore({ store: createMemoryLiveRecordStore(), workspaceId: "workspace:scheduling-test" });
  await exercise(() => store);
});

test("SC-R40-01 storage unavailable → 503; a storage failure → 500 without details", async () => {
  const handlers = createSchedulingAvailabilityRouteHandlers({ resolveActor: async () => ({ id: ALICE }), store: () => null });
  const unavailable = await handlers.GET();
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error.context.reason, "SCHEDULING_AVAILABILITY_UNCONFIGURED");
  const failing = createSchedulingAvailabilityRouteHandlers({ resolveActor: async () => ({ id: ALICE }), store: () => ({
    get: async () => { throw new Error("db down"); }, put: async () => { throw new Error("db down"); },
  }) });
  const original = console.error; console.error = () => {};
  try {
    const failed = await failing.GET();
    assert.equal(failed.status, 500);
    assert.doesNotMatch(JSON.stringify(await failed.json()), /db down/);
  } finally { console.error = original; }
});

test("SC-R40-01 GET/PUT against PostgreSQL orbit_records (live store)", databaseTest, async () => {
  await withNetworkDatabase(async ({ client, pool, schema }) => {
    const store = createSchedulingAvailabilityStore({ store: createPostgresLiveRecordStore({ client }), workspaceId: WORKSPACE });
    await exercise(() => store);
    const rows = await pool.query(`select record_id, user_id, collection_name from "${schema}".orbit_records where collection_name = 'schedulingAvailability'`);
    assert.deepEqual(rows.rows, [{ record_id: ALICE, user_id: ALICE, collection_name: "schedulingAvailability" }]);
  });
});
