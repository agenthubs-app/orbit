import assert from "node:assert/strict";

import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import {
  createPostgresContactRecordPageReader,
  createStorageContactGraphProvider,
} from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { createLiveDashboardAggregateService } from "../../features/dashboard/live-service";
import { createStorageDashboardAggregateProvider } from "../../features/dashboard/storage/dashboard-live-record-provider";
import { createLiveNetworkDistributionAnalyticsService } from "../../features/dashboard/live-distribution-service";
import { createLiveOpportunityReminderAnalyticsService } from "../../features/dashboard/live-opportunity-service";
import {
  networkDistributionProviderForAccount,
  opportunityProviderForAccount,
} from "../../features/dashboard/service-factory";
import { createMobileContactsDashboardServiceFromSources } from "../../features/mobile/contacts-dashboard-service";
import { createLiveProfileService } from "../../features/profile/live-service";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createLiveEventCrudAndImportService } from "../../features/events/event-crud-and-import/live-service";
import { createStorageEventStoreProvider } from "../../features/events/event-crud-and-import/providers/storage-event-provider";
import { createNoteAssociationReader } from "../../features/notes/association-reader";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { SYNC_REVISION_ASSIGN_ONLY_SQL } from "../support/sync-revision-fixture";
import { withConversationTurnSteps } from "../../features/agent/runtime/conversation-run-steps";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createTransactionalOrbitAgentChatRequestStore } from "../../features/orbit-ai/storage/orbit-agent-chat-request-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

/**
 * The five operation chains of the frozen read-cost baseline, seeded and
 * composed exactly as production composes them (read-dedupe wrapper
 * included); only the SQL client is the caller's measured one. Shared by the
 * baseline ratchet and the read-receipt reconciliation test so both measure
 * the same operations.
 */
export const READ_COST_SEEDED_AT = "2026-09-18T00:00:00.000Z";
export const READ_COST_NOTE_COUNT = 12;
export const READ_COST_TASK_COUNT = 12;
/** Plain AI answers recorded before 0103 (a run, 8 step rows, 2 analytics rows each). */
export const READ_COST_LEGACY_AI_RUN_COUNT = 20;

/**
 * Sprint 0103 chain "ai.run" (GET /api/ai/runs/[id]): the actor has legacy
 * plain-answer history plus one confirmed action run whose turn is on a
 * reliable request record. Returns the reads the route performs.
 */
