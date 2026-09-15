import assert from "node:assert/strict";
import test from "node:test";

import { createOrbitScheduleMeetingDetailsService } from "../../features/events/orbit-schedule-meeting-details";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const ACTOR = "account:owner";
const OTHER = "account:other";
const WORKSPACE = "workspace:meeting-details";

function record(userId = ACTOR) {
  return {
    collectionName: "orbitScheduleItems",
    createdAt: "2026-09-10T00:00:00.000Z",
    evidenceIds: [],
    lifecycleState: "active" as const,
    occurredAt: "2026-09-15T06:30:00.000Z",
    payload: {
      accountId: userId,
      category: "meeting",
      endsAt: "2026-09-15T07:30:00.000Z",
      eventId: "seed:meeting",
      id: "seed:meeting",
      kind: "meeting",
      location: "Orbit 办公室",
      relatedContactId: "contact:emma",
      sourceId: "seed:meeting",
      startsAt: "2026-09-15T06:30:00.000Z",
      title: "与艾玛推进企业 AI 合作",
    },
    provider: "xiaoyu-planner",
    providerRecordId: "customer-meeting",
    recordId: "seed:meeting",
    sourceId: "xiaoyu-planner:customer-meeting",
    sourceType: "manual",
    updatedAt: "2026-09-10T00:00:00.000Z",
    userId,
    workspaceId: WORKSPACE,
  };
}

test("legacy schedule meetings expose private details and persist an exact idempotent edit", async () => {
  const store = createMemoryLiveRecordStore([record()]);
  const service = createOrbitScheduleMeetingDetailsService({
    now: () => "2026-09-15T08:00:00.000Z",
    store,
    workspaceId: WORKSPACE,
  });

  const before = await service.get({ actorId: ACTOR, meetingId: "seed:meeting" });
  assert.deepEqual({
    appointmentId: before.appointmentId,
    contactId: before.contactId,
    details: before.details,
    title: before.title,
    version: before.version,
    visibility: before.visibility,
  }, {
    appointmentId: "seed:meeting",
    contactId: "contact:emma",
    details: "",
    title: "与艾玛推进企业 AI 合作",
    version: 1,
    visibility: "private",
  });

  const saved = await service.updateDetails({
    actorId: ACTOR,
    details: " 准备报价\r\n确认决策人 ",
    expectedVersion: 1,
    idempotencyKey: "legacy-details-1",
    meetingId: "seed:meeting",
  });
  assert.equal(saved.appointment.details, "准备报价\n确认决策人");
  assert.equal(saved.appointment.detailsUpdatedBy, "you");
  assert.equal(saved.appointment.version, 2);
  assert.equal(saved.replayed, false);
  assert.equal((await service.updateDetails({ actorId: ACTOR, details: " 准备报价\r\n确认决策人 ", expectedVersion: 1, idempotencyKey: "legacy-details-1", meetingId: "seed:meeting" })).replayed, true);
  await assert.rejects(() => service.get({ actorId: OTHER, meetingId: "seed:meeting" }), /not found/i);
  await assert.rejects(() => service.updateDetails({ actorId: ACTOR, details: "过期覆盖", expectedVersion: 1, idempotencyKey: "legacy-details-2", meetingId: "seed:meeting" }), /version/i);
});
