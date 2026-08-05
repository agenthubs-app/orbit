import assert from "node:assert/strict";
import test from "node:test";

import { createAttendeePostEventAiArtifactGetHandler, createAttendeePostEventAiArtifactPostHandler } from "../../app/api/events/[id]/post-event/artifact/handler";
import type { EventRegistration } from "../../features/events/registration/contract";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import {
  ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION,
  createLiveRecordAttendeePostEventAiArtifactReader,
} from "../../features/events/post-event-artifact/live-record-reader";
import { processAttendeePostEventAiTask } from "../../features/events/post-event-artifact/processor";
import { createAttendeePostEventAiTaskRepository } from "../../features/events/post-event-artifact/task-repository";
import { postEventEvidenceHash } from "../../features/events/post-event-artifact/evidence-version";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";

const eventId = "demo-event-1";
const actorA = "actor:attendee-a";
const actorB = "actor:attendee-b";
const timestamp = "2026-08-04T12:00:00.000Z";

function artifactRecord(input: {
  actorId: string;
  evidenceIds?: readonly string[];
  generationMethod?: string;
  payloadEvidenceIds?: readonly string[];
  status?: "queued" | "running" | "ready" | "failed";
  summary?: string;
}): LiveRecord<Record<string, unknown>> {
  const evidenceIds = input.evidenceIds ?? ["evidence:encounter:a"];
  const evidenceHash = postEventEvidenceHash([], evidenceIds);
  return {
    collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION,
    createdAt: timestamp,
    evidenceIds,
    lifecycleState: "active",
    payload: {
      artifact: {
        evidenceHash,
        evidenceIds: input.payloadEvidenceIds ?? evidenceIds,
        generatedAt: timestamp,
        messageDraft: "A provider-generated draft grounded in the recorded commitment.",
        summary: input.summary ?? "A provider-generated summary of the attendee's own encounter evidence.",
        version: 1,
      },
      attendeeActorId: input.actorId,
      eventId,
      evidenceHash,
      failureCode: input.status === "failed" ? "PROVIDER_TIMEOUT" : null,
      provenance: {
        generationMethod: input.generationMethod ?? "ai-provider",
        model: "gpt-5.6",
        promptVersion: 3,
        provider: "openai",
      },
      status: input.status ?? "ready",
      taskId: `post-event:${eventId}:${input.actorId}`,
      version: 1,
    },
    recordId: `post-event:${eventId}:${input.actorId}`,
    sourceId: `source:post-event:${eventId}:${input.actorId}`,
    sourceType: "event_import",
    targetId: eventId,
    targetType: "event",
    updatedAt: timestamp,
    userId: input.actorId,
    workspaceId: "workspace:test",
  };
}

function registration(actorId: string): EventRegistration {
  return {
    cancelledAt: null,
    eventId,
    id: `registration:${eventId}:${actorId}`,
    participantProfile: {
      answers: {},
      createdAt: timestamp,
      eventId,
      id: `profile:${eventId}:${actorId}`,
      updatedAt: timestamp,
      userId: actorId,
    },
    participantProfileId: `profile:${eventId}:${actorId}`,
    reactivatedAt: null,
    registeredAt: timestamp,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: "rsvped",
    updatedAt: timestamp,
    userId: actorId,
  };
}

test("attendee artifact reader isolates actor and event before exposing ready provider prose", async () => {
  const reader = createLiveRecordAttendeePostEventAiArtifactReader({
    store: createMemoryLiveRecordStore([
      artifactRecord({ actorId: actorA, summary: "Attendee A summary" }),
      artifactRecord({ actorId: actorB, summary: "Attendee B summary" }),
    ]),
    workspaceId: "workspace:test",
  });

  const view = await reader.read({ attendeeActorId: actorA, eventId });
  assert.equal(view.status, "ready");
  assert.equal(view.artifact?.summary, "Attendee A summary");
  assert.doesNotMatch(JSON.stringify(view), /Attendee B summary/);
});

test("ready records fail closed when provenance is deterministic or evidence is not permitted", async () => {
  for (const record of [
    artifactRecord({ actorId: actorA, generationMethod: "deterministic-summary" }),
    artifactRecord({ actorId: actorA, payloadEvidenceIds: ["evidence:other-attendee"] }),
  ]) {
    const reader = createLiveRecordAttendeePostEventAiArtifactReader({
      store: createMemoryLiveRecordStore([record]),
      workspaceId: "workspace:test",
    });
    const view = await reader.read({ attendeeActorId: actorA, eventId });
    assert.equal(view.status, "failed");
    assert.equal(view.failureCode, "AI_ARTIFACT_POLICY_REJECTED");
    assert.equal(view.artifact, null);
  }
});

