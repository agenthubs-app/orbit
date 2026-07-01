import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveEventCrudAndImportService,
  type LiveEventStoreProvider,
  type LiveEventStoreRecord,
} from "../../features/events/event-crud-and-import/live-service";
import { createStorageEventStoreProvider } from "../../features/events/event-crud-and-import/providers/storage-event-provider";
import {
  resolveEventAttendeeRosterService,
  resolveEventCrudAndImportService,
  resolveEventEncounterNoteService,
  resolveEventGoalAndReadinessService,
  resolvePostEventContactReviewService,
  resolveWantConnectService,
} from "../../features/events/service-factory";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const liveRecord: LiveEventStoreRecord = {
  id: "event:live:operator-dinner",
  title: "Operator dinner",
  description: "Live-store event for relationship preparation.",
  venue: "Orbit Live Room",
  startsAt: "2026-07-15T10:00:00.000Z",
  endsAt: "2026-07-15T12:00:00.000Z",
  status: "confirmed",
  source: {
    type: "manual",
    id: "source:live-store:operator-dinner",
    label: "Fake live event store",
    provider: "fake-live-event-store",
    providerRecordId: "live-store-record:operator-dinner",
    importedAt: "2026-07-01T00:00:00.000Z",
  },
  evidence: [
    {
      evidenceId: "evidence:live-store:operator-dinner",
      excerpt: "The operator manually added this live-store event.",
      capturedAt: "2026-07-01T00:00:00.000Z",
      createdBy: "profile_live_events_test",
    },
  ],
  relationshipContext:
    "The operator wants Orbit AI to prepare relationship context for this dinner.",
  recommendedPreparation: "Review the invite list before the dinner.",
  nextAction: "Open the event detail and prepare attendee context.",
};

function createFakeLiveProvider(): LiveEventStoreProvider {
  const records: LiveEventStoreRecord[] = [liveRecord];

  return {
    source: "live-store:fake-events",
    sourceLabel: "Fake live events store",
    listEvents() {
      return records;
    },
    getEvent(eventId) {
      return records.find((record) => record.id === eventId) ?? null;
    },
    createManualEvent(input) {
      const id = `event:live:${input.title.toLowerCase().replace(/\s+/g, "-")}`;
      const created: LiveEventStoreRecord = {
        id,
        title: input.title,
        description:
          input.description ??
          "Manual event created through the fake live events store.",
        venue: input.venue ?? "Orbit Live Room",
        startsAt: input.startsAt ?? "2026-07-20T10:00:00.000Z",
        endsAt: input.endsAt ?? input.startsAt ?? "2026-07-20T11:00:00.000Z",
        status: "confirmed",
        source: {
          type: "manual",
          id: `source:live-store:${id}`,
          label: input.sourceNote,
          provider: "fake-live-event-store",
          providerRecordId: `live-store-record:${id}`,
          importedAt: "2026-07-01T00:00:00.000Z",
        },
        evidence: [
          {
            evidenceId: `evidence:live-store:${id}`,
            excerpt: input.sourceNote,
            capturedAt: input.startsAt ?? "2026-07-20T10:00:00.000Z",
            createdBy: "profile_live_events_test",
          },
        ],
        relationshipContext: input.sourceNote,
        recommendedPreparation:
          "Review the live-store event before attaching attendees.",
        nextAction: "Prepare relationship context for the live-store event.",
      };

      records.push(created);
      return created;
    },
  };
}

test("event CRUD import factory registers explicit live mode while other event child capabilities stay non-live", () => {
  const liveResolution = resolveEventCrudAndImportService("live");
  const attendeeLive = resolveEventAttendeeRosterService("live");
  const goalLive = resolveEventGoalAndReadinessService("live");
  const encounterLive = resolveEventEncounterNoteService("live");
  const wantConnectLive = resolveWantConnectService("live");
  const postEventLive = resolvePostEventContactReviewService("live");

  assert.equal(liveResolution.success, true);
  if (liveResolution.success) {
    const result = liveResolution.service.listEvents();

    assert.equal(result.success, false);
    assert.equal(result.error.code, "EVENTS_LIVE_STORE_UNCONFIGURED");
  }

  for (const resolution of [
    attendeeLive,
    goalLive,
    encounterLive,
    wantConnectLive,
    postEventLive,
  ]) {
    assert.equal(resolution.success, false);
    if (!resolution.success) {
      assert.equal(resolution.error.code, "NOT_IMPLEMENTED");
      assert.equal(resolution.error.requestedMode, "live");
      assert.deepEqual(resolution.error.availableModes, ["mock"]);
    }
  }
});

