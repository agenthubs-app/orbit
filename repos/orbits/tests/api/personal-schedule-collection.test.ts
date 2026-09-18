import assert from "node:assert/strict";
import test from "node:test";
import { createScheduleItemsGetHandler } from "../../app/api/schedule-items/handler";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createScheduleAuthorityService } from "../../features/personal-schedule/authority-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { personalScheduleSchema } from "../../shared/api-schema/personal-schedule";

test("explicit personal scope does not decode legacy display-only personal rows as editable records", async () => {
  const service = createPersonalScheduleService({ store: createMemoryLiveRecordStore(), workspaceId: "s0042" });
  const dependencies = {
    resolveActor: async () => ({ id: "actor:a" }),
    personalService: service,
    scheduleProvider: { async list() { return [{ id: "legacy:personal", sourceId: "legacy:personal", kind: "personal" as const, category: "personal" as const, title: "Legacy display item", startsAt: "2026-09-17T00:00:00Z", state: "upcoming" as const }]; } },
  };
  const handler = createScheduleItemsGetHandler(dependencies) as (request?: Request) => Promise<Response>;
  const scoped = await handler(new Request("https://orbit.test/api/schedule-items?scope=personal"));
  assert.equal(scoped.status, 200);
  assert.deepEqual((await scoped.json()).data.scheduleItems, []);
  const aggregated = await handler(new Request("https://orbit.test/api/schedule-items"));
  assert.equal((await aggregated.json()).data.scheduleItems[0].id, "legacy:personal");
});

test("web personal client requests the editable collection rather than the legacy aggregate", async () => {
  const { createPersonalScheduleClient } = await import("../../app/(app)/app/tasks/personal-schedule-client");
  const service = createPersonalScheduleService({ store: createMemoryLiveRecordStore(), workspaceId: "s0042", now: () => "2026-09-16T00:00:00Z" });
  const created = await service.create("actor:a", { title: "Owned review", startsAt: "2026-09-17T00:00:00Z", idempotencyKey: "web-read" });
  const handler = createScheduleItemsGetHandler({ resolveActor: async () => ({ id: "actor:a" }), personalService: service, scheduleProvider: { async list() { return [{ id: "legacy:personal", sourceId: "legacy:personal", kind: "personal", category: "personal", title: "Legacy", startsAt: "2026-09-17T00:00:00Z", state: "upcoming" }]; } } });
  const client = createPersonalScheduleClient("actor:a", async input => handler(new Request(new URL(String(input), "https://orbit.test"))));
  assert.deepEqual(await client.list(), [created.scheduleItem]);
});

test("personal collection reads owned items when authority also contains a valid event", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createPersonalScheduleService({ store, workspaceId: "s0042", now: () => "2026-09-16T00:00:00Z" });
  const created = await service.create("actor:a", { title: "Personal review", startsAt: "2026-09-17T00:00:00Z", idempotencyKey: "create" });
  await createScheduleAuthorityService({ store, workspaceId: "s0042" }).saveEvent({ actorId: "actor:a", id: "schedule:event", eventId: "event:a", title: "Event", startsAt: "2026-09-17T00:00:00Z", evidenceIds: ["evidence:a"] });
  store.upsertRecord({ workspaceId: "s0042", collectionName: "personal_schedule_items", recordId: "schedule:meeting", userId: "actor:a", sourceType: "agent_action", sourceId: "meeting:a", evidenceIds: [], createdAt: "2026-09-16T00:00:00Z", updatedAt: "2026-09-16T00:00:00Z", lifecycleState: "active", payload: {
    id: "schedule:meeting", sourceId: "meeting:a", meetingId: "meeting:a", accountId: "actor:a", ownerUserId: "actor:a", kind: "meeting", category: "meeting", title: "Meeting", startsAt: "2026-09-17T00:00:00Z", createdAt: "2026-09-16T00:00:00Z", updatedAt: "2026-09-16T00:00:00Z", state: "upcoming", evidenceIds: [],
  } });
  const handler = createScheduleItemsGetHandler({ resolveActor: async () => ({ id: "actor:a" }), scheduleProvider: service });
  const response = await handler();
  assert.equal(response.status, 200);
  const items = (await response.json()).data.scheduleItems;
  assert.deepEqual(items, [created.scheduleItem]);
  assert.equal(personalScheduleSchema.safeParse(items[0]).success, true);
  assert.deepEqual(await service.list({ actorId: "actor:b" }), []);
});

for (const damage of ["record-id", "record-source", "payload-source", "owner", "version", "duplicate", "unknown-field"] as const) {
  test(`personal collection fails visibly for ${damage} damage`, async () => {
    const store = createMemoryLiveRecordStore<Record<string, unknown>>();
    const service = createPersonalScheduleService({ store, workspaceId: "s0042", now: () => "2026-09-16T00:00:00Z" });
    await service.create("actor:a", { title: "Personal review", startsAt: "2026-09-17T00:00:00Z", idempotencyKey: "create" });
    const records = store.listRecords({ limit: "unbounded", workspaceId: "s0042", collectionName: "personal_schedule_items", userId: "actor:a" });
    const row = records[0]!;
    if (damage === "record-id") row.recordId = "wrong-id";
    if (damage === "record-source") row.sourceId = "wrong-source";
    if (damage === "payload-source") row.payload.sourceId = "wrong-source";
    if (damage === "owner") row.payload.ownerUserId = "actor:b";
    if (damage === "version") row.payload.updatedAt = "2026-09-15T00:00:00Z";
    if (damage === "unknown-field") row.payload.secret = "must-not-pass";
    // The injected storage boundary models a corrupt row/query result; the
    // actual collection handler and business service still perform validation.
    store.listRecords = () => damage === "duplicate" ? [row, row] : [row];
    const handler = createScheduleItemsGetHandler({ resolveActor: async () => ({ id: "actor:a" }), scheduleProvider: service });
    const response = await handler();
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.data, undefined);
  });
}
