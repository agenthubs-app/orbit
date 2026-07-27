import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  createAgentLedgerForRequest,
  resolveAgentLedgerForServerPage,
  resolveAgentRequestContext,
} from "../../app/api/_shared/agent-request-context";
import { POST as runAgentWorker } from "../../app/api/internal/agent/worker/route";
import { createAgentSchedulerRouteHandler } from "../../app/api/internal/agent/scheduler/route-handler";
import {
  createOrbitAgentRuntimeService,
  resetOrbitAgentRuntimeServicesForTests,
} from "../../features/agent/runtime/service-factory";
import { createAgentLedgerService } from "../../features/agent/service-factory";
import type { EventRecord } from "../../features/events/event-crud-and-import/contract";
import type {
  ExternalCalendarEventSummary,
  ExternalRelationshipSignal,
} from "../../features/integrations/contract";
import type { RelationshipNaturalSearchResultItem } from "../../features/search/contract";
import { createPreEventBriefCandidateCollector } from "../../features/orbit-ai/workflows/pre-event-brief-candidate-source";
import { createPreEventBriefWorkflow } from "../../features/orbit-ai/workflows/pre-event-brief-v1";

const NOW = "2026-07-26T00:00:00.000Z";
const STARTS_AT = "2026-07-26T12:00:00.000Z";

