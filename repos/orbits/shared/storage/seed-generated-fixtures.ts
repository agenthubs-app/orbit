import {
  MOCK_FIXTURE_COLLECTION_NAMES,
  defaultMockFixtures,
  type MockFixtureCollectionName,
} from "../mock/fixtures";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "./live-record-store";

type FixtureRecord = Record<string, unknown> & { id: string };

export interface GeneratedFixtureLiveSeedCollection {
  collectionName: MockFixtureCollectionName;
  recordIds: readonly string[];
}

export interface SeedGeneratedRelationshipFixturesIntoLiveStoreOptions {
  now?: () => string;
  onCollectionSeeded?: (collection: GeneratedFixtureLiveSeedCollection) => void;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface GeneratedFixtureLiveSeedResult {
  collections: readonly GeneratedFixtureLiveSeedCollection[];
  seededAt: string;
  totalRecords: number;
  workspaceId: string;
}

export interface VerifyGeneratedRelationshipFixturesInLiveStoreOptions {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export type VerifyGeneratedRelationshipFixturesInLiveStoreResult =
  | {
      collections: readonly GeneratedFixtureLiveSeedCollection[];
      success: true;
      totalRecords: number;
      workspaceId: string;
    }
  | {
      collections: readonly GeneratedFixtureLiveSeedCollection[];
      failures: readonly string[];
      success: false;
      totalRecords: number;
      workspaceId: string;
    };

const fixtureGeneratedAt = defaultMockFixtures.generatedAt;
const evidenceById = new Map(
  defaultMockFixtures.evidence.map((evidence) => [evidence.id, evidence]),
);

export const GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS =
  MOCK_FIXTURE_COLLECTION_NAMES.map((collectionName) => ({
    collectionName,
    recordIds: fixtureRecordsFor(collectionName).map((record) => record.id),
  })) satisfies readonly GeneratedFixtureLiveSeedCollection[];

function fixtureRecordsFor(
  collectionName: MockFixtureCollectionName,
): readonly FixtureRecord[] {
  return defaultMockFixtures[collectionName] as unknown as readonly FixtureRecord[];
}

function sourceFor(record: FixtureRecord): {
  sourceId: string;
  sourceLabel: string;
  sourceType: string;
} {
  const source = record.source;

  if (isRecord(source) && typeof source.id === "string") {
    return {
      sourceId: source.id,
      sourceLabel:
        typeof source.label === "string"
          ? source.label
          : "Generated relationship fixture source",
      sourceType: typeof source.type === "string" ? source.type : "system",
    };
  }

  if (
    typeof record.sourceId === "string" &&
    typeof record.sourceType === "string"
  ) {
    return {
      sourceId: record.sourceId,
      sourceLabel:
        typeof record.summary === "string"
          ? record.summary
          : "Generated relationship evidence source",
      sourceType: record.sourceType,
    };
  }

  return {
    sourceId: `source:generated-relationship-fixtures:${record.id}`,
    sourceLabel: "Generated relationship fixtures",
    sourceType: "system",
  };
}

function evidenceIdsFor(record: FixtureRecord): readonly string[] {
  if (Array.isArray(record.evidenceIds)) {
    return record.evidenceIds.filter(
      (evidenceId): evidenceId is string => typeof evidenceId === "string",
    );
  }

  if (
    typeof record.id === "string" &&
    typeof record.sourceType === "string" &&
    typeof record.sourceId === "string"
  ) {
    return [record.id];
  }

  return [];
}

function targetFor(
  collectionName: MockFixtureCollectionName,
  record: FixtureRecord,
): { targetId: string; targetType: string } {
  const target = record.target;

  if (
    isRecord(target) &&
    typeof target.type === "string" &&
    typeof target.id === "string"
  ) {
    return {
      targetId: target.id,
      targetType: target.type,
    };
  }

  switch (collectionName) {
    case "accounts":
      return { targetId: record.id, targetType: "account" };
    case "profiles":
      return { targetId: record.id, targetType: "profile" };
    case "events":
      return { targetId: record.id, targetType: "event" };
    case "networkPeople":
      return { targetId: record.id, targetType: "person" };
    case "personRelationshipEdges":
      return { targetId: record.id, targetType: "person_relationship_edge" };
    case "attendees":
      return { targetId: record.id, targetType: "attendee" };
    case "contacts":
      return { targetId: record.id, targetType: "contact" };
    case "connections":
      return { targetId: record.id, targetType: "connection" };
    case "evidence":
      return { targetId: record.id, targetType: "evidence" };
    case "tasks":
      return { targetId: record.id, targetType: "task" };
    case "conversations":
      return { targetId: record.id, targetType: "conversation" };
    case "messages":
      return { targetId: record.id, targetType: "message" };
    case "dashboards":
      return { targetId: record.id, targetType: "dashboard" };
    case "agentActions":
      return { targetId: record.id, targetType: "agent_action" };
    case "permissions":
      return { targetId: record.id, targetType: "permission" };
    case "notifications":
      return { targetId: record.id, targetType: "notification" };
    case "eventParticipantIntents":
      return {
        targetId: stringField(record, "eventId") ?? record.id,
        targetType: "event",
      };
    case "aiAnalyses":
      return { targetId: record.id, targetType: "ai_analysis" };
    case "matchRecommendations":
      return {
        targetId:
          stringField(record, "eventId") ??
          stringField(record, "contactId") ??
          stringField(record, "connectionId") ??
          record.id,
        targetType: stringField(record, "eventId") ? "event" : "recommendation",
      };
    case "interactionMemories":
      return {
        targetId: stringField(record, "contactId") ?? record.id,
        targetType: stringField(record, "contactId") ? "contact" : "interaction_memory",
      };
    case "recommendationTests":
      return {
        targetId: stringField(record, "eventId") ?? record.id,
        targetType: stringField(record, "eventId") ? "event" : "recommendation_test",
      };
  }
}

function occurredAtFor(record: FixtureRecord): string {
  return (
    stringField(record, "occurredAt") ??
    stringField(record, "startsAt") ??
    stringField(record, "dueAt") ??
    stringField(record, "scheduledFor") ??
    stringField(record, "generatedAt") ??
    stringField(record, "updatedAt") ??
    stringField(record, "createdAt") ??
    fixtureGeneratedAt
  );
}

function createdAtFor(record: FixtureRecord): string {
  return (
    stringField(record, "createdAt") ??
    stringField(record, "occurredAt") ??
    stringField(record, "startsAt") ??
    fixtureGeneratedAt
  );
}

function updatedAtFor(record: FixtureRecord, now: string): string {
  return (
    stringField(record, "updatedAt") ??
    stringField(record, "generatedAt") ??
    stringField(record, "createdAt") ??
    now
  );
}

function searchTextFor(record: FixtureRecord): string {
  const values = new Set<string>();

  collectSearchText(record, values);

  for (const evidenceId of evidenceIdsFor(record)) {
    const evidence = evidenceById.get(evidenceId);

    if (evidence) {
      collectSearchText(evidence, values);
    }
  }

  return Array.from(values).join(" ");
}

function liveRecordForFixture(input: {
  collectionName: MockFixtureCollectionName;
  now: string;
  record: FixtureRecord;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const source = sourceFor(input.record);
  const target = targetFor(input.collectionName, input.record);

  return {
    workspaceId: input.workspaceId,
    collectionName: input.collectionName,
    recordId: input.record.id,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceLabel: source.sourceLabel,
    provider: "generated-relationship-fixtures",
    providerRecordId: input.record.id,
    evidenceIds: evidenceIdsFor(input.record),
    targetType: target.targetType,
    targetId: target.targetId,
    occurredAt: occurredAtFor(input.record),
    createdAt: createdAtFor(input.record),
    updatedAt: updatedAtFor(input.record, input.now),
    lifecycleState: "active",
    searchText: searchTextFor(input.record),
    payload: input.record,
  };
}

export async function seedGeneratedRelationshipFixturesIntoLiveStore({
  now = () => new Date().toISOString(),
  onCollectionSeeded,
  store,
  workspaceId,
}: SeedGeneratedRelationshipFixturesIntoLiveStoreOptions): Promise<GeneratedFixtureLiveSeedResult> {
  const seededAt = now();
  const collections: GeneratedFixtureLiveSeedCollection[] = [];

  for (const collectionName of MOCK_FIXTURE_COLLECTION_NAMES) {
    const recordIds: string[] = [];

    for (const record of fixtureRecordsFor(collectionName)) {
      await store.upsertRecord(
        liveRecordForFixture({
          collectionName,
          now: seededAt,
          record,
          workspaceId,
        }),
      );
      recordIds.push(record.id);
    }

    collections.push({
      collectionName,
      recordIds,
    });
    onCollectionSeeded?.({
      collectionName,
      recordIds,
    });
  }

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

export async function verifyGeneratedRelationshipFixturesInLiveStore({
  store,
  workspaceId,
}: VerifyGeneratedRelationshipFixturesInLiveStoreOptions): Promise<VerifyGeneratedRelationshipFixturesInLiveStoreResult> {
  const collections: GeneratedFixtureLiveSeedCollection[] = [];
  const failures: string[] = [];

  for (const expected of GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS) {
    const records = await store.listRecords({
      workspaceId,
      collectionName: expected.collectionName,
      recordIds: expected.recordIds,
    });
    const recordIds = records.map((record) => record.recordId).sort();
    const expectedIds = [...expected.recordIds].sort();
    const missingIds = expectedIds.filter((recordId) => !recordIds.includes(recordId));

    if (records.length !== expectedIds.length) {
      failures.push(
        `${expected.collectionName}: expected ${expectedIds.length} generated fixture records, found ${records.length}`,
      );
    }

    if (missingIds.length > 0) {
      failures.push(
        `${expected.collectionName}: missing ${missingIds.length} generated fixture records (${formatIdSample(missingIds)})`,
      );
    }

    collections.push({
      collectionName: expected.collectionName,
      recordIds,
    });
  }

  await verifyKeyGeneratedFixtureRecords({
    failures,
    store,
    workspaceId,
  });

  const totalRecords = collections.reduce(
    (total, collection) => total + collection.recordIds.length,
    0,
  );

  if (failures.length > 0) {
    return {
      collections,
      failures,
      success: false,
      totalRecords,
      workspaceId,
    };
  }

  return {
    collections,
    success: true,
    totalRecords,
    workspaceId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(record: Record<string, unknown>, fieldName: string): string | null {
  const value = record[fieldName];

  return typeof value === "string" && value.trim() ? value : null;
}

function formatIdSample(recordIds: readonly string[]): string {
  const sampleSize = 10;
  const sample = recordIds.slice(0, sampleSize).join(", ");
  const remainingCount = recordIds.length - sampleSize;

  return remainingCount > 0 ? `${sample}, and ${remainingCount} more` : sample;
}

function collectSearchText(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed) {
      output.add(trimmed);
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSearchText(item, output);
    }

    return;
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      collectSearchText(item, output);
    }
  }
}

async function verifyKeyGeneratedFixtureRecords({
  failures,
  store,
  workspaceId,
}: {
  failures: string[];
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<void> {
  await verifyRecord({
    collectionName: "events",
    failures,
    recordId: "event_01",
    store,
    verify: (record) => {
      if (stringField(record.payload, "name") !== defaultMockFixtures.events[0].name) {
        return "events event_01 name should match defaultMockFixtures";
      }

      return null;
    },
    workspaceId,
  });

  await verifyRecord({
    collectionName: "events",
    failures,
    recordId: "event_signup_01",
    store,
    verify: (record) =>
      record.targetType === "event"
        ? null
        : "events event_signup_01 targetType should be event",
    workspaceId,
  });

  await verifyRecord({
    collectionName: "contacts",
    failures,
    recordId: "contact_001",
    store,
    verify: (record) =>
      stringField(record.payload, "displayName") === "佐藤 健一"
        ? null
        : "contacts contact_001 displayName should be 佐藤 健一",
    workspaceId,
  });

  await verifyRecord({
    collectionName: "evidence",
    failures,
    recordId: "evidence:event:01",
    store,
    verify: (record) =>
      record.sourceType === "event_import"
        ? null
        : "evidence evidence:event:01 sourceType should be event_import",
    workspaceId,
  });

  await verifyRecord({
    collectionName: "attendees",
    failures,
    recordId: "participant_001",
    store,
    verify: (record) =>
      stringField(record.payload, "eventId") === "event_01"
        ? null
        : "attendees participant_001 eventId should be event_01",
    workspaceId,
  });

  await verifyRecord({
    collectionName: "eventParticipantIntents",
    failures,
    recordId: "intent_001",
    store,
    verify: (record) =>
      stringField(record.payload, "eventId") === "event_01"
        ? null
        : "eventParticipantIntents intent_001 eventId should be event_01",
    workspaceId,
  });

  await verifyRecord({
    collectionName: "tasks",
    failures,
    recordId: "task_001",
    store,
    verify: (record) =>
      record.targetType === "task"
        ? null
        : "tasks task_001 targetType should be task",
    workspaceId,
  });

  await verifyRecord({
    collectionName: "conversations",
    failures,
    recordId: "conversation_001",
    store,
    verify: (record) =>
      record.targetType === "conversation"
        ? null
        : "conversations conversation_001 targetType should be conversation",
    workspaceId,
  });

  await verifyRecord({
    collectionName: "messages",
    failures,
    recordId: "message_0001",
    store,
    verify: (record) =>
      stringField(record.payload, "conversationId") === "conversation_001"
        ? null
        : "messages message_0001 conversationId should be conversation_001",
    workspaceId,
  });

  await verifyRecord({
    collectionName: "agentActions",
    failures,
    recordId: "agent_action_001",
    store,
    verify: (record) =>
      record.payload.confirmationRequired === true
        ? null
        : "agentActions agent_action_001 confirmationRequired should be true",
    workspaceId,
  });
}

async function verifyRecord(input: {
  collectionName: MockFixtureCollectionName;
  failures: string[];
  recordId: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  verify: (record: LiveRecord<Record<string, unknown>>) => string | null;
  workspaceId: string;
}): Promise<void> {
  const record = await input.store.getRecord({
    workspaceId: input.workspaceId,
    collectionName: input.collectionName,
    recordId: input.recordId,
  });

  if (!record) {
    input.failures.push(`${input.collectionName}: missing key record ${input.recordId}`);
    return;
  }

  const failure = input.verify(record);

  if (failure) {
    input.failures.push(failure);
  }
}
