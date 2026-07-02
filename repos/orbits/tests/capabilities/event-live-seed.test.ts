import assert from "node:assert/strict";
import test from "node:test";

import { createLiveEventAttendeeRosterService } from "../../features/events/attendee-roster/live-service";
import { createLiveEventCrudAndImportService } from "../../features/events/event-crud-and-import/live-service";
import { createStorageEventStoreProvider } from "../../features/events/event-crud-and-import/providers/storage-event-provider";
import { createLiveEventGoalAndReadinessService } from "../../features/events/goal-readiness/live-service";
import { createLiveEventEncounterNoteService } from "../../features/events/encounter-note/live-service";
import { createLivePostEventContactReviewService } from "../../features/events/post-event-review/live-service";
import {
  createEventCapabilityRecordProvider,
  EVENT_WORK_RECORD_COLLECTIONS,
} from "../../features/events/storage/event-work-record-provider";
import {
  EVENT_LIVE_SEED_COLLECTIONS,
  seedEventsMockDataIntoLiveStore,
} from "../../features/events/storage/seed-live-events";
import { createLiveWantConnectService } from "../../features/events/want-connect/live-service";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("events live seed writes all mock event datasets into live record storage", async () => {
  const store = createMemoryLiveRecordStore();
  const workspaceId = "workspace:event-live-seed-test";

  const firstSeed = await seedEventsMockDataIntoLiveStore({
    now: () => "2026-07-01T12:00:00.000Z",
    store,
    workspaceId,
  });
  const secondSeed = await seedEventsMockDataIntoLiveStore({
    now: () => "2026-07-01T12:00:00.000Z",
    store,
    workspaceId,
  });

  assert.deepEqual(
    firstSeed.collections.map((collection) => collection.collectionName),
    EVENT_LIVE_SEED_COLLECTIONS,
  );
  const expectedTotalRecords = defaultMockFixtures.events.length + 8;
  assert.equal(firstSeed.totalRecords, expectedTotalRecords);
  assert.equal(secondSeed.totalRecords, expectedTotalRecords);

  const eventRecords = store.listRecords({
    workspaceId,
    collectionName: "events",
  });
  assert.deepEqual(
    eventRecords.map((record) => record.recordId).sort(),
    [
      "demo-event-1",
      "demo-event-2",
      ...defaultMockFixtures.events.map((event) => event.id),
      "event:manual:founder-investor-salon",
    ].sort(),
  );
  const generatedEventRecord = eventRecords.find(
    (record) => record.recordId === "event_01",
  );
  assert.ok(generatedEventRecord);
  const generatedEventTitle = generatedEventRecord.payload.title;
  assert.equal(typeof generatedEventTitle, "string");
  assert.match(generatedEventTitle, /東京インバウンド飲食店成長会/);
  assert.equal(generatedEventRecord.sourceType, "event_import");

  const allRecords = store.listRecords({ workspaceId });
  assert.equal(allRecords.length, expectedTotalRecords);

  const eventService = createLiveEventCrudAndImportService({
    provider: createStorageEventStoreProvider({
      store,
      workspaceId,
    }),
  });
  const events = await eventService.listEvents();

  assert.equal(events.success, true);
  assert.equal(events.data.events.length, defaultMockFixtures.events.length + 3);
  assert.equal(events.data.provenance.generationMethod, "live-store-query");
  assert.ok(
    events.data.events.some(
      (event) =>
        event.id === "event_signup_01" &&
        event.title.includes("関西越境ビジネス申込テスト会"),
    ),
  );

  const attendeeProvider = createEventCapabilityRecordProvider({
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

  const roster = await createLiveEventAttendeeRosterService({
    provider: attendeeProvider,
  }).getAttendeeRoster({ eventId: "demo-event-1" });
  const readiness = await createLiveEventGoalAndReadinessService({
    provider: goalProvider,
  }).getReadiness({ eventId: "demo-event-1" });
  const encounter = await createLiveEventEncounterNoteService({
    provider: encounterProvider,
  }).createEncounterNote({
    eventId: "demo-event-1",
    contactId: "contact:priya-shah",
    noteText: "Seed verification note.",
  });
  const matches = await createLiveWantConnectService({
    provider: wantConnectProvider,
  }).listMatches({ eventId: "demo-event-1" });
  const review = await createLivePostEventContactReviewService({
    provider: postEventProvider,
  }).getPostEventReview({ eventId: "demo-event-1" });

  assert.equal(roster.success, true);
  assert.equal(readiness.success, true);
  assert.equal(encounter.success, true);
  assert.equal(matches.success, true);
  assert.equal(matches.data.matches.length, 1);
  assert.equal(review.success, true);
  assert.equal(review.data.contacts.length, 2);
});