test("artifact reader preserves queued, running, and failed states without exposing premature prose", async () => {
  const emptyReader = createLiveRecordAttendeePostEventAiArtifactReader({
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:test",
  });
  assert.equal((await emptyReader.read({ attendeeActorId: actorA, eventId })).status, "unconfigured");

  for (const expected of ["queued", "running", "failed"] as const) {
    const reader = createLiveRecordAttendeePostEventAiArtifactReader({
      store: createMemoryLiveRecordStore([artifactRecord({ actorId: actorA, status: expected })]),
      workspaceId: "workspace:test",
    });
    const view = await reader.read({ attendeeActorId: actorA, eventId });
    assert.equal(view.status, expected);
    assert.equal(view.artifact, null);
    assert.equal(view.failureCode, expected === "failed" ? "AI_GENERATION_FAILED" : null);
  }
});

test("artifact request is idempotent and worker leases a real queued task into stored ready state", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createAttendeePostEventAiTaskRepository({ store, workspaceId: "workspace:test" });
  const requested = {
    attendeeActorId: actorA,
    eventId,
    evidenceSnapshot: [{ commitments: ["Send benchmark"], contactId: "contact:a", evidenceId: "evidence:human-encounter:a", nextStep: "Review next week", noteText: "Discussed a concrete benchmark.", observedAt: timestamp, talked: "yes" as const }],
    evidenceWhitelist: ["evidence:human-encounter:a"],
    model: "gpt-5.6",
    promptVersion: 1,
    provider: "openai",
    requestedAt: timestamp,
  };
  assert.equal((await repository.request(requested)).status, "queued");
  assert.equal((await repository.request(requested)).status, "queued");
  assert.equal((await store.listRecords({ collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, workspaceId: "workspace:test" })).length, 1);

  const outcome = await processAttendeePostEventAiTask({
    config: { apiKey: "test", provider: "openai" },
    now: () => "2026-08-04T12:01:00.000Z",
    repository,
    runModelText: async () => ({ model: "gpt-5.6", provider: "openai", source: "provider:openai-responses-api", success: true, text: JSON.stringify({ messageDraft: "Thank you for the benchmark discussion.", summary: "The attendee committed to send a benchmark before next week's review." }) }),
    workerId: "worker:test",
  });
  assert.equal(outcome, "ready");
  const reader = createLiveRecordAttendeePostEventAiArtifactReader({ store, workspaceId: "workspace:test" });
  const view = await reader.read({ attendeeActorId: actorA, eventId });
  assert.equal(view.status, "ready");
  assert.equal(view.artifact?.provider, "openai");
  assert.deepEqual(view.artifact?.evidenceIds, requested.evidenceWhitelist);
});

test("changed encounter evidence queues a new artifact version and the older ready artifact is history, not current", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createAttendeePostEventAiTaskRepository({ store, workspaceId: "workspace:test" });
  const firstRequest = {
    attendeeActorId: actorA,
    eventId,
    evidenceSnapshot: [{ commitments: ["Send benchmark"], contactId: "contact:a", evidenceId: "evidence:human-encounter:a", nextStep: "Review next week", noteText: "Initial evidence", observedAt: timestamp, talked: "yes" as const }],
    evidenceWhitelist: ["evidence:human-encounter:a"],
    model: "gpt-5.6",
    promptVersion: 1,
    provider: "openai",
    requestedAt: timestamp,
  };
  await repository.request(firstRequest);
  assert.equal(await processAttendeePostEventAiTask({
    config: { apiKey: "test", provider: "openai" },
    now: () => "2026-08-04T12:01:00.000Z",
    repository,
    runModelText: async () => ({ model: "gpt-5.6", provider: "openai", source: "provider:openai-responses-api", success: true, text: JSON.stringify({ messageDraft: null, summary: "Version one" }) }),
    workerId: "worker:v1",
  }), "ready");

  const second = await repository.request({
    ...firstRequest,
    evidenceSnapshot: [...firstRequest.evidenceSnapshot, { commitments: ["Introduce procurement lead"], contactId: "contact:b", evidenceId: "evidence:human-encounter:b", nextStep: "Meet Friday", noteText: "A new accepted encounter changed the evidence set", observedAt: "2026-08-04T12:02:00.000Z", talked: "yes" as const }],
    evidenceWhitelist: [...firstRequest.evidenceWhitelist, "evidence:human-encounter:b"],
    requestedAt: "2026-08-04T12:03:00.000Z",
  });
  assert.equal(second.version, 2);
  assert.equal(second.status, "queued");
  const records = await store.listRecords({ collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, workspaceId: "workspace:test" });
  assert.equal(records.length, 2, "the first ready artifact remains immutable history");
  const beforeRegeneration = await createLiveRecordAttendeePostEventAiArtifactReader({ store, workspaceId: "workspace:test" }).read({ attendeeActorId: actorA, eventId });
  assert.equal(beforeRegeneration.status, "queued");
  assert.equal(beforeRegeneration.artifact, null, "the stale ready artifact must not masquerade as current");
});

