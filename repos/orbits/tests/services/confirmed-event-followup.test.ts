import assert from "node:assert/strict";
import test from "node:test";

import { CONFIRMED_EVENT_FOLLOWUP_COLLECTION, createConfirmedEventFollowupService } from "../../features/events/confirmed-followup/service";
import { createStorageFollowupActionWriter } from "../../features/followups/action-writer";
import { createStorageReminderActionWriter } from "../../features/notifications/action-writer";
import type { HumanEncounterRecord } from "../../features/encounters/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const ACTOR = "actor:aiko";
const EVENT = "event:tokyo-ai-night";
const NOW = "2026-08-05T08:00:00.000Z";
const WORKSPACE = "workspace:test";

function encounter(overrides: Partial<HumanEncounterRecord> = {}): HumanEncounterRecord {
  return {
    actorId: ACTOR,
    commitments: ["Send the bilingual unit-economics brief", "Introduce the retail operations lead"],
    connectionId: null,
    contactId: "contact:ren-owned-by-aiko",
    createdAt: "2026-08-05T07:31:00.000Z",
    encounterId: "encounter:aiko-ren",
    eventId: EVENT,
    nextStep: "Review the circular packaging pilot metrics on Friday",
    noteText: "Compared deposit recovery, washing loss, and staff training across eighteen stores.",
    observedAt: "2026-08-05T07:30:00.000Z",
    privacy: "private",
    projection: { attempts: 0, availableAt: NOW, lastError: null, leaseExpiresAt: null, leaseToken: null, status: "pending" },
    requestHash: "hash:aiko-ren",
    talked: "yes",
    tags: ["circular-packaging", "japan-retail"],
    voiceMemoReference: null,
    ...overrides,
  };
}

function fixture(values: readonly HumanEncounterRecord[] = [encounter()]) {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>([{
    collectionName: "contacts",
    createdAt: NOW,
    evidenceIds: ["evidence:contact:ren"],
    lifecycleState: "active",
    payload: {
      displayName: "Ren Hayashi",
      id: "contact:ren-owned-by-aiko",
    },
    recordId: "contact:ren-owned-by-aiko",
    sourceId: "event-contact-request:ren",
    sourceType: "event_import",
    updatedAt: NOW,
    userId: ACTOR,
    workspaceId: WORKSPACE,
  }]);
  const service = createConfirmedEventFollowupService({
    encounters: { async list() { return values; } },
    followups: createStorageFollowupActionWriter({ store, userId: ACTOR, workspaceId: WORKSPACE }),
    now: () => NOW,
    reminders: createStorageReminderActionWriter({ store, userId: ACTOR, workspaceId: WORKSPACE }),
    store,
    workspaceId: WORKSPACE,
  });
  return { service, store };
}

test("lists only explicit actor-owned event evidence with next steps or commitments", async () => {
  const { service } = fixture([
    encounter(),
    encounter({ actorId: "actor:other", encounterId: "encounter:other-actor" }),
    encounter({ eventId: "event:other", encounterId: "encounter:other-event" }),
    encounter({ talked: "no", encounterId: "encounter:not-talked" }),
    encounter({ commitments: [], encounterId: "encounter:no-actions", nextStep: "" }),
  ]);
  const candidates = await service.list({ actorId: ACTOR, eventId: EVENT });
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map((candidate) => [candidate.sourceKind, candidate.sourceIndex, candidate.sourceText]), [
    ["next_step", 0, "Review the circular packaging pilot metrics on Friday"],
    ["commitment", 0, "Send the bilingual unit-economics brief"],
    ["commitment", 1, "Introduce the retail operations lead"],
  ]);
  assert.ok(candidates.every((candidate) => candidate.state === "available"));
  assert.ok(candidates.every((candidate) => candidate.contactDisplayName === "Ren Hayashi"));
  assert.ok(candidates.every((candidate) => candidate.contactHref === "/app/contacts/contact%3Aren-owned-by-aiko"));
});

