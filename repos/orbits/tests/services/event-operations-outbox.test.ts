import assert from "node:assert/strict";
import test from "node:test";

import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import { createStorageEventContactRequestNotificationWriter } from "../../features/events/event-operations/contact-request-notification-writer";
import type { EventOperationsEngine } from "../../features/events/event-operations/engine";
import {
  createEventOperationsOutboxProjector,
  EventOperationsOutboxProjectionError,
} from "../../features/events/event-operations/outbox-projector";
import type {
  EventOperationsOutboxMessage,
  EventOperationsOutboxRepository,
} from "../../features/events/event-operations/storage/postgres-outbox-repository";
import type { EventOperationsPostgresRuntime } from "../../features/events/event-operations/storage/postgres-client";
import { createEventOperationsWorker } from "../../features/events/event-operations/worker";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";

const WORKSPACE_ID = "workspace:event-operations-outbox-test";

function relationshipMessage(
  overrides: Partial<EventOperationsOutboxMessage> = {},
): EventOperationsOutboxMessage {
  const evidence: RelationshipEvidenceDTO = {
    confidence: 1,
    createdBy: "actor:owner",
    id: "evidence:event-consent:owner-target",
    occurredAt: "2026-08-03T10:00:00.000Z",
    sourceId: "event:outbox-test",
    sourceType: "event_import",
    summary: "Mutual business-card consent.",
  };
  const contact: ContactDTO = {
    createdAt: "2026-08-03T10:00:00.000Z",
    displayName: "Aiko Nakamura",
    evidenceIds: [evidence.id],
    id: "contact:event-consent:owner-target",
    organization: "Kinetic Materials",
    role: "Founder",
    source: {
      id: "event:outbox-test",
      label: "Accepted event business-card request",
      type: "event_import",
    },
    stage: "active",
    updatedAt: "2026-08-03T10:00:00.000Z",
  };
  const connection: ConnectionDTO = {
    accountId: "actor:owner",
    contactId: contact.id,
    createdAt: "2026-08-03T10:00:00.000Z",
    evidenceIds: [evidence.id],
    id: "connection:event-consent:owner-target",
    source: {
      id: "event:outbox-test",
      label: "Mutually accepted event connection",
      type: "event_import",
    },
    stage: "active",
    summary: "Met at a materials and AI founder salon.",
    updatedAt: "2026-08-03T10:00:00.000Z",
    valueTypes: ["knowledge_exchange"],
  };
  return {
    aggregateId: "relationship:owner-target",
    aggregateType: "event_relationship_side",
    attempts: 1,
    eventId: "event:outbox-test",
    eventType: "event.relationship_side.project",
    leaseEpoch: 1,
    leaseExpiresAt: "2026-08-03T10:01:00.000Z",
    leaseToken: "lease:relationship:1",
    outboxId: "outbox:relationship:owner-target",
    payload: {
      connection,
      contact,
      evidence,
      ownerActorId: "actor:owner",
      relationshipPairId: "relationship:owner-target",
      requestId: "request:owner-target",
    },
    workerId: "worker:test",
    ...overrides,
  };
}

