import assert from "node:assert/strict";
import test from "node:test";

import { createLiveEventAttendeeRosterService } from "../../features/events/attendee-roster/live-service";
import { mockEventAttendeeRosterFixture } from "../../features/events/attendee-roster/fixtures";
import { createLiveEventEncounterNoteService } from "../../features/events/encounter-note/live-service";
import { mockEventEncounterNoteFixture } from "../../features/events/encounter-note/fixtures";
import { createLiveEventGoalAndReadinessService } from "../../features/events/goal-readiness/live-service";
import { mockEventGoalReadinessFixture } from "../../features/events/goal-readiness/fixtures";
import { createLivePostEventContactReviewService } from "../../features/events/post-event-review/live-service";
import { mockPostEventReviewFixture } from "../../features/events/post-event-review/fixtures";
import {
  resolveEventAttendeeRosterService,
  resolveEventEncounterNoteService,
  resolveEventGoalAndReadinessService,
  resolvePostEventContactReviewService,
  resolveWantConnectService,
} from "../../features/events/service-factory";
import {
  createEventCapabilityRecordProvider,
  EVENT_WORK_RECORD_COLLECTIONS,
} from "../../features/events/storage/event-work-record-provider";
import { createLiveWantConnectService } from "../../features/events/want-connect/live-service";
import { mockWantConnectFixture } from "../../features/events/want-connect/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

async function withoutLiveDatabaseEnv(run: () => Promise<void>): Promise<void> {
  const previousEventUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveUrl = process.env.ORBIT_LIVE_DATABASE_URL;
  const previousOrbitUrl = process.env.ORBIT_DATABASE_URL;

  try {
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;
    delete process.env.ORBIT_DATABASE_URL;

    await run();
  } finally {
    if (previousEventUrl === undefined) {
      delete process.env.ORBIT_EVENT_DATABASE_URL;
    } else {
      process.env.ORBIT_EVENT_DATABASE_URL = previousEventUrl;
    }

    if (previousLiveUrl === undefined) {
      delete process.env.ORBIT_LIVE_DATABASE_URL;
    } else {
      process.env.ORBIT_LIVE_DATABASE_URL = previousLiveUrl;
    }

    if (previousOrbitUrl === undefined) {
      delete process.env.ORBIT_DATABASE_URL;
    } else {
      process.env.ORBIT_DATABASE_URL = previousOrbitUrl;
    }
  }
}

test("event child service factories register live and hybrid storage-backed modes", async () => {
  await withoutLiveDatabaseEnv(async () => {
    const resolutions = [
      resolveEventAttendeeRosterService("live"),
      resolveEventAttendeeRosterService("hybrid"),
      resolveEventGoalAndReadinessService("live"),
      resolveEventGoalAndReadinessService("hybrid"),
      resolveEventEncounterNoteService("live"),
      resolveEventEncounterNoteService("hybrid"),
      resolveWantConnectService("live"),
      resolveWantConnectService("hybrid"),
      resolvePostEventContactReviewService("live"),
      resolvePostEventContactReviewService("hybrid"),
    ];

    for (const resolution of resolutions) {
      assert.equal(resolution.success, true);
    }

    const roster = resolutions[0];
    const readiness = resolutions[2];
    const encounter = resolutions[4];
    const wantConnect = resolutions[6];
    const postEvent = resolutions[8];

    assert.equal(roster.success, true);
    assert.equal(readiness.success, true);
    assert.equal(encounter.success, true);
    assert.equal(wantConnect.success, true);
    assert.equal(postEvent.success, true);

    if (
      roster.success &&
      readiness.success &&
      encounter.success &&
      wantConnect.success &&
      postEvent.success
    ) {
      const rosterResult = await roster.service.getAttendeeRoster({
        eventId: "demo-event-1",
      });
      const readinessResult = await readiness.service.getReadiness({
        eventId: "demo-event-1",
      });
      const encounterResult = await encounter.service.createEncounterNote({
        eventId: "demo-event-1",
        contactId: "contact:priya-shah",
        noteText: "Storage-backed note.",
      });
      const wantConnectResult =
        await wantConnect.service.createWantToConnectIntent({
          eventId: "demo-event-1",
          actorContactId: "contact:operator",
          targetContactId: "contact:priya-shah",
        });
      const postEventResult = await postEvent.service.getPostEventReview({
        eventId: "demo-event-1",
      });

      assert.equal(rosterResult.success, false);
      assert.equal(rosterResult.error.code, "EVENT_ATTENDEE_ROSTER_LIVE_STORE_UNCONFIGURED");
      assert.equal(readinessResult.success, false);
      assert.equal(readinessResult.error.code, "EVENT_GOAL_READINESS_LIVE_STORE_UNCONFIGURED");
      assert.equal(encounterResult.success, false);
      assert.equal(encounterResult.error.code, "EVENT_ENCOUNTER_NOTE_LIVE_STORE_UNCONFIGURED");
      assert.equal(wantConnectResult.success, false);
      assert.equal(wantConnectResult.error.code, "WANT_CONNECT_LIVE_STORE_UNCONFIGURED");
      assert.equal(postEventResult.success, false);
      assert.equal(postEventResult.error.code, "POST_EVENT_REVIEW_LIVE_STORE_UNCONFIGURED");
    }
  });
});