test("confirmation re-reads evidence and idempotently creates one real task and in-app reminder with provenance", async () => {
  const { service, store } = fixture();
  const request = { actorId: ACTOR, encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 1, sourceKind: "commitment" as const };
  const first = await service.confirm(request);
  const replay = await service.confirm(request);
  assert.deepEqual(replay, first);
  assert.equal(first.state, "created");
  assert.equal(first.sourceText, "Introduce the retail operations lead");
  assert.equal(first.dueAt, "2026-08-08T08:00:00.000Z");

  const tasks = await store.listRecords({ collectionName: "tasks", userId: ACTOR, workspaceId: WORKSPACE });
  const reminders = await store.listRecords({ collectionName: "notifications", userId: ACTOR, workspaceId: WORKSPACE });
  const markers = await store.listRecords({ collectionName: CONFIRMED_EVENT_FOLLOWUP_COLLECTION, userId: ACTOR, workspaceId: WORKSPACE });
  assert.equal(tasks.length, 1);
  assert.equal(reminders.length, 1);
  assert.equal(markers.length, 1);
  assert.equal(tasks[0]?.payload.title, "Introduce the retail operations lead");
  assert.equal(tasks[0]?.sourceType, "agent_action");
  assert.equal(reminders[0]?.payload.channel, "in_app");
  assert.equal(reminders[0]?.payload.status, "pending");
  assert.deepEqual(tasks[0]?.evidenceIds, ["evidence:human-encounter:encounter:aiko-ren"]);
  assert.deepEqual(reminders[0]?.evidenceIds, tasks[0]?.evidenceIds);
  assert.deepEqual(markers[0]?.payload.provenance, {
    actorId: ACTOR,
    encounterId: "encounter:aiko-ren",
    eventId: EVENT,
    evidenceIds: ["evidence:human-encounter:encounter:aiko-ren"],
    kind: "user_confirmed_human_encounter_followup",
    sourceIndex: 1,
    sourceKind: "commitment",
  });
  assert.equal(markers[0]?.payload.taskId, first.taskId);
  assert.equal(markers[0]?.payload.reminderId, first.reminderId);
  assert.equal(markers[0]?.payload.taskHref, "/app/followups");
});

test("rejects forged encounter ownership, stale source references, and a changed due time", async () => {
  const { service } = fixture();
  await assert.rejects(() => service.confirm({ actorId: ACTOR, encounterId: "encounter:forged", eventId: EVENT, sourceIndex: 0, sourceKind: "next_step" }), /No eligible human encounter evidence/);
  await assert.rejects(() => service.confirm({ actorId: ACTOR, encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 8, sourceKind: "commitment" }), /no longer present/);
  await service.confirm({ actorId: ACTOR, dueAt: "2026-08-09T09:00:00.000Z", encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 0, sourceKind: "next_step" });
  await assert.rejects(() => service.confirm({ actorId: ACTOR, dueAt: "2026-08-10T09:00:00.000Z", encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 0, sourceKind: "next_step" }), /different due time/);
});

test("a retry heals a task persisted before a transient reminder failure without duplicating either record", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const actualReminderWriter = createStorageReminderActionWriter({ store, userId: ACTOR, workspaceId: WORKSPACE });
  let failOnce = true;
  const service = createConfirmedEventFollowupService({
    encounters: { async list() { return [encounter()]; } },
    followups: createStorageFollowupActionWriter({ store, userId: ACTOR, workspaceId: WORKSPACE }),
    now: () => NOW,
    reminders: {
      async createReminder(input) {
        if (failOnce) { failOnce = false; throw new Error("transient reminder store failure"); }
        return actualReminderWriter.createReminder(input);
      },
      removeReminder: actualReminderWriter.removeReminder,
    },
    store,
    workspaceId: WORKSPACE,
  });
  const request = { actorId: ACTOR, encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 0, sourceKind: "commitment" as const };
  await assert.rejects(() => service.confirm(request), /transient reminder store failure/);
  assert.equal((await store.listRecords({ collectionName: CONFIRMED_EVENT_FOLLOWUP_COLLECTION, workspaceId: WORKSPACE })).length, 1);
  assert.equal((await store.listRecords({ collectionName: "tasks", workspaceId: WORKSPACE })).length, 1);
  assert.equal((await store.listRecords({ collectionName: "notifications", workspaceId: WORKSPACE })).length, 0);
  const healed = await service.confirm(request);
  assert.equal(healed.state, "created");
  assert.equal((await store.listRecords({ collectionName: "tasks", workspaceId: WORKSPACE })).length, 1);
  assert.equal((await store.listRecords({ collectionName: "notifications", workspaceId: WORKSPACE })).length, 1);
});

