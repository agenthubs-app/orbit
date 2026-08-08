import { createHash } from "node:crypto";

import { createConfiguredStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import type { EventRegistration } from "../features/events/registration/contract";
import { eventRegistrationId } from "../features/events/registration/service";
import { createConfiguredEventRegistrationProvider } from "../features/events/registration/storage/live-record-provider";
import { createConfiguredEventOperationsRepository } from "../features/events/event-operations/repository";
import {
  defaultMockFixtures,
  type MockFixtureCollectionName,
} from "../shared/mock/fixtures";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../shared/storage/live-record-store";
import { loadLocalEnv } from "./load-local-env";

const PRESSURE_PROVIDER = "iorbit-account-agent-pressure-fixtures";
const BATCH_SIZE = 16;

const SEEDED_COLLECTIONS = [
  "events",
  "networkPeople",
  "personRelationshipEdges",
  "attendees",
  "contacts",
  "connections",
  "evidence",
  "tasks",
  "conversations",
  "messages",
  "agentActions",
  "notifications",
  "eventParticipantIntents",
  "aiAnalyses",
  "matchRecommendations",
  "interactionMemories",
  "recommendationTests",
] as const satisfies readonly MockFixtureCollectionName[];

type SeededCollectionName = (typeof SEEDED_COLLECTIONS)[number];
type FixtureRecord = Record<string, unknown> & { id: string };
type RunMode = "cleanup" | "seed" | "verify";

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;

  return value?.trim() || null;
}

function parseMode(): RunMode {
  const value = argumentValue("--mode") ?? "seed";
  if (value === "seed" || value === "verify" || value === "cleanup") {
    return value;
  }

  throw new Error("--mode must be seed, verify, or cleanup");
}

function actorKey(actorId: string): string {
  return createHash("sha256").update(actorId).digest("hex").slice(0, 10);
}

function fixtureRecordsFor(
  collectionName: SeededCollectionName,
): readonly FixtureRecord[] {
  return defaultMockFixtures[
    collectionName
  ] as unknown as readonly FixtureRecord[];
}

function buildIdMap(prefix: string, actorId: string): ReadonlyMap<string, string> {
  const idMap = new Map<string, string>();
  const fixtureAccountId = defaultMockFixtures.accounts[0]?.id;
  const fixtureProfileId = defaultMockFixtures.profiles[0]?.id;

  if (fixtureAccountId) idMap.set(fixtureAccountId, actorId);
  if (fixtureProfileId) idMap.set(fixtureProfileId, actorId);

  for (const collectionName of SEEDED_COLLECTIONS) {
    for (const record of fixtureRecordsFor(collectionName)) {
      idMap.set(record.id, `${prefix}${record.id}`);
    }
  }

  return idMap;
}

function remapValue(value: unknown, idMap: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return idMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remapValue(item, idMap));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, remapValue(item, idMap)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArrayField(
  record: Record<string, unknown>,
  field: string,
): readonly string[] {
  const value = record[field];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function collectSearchText(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) output.add(trimmed);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectSearchText(item, output);
    return;
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) collectSearchText(item, output);
  }
}

function sourceFor(payload: Record<string, unknown>, recordId: string): {
  sourceId: string;
  sourceLabel: string;
  sourceType: string;
} {
  const source = payload.source;
  if (isRecord(source)) {
    return {
      sourceId: stringField(source, "id") ?? `source:${recordId}`,
      sourceLabel: stringField(source, "label") ?? "iOrbit 中文压力测试数据",
      sourceType: stringField(source, "type") ?? "system",
    };
  }

  return {
    sourceId: stringField(payload, "sourceId") ?? `source:${recordId}`,
    sourceLabel:
      stringField(payload, "summary") ?? "iOrbit 中文压力测试数据",
    sourceType: stringField(payload, "sourceType") ?? "system",
  };
}