async function seedAiRunChain(client: TransactionalPostgresClient, workspaceId: string, actorId: string): Promise<() => Promise<unknown>> {
  const repository = createStorageAgentRuntimeRepository({
    store: createPostgresLiveRecordStore({ client }),
    sqlClient: client,
    workspaceId: `${workspaceId}:agent-actor:${actorId}`,
  });
  let sequence = 0;
  const runtime = createAgentRuntimeService({
    repository,
    now: () => READ_COST_SEEDED_AT,
    id: () => `read-cost-${String(++sequence).padStart(6, "0")}`,
    executors: createAgentExecutorRegistry([{ key: "read-cost.persist", riskLevel: "write", async execute() {
      return { resultRef: "read-cost:written", summary: "Deterministic read-cost execution" };
    } }]),
  });
  for (let index = 0; index < READ_COST_LEGACY_AI_RUN_COUNT; index += 1) {
    const runId = `run:conversation:read-cost-${index}`;
    await repository.saveRun({ runId, workflowKey: "agent_conversation_v1", workflowVersion: 1, trigger: "chat", status: "completed",
      actionIds: [], createdAt: READ_COST_SEEDED_AT, startedAt: READ_COST_SEEDED_AT, completedAt: READ_COST_SEEDED_AT, updatedAt: READ_COST_SEEDED_AT });
    for (let step = 1; step <= 8; step += 1) {
      await repository.saveRunStep({ stepId: `${runId}:step:${step}`, runId, kind: "deterministic", name: `phase_${step}`, sequence: step,
        status: "completed", attempt: 1, createdAt: READ_COST_SEEDED_AT, updatedAt: READ_COST_SEEDED_AT });
    }
  }
  const runId = "run:natural-language:read-cost";
  const actionId = "action:natural-language:read-cost";
  await runtime.createRun({ runId, workflowKey: "agent_natural_language_actions_v1", trigger: "chat", conversationId: "conversation:read-cost" });
  await runtime.proposeAction({
    actionId, runId, workflowKey: "agent_natural_language_actions_v1", workflowVersion: 1,
    title: "Read-cost action", whyNow: "Deterministic", preview: "Read-cost", riskLevel: "write", payloadVersion: 1,
    compensation: { supported: false }, evidenceChips: [], evidenceIds: [], sourceRefs: [],
    operations: [{ operationId: `${actionId}:operation:1`, operationType: "create_followup_task", executorKey: "read-cost.persist",
      idempotencyKey: `${actionId}:v1`, payloadVersion: 1, payload: {}, preview: "Read-cost", riskLevel: "write", compensation: { supported: false } }],
  });
  await runtime.approveAction({ actionId, actorLabel: "Read-cost" });
  await runtime.processOutbox({ workerId: "read-cost", limit: 5 });
  const requests = createTransactionalOrbitAgentChatRequestStore({ actorId, client, workspaceId, now: () => READ_COST_SEEDED_AT });
  await requests.reserve("request:read-cost", "fingerprint:read-cost", "session:read-cost");
  await requests.complete("request:read-cost", "fingerprint:read-cost", {
    success: true,
    data: { runId, activeConversationId: "conversation:read-cost", diagnostics: { maxLoopSteps: 3, timings: [
      { phase: "local_boundary", durationMs: 5 }, { phase: "planner", durationMs: 900 }, { phase: "synthesis", durationMs: 4000 },
    ] } },
  });
  return async () => {
    const stored = await repository.getRun(runId);
    assert.ok(stored, "ai.run must find the run");
    const detail = withConversationTurnSteps(stored, (await requests.findByRunId!(runId)) ?? null);
    assert.equal(detail.actions.length, 1);
    assert.equal(detail.steps.length, 3, "ai.run derives the turn's steps from its request record");
    return detail.steps.map((step) => step.stepId);
  };
}