test("reads terminal and scheduled task/reminder states without reopening or repairing completed and dismissed work", async () => {
  const { service, store } = fixture();
  const completed = await service.confirm({ actorId: ACTOR, encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 0, sourceKind: "next_step" });
  const completedTask = await store.getRecord({ collectionName: "tasks", recordId: completed.taskId, workspaceId: WORKSPACE });
  const failedReminder = await store.getRecord({ collectionName: "notifications", recordId: completed.reminderId, workspaceId: WORKSPACE });
  assert.ok(completedTask && failedReminder);
  await store.upsertRecord({ ...completedTask, payload: { ...completedTask.payload, status: "completed" }, updatedAt: "2026-08-05T09:00:00.000Z" });
  await store.upsertRecord({ ...failedReminder, payload: { ...failedReminder.payload, status: "failed" }, updatedAt: "2026-08-05T09:00:00.000Z" });
  const completedReplay = await service.confirm({ actorId: ACTOR, encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 0, sourceKind: "next_step" });
  assert.equal(completedReplay.state, "completed");
  assert.equal(completedReplay.taskStatus, "completed");
  assert.equal(completedReplay.reminderStatus, "failed", "terminal task does not reopen a failed reminder");

  const dismissed = await service.confirm({ actorId: ACTOR, encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 1, sourceKind: "commitment" });
  const dismissedTask = await store.getRecord({ collectionName: "tasks", recordId: dismissed.taskId, workspaceId: WORKSPACE });
  assert.ok(dismissedTask);
  await store.upsertRecord({ ...dismissedTask, payload: { ...dismissedTask.payload, status: "dismissed" }, updatedAt: "2026-08-05T09:05:00.000Z" });
  const dismissedReplay = await service.confirm({ actorId: ACTOR, encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 1, sourceKind: "commitment" });
  assert.equal(dismissedReplay.state, "dismissed");
  assert.equal(dismissedReplay.taskStatus, "dismissed");

  const scheduled = await service.confirm({ actorId: ACTOR, encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 0, sourceKind: "commitment" });
  const scheduledTask = await store.getRecord({ collectionName: "tasks", recordId: scheduled.taskId, workspaceId: WORKSPACE });
  const sentReminder = await store.getRecord({ collectionName: "notifications", recordId: scheduled.reminderId, workspaceId: WORKSPACE });
  assert.ok(scheduledTask && sentReminder);
  await store.upsertRecord({ ...scheduledTask, payload: { ...scheduledTask.payload, status: "scheduled" }, updatedAt: "2026-08-05T09:10:00.000Z" });
  await store.upsertRecord({ ...sentReminder, payload: { ...sentReminder.payload, status: "sent" }, updatedAt: "2026-08-05T09:10:00.000Z" });
  const scheduledView = (await service.list({ actorId: ACTOR, eventId: EVENT })).find((item) => item.taskId === scheduled.taskId);
  assert.equal(scheduledView?.state, "created");
  assert.equal(scheduledView?.taskStatus, "scheduled");
  assert.equal(scheduledView?.reminderStatus, "sent");
});

test("rejects a deterministic marker with the wrong actor or event target boundary", async () => {
  const { service, store } = fixture();
  const created = await service.confirm({ actorId: ACTOR, encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 0, sourceKind: "next_step" });
  const markers = await store.listRecords({ collectionName: CONFIRMED_EVENT_FOLLOWUP_COLLECTION, userId: ACTOR, workspaceId: WORKSPACE });
  assert.equal(markers.length, 1);
  await store.upsertRecord({ ...markers[0]!, targetId: "event:wrong" });
  await assert.rejects(() => service.confirm({ actorId: ACTOR, encounterId: "encounter:aiko-ren", eventId: EVENT, sourceIndex: 0, sourceKind: "next_step" }), /different evidence/);
  assert.equal((await store.getRecord({ collectionName: "tasks", recordId: created.taskId, workspaceId: WORKSPACE }))?.payload.status, "open");
});