function targetFor(
  collectionName: SeededCollectionName,
  payload: Record<string, unknown>,
  recordId: string,
): { targetId: string; targetType: string } {
  const target = payload.target;
  if (isRecord(target)) {
    const id = stringField(target, "id");
    const type = stringField(target, "type");
    if (id && type) return { targetId: id, targetType: type };
  }

  switch (collectionName) {
    case "events":
      return { targetId: recordId, targetType: "event" };
    case "networkPeople":
      return { targetId: recordId, targetType: "person" };
    case "personRelationshipEdges":
      return { targetId: recordId, targetType: "person_relationship_edge" };
    case "attendees":
      return { targetId: recordId, targetType: "attendee" };
    case "contacts":
      return { targetId: recordId, targetType: "contact" };
    case "connections":
      return { targetId: recordId, targetType: "connection" };
    case "evidence":
      return { targetId: recordId, targetType: "evidence" };
    case "tasks":
      return { targetId: recordId, targetType: "task" };
    case "conversations":
      return { targetId: recordId, targetType: "conversation" };
    case "messages":
      return { targetId: recordId, targetType: "message" };
    case "agentActions":
      return { targetId: recordId, targetType: "agent_action" };
    case "notifications":
      return { targetId: recordId, targetType: "notification" };
    case "eventParticipantIntents":
      return {
        targetId: stringField(payload, "eventId") ?? recordId,
        targetType: "event",
      };
    case "aiAnalyses":
      return { targetId: recordId, targetType: "ai_analysis" };
    case "matchRecommendations":
      return {
        targetId:
          stringField(payload, "eventId") ??
          stringField(payload, "contactId") ??
          stringField(payload, "connectionId") ??
          recordId,
        targetType: stringField(payload, "eventId")
          ? "event"
          : "recommendation",
      };
    case "interactionMemories":
      return {
        targetId: stringField(payload, "contactId") ?? recordId,
        targetType: stringField(payload, "contactId")
          ? "contact"
          : "interaction_memory",
      };
    case "recommendationTests":
      return {
        targetId: stringField(payload, "eventId") ?? recordId,
        targetType: stringField(payload, "eventId") ? "event" : "test",
      };
  }
}

function toLiveRecord(input: {
  actorId: string;
  collectionName: SeededCollectionName;
  idMap: ReadonlyMap<string, string>;
  fixture: FixtureRecord;
  now: string;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const payload = remapValue(input.fixture, input.idMap) as Record<string, unknown>;
  const recordId = stringField(payload, "id");
  if (!recordId) throw new Error(`Fixture in ${input.collectionName} has no id.`);

  const source = sourceFor(payload, recordId);
  const target = targetFor(input.collectionName, payload, recordId);
  const createdAt =
    stringField(payload, "createdAt") ??
    stringField(payload, "occurredAt") ??
    stringField(payload, "startsAt") ??
    input.now;
  const updatedAt =
    stringField(payload, "updatedAt") ??
    stringField(payload, "generatedAt") ??
    createdAt;
  const occurredAt =
    stringField(payload, "occurredAt") ??
    stringField(payload, "startsAt") ??
    stringField(payload, "dueAt") ??
    updatedAt;
  const searchValues = new Set<string>();
  collectSearchText(payload, searchValues);

  return {
    collectionName: input.collectionName,
    createdAt,
    evidenceIds: stringArrayField(payload, "evidenceIds"),
    lifecycleState: "active",
    occurredAt,
    payload,
    provider: PRESSURE_PROVIDER,
    // Account-scoped storage ids are namespaced so parallel QA accounts never
    // overwrite one another. Event provenance must still retain the upstream
    // canonical id, otherwise Today/Agent links cannot resolve back into the
    // public Event Core detail route.
    providerRecordId:
      input.collectionName === "events" ? input.fixture.id : recordId,
    recordId,
    searchText: [...searchValues].join(" "),
    sourceId: source.sourceId,
    sourceLabel: source.sourceLabel,
    sourceType: source.sourceType,
    targetId: target.targetId,
    targetType: target.targetType,
    updatedAt,
    userId: input.actorId,
    workspaceId: input.workspaceId,
  };
}

async function inBatches<TValue>(
  values: readonly TValue[],
  run: (value: TValue) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < values.length; index += BATCH_SIZE) {
    await Promise.all(values.slice(index, index + BATCH_SIZE).map(run));
  }
}

function pressurePrefix(actorId: string): string {
  return `iorbit-qa-${actorKey(actorId)}:`;
}

