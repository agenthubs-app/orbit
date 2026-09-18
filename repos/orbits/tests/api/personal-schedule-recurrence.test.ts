import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createPersonalScheduleHandlers } from "../../app/api/schedule-items/personal-handler";
import { createScheduleItemsGetHandler } from "../../app/api/schedule-items/handler";

function fixture() {
  const store = createMemoryLiveRecordStore();
  let actorId = "owner";
  const service = createPersonalScheduleService({ store, workspaceId: "recurrence-60", now: () => "2026-09-17T08:00:00Z" });
  const dependencies = { service, resolveActor: async () => ({ id: actorId }) };
  const handlers = createPersonalScheduleHandlers(dependencies);
  const list = createScheduleItemsGetHandler({ ...dependencies, personalService: service });
  const request = (method: string, body?: object, version = "3", query = "") => new Request(`https://orbit.test/api/schedule-items${query}`, { method, headers: { "x-orbit-personal-schedule-version": version }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const fields = { title: "Recurring meeting", startsAt: "2026-09-18T09:00:37Z", endsAt: "2026-09-18T10:00:37Z", timeZone: "Asia/Tokyo", reminderMinutes: 15, recurrence: { frequency: "daily", until: "2026-09-20" }, idempotencyKey: "create-series" };
  return { store, service, handlers, list, request, context, fields, setActor: (id: string) => { actorId = id; } };
}

test("v3 rules persist through independent GET and expose stable bounded future occurrences", async () => {
  const f = fixture();
  const response = await f.handlers.POST(f.request("POST", f.fields));
  assert.equal(response.status, 201);
  const item = (await response.json()).data.scheduleItem;
  const read = (await (await f.handlers.GET(f.request("GET"), f.context(item.id))).json()).data.scheduleItem;
  assert.deepEqual(read.recurrence, f.fields.recurrence);
  assert.equal(read.reminderMinutes, 15);
  const query = "?scope=personal&from=2026-09-18T00:00:00Z&to=2026-09-22T00:00:00Z";
  const result = await f.list(f.request("GET", undefined, "3", query));
  assert.equal(result.status, 200);
  const instances = (await result.json()).data.scheduleItems;
  assert.equal(instances.length, 3);
  assert.deepEqual(instances.map((instance: { startsAt: string }) => instance.startsAt), ["2026-09-18T09:00:37.000Z", "2026-09-19T09:00:37.000Z", "2026-09-20T09:00:37.000Z"]);
  assert.equal(instances[1].seriesId, item.id);
  const detail = await f.handlers.GET(f.request("GET"), f.context(instances[1].id));
  assert.equal(detail.status, 200);
  assert.deepEqual((await detail.json()).data.scheduleItem, instances[1]);
  f.setActor("other");
  assert.equal((await f.handlers.GET(f.request("GET"), f.context(instances[1].id))).status, 404);
});

test("old representations hide rules and old mutations cannot implicitly edit a repeated series", async () => {
  const f = fixture();
  const response = await f.handlers.POST(f.request("POST", f.fields));
  assert.equal(response.status, 201);
  const item = (await response.json()).data.scheduleItem;
  for (const version of ["1", "2"]) {
    const read = (await (await f.handlers.GET(f.request("GET", undefined, version), f.context(item.id))).json()).data.scheduleItem;
    assert.equal(Object.hasOwn(read, "recurrence"), false);
    assert.equal(Object.hasOwn(read, "reminderMinutes"), false);
    assert.equal((await f.handlers.PATCH(f.request("PATCH", { expectedUpdatedAt: item.updatedAt, idempotencyKey: `old-${version}`, patch: { title: "Implicit scope" } }, version), f.context(item.id))).status, 400);
  }
  const edited = await f.handlers.PATCH(f.request("PATCH", { expectedUpdatedAt: item.updatedAt, idempotencyKey: "explicit-series", scope: "series", patch: { title: "Renamed" } }), f.context(item.id));
  assert.equal(edited.status, 200);
  const read = (await (await f.handlers.GET(f.request("GET"), f.context(item.id))).json()).data.scheduleItem;
  assert.deepEqual(read.recurrence, f.fields.recurrence);
  assert.equal(read.reminderMinutes, 15);
});

test("a single occurrence reschedule/cancellation persists, leaves siblings unchanged, and uses CAS", async () => {
  const f = fixture();
  const response = await f.handlers.POST(f.request("POST", f.fields));
  assert.equal(response.status, 201);
  const item = (await response.json()).data.scheduleItem;
  const occurrenceId = `${item.id}:occurrence:2026-09-19`;
  const command = { expectedUpdatedAt: item.updatedAt, idempotencyKey: "move-once", scope: "occurrence", patch: { startsAt: "2026-09-19T11:00:37Z", endsAt: "2026-09-19T12:00:37Z" } };
  const moved = await f.handlers.PATCH(f.request("PATCH", command), f.context(occurrenceId));
  assert.equal(moved.status, 200);
  const current = (await moved.json()).data.scheduleItem;
  const independent = (await (await f.handlers.GET(f.request("GET"), f.context(occurrenceId))).json()).data.scheduleItem;
  assert.equal(Date.parse(independent.startsAt), Date.parse(command.patch.startsAt));
  const sibling = (await (await f.handlers.GET(f.request("GET"), f.context(`${item.id}:occurrence:2026-09-20`))).json()).data.scheduleItem;
  assert.equal(sibling.startsAt, "2026-09-20T09:00:37.000Z");
  assert.equal((await f.handlers.PATCH(f.request("PATCH", { ...command, idempotencyKey: "stale" }), f.context(occurrenceId))).status, 409);
  const cancel = { expectedUpdatedAt: current.updatedAt, idempotencyKey: "cancel-once", scope: "occurrence" };
  assert.equal((await f.handlers.DELETE(f.request("DELETE", cancel), f.context(occurrenceId))).status, 200);
  assert.equal((await f.handlers.GET(f.request("GET"), f.context(occurrenceId))).status, 404);
  assert.equal((await f.handlers.GET(f.request("GET"), f.context(`${item.id}:occurrence:2026-09-20`))).status, 200);
  // A late receipt replay must not execute the old mutation again.
  assert.equal((await f.handlers.PATCH(f.request("PATCH", command), f.context(occurrenceId))).status, 200);
  assert.equal((await f.handlers.GET(f.request("GET"), f.context(occurrenceId))).status, 404);
});

test("an invalid instance window returns validation failure rather than a server outage", async () => {
  const f = fixture();
  const result = await f.list(f.request("GET", undefined, "3", "?scope=personal&from=invalid&to=2026-09-22T00:00:00Z"));
  assert.equal(result.status, 400);
});

test("an explicit list window excludes nonrepeating schedules outside that window", async () => {
  const f = fixture();
  await f.service.create("owner", { title: "Old single", startsAt: "2026-09-01T09:00:00Z", idempotencyKey: "old-single" });
  const response = await f.list(f.request("GET", undefined, "3", "?scope=personal&from=2026-09-18T00:00:00Z&to=2026-09-22T00:00:00Z"));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.scheduleItems, []);
});

test("a repeated ambiguous local time fails validation before persisting a partial schedule", async () => {
  const f = fixture();
  const result = await f.handlers.POST(f.request("POST", { ...f.fields, startsAt: "2026-10-31T05:30:00Z", endsAt: "2026-10-31T06:30:00Z", timeZone: "America/New_York", recurrence: { frequency: "daily", until: "2026-11-02" } }));
  assert.equal(result.status, 400);
  assert.equal(f.store.listRecords({ limit: "unbounded", workspaceId: "recurrence-60", collectionName: "personal_schedule_items" }).length, 0);
});

test("the windowless Today caller retains today's started recurring instances and readable details", async () => {
  const f = fixture();
  const { scheduleItem: item } = await f.service.create("owner", { ...f.fields, reminderMinutes: 15, startsAt: "2026-09-17T07:00:37Z", endsAt: "2026-09-17T09:00:37Z", recurrence: { frequency: "daily", until: "2026-09-18" } });
  const instances = await f.service.list({ actorId: "owner" });
  const ongoing = instances.find(instance => instance.id === `${item.id}:occurrence:2026-09-17`);
  assert.ok(ongoing);
  assert.equal(ongoing.state, "ongoing");
  assert.deepEqual(await f.service.get({ actorId: "owner", id: ongoing.id }), ongoing);
  const explicit = await f.service.list({ actorId: "owner", from: "2026-09-17T08:00:00Z", to: "2026-09-17T14:00:00Z" });
  assert.deepEqual(explicit, []); // Explicit windows remain start-in-half-open-window.
});

test("windowless daily visibility includes ended-today, all-day and cross-day ongoing instances", async () => {
  const f = fixture();
  const cases = [
    { key: "ended-today", startsAt: "2026-09-17T00:00:00Z", endsAt: "2026-09-17T01:00:00Z", date: "2026-09-17", state: "ended", allDay: false },
    { key: "all-day", startsAt: "2026-09-16T15:00:00Z", endsAt: "2026-09-17T15:00:00Z", date: "2026-09-17", state: "ongoing", allDay: true },
    { key: "cross-day", startsAt: "2026-09-16T14:00:00Z", endsAt: "2026-09-17T10:00:00Z", date: "2026-09-16", state: "ongoing", allDay: false },
  ];
  for (const c of cases) {
    const { scheduleItem: item } = await f.service.create("owner", { ...f.fields, reminderMinutes: 15, startsAt: c.startsAt, endsAt: c.endsAt, allDay: c.allDay, idempotencyKey: c.key, recurrence: { frequency: "daily", until: "2026-09-18" } });
    const instances = await f.service.list({ actorId: "owner" });
    assert.equal(instances.find(instance => instance.id === `${item.id}:occurrence:${c.date}`)?.state, c.state, c.key);
    assert.equal(instances.some(instance => instance.seriesId === item.id && instance.occurrenceDate! < "2026-09-17" && instance.state === "ended"), false);
  }
});