test("worker stores strict schema failures with attempt metadata and no fallback prose", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createAttendeePostEventAiTaskRepository({ store, workspaceId: "workspace:test" });
  await repository.request({
    attendeeActorId: actorA,
    eventId,
    evidenceSnapshot: [{ commitments: [], contactId: "contact:a", evidenceId: "evidence:human-encounter:a", nextStep: "", noteText: "Recorded evidence", observedAt: timestamp, talked: "yes" }],
    evidenceWhitelist: ["evidence:human-encounter:a"],
    maxAttempts: 1,
    model: "gpt-5.6",
    promptVersion: 1,
    provider: "openai",
    requestedAt: timestamp,
  });
  const outcome = await processAttendeePostEventAiTask({
    config: { apiKey: "test", provider: "openai" },
    now: () => "2026-08-04T12:01:00.000Z",
    repository,
    runModelText: async () => ({ model: "gpt-5.6", provider: "openai", source: "provider:openai-responses-api", success: true, text: JSON.stringify({ messageDraft: "Invented", summary: "Invented", unsupported: true }) }),
    workerId: "worker:test",
  });
  assert.equal(outcome, "failed");
  const record = (await store.listRecords({ collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, workspaceId: "workspace:test" }))[0];
  const stored = record?.payload as any;
  assert.equal(stored.status, "failed");
  assert.equal(stored.attemptCount, 1);
  assert.equal(stored.error.code, "MODEL_SCHEMA_INVALID");
  assert.equal(stored.error.retryable, false);
  assert.equal(stored.artifact, null);
});

test("worker honors the provider retryability decision instead of retrying terminal billing failures", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createAttendeePostEventAiTaskRepository({ store, workspaceId: "workspace:test" });
  await repository.request({
    attendeeActorId: actorA,
    eventId,
    evidenceSnapshot: [{ commitments: ["Send benchmark"], contactId: "contact:a", evidenceId: "evidence:human-encounter:a", nextStep: "Review next week", noteText: "Discussed a concrete benchmark.", observedAt: timestamp, talked: "yes" }],
    evidenceWhitelist: ["evidence:human-encounter:a"],
    maxAttempts: 4,
    model: "deepseek-v4-flash",
    promptVersion: 1,
    provider: "deepseek",
    requestedAt: timestamp,
  });

  const outcome = await processAttendeePostEventAiTask({
    config: { apiKey: "test", provider: "deepseek" },
    now: () => "2026-08-04T12:01:00.000Z",
    repository,
    runModelText: async () => ({
      error: {
        code: "MODEL_REQUEST_FAILED",
        message: "Insufficient Balance",
        provider: "deepseek",
        source: "provider:deepseek-chat-completions-api",
      },
      retryable: false,
      success: false,
    }),
    workerId: "worker:terminal-provider-failure",
  });

  assert.equal(outcome, "failed");
  const record = (await store.listRecords({ collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, workspaceId: "workspace:test" }))[0];
  const stored = record?.payload as any;
  assert.equal(stored.status, "failed");
  assert.equal(stored.attemptCount, 1);
  assert.equal(stored.error.code, "MODEL_REQUEST_FAILED");
  assert.equal(stored.error.retryable, false);
  assert.equal(stored.artifact, null);
});

test("attendee artifact API uses the registered actor scope instead of organizer scope", async () => {
  let observedActorId = "";
  const handler = createAttendeePostEventAiArtifactGetHandler({
    artifactReader: {
      async read(input) {
        observedActorId = input.attendeeActorId;
        return { artifact: null, eventId: input.eventId, failureCode: null, status: "running", updatedAt: timestamp };
      },
    },
    getRegistration: async () => registration(actorA),
    loadEvent: async () => mockEventRecords.find((event) => event.id === eventId) ?? null,
    providerConfiguration: { config: { apiKey: "test", provider: "openai" }, model: "gpt-5.6", provider: "openai" },
    resolveActor: async () => ({ email: "a@example.test", id: actorA, name: "Attendee A" }),
  });
  const response = await handler(
    new Request(`http://localhost/api/events/${eventId}/post-event/artifact`),
    { params: Promise.resolve({ id: eventId }) },
  );
  assert.equal(response.status, 200);
  assert.equal(observedActorId, actorA);
  assert.deepEqual((await response.json()).data, {
    artifact: null,
    eventId,
    failureCode: null,
    status: "running",
    updatedAt: timestamp,
  });
});