test("live event CRUD store maps provider records without calendar provider side effects", () => {
  const service = createLiveEventCrudAndImportService({
    provider: createFakeLiveProvider(),
  });

  const listed = service.listEvents({ statusFilter: "confirmed" });
  const detail = service.getEvent({ eventId: "event:live:operator-dinner" });
  const missing = service.getEvent({ eventId: "missing-live-event" });
  const created = service.createEvent({
    title: "Live investor dinner",
    sourceNote: "Operator added the dinner directly to the live events store.",
    venue: "Marunouchi",
    startsAt: "2026-07-20T10:00:00.000Z",
    endsAt: "2026-07-20T12:00:00.000Z",
  });

  assert.equal(listed.success, true);
  assert.equal(listed.data.events.length, 1);
  assert.equal(listed.data.events[0]?.id, "event:live:operator-dinner");
  assert.equal(listed.data.events[0]?.sourceMetadata.provider, "fake-live-event-store");
  assert.equal(listed.data.events[0]?.sourceMetadata.captureMethod, "manual_form");
  assert.equal(listed.data.events[0]?.liveDatabaseWriteExecuted, false);
  assert.equal(listed.data.events[0]?.calendarProviderRequested, false);
  assert.equal(listed.data.events[0]?.organizerFeedRequested, false);
  assert.equal(listed.data.events[0]?.externalNetworkRequested, false);
  assert.equal(listed.data.provenance.source, "live-store:fake-events");
  assert.equal(listed.data.provenance.sourceLabel, "Fake live events store");
  assert.equal(listed.data.provenance.generationMethod, "live-store-query");
  assert.equal(listed.data.provenance.liveDatabaseWriteExecuted, false);
  assert.deepEqual(listed.data.provenance.evidenceIds, [
    "evidence:live-store:operator-dinner",
  ]);

  assert.equal(detail.success, true);
  assert.equal(detail.data.event.title, "Operator dinner");
  assert.equal(missing.success, false);
  assert.equal(missing.error.code, "EVENTS_EVENT_NOT_FOUND");

  assert.equal(created.success, true);
  assert.equal(created.data.event.id, "event:live:live-investor-dinner");
  assert.equal(created.data.event.liveDatabaseWriteExecuted, true);
  assert.equal(created.data.event.sourceMetadata.liveDatabaseWriteExecuted, true);
  assert.equal(created.data.importedRecords[0]?.liveDatabaseWriteExecuted, true);
  assert.equal(created.data.provenance.generationMethod, "live-store-manual-event-creation");
  assert.equal(created.data.provenance.liveDatabaseWriteExecuted, true);
  assert.equal(created.data.provenance.calendarSyncRequested, false);
  assert.equal(created.data.provenance.organizerFeedRequested, false);
  assert.equal(created.data.provenance.externalNetworkRequested, false);
  assert.equal(created.data.provenance.aiProviderRequested, false);
  assert.equal(created.data.provenance.emailProviderRequested, false);
  assert.equal(created.data.provenance.notificationDelivered, false);
});

test("unconfigured live event store fails closed for every operation", () => {
  const service = createLiveEventCrudAndImportService();

  const listed = service.listEvents();
  const detail = service.getEvent({ eventId: "event:live:missing-provider" });
  const created = service.createEvent({
    title: "Live dinner",
    sourceNote: "Operator attempted live creation without provider config.",
  });

  for (const result of [listed, detail, created]) {
    assert.equal(result.success, false);
    assert.equal(result.error.code, "EVENTS_LIVE_STORE_UNCONFIGURED");
    assert.equal(result.error.provenance.source, "live-store:unconfigured");
    assert.equal(result.error.provenance.liveDatabaseWriteExecuted, false);
    assert.equal(result.error.provenance.calendarSyncRequested, false);
    assert.equal(result.error.provenance.organizerFeedRequested, false);
    assert.equal(result.error.provenance.externalNetworkRequested, false);
  }
});