test("event child live services read and write shared event work records", async () => {
  const store = createMemoryLiveRecordStore();
  const workspaceId = "workspace:event-child-live";

  const rosterProvider = createEventCapabilityRecordProvider({
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.attendeeRoster,
    store,
    workspaceId,
  });
  const goalProvider = createEventCapabilityRecordProvider({
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.goalReadiness,
    store,
    workspaceId,
  });
  const encounterProvider = createEventCapabilityRecordProvider({
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.encounterNotes,
    store,
    workspaceId,
  });
  const wantConnectProvider = createEventCapabilityRecordProvider({
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.wantConnect,
    store,
    workspaceId,
  });
  const postEventProvider = createEventCapabilityRecordProvider({
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.postEventReview,
    store,
    workspaceId,
  });

  await rosterProvider.upsertPayload("demo-event-1", mockEventAttendeeRosterFixture);
  await goalProvider.upsertPayload("demo-event-1", mockEventGoalReadinessFixture);
  await encounterProvider.upsertPayload("demo-event-1", mockEventEncounterNoteFixture);
  await wantConnectProvider.upsertPayload("demo-event-1", mockWantConnectFixture);
  await postEventProvider.upsertPayload("demo-event-1", mockPostEventReviewFixture);

  const rosterService = createLiveEventAttendeeRosterService({
    provider: rosterProvider,
  });
  const goalService = createLiveEventGoalAndReadinessService({
    provider: goalProvider,
  });
  const encounterService = createLiveEventEncounterNoteService({
    now: () => "2026-07-01T10:00:00.000Z",
    provider: encounterProvider,
  });
  const wantConnectService = createLiveWantConnectService({
    now: () => "2026-07-01T10:05:00.000Z",
    provider: wantConnectProvider,
  });
  const postEventService = createLivePostEventContactReviewService({
    provider: postEventProvider,
  });

  const roster = await rosterService.getAttendeeRoster({
    eventId: "demo-event-1",
    eligibleOnly: "true",
  });
  const importedRoster = await rosterService.importAttendeeRoster({
    eventId: "demo-event-1",
  });
  const updatedGoal = await goalService.setGoal({
    eventId: "demo-event-1",
    goalText: "Meet two storage operators from the live record.",
  });
  const encounter = await encounterService.createEncounterNote({
    eventId: "demo-event-1",
    contactId: "contact:priya-shah",
    noteText: "Priya asked for the live storage follow-up path.",
  });
  const wantConnect = await wantConnectService.createWantToConnectIntent({
    eventId: "demo-event-1",
    actorContactId: "contact:operator",
    targetContactId: "contact:priya-shah",
  });
  const postEventReview = await postEventService.getPostEventReview({
    eventId: "demo-event-1",
  });
  const confirmedContacts = await postEventService.confirmPostEventContacts({
    eventId: "demo-event-1",
    contactDraftIds: ["draft:post-event:priya"],
  });

  assert.equal(roster.success, true);
  assert.equal(roster.data.provenance.source, rosterProvider.source);
  assert.ok(roster.data.attendees.every((attendee) => attendee.eligibleRecommendation.isEligible));
  assert.equal(importedRoster.success, true);
  assert.equal(importedRoster.data.importBatch.liveDatabaseWriteExecuted, true);

  assert.equal(updatedGoal.success, true);
  assert.equal(updatedGoal.data.acceptedGoalText, "Meet two storage operators from the live record.");
  assert.equal(updatedGoal.data.provenance.liveDatabaseWriteExecuted, true);
  assert.equal(
    (await goalProvider.getPayload("demo-event-1"))?.goal?.intent,
    "Meet two storage operators from the live record.",
  );

  assert.equal(encounter.success, true);
  assert.equal(encounter.data.note?.text, "Priya asked for the live storage follow-up path.");
  assert.equal(encounter.data.provenance.liveDatabaseWriteExecuted, true);
  assert.equal(encounter.data.provenance.liveNoteStorageExecuted, true);

  assert.equal(wantConnect.success, true);
  assert.equal(wantConnect.data.intent?.actorContactId, "contact:operator");
  assert.equal(wantConnect.data.provenance.liveDatabaseWriteExecuted, true);

  assert.equal(postEventReview.success, true);
  assert.equal(postEventReview.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(confirmedContacts.success, true);
  assert.equal(confirmedContacts.data.confirmedContacts.length, 1);
  assert.equal(confirmedContacts.data.provenance.liveDatabaseWriteExecuted, true);
});