test("attendee artifact API reports unconfigured without borrowing organizer review data", async () => {
  const handler = createAttendeePostEventAiArtifactGetHandler({
    artifactReader: null,
    getRegistration: async () => registration(actorA),
    loadEvent: async () => mockEventRecords.find((event) => event.id === eventId) ?? null,
    resolveActor: async () => ({ email: "a@example.test", id: actorA, name: "Attendee A" }),
  });
  const response = await handler(
    new Request(`http://localhost/api/events/${eventId}/post-event/artifact`),
    { params: Promise.resolve({ id: eventId }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, {
    artifact: null,
    eventId,
    failureCode: null,
    status: "unconfigured",
    updatedAt: null,
  });
});

test("artifact POST queues one idempotent task from the registered attendee's explicit encounters", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const taskRepository = createAttendeePostEventAiTaskRepository({ store, workspaceId: "workspace:test" });
  const handler = createAttendeePostEventAiArtifactPostHandler({
    encounterService: {
      async list(input) {
        assert.deepEqual(input, { actorId: actorA, eventId });
        return [{
          actorId: actorA, commitments: ["Send the energy benchmark"], connectionId: null, contactId: "contact:a", createdAt: timestamp, encounterId: "encounter:a", eventId, nextStep: "Review next Thursday", noteText: "Compared grid-scale storage deployment constraints.", observedAt: timestamp, privacy: "private", projection: { attempts: 0, availableAt: timestamp, lastError: null, leaseExpiresAt: null, leaseToken: null, status: "pending" }, requestHash: "request-hash:a", talked: "yes", tags: ["energy"], voiceMemoReference: null,
        }];
      },
    },
    getRegistration: async () => registration(actorA),
    loadEvent: async () => mockEventRecords.find((event) => event.id === eventId) ?? null,
    providerConfiguration: { config: { apiKey: "test", provider: "openai" }, model: "gpt-5.6", provider: "openai" },
    resolveActor: async () => ({ email: "a@example.test", id: actorA, name: "Attendee A" }),
    taskRepository,
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await handler(new Request(`http://localhost/api/events/${eventId}/post-event/artifact`, { method: "POST" }), { params: Promise.resolve({ id: eventId }) });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).data.status, "queued");
  }
  const records = await store.listRecords({ collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, workspaceId: "workspace:test" });
  assert.equal(records.length, 1);
  assert.equal(records[0]?.userId, actorA);
  assert.deepEqual(records[0]?.evidenceIds, ["evidence:human-encounter:encounter:a"]);
});

test("artifact POST excludes encounters that the attendee marked as no conversation or uncertain", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const taskRepository = createAttendeePostEventAiTaskRepository({ store, workspaceId: "workspace:test" });
  const encounter = (encounterId: string, talked: "yes" | "no" | "uncertain") => ({
    actorId: actorA,
    commitments: talked === "yes" ? ["Send the benchmark"] : [],
    connectionId: null,
    contactId: `contact:${encounterId}`,
    createdAt: timestamp,
    encounterId,
    eventId,
    nextStep: talked === "yes" ? "Review next Thursday" : "",
    noteText: talked === "yes" ? "Compared deployment constraints." : "No confirmed conversation took place.",
    observedAt: timestamp,
    privacy: "private" as const,
    projection: { attempts: 0, availableAt: timestamp, lastError: null, leaseExpiresAt: null, leaseToken: null, status: "pending" as const },
    requestHash: `request-hash:${encounterId}`,
    talked,
    tags: [],
    voiceMemoReference: null,
  });
  const handler = createAttendeePostEventAiArtifactPostHandler({
    encounterService: {
      async list() {
        return [
          encounter("confirmed", "yes"),
          encounter("not-spoken", "no"),
          encounter("uncertain", "uncertain"),
        ];
      },
    },
    getRegistration: async () => registration(actorA),
    loadEvent: async () => mockEventRecords.find((event) => event.id === eventId) ?? null,
    providerConfiguration: { config: { apiKey: "test", provider: "openai" }, model: "gpt-5.6", provider: "openai" },
    resolveActor: async () => ({ email: "a@example.test", id: actorA, name: "Attendee A" }),
    taskRepository,
  });

  const response = await handler(
    new Request(`http://localhost/api/events/${eventId}/post-event/artifact`, { method: "POST" }),
    { params: Promise.resolve({ id: eventId }) },
  );
  assert.equal(response.status, 202);
  const record = (await store.listRecords({ collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, workspaceId: "workspace:test" }))[0];
  const task = record?.payload as any;
  assert.deepEqual(task.evidenceWhitelist, ["evidence:human-encounter:confirmed"]);
  assert.deepEqual(task.evidenceSnapshot.map((item: { talked: string }) => item.talked), ["yes"]);
});