test("live event CRUD can read and create events through the shared storage provider", () => {
  const storageRecord: LiveRecord<{
    description: string;
    endsAt: string;
    evidence: readonly {
      capturedAt: string;
      createdBy: string;
      evidenceId: string;
      excerpt: string;
    }[];
    nextAction: string;
    recommendedPreparation: string;
    relationshipContext: string;
    startsAt: string;
    status: string;
    title: string;
    venue: string;
  }> = {
    workspaceId: "workspace:events",
    collectionName: "events",
    recordId: "event:storage:operator-breakfast",
    sourceType: "manual",
    sourceId: "source:storage:operator-breakfast",
    sourceLabel: "Shared storage seed",
    provider: "shared-live-record-storage",
    providerRecordId: "provider:event:operator-breakfast",
    evidenceIds: ["evidence:storage:operator-breakfast"],
    targetType: "event",
    targetId: "event:storage:operator-breakfast",
    occurredAt: "2026-07-18T09:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    lifecycleState: "active",
    searchText: "operator breakfast shared storage",
    payload: {
      title: "Operator breakfast",
      description: "Shared storage event for the live provider.",
      venue: "Orbit Cafe",
      startsAt: "2026-07-18T09:00:00.000Z",
      endsAt: "2026-07-18T10:00:00.000Z",
      status: "confirmed",
      evidence: [
        {
          evidenceId: "evidence:storage:operator-breakfast",
          excerpt: "The operator entered this event into shared storage.",
          capturedAt: "2026-07-01T00:00:00.000Z",
          createdBy: "shared-storage-test",
        },
      ],
      relationshipContext:
        "The operator wants to prepare investor context before breakfast.",
      recommendedPreparation: "Review shared storage context.",
      nextAction: "Open the storage-backed event detail.",
    },
  };
  const store = createMemoryLiveRecordStore([storageRecord]);
  const provider = createStorageEventStoreProvider({
    now: () => "2026-07-01T00:00:00.000Z",
    store,
    workspaceId: "workspace:events",
  });
  const service = createLiveEventCrudAndImportService({ provider });

  const listed = service.listEvents({ sourceCaptureMethod: "manual_form" });
  const detail = service.getEvent({ eventId: "event:storage:operator-breakfast" });
  const created = service.createEvent({
    title: "Storage investor dinner",
    sourceNote: "Operator added a storage-backed dinner.",
    venue: "Marunouchi",
    startsAt: "2026-07-20T10:00:00.000Z",
    endsAt: "2026-07-20T12:00:00.000Z",
  });

  assert.equal(provider.source, "live-record-store:events:workspace:events");
  assert.equal(provider.sourceLabel, "Events shared storage");
  assert.equal(listed.success, true);
  assert.equal(listed.data.events[0]?.id, "event:storage:operator-breakfast");
  assert.equal(listed.data.events[0]?.title, "Operator breakfast");
  assert.equal(listed.data.events[0]?.sourceMetadata.provider, "shared-live-record-storage");
  assert.deepEqual(listed.data.provenance.evidenceIds, [
    "evidence:storage:operator-breakfast",
  ]);

  assert.equal(detail.success, true);
  assert.equal(detail.data.event.relationshipContext, storageRecord.payload.relationshipContext);

  assert.equal(created.success, true);
  assert.equal(created.data.event.id, "event:live-record:storage-investor-dinner");
  assert.equal(created.data.event.liveDatabaseWriteExecuted, true);
  assert.equal(
    store.getRecord({
      workspaceId: "workspace:events",
      collectionName: "events",
      recordId: "event:live-record:storage-investor-dinner",
    })?.payload.title,
    "Storage investor dinner",
  );
});
