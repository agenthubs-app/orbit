import { mockEventRecords } from "../event-crud-and-import/fixtures";
import type { EventRecord } from "../event-crud-and-import/contract";
import type {
  StorageEventEvidencePayload,
  StorageEventPayload,
} from "../event-crud-and-import/providers/storage-event-provider";
import { EVENTS_LIVE_RECORD_COLLECTION } from "../event-crud-and-import/providers/storage-event-provider";
import { mockEventAttendeeRosterFixture } from "../attendee-roster/fixtures";
import type { EventAttendeeRosterPayload } from "../attendee-roster/contract";
import { mockEventGoalReadinessFixture } from "../goal-readiness/fixtures";
import type { EventGoalReadinessPayload } from "../goal-readiness/contract";
import { mockEventEncounterNoteFixture } from "../encounter-note/fixtures";
import type { EventEncounterNotePayload } from "../encounter-note/contract";
import { mockWantConnectFixture } from "../want-connect/fixtures";
import type { WantConnectPayload } from "../want-connect/contract";
import { mockPostEventReviewFixture } from "../post-event-review/fixtures";
import type { PostEventReviewPayload } from "../post-event-review/contract";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type {
  EventDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import { defaultMockFixtures } from "../../../shared/mock/fixtures";
import {
  createEventCapabilityRecordProvider,
  EVENT_WORK_RECORD_COLLECTIONS,
  type EventWorkRecordCollectionName,
} from "./event-work-record-provider";

const generatedRelationshipEventRecordIds = defaultMockFixtures.events.map(
  (event) => event.id,
);
const generatedRelationshipEvidenceById = new Map(
  defaultMockFixtures.evidence.map((evidence) => [evidence.id, evidence]),
);
const generatedRelationshipFixtureCreatedBy =
  defaultMockFixtures.profiles[0]?.id ?? "generated-relationship-fixtures";

export const EVENT_LIVE_SEED_COLLECTIONS = [
  EVENTS_LIVE_RECORD_COLLECTION,
  EVENT_WORK_RECORD_COLLECTIONS.attendeeRoster,
  EVENT_WORK_RECORD_COLLECTIONS.goalReadiness,
  EVENT_WORK_RECORD_COLLECTIONS.encounterNotes,
  EVENT_WORK_RECORD_COLLECTIONS.wantConnect,
  EVENT_WORK_RECORD_COLLECTIONS.postEventReview,
] as const;

export const EVENT_LIVE_SEED_EXPECTED_RECORDS = [
  {
    collectionName: EVENTS_LIVE_RECORD_COLLECTION,
    recordIds: [
      "demo-event-1",
      "demo-event-2",
      ...generatedRelationshipEventRecordIds,
      "event:manual:founder-investor-salon",
    ],
  },
  {
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.attendeeRoster,
    recordIds: ["demo-event-1"],
  },
  {
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.goalReadiness,
    recordIds: ["demo-event-1"],
  },
  {
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.encounterNotes,
    recordIds: ["demo-event-1"],
  },
  {
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.wantConnect,
    recordIds: ["demo-event-1"],
  },
  {
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.postEventReview,
    recordIds: ["demo-event-1"],
  },
] as const satisfies readonly SeededLiveEventCollection[];

export interface SeedEventsMockDataIntoLiveStoreOptions {
  now?: () => string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface SeededLiveEventCollection {
  collectionName: (typeof EVENT_LIVE_SEED_COLLECTIONS)[number];
  recordIds: readonly string[];
}

export interface SeedEventsMockDataIntoLiveStoreResult {
  collections: readonly SeededLiveEventCollection[];
  seededAt: string;
  totalRecords: number;
  workspaceId: string;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function evidencePayloadFor(
  event: EventRecord,
): readonly StorageEventEvidencePayload[] {
  return event.evidence.map((evidence) => ({
    capturedAt: evidence.capturedAt,
    createdBy: evidence.createdBy,
    evidenceId: evidence.evidenceId,
    excerpt: evidence.excerpt,
  }));
}

function evidencePayloadForGeneratedRelationshipEvent(
  event: EventDTO,
): readonly StorageEventEvidencePayload[] {
  return event.evidenceIds.map((evidenceId) => {
    const evidence: RelationshipEvidenceDTO | undefined =
      generatedRelationshipEvidenceById.get(evidenceId);

    return {
      capturedAt: evidence?.occurredAt ?? event.startsAt,
      createdBy: evidence?.createdBy ?? generatedRelationshipFixtureCreatedBy,
      evidenceId,
      excerpt:
        evidence?.summary ??
        event.source.label ??
        `Generated relationship event ${event.id}`,
    };
  });
}

function searchTextFor(event: EventRecord): string {
  return [
    event.title,
    event.description,
    event.venue,
    event.relationshipContext,
    event.recommendedPreparation,
    event.nextAction,
  ]
    .filter((value) => value.trim().length > 0)
    .join(" ");
}

function searchTextForGeneratedRelationshipEvent(input: {
  event: EventDTO;
  evidence: readonly StorageEventEvidencePayload[];
}): string {
  return [
    input.event.name,
    input.event.location,
    input.event.source.label,
    ...input.evidence.map((evidence) => evidence.excerpt),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
}

function liveRecordForEvent(input: {
  event: EventRecord;
  now: string;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const payload: StorageEventPayload = {
    description: input.event.description,
    endsAt: input.event.endsAt,
    evidence: evidencePayloadFor(input.event),
    nextAction: input.event.nextAction,
    recommendedPreparation: input.event.recommendedPreparation,
    relationshipContext: input.event.relationshipContext,
    startsAt: input.event.startsAt,
    status: input.event.status,
    title: input.event.title,
    venue: input.event.venue,
  };

  return {
    workspaceId: input.workspaceId,
    collectionName: EVENTS_LIVE_RECORD_COLLECTION,
    recordId: input.event.id,
    sourceType: input.event.sourceMetadata.type,
    sourceId: input.event.sourceMetadata.id,
    sourceLabel: input.event.sourceMetadata.label,
    provider: input.event.sourceMetadata.provider,
    providerRecordId: input.event.sourceMetadata.providerRecordId,
    evidenceIds: input.event.evidence.map((evidence) => evidence.evidenceId),
    targetType: "event",
    targetId: input.event.id,
    occurredAt: input.event.startsAt,
    createdAt: input.event.sourceMetadata.importedAt,
    updatedAt: input.now,
    lifecycleState: "active",
    searchText: searchTextFor(input.event),
    payload,
  };
}

function liveRecordForGeneratedRelationshipEvent(input: {
  event: EventDTO;
  now: string;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const evidence = evidencePayloadForGeneratedRelationshipEvent(input.event);
  const description =
    evidence.find((item) => item.excerpt.trim().length > 0)?.excerpt ??
    input.event.source.label ??
    input.event.name;
  const payload: StorageEventPayload = {
    description,
    endsAt: input.event.endsAt ?? input.event.startsAt,
    evidence,
    nextAction: "Use this source-backed event for live agent workflow tests.",
    recommendedPreparation:
      "Review generated relationship fixture evidence before agent event planning.",
    relationshipContext: description,
    startsAt: input.event.startsAt,
    status: input.event.source.type === "event_import" ? "imported" : "confirmed",
    title: input.event.name,
    venue: input.event.location ?? null,
  };

  return {
    workspaceId: input.workspaceId,
    collectionName: EVENTS_LIVE_RECORD_COLLECTION,
    recordId: input.event.id,
    sourceType: input.event.source.type,
    sourceId: input.event.source.id,
    sourceLabel: input.event.source.label ?? null,
    provider: "generated-relationship-fixtures",
    providerRecordId: input.event.id,
    evidenceIds: input.event.evidenceIds,
    targetType: "event",
    targetId: input.event.id,
    occurredAt: input.event.startsAt,
    createdAt: defaultMockFixtures.generatedAt,
    updatedAt: input.now,
    lifecycleState: "active",
    searchText: searchTextForGeneratedRelationshipEvent({
      event: input.event,
      evidence,
    }),
    payload,
  };
}

async function seedEventCrudRecords(input: {
  now: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<SeededLiveEventCollection> {
  const recordIds: string[] = [];

  for (const event of mockEventRecords) {
    const record = liveRecordForEvent({
      event,
      now: input.now,
      workspaceId: input.workspaceId,
    });

    await input.store.upsertRecord(record);
    recordIds.push(record.recordId);
  }

  for (const event of defaultMockFixtures.events) {
    const record = liveRecordForGeneratedRelationshipEvent({
      event,
      now: input.now,
      workspaceId: input.workspaceId,
    });

    await input.store.upsertRecord(record);
    recordIds.push(record.recordId);
  }

  return {
    collectionName: EVENTS_LIVE_RECORD_COLLECTION,
    recordIds,
  };
}

async function seedCapabilityPayload<TPayload extends object>(input: {
  collectionName: EventWorkRecordCollectionName;
  eventId: string;
  now: string;
  payload: TPayload;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<SeededLiveEventCollection> {
  const provider = createEventCapabilityRecordProvider<TPayload>({
    collectionName: input.collectionName,
    now: () => input.now,
    store: input.store,
    workspaceId: input.workspaceId,
  });

  await provider.upsertPayload(input.eventId, cloneJson(input.payload), {
    now: input.now,
  });

  return {
    collectionName: input.collectionName,
    recordIds: [input.eventId],
  };
}

export async function seedEventsMockDataIntoLiveStore({
  now = () => new Date().toISOString(),
  store,
  workspaceId,
}: SeedEventsMockDataIntoLiveStoreOptions): Promise<SeedEventsMockDataIntoLiveStoreResult> {
  const seededAt = now();
  const collections: SeededLiveEventCollection[] = [
    await seedEventCrudRecords({
      now: seededAt,
      store,
      workspaceId,
    }),
    await seedCapabilityPayload<EventAttendeeRosterPayload>({
      collectionName: EVENT_WORK_RECORD_COLLECTIONS.attendeeRoster,
      eventId: mockEventAttendeeRosterFixture.event.id,
      now: seededAt,
      payload: mockEventAttendeeRosterFixture,
      store,
      workspaceId,
    }),
    await seedCapabilityPayload<EventGoalReadinessPayload>({
      collectionName: EVENT_WORK_RECORD_COLLECTIONS.goalReadiness,
      eventId: mockEventGoalReadinessFixture.event.id,
      now: seededAt,
      payload: mockEventGoalReadinessFixture,
      store,
      workspaceId,
    }),
    await seedCapabilityPayload<EventEncounterNotePayload>({
      collectionName: EVENT_WORK_RECORD_COLLECTIONS.encounterNotes,
      eventId: mockEventEncounterNoteFixture.event.id,
      now: seededAt,
      payload: mockEventEncounterNoteFixture,
      store,
      workspaceId,
    }),
    await seedCapabilityPayload<WantConnectPayload>({
      collectionName: EVENT_WORK_RECORD_COLLECTIONS.wantConnect,
      eventId: mockWantConnectFixture.event.id,
      now: seededAt,
      payload: mockWantConnectFixture,
      store,
      workspaceId,
    }),
    await seedCapabilityPayload<PostEventReviewPayload>({
      collectionName: EVENT_WORK_RECORD_COLLECTIONS.postEventReview,
      eventId: mockPostEventReviewFixture.event.id,
      now: seededAt,
      payload: mockPostEventReviewFixture,
      store,
      workspaceId,
    }),
  ];

  return {
    collections,
    seededAt,
    totalRecords: collections.reduce(
      (total, collection) => total + collection.recordIds.length,
      0,
    ),
    workspaceId,
  };
}