async function seedRecords(input: {
  actorId: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<Record<string, number>> {
  const prefix = pressurePrefix(input.actorId);
  const idMap = buildIdMap(prefix, input.actorId);
  const counts: Record<string, number> = {};
  const now = new Date().toISOString();

  for (const collectionName of SEEDED_COLLECTIONS) {
    const records = fixtureRecordsFor(collectionName).map((fixture) =>
      toLiveRecord({ ...input, collectionName, fixture, idMap, now }),
    );
    await inBatches(records, async (record) => {
      await input.store.upsertRecord(record);
    });
    counts[collectionName] = records.length;
  }

  const registrationProvider = createConfiguredEventRegistrationProvider();
  const operationsRepository = createConfiguredEventOperationsRepository();
  if (!operationsRepository) {
    throw new Error("The canonical event membership repository is unavailable.");
  }
  const eventFixtures = fixtureRecordsFor("events");
  for (const event of eventFixtures) {
    const eventId = event.id;
    const startsAt = stringField(event, "startsAt") ?? now;
    const registeredAt = new Date(
      new Date(startsAt).getTime() - 21 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    const registrationId = eventRegistrationId(eventId, input.actorId);
    const profileId = `event-participant-profile:${encodeURIComponent(eventId)}:${encodeURIComponent(input.actorId)}`;
    const registration: EventRegistration = {
      cancelledAt: null,
      eventId,
      id: registrationId,
      participantProfile: {
        answers: {
          positioning: "负责 iOrbit 产品验证与商务关系运营的测试负责人",
          industry: "人工智能与企业软件",
          targetAttendees: "企业决策者、投资人、渠道伙伴与行业专家",
          valueOffered: "提供跨境业务验证、关系运营方法与产品试用反馈",
          desiredOutcome: "建立三条可继续推进的高质量合作关系",
          energyStyle: "偏好一对一深入交流，并在会后快速形成明确下一步",
          experienceHighlight: "有中日跨境项目、企业软件和活动运营经验",
          followUpPreference: "活动后两天内通过中文邮件或 iOrbit 任务跟进",
        },
        createdAt: registeredAt,
        displayName: "Orbit QA 测试账号",
        eventId,
        id: profileId,
        updatedAt: registeredAt,
        userId: input.actorId,
      },
      participantProfileId: profileId,
      reactivatedAt: null,
      registeredAt,
      sideEffects: {
        calendarUpdateExecuted: false,
        emailSent: false,
        globalProfileWriteExecuted: false,
        notificationDelivered: false,
        organizerMessageSent: false,
        refundRequested: false,
      },
      status: "rsvped",
      updatedAt: registeredAt,
      userId: input.actorId,
    };
    await registrationProvider.saveRegistration(registration);
    if (event.id === "event_signup_01") {
      // event_signup_01 is the only generated fixture currently enrolled in
      // canonical membership. The other fixture events deliberately remain on
      // their legacy/projection path until operators configure their windows.
      await operationsRepository.seedCanonicalRegistration(registration);
    }
  }
  counts.event_registrations = eventFixtures.length;
  counts.canonical_event_registrations = 1;

  return counts;
}

async function verifyRecords(input: {
  actorId: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<{ counts: Record<string, number>; failures: string[] }> {
  const failures: string[] = [];
  const counts: Record<string, number> = {};
  const prefix = pressurePrefix(input.actorId);

  for (const collectionName of SEEDED_COLLECTIONS) {
    const expected = fixtureRecordsFor(collectionName).length;
    const records = await input.store.listRecords({
      collectionName,
      userId: input.actorId,
      workspaceId: input.workspaceId,
    });
    const actual = records.filter(
      (record) =>
        record.provider === PRESSURE_PROVIDER && record.recordId.startsWith(prefix),
    ).length;
    counts[collectionName] = actual;
    if (actual !== expected) {
      failures.push(`${collectionName}: expected ${expected}, found ${actual}`);
    }
  }

  const registrations = await input.store.listRecords({
    collectionName: "event_registrations",
    userId: input.actorId,
    workspaceId: input.workspaceId,
  });
  const canonicalRegistrationEventIds = new Set(
    fixtureRecordsFor("events").map((event) => event.id),
  );
  const pressureRegistrations = registrations.filter((record) => {
    const registration = isRecord(record.payload.registration)
      ? record.payload.registration
      : null;
    const eventId = registration
      ? stringField(registration, "eventId")
      : null;
    return Boolean(
      eventId &&
        (eventId.startsWith(prefix) || canonicalRegistrationEventIds.has(eventId)),
    );
  });
  counts.event_registrations = pressureRegistrations.length;
  const expectedRegistrations = fixtureRecordsFor("events").length;
  if (pressureRegistrations.length !== expectedRegistrations) {
    failures.push(
      `event_registrations: expected ${expectedRegistrations}, found ${pressureRegistrations.length}`,
    );
  }

  const operationsRepository = createConfiguredEventOperationsRepository();
  if (!operationsRepository) {
    failures.push("canonical_event_registrations: repository unavailable");
    counts.canonical_event_registrations = 0;
  } else {
    const canonicalRegistration = await operationsRepository.getCanonicalRegistration(
      "event_signup_01",
      input.actorId,
    );
    const activeCanonicalRegistrations =
      canonicalRegistration?.status === "rsvped" ? 1 : 0;
    counts.canonical_event_registrations = activeCanonicalRegistrations;
    if (activeCanonicalRegistrations !== 1) {
      failures.push(
        `canonical_event_registrations: expected 1, found ${activeCanonicalRegistrations}`,
      );
    }
  }

  return { counts, failures };
}

async function cleanupRecords(input: {
  actorId: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<Record<string, number>> {
  const prefix = pressurePrefix(input.actorId);
  const deletedAt = new Date().toISOString();
  const counts: Record<string, number> = {};

  for (const collectionName of [...SEEDED_COLLECTIONS, "event_registrations"] as const) {
    const records = await input.store.listRecords({
      collectionName,
      userId: input.actorId,
      workspaceId: input.workspaceId,
    });
    const owned = records.filter((record) => {
      if (collectionName === "event_registrations") {
        const registration = isRecord(record.payload.registration)
          ? record.payload.registration
          : null;
        const eventId = registration
          ? stringField(registration, "eventId")
          : null;
        const canonicalRegistrationEventIds = new Set(
          fixtureRecordsFor("events").map((event) => event.id),
        );
        return Boolean(
          eventId &&
            (eventId.startsWith(prefix) || canonicalRegistrationEventIds.has(eventId)),
        );
      }
      return record.provider === PRESSURE_PROVIDER && record.recordId.startsWith(prefix);
    });
    await inBatches(owned, async (record) => {
      await input.store.deleteRecord({
          collectionName,
          deletedAt,
          recordId: record.recordId,
          workspaceId: input.workspaceId,
        });
    });
    counts[collectionName] = owned.length;
  }

  // Canonical membership is an append-only audit log. Cleanup removes the
  // account-scoped pressure records and projections but intentionally does not
  // forge a cancellation or erase membership history.
  counts.canonical_event_registrations = 0;

  return counts;
}

async function main(): Promise<void> {
  loadLocalEnv();
  const email = argumentValue("--email");
  if (!email) {
    throw new Error(
      "Usage: --email <test-account-email> [--mode seed|verify|cleanup]",
    );
  }

  const mode = parseMode();
  const authProvider = createConfiguredStorageAuthUserProvider();
  const configuredStore = createConfiguredPostgresLiveRecordStore();
  if (!authProvider || !configuredStore) {
    throw new Error("The configured live store is unavailable.");
  }

  const actor = await authProvider.getUserByEmail(email);
  if (!actor) throw new Error(`No account exists for ${email}.`);

  const input = {
    actorId: actor.id,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  };

  if (mode === "cleanup") {
    const counts = await cleanupRecords(input);
    console.log(JSON.stringify({ accountId: actor.id, counts, mode }, null, 2));
    return;
  }

  if (mode === "seed") await seedRecords(input);
  const verification = await verifyRecords(input);
  console.log(
    JSON.stringify(
      {
        accountId: actor.id,
        counts: verification.counts,
        failures: verification.failures,
        fixtureSet: `iorbit-agent-pressure-${actorKey(actor.id)}`,
        mode,
        success: verification.failures.length === 0,
        totalRecords: Object.values(verification.counts).reduce(
          (total, count) => total + count,
          0,
        ),
      },
      null,
      2,
    ),
  );
  if (verification.failures.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Pressure fixture seeding failed.");
  process.exitCode = 1;
});