function event(): EventRecord {
  const source = {
    type: "manual" as const,
    id: "source:orbit:event",
    label: "Orbit event",
    captureMethod: "manual_form" as const,
    provider: "orbit",
    providerRecordId: "event:orbit",
    importedAt: NOW,
    calendarSyncRequested: false as const,
    organizerFeedRequested: false as const,
    liveDatabaseWriteExecuted: true,
    externalNetworkRequested: false as const,
  };
  return {
    id: "event:orbit",
    title: "Climate founder dinner",
    description: "Orbit-owned event",
    venue: "Tokyo",
    startsAt: STARTS_AT,
    endsAt: "2026-07-26T14:00:00.000Z",
    status: "confirmed",
    sourceMetadata: source,
    evidence: [
      {
        evidenceId: "evidence:orbit:event",
        source,
        excerpt: "Orbit event evidence",
        capturedAt: NOW,
        createdBy: "orbit-user",
      },
    ],
    relationshipContext: "Climate founders and storage pilots",
    recommendedPreparation: "Prepare a two-page pilot scope.",
    nextAction: "Review the Brief.",
    calendarSyncRequested: false,
    calendarProviderRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: true,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function relationship(): RelationshipNaturalSearchResultItem {
  return {
    id: "relationship:kenji",
    contactId: "contact:kenji",
    displayName: "Kenji Watanabe",
    role: "Founder",
    organization: "Aster Grid",
    industry: "climate",
    location: "Tokyo",
    relationshipContext: "Discussed a storage pilot.",
    matchedBusinessIntents: ["explore_partnership"],
    source: {
      type: "manual",
      id: "source:relationship:kenji",
      label: "Orbit relationship",
      evidenceId: "evidence:orbit:relationship",
    },
    evidence: [
      {
        evidenceId: "evidence:orbit:relationship",
        source: {
          type: "manual",
          id: "source:relationship:kenji",
          label: "Orbit relationship",
          evidenceId: "evidence:orbit:relationship",
        },
        excerpt: "Discussed Singapore storage pilot scope.",
        capturedAt: "2026-07-20T03:00:00.000Z",
        createdBy: "orbit-user",
      },
    ],
    value: {
      score: 90,
      valueTypes: ["commercial_opportunity"],
      rationale: "Owns the storage pilot decision.",
      evidenceIds: ["evidence:orbit:relationship"],
    },
    followUpStatus: "needs_follow_up",
    recommendedAction: "Confirm the pilot scope.",
    matchScore: {
      value: 0.9,
      band: "high",
      rationale: "Strong climate and pilot overlap.",
      matchedFields: ["storage pilot"],
    },
    semanticSearchExecuted: false,
    embeddingGenerated: false,
    crossProviderIndexQueried: false,
    databaseQueryExecuted: true,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

test("live Agent runtime fails closed without an authenticated actor", () => {
  assert.throws(
    () => createOrbitAgentRuntimeService("live"),
    /authenticated actor context/,
  );
});

test("actor-scoped runtimes cannot read another actor's Agent runs", async () => {
  resetOrbitAgentRuntimeServicesForTests();
  const alice = createOrbitAgentRuntimeService("mock", {
    actorId: "user:alice",
  });
  const bob = createOrbitAgentRuntimeService("mock", {
    actorId: "user:bob",
  });
  await alice.createRun({
    runId: "run:alice-only",
    workflowKey: "pre_event_brief_v1",
    workflowVersion: 1,
    trigger: "scheduler",
  });
  assert.ok(await alice.getRun("run:alice-only"));
  assert.equal(await bob.getRun("run:alice-only"), null);
  resetOrbitAgentRuntimeServicesForTests();
});

test("live request context rejects missing auth and keeps ledger actions actor-scoped", async () => {
  resetOrbitAgentRuntimeServicesForTests();
  const missing = await resolveAgentRequestContext("live", {
    authenticate: async () => null,
    runtimeForActor() {
      throw new Error("runtime must not be constructed without auth");
    },
  });
  assert.equal(missing, null);

  async function contextFor(actorId: string) {
    return resolveAgentRequestContext("live", {
      authenticate: async () => ({ user: { id: actorId } }),
      runtimeForActor(_mode, resolvedActorId) {
        assert.equal(resolvedActorId, actorId);
        return createOrbitAgentRuntimeService("mock", { actorId });
      },
    });
  }
  const alice = await contextFor("user:alice");
  const bob = await contextFor("user:bob");
  assert.ok(alice);
  assert.ok(bob);
  await createPreEventBriefWorkflow(alice.runtime).run({
    eventId: "event:alice-only",
    title: "Alice private event",
    startsAt: STARTS_AT,
    attendees: [],
    trigger: "scheduler",
  });

  const aliceLedger = await createAgentLedgerForRequest(alice).listEntries();
  const bobLedger = await createAgentLedgerForRequest(bob).listEntries();
  assert.equal(aliceLedger.success, true);
  assert.equal(bobLedger.success, true);
  if (aliceLedger.success && bobLedger.success) {
    assert.ok(
      aliceLedger.data.entries.some(
        (entry) => entry.workflowKey === "pre_event_brief_v1",
      ),
    );
    assert.equal(bobLedger.data.entries.length, 0);
  }
  resetOrbitAgentRuntimeServicesForTests();
});

test("server-rendered ledger pages resolve the authenticated actor without building an API context", async () => {
  const missing = await resolveAgentLedgerForServerPage("live", {
    authenticate: async () => null,
    ledgerForActor() {
      throw new Error("ledger must not be constructed without auth");
    },
  });
  assert.equal(missing, null);

  let resolvedActorId = "";
  const ledger = await resolveAgentLedgerForServerPage("live", {
    authenticate: async () => ({ user: { id: "user:page-reader" } }),
    ledgerForActor(actorId) {
      resolvedActorId = actorId;
      return createAgentLedgerService("mock");
    },
  });
  assert.equal(resolvedActorId, "user:page-reader");
  assert.ok(ledger);
  assert.equal((await ledger.listEntries()).success, true);
});

test("Agent ledger and queue routes resolve server auth instead of request identity fields", () => {
  for (const route of [
    "app/api/agent/ledger/route.ts",
    "app/api/agent/ledger/[id]/transition/route.ts",
    "app/api/agent/ledger/[id]/draft/route.ts",
    "app/api/agent/actions/route.ts",
    "app/api/agent/actions/[id]/accept/route.ts",
    "app/api/agent/actions/[id]/dismiss/route.ts",
    "app/api/agent/actions/[id]/view/route.ts",
    "app/api/ai/conversations/route.ts",
    "app/api/ai/runs/[id]/route.ts",
    "app/api/ai/today/route.ts",
    "app/api/events/[id]/encounters/route.ts",
    "app/api/events/[id]/post-event/followup/route.ts",
  ]) {
    const source = readFileSync(join(process.cwd(), route), "utf8");
    assert.match(source, /resolveAgentRequestContext/);
    assert.doesNotMatch(source, /body\.(actorId|workspaceId)/);
  }
});

test("Today and All actions server pages use the authenticated ledger entry point", () => {
  for (const page of [
    "app/(app)/app/today/page.tsx",
    "app/(app)/app/contacts/all-actions/page.tsx",
  ]) {
    const source = readFileSync(join(process.cwd(), page), "utf8");
    assert.match(source, /resolveAgentLedgerForServerPage/);
    assert.match(source, /ledgerService/);
    if (page.includes("/today/")) {
      assert.match(source, /auth\(\)/);
      assert.match(source, /redirect\("\/app\/account\/login/);
    }
  }
});

test("Brief collection preserves Orbit-first priority and metadata-only mail enrichment", async () => {
  const calls: string[] = [];
  const calendar: ExternalCalendarEventSummary = {
    providerRecordId: "calendar:event:1",
    title: "Climate founder dinner",
    startsAt: STARTS_AT,
    endsAt: "2026-07-26T14:00:00.000Z",
    location: "Calendar location must not replace Orbit",
    attendeeCount: 8,
    evidenceId: "evidence:calendar:event",
  };
  const signal: ExternalRelationshipSignal = {
    providerRecordId: "mail:metadata:1",
    kind: "email_metadata",
    occurredAt: "2026-07-24T04:00:00.000Z",
    counterpartDomain: "astergrid.com",
    subjectHint: "Singapore pilot scope",
    evidenceId: "evidence:mail:metadata",
    messageBodyPersisted: false,
  };
  const collector = createPreEventBriefCandidateCollector({
    actorId: "user:alice",
    now: () => NOW,
    orbit: {
      async listEvents() {
        calls.push("orbit-events");
        return [event()];
      },
      async listRelationships() {
        calls.push("orbit-relationships");
        return [relationship()];
      },
    },
    external: {
      async listCalendarEvents() {
        calls.push("authorized-calendar");
        return [calendar];
      },
      async listRelationshipSignals() {
        calls.push("authorized-mail-calendar-metadata");
        return [signal];
      },
    },
    delivery: {
      async getDeliveryProfile() {
        return {
          costlyMiss: true,
          pushEnabled: true,
          pushToken: "push:alice",
        };
      },
    },
  });

  const candidates = await collector.collect();
  assert.deepEqual(calls, [
    "orbit-events",
    "orbit-relationships",
    "authorized-calendar",
    "authorized-mail-calendar-metadata",
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].location, "Tokyo");
  assert.deepEqual(candidates[0].evidenceIds?.slice(0, 4), [
    "evidence:orbit:event",
    "evidence:calendar:event",
    "evidence:orbit:relationship",
    "evidence:mail:metadata",
  ]);
  assert.deepEqual(candidates[0].attendees[0].evidenceSummaries, [
    "Discussed Singapore storage pilot scope.",
    "Singapore pilot scope",
  ]);
  assert.equal(
    Object.hasOwn(
      candidates[0].attendees[0] as unknown as Record<string, unknown>,
      "messageBody",
    ),
    false,
  );
});

test("scheduler API rejects missing actor and client-supplied candidates or identity", async () => {
  let serviceConstructed = false;
  const handler = createAgentSchedulerRouteHandler({
    authorize: () => true,
    resolveActorId: (request) =>
      request.headers.get("x-orbit-actor-id")?.trim() || null,
    runtimeForActor() {
      serviceConstructed = true;
      return createOrbitAgentRuntimeService("mock");
    },
    collectorForActor() {
      serviceConstructed = true;
      return { collect: async () => [] };
    },
  });

  const unauthenticated = await handler(
    new Request("http://localhost/api/internal/agent/scheduler", {
      method: "POST",
    }),
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal(serviceConstructed, false);

  for (const body of [
    { candidates: [event()] },
    { actorId: "user:bob" },
    { workspaceId: "workspace:other" },
  ]) {
    const response = await handler(
      new Request("http://localhost/api/internal/agent/scheduler", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orbit-actor-id": "user:alice",
        },
        body: JSON.stringify(body),
      }),
    );
    assert.equal(response.status, 400);
    const payload = (await response.json()) as {
      error: { code: string };
    };
    assert.equal(payload.error.code, "CLIENT_SCHEDULER_INPUT_FORBIDDEN");
  }
  assert.equal(serviceConstructed, false);
});

test("worker API rejects missing actor and request-body identity before executor construction", async () => {
  const missingActor = await runAgentWorker(
    new Request("http://localhost/api/internal/agent/worker", {
      method: "POST",
    }),
  );
  assert.equal(missingActor.status, 401);

  for (const body of [
    { actorId: "user:bob" },
    { workspaceId: "workspace:other" },
  ]) {
    const response = await runAgentWorker(
      new Request("http://localhost/api/internal/agent/worker", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orbit-actor-id": "user:alice",
        },
        body: JSON.stringify(body),
      }),
    );
    assert.equal(response.status, 400);
    const payload = (await response.json()) as {
      error: { code: string };
    };
    assert.equal(payload.error.code, "CLIENT_WORKER_IDENTITY_FORBIDDEN");
  }
});

test("scheduler API binds collector and runtime to the same authenticated actor", async () => {
  resetOrbitAgentRuntimeServicesForTests();
  const bound: string[] = [];
  const handler = createAgentSchedulerRouteHandler({
    authorize: () => true,
    resolveActorId: (request) =>
      request.headers.get("x-orbit-actor-id")?.trim() || null,
    resolveMode: () => "mock",
    runtimeForActor(actorId) {
      bound.push(`runtime:${actorId}`);
      return createOrbitAgentRuntimeService("mock", { actorId });
    },
    collectorForActor(actorId) {
      bound.push(`collector:${actorId}`);
      return { collect: async () => [] };
    },
    preferences: async () => ({
      preEventBriefPushEnabled: true,
      quietHours: { start: "22:00", end: "08:00" },
      timeZone: "Asia/Tokyo",
    }),
    push: () => null,
  });

  for (const actorId of ["user:alice", "user:bob"]) {
    const response = await handler(
      new Request("http://localhost/api/internal/agent/scheduler", {
        method: "POST",
        headers: { "x-orbit-actor-id": actorId },
      }),
    );
    assert.equal(response.status, 200);
  }
  assert.deepEqual(bound, [
    "collector:user:alice",
    "runtime:user:alice",
    "collector:user:bob",
    "runtime:user:bob",
  ]);
  resetOrbitAgentRuntimeServicesForTests();
});