export async function seedReadCostChains({
  client,
  databaseUrl,
  schema,
  workspaceId,
  actorId,
}: {
  client: TransactionalPostgresClient;
  databaseUrl: string;
  schema: string;
  workspaceId: string;
  actorId: string;
}): Promise<Record<string, () => Promise<unknown>>> {
  const configured = createConfiguredPostgresLiveRecordStore({
    createClient: () => ({ query: client.query.bind(client), close: async () => {} }),
    env: {
      ORBIT_DATABASE_TARGET: "local",
      ORBIT_LOCAL_DATABASE_URL: `${databaseUrl}#${schema}`,
      ORBIT_LOCAL_WORKSPACE_ID: workspaceId,
    },
  });
  assert.ok(configured);
  const { store } = configured;
  // sync_revision as on the development database: the dashboard graph version needs it (0102).
  await client.query(SYNC_REVISION_ASSIGN_ONLY_SQL);
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId, now: () => READ_COST_SEEDED_AT });
  const notes = createNoteService({
    repository: createNoteRepository({ store, workspaceId }),
    associationReader: createNoteAssociationReader({
      contactProvider: createStorageContactGraphProvider({ store, workspaceId }),
      store,
      workspaceId,
    }),
  });
  for (let index = 0; index < READ_COST_NOTE_COUNT; index += 1) {
    await notes.create({
      actorId,
      title: `Baseline note ${index}`,
      body: `Deterministic note body ${index}`,
      idempotencyKey: `read-cost:note:${index}`,
      now: READ_COST_SEEDED_AT,
    });
  }

  // Generated fixture tasks are legacy-shaped and invisible to the canonical task list;
  // the measured actor's tasks are created through the real service like API traffic.
  const tasks = createTaskService({ repository: createTaskRepository({ store, workspaceId, transactionClient: client }) });
  for (let index = 0; index < READ_COST_TASK_COUNT; index += 1) {
    await tasks.create({
      actorId,
      title: `Baseline task ${index}`,
      category: "work",
      idempotencyKey: `read-cost:task:${index}`,
      now: READ_COST_SEEDED_AT,
    });
  }

  const contactProvider = createStorageContactGraphProvider({
    store,
    workspaceId,
    contactScopeRecordReader: createPostgresContactScopeRecordReader({ client, workspaceId }),
    contactRecordPageReader: createPostgresContactRecordPageReader({ client, workspaceId }),
  });
  // The chains measure unchanged data: the actor's gaps/opportunities snapshot
  // is computed once here, as the first dashboard open after a write would.
  const primed = await createStorageDashboardAggregateProvider({ store, workspaceId, sqlClient: client })
    .readDashboardAnalysisSnapshotForAccount!(actorId);
  assert.ok(primed, "the seeded schema provides a graph version");
  const aiRun = await seedAiRunChain(client, workspaceId, actorId);
  return {
    "ai.run": aiRun,
    "contacts.list": async () => {
      const result = await createLiveContactsListSearchAndFilterService({ provider: contactProvider }).listContacts({ actorId });
      assert.ok(result.success, "contacts.list must succeed");
      assert.ok(result.data.contacts.length > 0, "contacts.list must return the actor's contacts");
      return result.data.contacts.length;
    },
    "tasks.list": async () => {
      const items = await tasks.list({ actorId });
      assert.equal(items.length, READ_COST_TASK_COUNT);
      return items.length;
    },
    "notes.list": async () => {
      const items = await notes.list({ actorId });
      assert.equal(items.length, READ_COST_NOTE_COUNT);
      return items.length;
    },
    "dashboard": async () => {
      const result = await createLiveDashboardAggregateService({
        provider: createStorageDashboardAggregateProvider({ store, workspaceId, sqlClient: client }),
      }).getDashboardAggregate({ actorId });
      assert.ok(result.success, "dashboard must succeed");
      return result.success;
    },
    "contacts.dashboard": async () => {
      // Production composition of /api/mobile/contacts-dashboard; the stored AI
      // analysis lookup (chat sessions) is not part of this read chain.
      const dashboardProvider = createStorageDashboardAggregateProvider({ store, workspaceId, sqlClient: client });
      const result = await createMobileContactsDashboardServiceFromSources({
        dashboard: createLiveDashboardAggregateService({ provider: dashboardProvider }),
        distribution: (id) => createLiveNetworkDistributionAnalyticsService({
          provider: networkDistributionProviderForAccount(dashboardProvider, id),
        }),
        opportunity: (id) => createLiveOpportunityReminderAnalyticsService({
          provider: opportunityProviderForAccount(dashboardProvider, id),
        }),
        profile: createLiveProfileService({ provider: createStorageProfileProvider({ store, workspaceId }) }),
        contacts: createLiveContactsListSearchAndFilterService({ provider: contactProvider }),
        contactRoleCounts: (id) => dashboardProvider.readContactRoleCountsForAccount!(id),
        graphVersion: (id) => dashboardProvider.readDashboardGraphVersionForAccount!(id),
      }).getDashboard({ actorId });
      assert.ok(result.success, "contacts.dashboard must succeed");
      assert.deepEqual(result.data.unavailableSections.filter((section) => section !== "analysis" && section !== "profile"), []);
      return result.data.aggregate.relationshipAssetTotals.contacts;
    },
    "events.list": async () => {
      const result = await createLiveEventCrudAndImportService({
        provider: createStorageEventStoreProvider({ store, workspaceId }),
      }).listEvents({ actorId });
      assert.ok(result.success, "events.list must succeed");
      return result.success;
    },
  };
}