test("relationship projection can be replayed ten times without duplicate legacy records", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const projector = createEventOperationsOutboxProjector({
    contactRequestNotifications: null,
    registrationProvider: createEventRegistrationLiveRecordProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
    relationshipProvider: createStorageBusinessCardContactWriteProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const message = relationshipMessage();

  for (let replay = 0; replay < 10; replay += 1) {
    const result = await projector.project(message);
    assert.equal(result.policy, "legacy_projection");
  }

  assert.equal(
    (await store.listRecords({ collectionName: "evidence", workspaceId: WORKSPACE_ID })).length,
    1,
  );
  assert.equal(
    (await store.listRecords({ collectionName: "contacts", workspaceId: WORKSPACE_ID })).length,
    1,
  );
  assert.equal(
    (await store.listRecords({ collectionName: "connections", workspaceId: WORKSPACE_ID })).length,
    1,
  );
  const contactId = (message.payload.contact as ContactDTO).id;
  assert.equal(
    (await store.getRecord({
      collectionName: "contacts",
      recordId: contactId,
      workspaceId: WORKSPACE_ID,
    }))?.recordId,
    contactId,
  );
});

test("contact-request lifecycle projects actor-scoped in-app notifications with internal deep links", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const projector = createEventOperationsOutboxProjector({
    contactRequestNotifications: createStorageEventContactRequestNotificationWriter({
      store,
      workspaceId: WORKSPACE_ID,
    }),
    registrationProvider: createEventRegistrationLiveRecordProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
    relationshipProvider: createStorageBusinessCardContactWriteProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const common = {
    requestId: "request:owner-target",
    requesterActorId: "actor:owner",
    targetActorId: "actor:target",
    updatedAt: "2026-08-03T10:00:00.000Z",
  };
  await store.upsertRecord({
    collectionName: "contacts",
    createdAt: common.updatedAt,
    evidenceIds: ["evidence:event-consent:owner-target"],
    lifecycleState: "active",
    payload: { displayName: "Aiko Nakamura", id: "contact:target-owned-by-owner" },
    recordId: "contact:target-owned-by-owner",
    sourceId: common.requestId,
    sourceType: "event_import",
    updatedAt: common.updatedAt,
    userId: common.requesterActorId,
    workspaceId: WORKSPACE_ID,
  });
  const transitions = [
    { eventType: "event.contact_request.created", payload: { ...common, revision: 1 } },
    { eventType: "event.contact_request.declined", payload: { ...common, revision: 2 } },
    { eventType: "event.contact_request.accepted", payload: { ...common, contactIdsByActor: { "actor:owner": "contact:target-owned-by-owner", "actor:target": "contact:owner-owned-by-target" }, revision: 3 } },
    { eventType: "event.contact_request.withdrawn", payload: { ...common, revision: 4 } },
  ] as const;
  for (const transition of transitions) {
    const result = await projector.project(relationshipMessage({
      aggregateId: common.requestId,
      aggregateType: "event_contact_request",
      ...transition,
    }));
    assert.equal(result.policy, "in_app");
    assert.equal(result.projection, "contact_request_notification");
  }
  const notifications = await store.listRecords({ collectionName: "notifications", workspaceId: WORKSPACE_ID });
  assert.equal(notifications.length, 4);
  assert.deepEqual(notifications.map((record) => record.userId), [
    "actor:target",
    "actor:owner",
    "actor:owner",
    "actor:target",
  ]);
  assert.equal(notifications[0]?.payload.actionHref, "/app/events/event%3Aoutbox-test#event-matchmaking-title");
  assert.equal(notifications[2]?.payload.actionHref, "/app/contacts/contact%3Atarget-owned-by-owner?eventId=event%3Aoutbox-test");
  assert.ok(notifications.every((record) => record.payload.channel === "in_app"));
  await assert.rejects(
    projector.project(relationshipMessage({
      aggregateId: common.requestId,
      aggregateType: "event_contact_request",
      eventType: "event.contact_request.accepted",
      payload: { ...common, revision: 5 },
    })),
    (error: unknown) => error instanceof EventOperationsOutboxProjectionError
      && error.code === "EVENT_OPERATIONS_OUTBOX_PAYLOAD_INVALID"
      && error.retryable === false,
  );
  await assert.rejects(
    projector.project(relationshipMessage({
      aggregateId: common.requestId,
      aggregateType: "event_contact_request",
      eventType: "event.contact_request.accepted",
      payload: {
        ...common,
        contactIdsByActor: { "actor:owner": "contact:not-yet-projected" },
        revision: 6,
      },
    })),
    (error: unknown) => error instanceof EventOperationsOutboxProjectionError
      && error.code === "EVENT_OPERATIONS_OUTBOX_PROVIDER_FAILED"
      && error.retryable === true,
  );
  await assert.rejects(
    projector.project(relationshipMessage({ eventType: "event.unknown" })),
    (error: unknown) =>
      error instanceof EventOperationsOutboxProjectionError &&
      error.code === "EVENT_OPERATIONS_OUTBOX_EVENT_UNSUPPORTED" &&
      error.retryable === false,
  );
});

test("registration and check-in events follow explicit durable legacy projection policies", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const projector = createEventOperationsOutboxProjector({
    contactRequestNotifications: null,
    registrationProvider: createEventRegistrationLiveRecordProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
    relationshipProvider: createStorageBusinessCardContactWriteProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const timestamp = "2026-08-03T09:55:00.000Z";
  const registration = {
    cancelledAt: null,
    eventId: "event:outbox-test",
    id: "event-registration:event:outbox-test:actor:owner",
    participantProfile: {
      answers: { goal: "Find a cross-border materials pilot partner." },
      createdAt: timestamp,
      eventId: "event:outbox-test",
      id: "participant:owner",
      updatedAt: timestamp,
      userId: "actor:owner",
    },
    participantProfileId: "participant:owner",
    reactivatedAt: null,
    registeredAt: timestamp,
    sideEffects: {},
    status: "rsvped",
    updatedAt: timestamp,
    userId: "actor:owner",
  };
  const registrationResult = await projector.project(
    relationshipMessage({
      eventType: "event.registration.upserted",
      payload: registration,
    }),
  );
  assert.equal(registrationResult.projection, "registration");
  assert.equal(
    (
      await store.listRecords({
        collectionName: "event_registrations",
        workspaceId: WORKSPACE_ID,
      })
    ).length,
    1,
  );

  const checkInResult = await projector.project(
    relationshipMessage({
      eventType: "event.checkin.created",
      payload: {
        actorId: "actor:owner",
        checkedInAt: "2026-08-03T10:05:00.000Z",
        eventId: "event:outbox-test",
        evidenceId: "evidence:event-check-in:owner",
        participantId: "participant:owner",
      },
    }),
  );
  assert.equal(checkInResult.projection, "checkin_evidence");
  assert.equal(
    (
      await store.getRecord({
        collectionName: "evidence",
        recordId: "evidence:event-check-in:owner",
        workspaceId: WORKSPACE_ID,
      })
    )?.userId,
    "actor:owner",
  );
});

test("worker retries a provider projection failure and then completes the same durable message", async () => {
  let state: "pending" | "running" | "completed" = "pending";
  let epoch = 0;
  let attempts = 0;
  let projectionCalls = 0;
  const outboxRepository: EventOperationsOutboxRepository = {
    async claim(input) {
      if (state !== "pending") return [];
      state = "running";
      attempts += 1;
      epoch += 1;
      return [
        relationshipMessage({
          attempts,
          leaseEpoch: epoch,
          leaseToken: `${input.workerId}:${epoch}`,
          workerId: input.workerId,
        }),
      ];
    },
    async complete() {
      if (state !== "running") return false;
      state = "completed";
      return true;
    },
    async fail(input) {
      if (state !== "running") return false;
      state = input.retryDelayMs === null ? "completed" : "pending";
      return true;
    },
    async heartbeat() {
      return state === "running";
    },
  };
  const runtime = {
    client: {
      async close() {},
      async query() {
        return { rowCount: 0, rows: [] };
      },
      async transaction<TValue>(operation: (executor: never) => Promise<TValue>) {
        return operation(this as never);
      },
    },
    workspaceId: WORKSPACE_ID,
  } as EventOperationsPostgresRuntime;
  const worker = createEventOperationsWorker({
    aiRequestFingerprint: "ai-stack:test-v1",
    engine: { runGeneration: async () => { throw new Error("not called"); } } as unknown as EventOperationsEngine,
    outboxProjector: {
      async project() {
        projectionCalls += 1;
        if (projectionCalls === 1) {
          throw new EventOperationsOutboxProjectionError(
            "TEST_PROVIDER_FAILURE",
            "Injected first-attempt provider failure.",
            true,
          );
        }
        return {
          policy: "legacy_projection" as const,
          projectedIds: ["contact:retry"],
          projection: "contact_relationship" as const,
        };
      },
    },
    outboxRepository,
    runtime,
    workerId: "worker:projection-retry",
  });

  const first = await worker.drainOnce();
  assert.equal(first.outboxRetried, 1);
  assert.equal(state, "pending");
  const second = await worker.drainOnce();
  assert.equal(second.outboxCompleted, 1);
  assert.equal(state, "completed");
  assert.equal(attempts, 2);
});

test("durable worker filters mixed-version generations before the discovery limit and counts only actual claims", async () => {
  const workerFingerprint = "ai-stack:v2";
  const mixedQueue = [
    {
      ai_request_fingerprint: "ai-stack:v1",
      generation_id: "generation:legacy-1",
      organizer_actor_id: "actor:organizer",
    },
    {
      ai_request_fingerprint: "ai-stack:v1",
      generation_id: "generation:legacy-2",
      organizer_actor_id: "actor:organizer",
    },
    {
      ai_request_fingerprint: workerFingerprint,
      generation_id: "generation:compatible",
      organizer_actor_id: "actor:organizer",
    },
  ];
  const generationRuns: string[] = [];
  let claimedTasks = 1;
  const runtime = {
    client: {
      async close() {},
      async query(text: string, values?: readonly unknown[]) {
        assert.match(text, /generation\.ai_request_fingerprint\s*=\s*\$3/u);
        assert.equal(values?.[2], workerFingerprint);
        const limit = Number(values?.[1] ?? 0);
        const rows = mixedQueue
          .filter((generation) => generation.ai_request_fingerprint === values?.[2])
          .slice(0, limit)
          .map(({ generation_id, organizer_actor_id }) => ({
            generation_id,
            organizer_actor_id,
          }));
        return { rowCount: rows.length, rows };
      },
      async transaction<TValue>(operation: (executor: never) => Promise<TValue>) {
        return operation(this as never);
      },
    },
    workspaceId: WORKSPACE_ID,
  } as EventOperationsPostgresRuntime;
  const outboxRepository: EventOperationsOutboxRepository = {
    async claim() { return []; },
    async complete() { return true; },
    async fail() { return true; },
    async heartbeat() { return true; },
  };
  const worker = createEventOperationsWorker({
    aiRequestFingerprint: workerFingerprint,
    engine: {
      async runGeneration(input) {
        generationRuns.push(input.generationId);
        return {
          claimedTasks,
          completedTasks: 0,
          failedTasks: 0,
          generationId: input.generationId,
          percent: 0,
          queuedTasks: 1,
          runningTasks: 0,
          status: "running" as const,
          totalTasks: 1,
        };
      },
    } as unknown as EventOperationsEngine,
    generationConcurrency: 2,
    outboxProjector: {
      async project() { throw new Error("not called"); },
    },
    outboxRepository,
    runtime,
    workerId: "worker:mixed-version",
  });

  const claimed = await worker.drainOnce();
  assert.deepEqual(claimed.generationIds, ["generation:compatible"]);
  assert.deepEqual(generationRuns, ["generation:compatible"]);
  assert.equal(claimed.workClaimed, 1);

  claimedTasks = 0;
  const discoveredButLostRace = await worker.drainOnce();
  assert.equal(discoveredButLostRace.generationBatches, 1);
  assert.equal(discoveredButLostRace.workClaimed, 0);
});

test("outbox drain completes while an independent generation drain is still running", async () => {
  const message = relationshipMessage();
  let completed = false;
  let generationFinished = false;
  let releaseGeneration!: () => void;
  let signalGenerationStarted!: () => void;
  const generationGate = new Promise<void>((resolve) => {
    releaseGeneration = resolve;
  });
  const generationStarted = new Promise<void>((resolve) => {
    signalGenerationStarted = resolve;
  });
  const outboxRepository: EventOperationsOutboxRepository = {
    async claim() {
      return completed ? [] : [message];
    },
    async complete() {
      completed = true;
      return true;
    },
    async fail() {
      return true;
    },
    async heartbeat() {
      return true;
    },
  };
  const runtime = {
    client: {
      async close() {},
      async query() {
        return {
          rowCount: 1,
          rows: [
            {
              generation_id: "generation:isolated-failure",
              organizer_actor_id: "actor:organizer",
            },
          ],
        };
      },
      async transaction<TValue>(operation: (executor: never) => Promise<TValue>) {
        return operation(this as never);
      },
    },
    workspaceId: WORKSPACE_ID,
  } as EventOperationsPostgresRuntime;
  const worker = createEventOperationsWorker({
    aiRequestFingerprint: "ai-stack:test-v1",
    engine: {
      async runGeneration() {
        signalGenerationStarted();
        await generationGate;
        generationFinished = true;
        throw new Error("Injected generation-specific failure.");
      },
    } as unknown as EventOperationsEngine,
    outboxProjector: {
      async project() {
        return {
          policy: "canonical_only" as const,
          projectedIds: [],
          projection: "none" as const,
        };
      },
    },
    outboxRepository,
    runtime,
    workerId: "worker:isolation",
  });

  const generationDrain = worker.drainGenerationsOnce();
  await generationStarted;
  const outboxResult = await worker.drainOutboxOnce();
  assert.equal(outboxResult.outboxCompleted, 1);
  assert.equal(generationFinished, false);

  releaseGeneration();
  const generationResult = await generationDrain;
  assert.equal(generationResult.errors.length, 1);
  assert.deepEqual(generationResult.errors[0], {
    id: "generation:isolated-failure",
    message: "Injected generation-specific failure.",
    scope: "generation",
  });
});
