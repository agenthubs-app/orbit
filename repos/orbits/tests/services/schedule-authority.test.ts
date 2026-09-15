import assert from "node:assert/strict";
import test from "node:test";

import { createScheduleAuthorityService } from "../../features/personal-schedule/authority-service";
import { dryRunScheduleMigration, planScheduleMigrationDryRun } from "../../features/personal-schedule/migration";
import { orbitScheduleItemFromLiveRecord } from "../../features/events/orbit-schedule-reader";
import { parseScheduleAuthorityMigrationCommand } from "../../scripts/migrate-schedule-authority";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";

const NOW = "2026-09-15T04:00:00.000Z";

function record(input: {
  collectionName: "orbitScheduleItems" | "personal_schedule_items";
  id: string;
  actorId?: string;
  title?: string;
  startsAt?: string;
}): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: input.collectionName,
    createdAt: NOW,
    evidenceIds: [],
    lifecycleState: "active",
    payload: {
      accountId: input.actorId,
      category: "event",
      createdAt: NOW,
      eventId: `event:${input.id}`,
      evidenceIds: [],
      id: input.id,
      kind: "event",
      ownerUserId: input.actorId,
      sourceId: `event:${input.id}`,
      startsAt: input.startsAt ?? "2026-09-16T01:00:00.000Z",
      state: "upcoming",
      title: input.title ?? input.id,
      updatedAt: NOW,
    },
    recordId: input.id,
    sourceId: input.id,
    sourceType: "agent_action",
    updatedAt: NOW,
    userId: input.actorId,
    workspaceId: "schedule-authority-test",
  };
}

test("event actions persist canonical schedule items with actor-scoped details", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createScheduleAuthorityService({ store, workspaceId: "schedule-authority-test" });
  await service.saveEvent({
    actorId: "actor:a",
    allDay: true,
    details: "Bring the signed agenda",
    endsAt: "2026-09-16T02:00:00.000Z",
    eventId: "event:one",
    evidenceIds: ["evidence:one"],
    id: "schedule:one",
    location: "Tokyo",
    meetingMethod: "in_person",
    startsAt: "2026-09-16T01:00:00.000Z",
    title: "Partner meeting",
    timeZone: "Asia/Tokyo",
  });

  await service.saveEvent({
    actorId: "actor:a",
    allDay: true,
    details: "Bring the signed agenda",
    endsAt: "2026-09-16T02:00:00.000Z",
    eventId: "event:one",
    evidenceIds: ["evidence:one"],
    id: "schedule:one",
    location: "Tokyo",
    meetingMethod: "in_person",
    startsAt: "2026-09-16T01:00:00.000Z",
    title: "Partner meeting",
    timeZone: "Asia/Tokyo",
  });

  const actorItems = await service.list({ actorId: "actor:a" });
  assert.equal(actorItems.length, 1);
  assert.deepEqual(
    {
      collection: (await store.listRecords({ workspaceId: "schedule-authority-test" }))[0]?.collectionName,
      eventId: actorItems[0]?.eventId,
      meetingMethod: actorItems[0]?.meetingMethod,
      details: actorItems[0]?.details,
      allDay: actorItems[0]?.allDay,
      timeZone: actorItems[0]?.timeZone,
    },
    {
      collection: "personal_schedule_items",
      eventId: "event:one",
      meetingMethod: "in_person",
      details: "Bring the signed agenda",
      allDay: true,
      timeZone: "Asia/Tokyo",
    },
  );
  assert.deepEqual(await service.list({ actorId: "actor:b" }), []);
  const persisted = await store.getRecord({
    collectionName: "personal_schedule_items",
    recordId: "schedule:one",
    workspaceId: "schedule-authority-test",
  });
  assert.equal(orbitScheduleItemFromLiveRecord(persisted!, "actor:a")?.details, "Bring the signed agenda");
  assert.equal(orbitScheduleItemFromLiveRecord(persisted!, "actor:b"), null);
  await assert.rejects(
    service.saveEvent({
      actorId: "actor:a",
      eventId: "event:one",
      evidenceIds: [],
      id: "schedule:one",
      startsAt: "2026-09-16T01:00:00.000Z",
      title: "Conflicting title",
    }),
    /different content/,
  );
  await service.cancel({ actorId: "actor:a", id: "schedule:one" });
  assert.deepEqual(await service.list({ actorId: "actor:a" }), []);
});

test("schedule migration dry-run classifies migration, duplicate, conflict, orphan, and foreign rows without writes", async () => {
  const canonical = record({ collectionName: "personal_schedule_items", id: "same", actorId: "actor:a" });
  const legacy = [
    record({ collectionName: "orbitScheduleItems", id: "new", actorId: "actor:a" }),
    record({ collectionName: "orbitScheduleItems", id: "same", actorId: "actor:a" }),
    record({ collectionName: "orbitScheduleItems", id: "conflict", actorId: "actor:a", title: "legacy title" }),
    record({ collectionName: "orbitScheduleItems", id: "orphan" }),
    record({ collectionName: "orbitScheduleItems", id: "foreign", actorId: "actor:b" }),
  ];
  const canonicalConflict = record({ collectionName: "personal_schedule_items", id: "conflict", actorId: "actor:a", title: "canonical title" });
  const plan = planScheduleMigrationDryRun({ actorId: "actor:a", canonicalRecords: [canonical, canonicalConflict], legacyRecords: legacy });
  assert.deepEqual(plan.counts, {
    conflict: 1,
    duplicate: 1,
    foreign: 1,
    migratable: 1,
    orphan: 1,
  });
  assert.deepEqual(plan.migratableIds, ["new"]);

  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  for (const item of [canonical, canonicalConflict, ...legacy]) await store.upsertRecord(item);
  const before = await store.listRecords({ workspaceId: "schedule-authority-test" });
  const result = await dryRunScheduleMigration({ actorId: "actor:a", store, workspaceId: "schedule-authority-test" });
  const after = await store.listRecords({ workspaceId: "schedule-authority-test" });
  assert.deepEqual(result.counts, plan.counts);
  assert.deepEqual(after, before);
});

test("schedule migration command accepts dry-run only and requires an actor", () => {
  assert.deepEqual(
    parseScheduleAuthorityMigrationCommand(["--dry-run", "--actor-id", "actor:a"]),
    { actorId: "actor:a", mode: "dry-run" },
  );
  for (const argv of [
    [],
    ["--actor-id", "actor:a"],
    ["--apply", "--actor-id", "actor:a"],
    ["--dry-run"],
    ["--dry-run", "--actor-id", ""],
    ["--dry-run", "--actor-id", "actor:a", "--unknown"],
  ]) {
    assert.throws(() => parseScheduleAuthorityMigrationCommand(argv));
  }
});
