import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import ts from "typescript";

import { saveAgentFeedback } from "../../app/api/agent/feedback/handler";
import { createAiProviderRunGetHandler } from "../../app/api/ai/runs/[id]/handler";
import { AGENT_FEEDBACK_COLLECTION } from "../../features/agent/feedback/service";
import { createAgentFeedbackService } from "../../features/agent/feedback/service-factory";
import { createLiveOrbitAgentTrace } from "../../features/orbit-ai/live-conversation-trace";
import { createPostEventFollowupWorkflow } from "../../features/orbit-ai/workflows/post-event-followup-v1";
import { createRuntimeBackedAgentLedgerService } from "../../features/agent/ledger/runtime-adapter";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createMemoryAgentRuntimeRepository, type AgentRuntimeRepository } from "../../features/agent/runtime/repository";
import { agentRunProgress, createAgentRuntimeService, type AgentRuntimeService } from "../../features/agent/runtime/service";
import { createOrbitAgentRuntimeService } from "../../features/agent/runtime/service-factory";
import {
  AGENT_RUN_TARGET_BACKFILL_SQL,
  createStorageAgentRuntimeRepository,
} from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createTransactionalOrbitAgentChatRequestStore } from "../../features/orbit-ai/storage/orbit-agent-chat-request-store";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createReadCostLedger } from "../performance/read-cost-ledger";

/**
 * Sprint 0103 (AI trace A1 + A3) against a real PostgreSQL schema. The POST
 * /api/ai/conversations route, the reliable request store, the chat session
 * provider, the agent runtime and GET /api/ai/runs/[id] all run for real;
 * only the model provider (the conversation service's reply) and the
 * unrelated memory/feedback/preference boundaries are stood in for.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `agent_run_trace_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:agent-run-trace:${schema}`;
const ACTOR_A = "account:trace-a";
const ACTOR_B = "account:trace-b";
const TIMINGS = [
  { phase: "local_boundary", durationMs: 5.724 },
  { phase: "planner", durationMs: 1200.5 },
  { phase: "tool_mapping", durationMs: 0, skipped: true },
  { phase: "synthesis", durationMs: 18500.041 },
];
const envKeys = ["ORBIT_FEATURE_MODE", "ORBIT_MODULE_MODE", "ORBIT_DATABASE_TARGET", "ORBIT_LOCAL_DATABASE_URL", "ORBIT_LOCAL_WORKSPACE_ID"] as const;
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

let admin: Pool;
let scoped: Pool;
let client: TransactionalPostgresClient;
const ledger = createReadCostLedger();

function scopedUrl(): string {
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

async function collectionCounts(): Promise<Record<string, number>> {
  const rows = (await scoped.query<{ collection_name: string; count: string }>(
    "select collection_name, count(*) from orbit_records group by 1",
  )).rows;
  return Object.fromEntries(rows.map((row) => [row.collection_name, Number(row.count)]));
}

/** A reminder the model proposes; the route turns it into a confirmable action run. */
const REMINDER_REQUEST = {
  capabilityId: "notifications.createReminder", requiresUserConfirmation: true,
  arguments: { title: "给梁佳怡回电话", dueAt: "2026-10-01T09:00:00.000Z" },
};

function loadRoute<TModule>(path: string, boundaries: Record<string, unknown>, real: readonly string[]): TModule {
  const url = new URL(path, import.meta.url);
  const require = createRequire(url);
  const source = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((id: string) => {
    if (Object.hasOwn(boundaries, id)) return boundaries[id];
    if (id === "next/server" || id.includes("/shared/") || real.some((suffix) => id.endsWith(suffix))) return require(id);
    return new Proxy({}, { get(_target, key) { throw new Error(`Unexpected dependency: ${id}.${String(key)}`); } });
  }, module, module.exports);
  return module.exports as TModule;
}

function conversationRoute(actorId: string, proposedActionRequests: readonly unknown[] = []) {
  const boundaries: Record<string, unknown> = {
    "../../../../shared/config/feature-mode": { resolveFeatureMode: () => "live" },
    "./request-context": { resolveOrbitAgentConversationRequestContext: async () => ({
      actorId, runtime: createOrbitAgentRuntimeService("live", { actorId }),
    }) },
    // The model provider boundary: an answer with the provider's timing spans,
    // optionally proposing write actions (as the planner does for "remind me ...").
    "../../../../features/orbit-ai/service-factory": { createOrbitAgentConversationServiceForActor: () => ({
      sendMessage: async () => ({ success: true, data: {
        activeConversationId: "conversation:trace", assistantMessage: "普通问答的回答。",
        messages: [{ role: "assistant", messageId: "provider-local", content: "普通问答的回答。", createdAt: "2026-09-27T00:00:00.000Z", conversationId: "conversation:trace", evidenceIds: [] }],
        artifacts: [], proposedActionRequests,
        diagnostics: { maxLoopSteps: 3, timings: TIMINGS },
      } }),
    }) },
    // Task interaction leaves reminder requests to the action runtime, as the real service does.
    "../../../../features/orbit-ai/task-interaction-service-factory": { createConfiguredOrbitAiTaskInteractionService: () => ({
      handle: async (input: { proposedActionRequests: unknown[] }) => ({ remainingActionRequests: input.proposedActionRequests }),
    }) },
    "../../../../features/orbit-ai/entity-drafts/service-factory": { createConfiguredEntityDraftService: () => ({
      cancel: async () => null, confirm: async () => ({ draft: null, kind: "not_pending" as const }),
      pending: async () => null, propose: async () => null, revise: async () => null,
    }) },
    "../../../../features/agent/memory/service-factory": { createAgentMemoryService: () => ({ getSettings: async () => ({}), context: async () => undefined }) },
    "../../../../features/agent/feedback/service-factory": { createAgentFeedbackService: () => ({ context: async () => undefined }) },
    "../../../../features/agent/preferences": { createAgentPreferencesService: () => ({ get: async () => ({}) }) },
    "../../../../features/integrations/service-factory": { createConfiguredOrbitIntegrationService: () => undefined },
    "../../../../features/contacts/service-factory": { createContactDetailTagStatusService: () => ({}) },
  };
  const real = [
    "/reliable-send-service", "/orbit-agent-chat-request-store", "/orbit-agent-chat-session-provider-factory",
    "/orbit-agent-chat-session-live-record-provider", "/ai-session-reference-authorization", "/entity-drafts/contract",
    "/conversation-runtime-links", "/natural-language-actions/service",
  ];
  return loadRoute<{ POST: (request: Request) => Promise<Response> }>("../../app/api/ai/conversations/route.ts", boundaries, real).POST;
}

type TurnBody = { data: { runId?: string; actionIds?: string[]; messages: Array<{ role: string; messageId?: string }> } };

async function ask(actorId: string, requestId: string, message: string, proposedActionRequests: readonly unknown[] = []): Promise<TurnBody> {
  const response = await conversationRoute(actorId, proposedActionRequests)(new Request("http://orbit.local/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({
      protocolVersion: 2, sessionId: `session:${requestId}`, requestId, clientMessageId: `user:${requestId}`,
      expectedMessageRevision: 0, references: [], locale: "zh", message,
    }),
  }));
  assert.equal(response.status, 200);
  return await response.json() as TurnBody;
}

const askPlainQuestion = (actorId: string, requestId: string) => ask(actorId, requestId, "我这周有什么安排？");

function actorRepository(actorId: string): AgentRuntimeRepository {
  return storageRepository(`${workspaceId}:agent-actor:${actorId}`);
}

/**
 * A plain question as recorded between 0103 and 0110: one completed run and
 * a request record that carries the run id and the turn's timing spans.
 */
async function seedLegacyPlainTurn(actorId: string, name: string): Promise<string> {
  const runId = `run:conversation:legacy-${name}`;
  const at = "2026-09-27T00:00:00.000Z";
  await actorRepository(actorId).saveRun({ runId, workflowKey: "agent_conversation_v1", workflowVersion: 1, conversationId: "conversation:trace",
    trigger: "chat", status: "completed", actionIds: [], createdAt: at, startedAt: at, completedAt: at, updatedAt: at });
  const requestStore = createTransactionalOrbitAgentChatRequestStore({ actorId, client, workspaceId });
  await requestStore.reserve(`request:legacy:${name}`, `fingerprint:legacy:${name}`, `session:legacy:${name}`);
  await requestStore.complete(`request:legacy:${name}`, `fingerprint:legacy:${name}`, {
    success: true, data: { runId, activeConversationId: "conversation:trace", diagnostics: { maxLoopSteps: 3, timings: TIMINGS } },
  });
  return runId;
}

/** Analytics rows as written before 0110 (the repository no longer has a writer for them). */
async function seedLegacyAnalytics(subspace: string, runId: string, at = "2026-09-27T00:00:00.000Z"): Promise<void> {
  const store = createPostgresLiveRecordStore({ client });
  for (const name of ["agent_run_started", "agent_run_completed"]) {
    const entity = { eventId: `analytics:${runId}:${name}`, name, occurredAt: at, runId, metadata: {} };
    await store.upsertRecord({
      workspaceId: subspace, collectionName: "agentAnalyticsEvents", recordId: entity.eventId,
      sourceType: "agent_action", sourceId: entity.eventId, sourceLabel: "Orbit Agent agentAnalyticsEvents", evidenceIds: [],
      lifecycleState: "active", searchText: JSON.stringify(entity), payload: { entity }, createdAt: entity.occurredAt, updatedAt: entity.occurredAt,
    });
  }
}

function runsHandler(actorId: string, runtimeForActor?: () => AgentRuntimeService) {
  return createAiProviderRunGetHandler({
    agentContext: {
      authenticate: async () => ({ user: { id: `user:${actorId}` } }),
      resolveActorFromSession: async () => ({ id: actorId }) as never,
      ...(runtimeForActor ? { runtimeForActor } : {}),
    },
  });
}

async function getRunDetail(actorId: string, runId: string, runtimeForActor?: () => AgentRuntimeService) {
  const response = await runsHandler(actorId, runtimeForActor)(
    new Request(`http://orbit.local/api/ai/runs/${encodeURIComponent(runId)}`),
    { params: Promise.resolve({ id: runId }) },
  );
  return { status: response.status, body: await response.json() as { success: boolean; data?: Record<string, unknown> } };
}

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  Object.assign(process.env, {
    ORBIT_FEATURE_MODE: "live",
    ORBIT_MODULE_MODE: "live",
    ORBIT_DATABASE_TARGET: "local",
    ORBIT_LOCAL_DATABASE_URL: scopedUrl(),
    ORBIT_LOCAL_WORKSPACE_ID: workspaceId,
  });
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  scoped = new Pool({ connectionString: scopedUrl(), max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool, readMetrics: ledger.observer });
  await runOrbitRecordsMigration(client);
}, { timeout: 120_000 });

after(async () => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (skip) return;
  try { await client.close(); } catch { /* already closed */ }
  try { await scoped.end(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

// SC-0110-01 (supersedes SC-0103-01's "the run record remains")
test("a plain question writes only its request record: no agentRuns, agentRunSteps or agentAnalyticsEvents rows and no run id", { skip, timeout: 60_000 }, async () => {
  const before = await collectionCounts();
  const body = await askPlainQuestion(ACTOR_A, "request:plain-1");
  const afterCounts = await collectionCounts();
  assert.equal(body.data.runId, undefined, "a plain answer carries no run id");
  assert.equal((afterCounts.agentRuns ?? 0) - (before.agentRuns ?? 0), 0, "no run record for a plain question");
  assert.equal((afterCounts.agentRunSteps ?? 0) - (before.agentRunSteps ?? 0), 0, "no step rows for a plain question");
  assert.equal((afterCounts.agentAnalyticsEvents ?? 0) - (before.agentAnalyticsEvents ?? 0), 0, "no analytics rows for a plain question");
  assert.equal((afterCounts.orbit_agent_chat_requests ?? 0) - (before.orbit_agent_chat_requests ?? 0), 1, "exactly one request record");
  const request = (await scoped.query<{ target_type: string | null; target_id: string | null; user_id: string; run_id: string | null; timings: number }>(
    `select target_type, target_id, user_id, payload->'result'->'data'->>'runId' as run_id,
            jsonb_array_length(payload->'result'->'data'->'diagnostics'->'timings') as timings
       from orbit_records where collection_name = 'orbit_agent_chat_requests' and payload->>'requestId' = 'request:plain-1'`,
  )).rows;
  assert.deepEqual(request, [{ target_type: null, target_id: null, user_id: ACTOR_A, run_id: null, timings: TIMINGS.length }],
    "the request record keeps the timing spans and names no run");
});

// SC-0110-01: the Agent result-feedback API stays, but has nothing to attach to for a plain answer (decision 5).
test("feedback on a plain answer returns 404 for every id the turn exposes and writes no feedback; an action run still accepts feedback", { skip, timeout: 60_000 }, async () => {
  const body = await askPlainQuestion(ACTOR_A, "request:plain-feedback");
  const feedback = createAgentFeedbackService({ actorId: ACTOR_A, mode: "live" });
  const context = { runtime: createOrbitAgentRuntimeService("live", { actorId: ACTOR_A }), service: feedback };
  const assistantId = body.data.messages.find((message) => message.role === "assistant")?.messageId;
  const exposedIds = [body.data.runId, "request:plain-feedback", assistantId].filter((id): id is string => Boolean(id));
  assert.ok(exposedIds.length >= 2);
  const feedbackRows = async () => Number((await scoped.query<{ count: string }>(
    "select count(*) from orbit_records where collection_name = $1", [AGENT_FEEDBACK_COLLECTION],
  )).rows[0]!.count);
  const before = await feedbackRows();
  for (const runId of exposedIds) {
    const response = await saveAgentFeedback(context, { runId, rating: "helpful" });
    assert.equal(response.status, 404, `feedback on ${runId} must not find a run`);
  }
  assert.equal(await feedbackRows(), before, "no feedback row was written for a plain answer");
  // Positive control: an action run is still a run, so the unchanged API accepts feedback on it.
  const action = await ask(ACTOR_A, "request:feedback-action", "提醒我给梁佳怡回电话", [REMINDER_REQUEST]);
  assert.match(action.data.runId ?? "", /^run:natural-language:/);
  const accepted = await saveAgentFeedback(context, { runId: action.data.runId!, rating: "helpful" });
  assert.equal(accepted.status, 200);
  assert.equal(await feedbackRows(), before + 1);
});

// SC-0110-03: a turn that proposes an action still records the whole run.
test("a turn with an action still writes its run, step and action, links the request record to the run, and confirm executes it — with no analytics rows", { skip, timeout: 60_000 }, async () => {
  const before = await collectionCounts();
  const body = await ask(ACTOR_A, "request:action-1", "提醒我明天给梁佳怡回电话", [REMINDER_REQUEST]);
  const runId = body.data.runId!;
  assert.match(runId, /^run:natural-language:/);
  assert.equal(body.data.actionIds?.length, 1);
  const proposed = await collectionCounts();
  const delta = (counts: Record<string, number>, name: string) => (counts[name] ?? 0) - (before[name] ?? 0);
  assert.deepEqual(
    Object.fromEntries(["agentRuns", "agentRunSteps", "agentActionsV2", "orbit_agent_chat_requests", "agentAnalyticsEvents"].map((name) => [name, delta(proposed, name)])),
    { agentRuns: 1, agentRunSteps: 1, agentActionsV2: 1, orbit_agent_chat_requests: 1, agentAnalyticsEvents: 0 },
  );
  const request = (await scoped.query<{ target_type: string; target_id: string }>(
    "select target_type, target_id from orbit_records where collection_name = 'orbit_agent_chat_requests' and payload->>'requestId' = 'request:action-1'",
  )).rows;
  assert.deepEqual(request, [{ target_type: "agent_run", target_id: runId }], "the action turn's request record is found by run id");

  // The status card reads the run; its steps include the turn's timing spans.
  const card = await getRunDetail(ACTOR_A, runId);
  assert.equal(card.status, 200);
  assert.equal(card.body.data?.runKind, "agent");
  assert.deepEqual((card.body.data!.steps as Array<{ name: string }>).map((step) => step.name),
    ["validate_natural_language_action_proposals", ...TIMINGS.map((span) => span.phase)]);
  assert.equal(((card.body.data!.run as { status: string }).status), "waiting_for_confirmation");

  // Confirm, execute, undo: the action lifecycle is unchanged and still writes no analytics.
  const runtime = createOrbitAgentRuntimeService("live", { actorId: ACTOR_A });
  const actionId = body.data.actionIds![0]!;
  await runtime.approveAction({ actionId, actorLabel: "QA user" });
  await runtime.processOutbox({ actionId, workerId: "test-worker", limit: 5 });
  const executed = await runtime.getRun(runId);
  assert.equal(executed?.actions[0]?.status, "completed");
  assert.equal(executed?.run.status, "completed");
  assert.equal(executed?.receipts.length, 1);
  const ledger = await createRuntimeBackedAgentLedgerService({ runtime }).listEntries({});
  assert.equal(ledger.success, true);
  assert.ok(ledger.success && ledger.data.entries.some((entry) => entry.runId === runId), "the action appears in the Agent ledger");
  const final = await collectionCounts();
  assert.equal(delta(final, "agentAnalyticsEvents"), 0, "propose, approve and complete write no analytics rows");
});

test("view, defer, reject and cancel write no analytics rows either", { skip, timeout: 60_000 }, async () => {
  const clock = { now: "2026-09-27T02:00:00.000Z" };
  const measured = harness(storageRepository(`${workspaceId}:agent-actor:${ACTOR_A}:lifecycle`), clock);
  const before = await collectionCounts();
  const runId = await recordActionRun(measured, "lifecycle-view");
  const detail = await measured.runtime.getRun(runId);
  await measured.runtime.markActionViewed(detail!.actions[0]!.actionId);
  const deferred = await recordProposedActionRun(measured, "lifecycle-defer");
  await measured.runtime.deferAction(deferred);
  const rejected = await recordProposedActionRun(measured, "lifecycle-reject");
  await measured.runtime.rejectAction(rejected);
  const canceled = await recordProposedActionRun(measured, "lifecycle-cancel");
  await measured.runtime.cancelAction(canceled);
  const afterCounts = await collectionCounts();
  assert.equal((afterCounts.agentAnalyticsEvents ?? 0) - (before.agentAnalyticsEvents ?? 0), 0);
  assert.ok((afterCounts.agentActionsV2 ?? 0) - (before.agentActionsV2 ?? 0) >= 4, "the actions themselves are still written");
});

test("POST /api/agent/actions/[id]/view records nothing but still marks a brief as viewed", { skip, timeout: 60_000 }, async () => {
  const runtime = createOrbitAgentRuntimeService("live", { actorId: ACTOR_A });
  const { POST } = loadRoute<{ POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>(
    "../../app/api/agent/actions/[id]/view/route.ts",
    {
      "../../../../../../shared/config/feature-mode": { resolveFeatureMode: () => "live" },
      "../../../../_shared/agent-request-context": {
        resolveAgentRequestContext: async () => ({ actorId: ACTOR_A, runtime }),
        agentRequestUnauthorizedResponse: () => new Response(null, { status: 401 }),
      },
    },
    [],
  );
  const runId = "run:pre-event-brief:view";
  const actionId = "action:pre-event-brief:view";
  await runtime.createRun({ runId, workflowKey: "pre_event_brief_v1", trigger: "today" });
  await runtime.proposeAction({
    actionId, runId, workflowKey: "pre_event_brief_v1", workflowVersion: 1, title: "会前简报", whyNow: "Tomorrow", preview: "Brief",
    riskLevel: "read", payloadVersion: 1, compensation: { supported: false }, evidenceChips: [], evidenceIds: [], sourceRefs: [],
    operations: [{ operationId: `${actionId}:op`, operationType: "generate_meeting_brief", executorKey: "events.generateMeetingBrief",
      idempotencyKey: `${actionId}:v1`, payloadVersion: 1, payload: {}, preview: "Brief", riskLevel: "read", compensation: { supported: false } }],
  });
  const before = await collectionCounts();
  const response = await POST(new Request(`http://orbit.local/api/agent/actions/${actionId}/view`, { method: "POST" }), { params: Promise.resolve({ id: actionId }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { recorded: true } });
  const afterCounts = await collectionCounts();
  assert.equal((afterCounts.agentAnalyticsEvents ?? 0) - (before.agentAnalyticsEvents ?? 0), 0, "opening an item writes no analytics row");
  const viewed = await runtime.getAction(actionId);
  assert.ok(viewed?.viewedAt, "the brief is still marked as viewed");
  const missing = await POST(new Request("http://orbit.local/api/agent/actions/none/view", { method: "POST" }), { params: Promise.resolve({ id: "action:none" }) });
  assert.equal(missing.status, 404);
});

test("the post-event follow-up workflow still records its run and actions but no analytics rows", { skip, timeout: 60_000 }, async () => {
  const clock = { now: "2026-09-27T03:00:00.000Z" };
  const repository = storageRepository(`${workspaceId}:agent-actor:${ACTOR_A}:followup`);
  const executor = (key: string) => ({ key, riskLevel: "write" as const, async execute(payload: Record<string, unknown>) {
    return { resultRef: `test:${key}:${String(payload.draftId ?? payload.taskId ?? "x")}`, summary: "Controlled test execution" };
  } });
  const runtime = createAgentRuntimeService({
    repository, now: () => clock.now,
    executors: createAgentExecutorRegistry(["events.saveMeetingNote", "followups.saveDraft", "followups.createTask", "notifications.createReminder"].map(executor)),
  });
  const before = await collectionCounts();
  const result = await createPostEventFollowupWorkflow(runtime).run({
    eventId: "event_08", eventTitle: "东京 AI 落地伙伴报名会", contactId: "contact_001", contactName: "佐藤 健一",
    noteText: "聊到了下季度的合作试点", trigger: "manual",
  });
  const afterCounts = await collectionCounts();
  assert.ok(result.run.runId);
  const detail = await runtime.getRun(result.run.runId);
  assert.ok((detail?.actions.length ?? 0) >= 2, "the workflow's actions are still recorded");
  assert.equal((afterCounts.agentAnalyticsEvents ?? 0) - (before.agentAnalyticsEvents ?? 0), 0);
});

// Old rows (0103–0110 plain runs, pre-0110 analytics) keep reading as before.
test("a plain run recorded before 0110 still reads through GET /api/ai/runs/[id] with its derived steps; legacy analytics rows change nothing", { skip, timeout: 60_000 }, async () => {
  const runId = await seedLegacyPlainTurn(ACTOR_A, "contract");
  await seedLegacyAnalytics(`${workspaceId}:agent-actor:${ACTOR_A}`, runId);
  const { status, body } = await getRunDetail(ACTOR_A, runId);
  assert.equal(status, 200);
  assert.equal(body.success, true);
  const data = body.data!;
  // Top-level contract as returned before 0103.
  assert.deepEqual(Object.keys(data).sort(), ["actions", "outbox", "progress", "receipts", "run", "runKind", "steps"]);
  assert.equal(data.runKind, "agent");
  assert.deepEqual([data.actions, data.outbox, data.receipts], [[], [], []]);
  const run = data.run as Record<string, unknown>;
  assert.equal(run.runId, runId);
  assert.equal(run.status, "completed");
  assert.equal(run.workflowKey, "agent_conversation_v1");
  const steps = data.steps as Array<Record<string, unknown>>;
  // Same fields, names, kinds, ids and sequences the step rows used to hold, plus durationMs.
  assert.deepEqual(steps.map(({ createdAt, updatedAt, ...step }) => {
    assert.equal(typeof createdAt, "string");
    assert.equal(typeof updatedAt, "string");
    return step;
  }), [
    { attempt: 1, durationMs: 5.724, inputRef: "conversation:conversation:trace", kind: "deterministic", name: "local_boundary", runId, sequence: 1, status: "completed", stepId: `${runId}:step:1:local_boundary` },
    { attempt: 1, durationMs: 1200.5, kind: "ai", name: "planner", runId, sequence: 2, status: "completed", stepId: `${runId}:step:2:planner` },
    { attempt: 1, durationMs: 0, kind: "tool", name: "tool_mapping", runId, sequence: 3, status: "skipped", stepId: `${runId}:step:3:tool_mapping` },
    { attempt: 1, durationMs: 18500.041, kind: "ai", name: "synthesis", outputRef: `${runId}:response`, runId, sequence: 4, status: "completed", stepId: `${runId}:step:4:synthesis` },
  ]);
  assert.deepEqual(data.progress, { canCancel: false, canRetry: false, completedSteps: 4, failedSteps: 0, percent: 100, totalSteps: 4 });
  const ledger = await createRuntimeBackedAgentLedgerService({ runtime: createOrbitAgentRuntimeService("live", { actorId: ACTOR_A }) }).listEntries({});
  assert.equal(ledger.success, true, "the Agent ledger still reads with legacy analytics rows present");
  // Feedback saved on an old plain run keeps working: the run still exists.
  const saved = await saveAgentFeedback(
    { runtime: createOrbitAgentRuntimeService("live", { actorId: ACTOR_A }), service: createAgentFeedbackService({ actorId: ACTOR_A, mode: "live" }) },
    { runId, rating: "helpful" },
  );
  assert.equal(saved.status, 200);
});

test("another actor can neither read an old plain run nor reach its request record by run id", { skip, timeout: 60_000 }, async () => {
  const runId = await seedLegacyPlainTurn(ACTOR_A, "isolation");
  const asB = await getRunDetail(ACTOR_B, runId);
  assert.notEqual(asB.body.data?.runKind, "agent", "B must not receive A's agent run");
  assert.ok(!JSON.stringify(asB.body).includes("local_boundary"), "B must not receive A's timing steps");
  const requestStoreB = createTransactionalOrbitAgentChatRequestStore({ actorId: ACTOR_B, client, workspaceId });
  assert.equal(await requestStoreB.findByRunId!(runId), null);
  const requestStoreA = createTransactionalOrbitAgentChatRequestStore({ actorId: ACTOR_A, client, workspaceId });
  assert.ok(await requestStoreA.findByRunId!(runId));
});

type Harness = { repository: AgentRuntimeRepository; runtime: AgentRuntimeService };

function harness(repository: AgentRuntimeRepository, clock: { now: string }): Harness {
  return {
    repository,
    runtime: createAgentRuntimeService({
      repository,
      now: () => clock.now,
      // Fixed-width ids, so byte counts compare equal across history sizes.
      id: () => randomUUID(),
      executors: createAgentExecutorRegistry([{ key: "tests.persist", riskLevel: "write", async execute(payload) {
        return { resultRef: `test:${String(payload.recordId)}`, summary: "Controlled test execution" };
      } }]),
    }),
  };
}

function storageRepository(subspace: string): AgentRuntimeRepository {
  return createStorageAgentRuntimeRepository({ store: createPostgresLiveRecordStore({ client }), sqlClient: client, workspaceId: subspace });
}

/** One confirmed action run, as the natural-language proposal path records it. */
async function recordActionRun({ runtime }: Harness, name: string): Promise<string> {
  const runId = `run:natural-language:${name}`;
  const actionId = `action:natural-language:${name}`;
  await runtime.createRun({ runId, workflowKey: "agent_natural_language_actions_v1", trigger: "chat", conversationId: "conversation:trace" });
  await runtime.addRunStep({ attempt: 1, inputRef: "conversation:conversation:trace", kind: "ai", name: "validate_natural_language_action_proposals",
    outputRef: `${runId}:proposals`, runId, status: "completed", stepId: `${runId}:validate` });
  await runtime.proposeAction({
    actionId, runId, workflowKey: "agent_natural_language_actions_v1", workflowVersion: 1,
    title: `Action ${name}`, whyNow: "Explicit request", preview: "Test only", riskLevel: "write", payloadVersion: 1,
    compensation: { supported: false }, evidenceChips: [], evidenceIds: [], sourceRefs: [],
    operations: [{ operationId: `${actionId}:operation:1`, operationType: "create_followup_task", executorKey: "tests.persist",
      idempotencyKey: `${actionId}:v1`, payloadVersion: 1, payload: { recordId: name }, preview: "Test only",
      riskLevel: "write", compensation: { supported: false } }],
  });
  await runtime.approveAction({ actionId, actorLabel: "Test user", selectedOperationIds: [`${actionId}:operation:1`] });
  await runtime.processOutbox({ workerId: "test-worker", limit: 5 });
  return runId;
}

/** A plain question as recorded before 0103: a run, eight step rows and two analytics rows. */
async function recordLegacyPlainRun({ repository }: Harness, subspace: string, index: number, at: string): Promise<void> {
  const runId = `run:conversation:legacy-${index}`;
  await repository.saveRun({ runId, workflowKey: "agent_conversation_v1", workflowVersion: 1, trigger: "chat", status: "completed",
    actionIds: [], createdAt: at, startedAt: at, completedAt: at, updatedAt: at });
  for (let step = 1; step <= 8; step += 1) {
    await repository.saveRunStep({ stepId: `${runId}:step:${step}:phase_${step}`, runId, kind: "deterministic", name: `phase_${step}`,
      sequence: step, status: "completed", attempt: 1, createdAt: at, updatedAt: at });
  }
  await seedLegacyAnalytics(subspace, runId, at);
}

/** One action run left awaiting confirmation. */
async function recordProposedActionRun({ runtime }: Harness, name: string): Promise<string> {
  const runId = `run:natural-language:${name}`;
  const actionId = `action:natural-language:${name}`;
  await runtime.createRun({ runId, workflowKey: "agent_natural_language_actions_v1", trigger: "chat", conversationId: "conversation:trace" });
  await runtime.proposeAction({
    actionId, runId, workflowKey: "agent_natural_language_actions_v1", workflowVersion: 1,
    title: `Action ${name}`, whyNow: "Explicit request", preview: "Test only", riskLevel: "write", payloadVersion: 1,
    compensation: { supported: false }, evidenceChips: [], evidenceIds: [], sourceRefs: [],
    operations: [{ operationId: `${actionId}:operation:1`, operationType: "create_followup_task", executorKey: "tests.persist",
      idempotencyKey: `${actionId}:v1`, payloadVersion: 1, payload: { recordId: name }, preview: "Test only",
      riskLevel: "write", compensation: { supported: false } }],
  });
  return actionId;
}

// SC-0103-03
test("reading one run costs the same rows and bytes with 10 or 200 historical runs", { skip, timeout: 300_000 }, async () => {
  const costs: Record<number, { queries: number; rows: number; bytes: number }> = {};
  for (const history of [10, 200]) {
    // Same-length subspace names: workspace_id is part of every returned row's bytes.
    const subspace = `${workspaceId}:agent-actor:history-${String(history).padStart(3, "0")}`;
    const clock = { now: "2026-09-27T00:00:00.000Z" };
    const measured = harness(storageRepository(subspace), clock);
    for (let index = 0; index < history; index += 1) {
      await recordLegacyPlainRun(measured, subspace, index, clock.now);
      if (index % 10 === 0) await recordActionRun(measured, `history-${index}`);
    }
    const targetRunId = await recordActionRun(measured, "target");
    const { result, cost } = await ledger.measure(`agent.run.history-${history}`, () => measured.repository.getRun(targetRunId));
    assert.ok(result);
    assert.equal(result.run.runId, targetRunId);
    assert.deepEqual(result.steps.map((step) => step.name), ["validate_natural_language_action_proposals"]);
    assert.deepEqual(result.actions.map((action) => [action.actionId, action.status]), [["action:natural-language:target", "completed"]]);
    assert.equal(result.outbox.length, 1);
    assert.deepEqual(result.receipts.map((receipt) => receipt.status), ["completed"]);
    costs[history] = cost;
  }
  console.info(JSON.stringify({ event: "agent_run_read_cost_by_history", costs }));
  assert.deepEqual(costs[200], costs[10], "rows, bytes and queries of one run read must not grow with history");
  assert.ok(costs[10]!.rows <= 6, `one run read returns only that run's rows (got ${costs[10]!.rows})`);
});

test("rows written before 0103 carry no run target; the backfill makes them readable by run id and is idempotent", { skip, timeout: 60_000 }, async () => {
  const subspace = `${workspaceId}:agent-actor:legacy-backfill`;
  const measured = harness(storageRepository(subspace), { now: "2026-09-27T00:00:00.000Z" });
  const runId = await recordActionRun(measured, "legacy");
  // Simulate the pre-0103 envelope: no target on child rows or on request records.
  await scoped.query("update orbit_records set target_type = null, target_id = null where workspace_id = $1 and collection_name <> 'agentRuns'", [subspace]);
  const missing = await measured.repository.getRun(runId);
  assert.equal(missing?.actions.length, 0, "without the backfill the precise read cannot see legacy rows");
  const first = await scoped.query(AGENT_RUN_TARGET_BACKFILL_SQL);
  const second = await scoped.query(AGENT_RUN_TARGET_BACKFILL_SQL);
  assert.ok((first.rowCount ?? 0) >= 4, "steps, action, outbox and receipt rows are backfilled");
  assert.equal(second.rowCount ?? 0, 0, "the backfill is idempotent");
  const restored = await measured.repository.getRun(runId);
  assert.equal(restored?.actions.length, 1);
  assert.equal(restored?.outbox.length, 1);
  assert.equal(restored?.receipts.length, 1);
  assert.equal(restored?.steps.length, 1);
});

// SC-0103-04
// Sprint 0122: one clock drives the runtime and the request record, so the
// derived steps' timestamps no longer depend on the machine's wall clock. The
// clocks below sit before, around and long after the real run date.
for (const [label, at] of [["past", "2020-01-01T00:00:00.000Z"], ["sprint-day", "2026-09-27T01:00:00.000Z"], ["future", "2099-12-31T23:00:00.000Z"]] as const)
test(`runs with actions: the status card view and the Agent ledger match the pre-0103 behaviour (${label} clock)`, { skip, timeout: 120_000 }, async () => {
  const clock = { now: at };
  const postgres = harness(storageRepository(`${workspaceId}:agent-actor:${ACTOR_A}:actions:${label}`), clock);
  // Reference: the in-memory repository with the pre-0103 route behaviour, i.e.
  // the conversation's timing spans written as step rows onto the action run.
  const reference = harness(createMemoryAgentRuntimeRepository(), clock);
  const runId = await recordActionRun(postgres, `card-${label}`);
  assert.equal(await recordActionRun(reference, `card-${label}`), runId);
  for (let index = 0; index < TIMINGS.length; index += 1) {
    const span = TIMINGS[index]!;
    await reference.runtime.addRunStep({
      attempt: 1,
      inputRef: index === 0 ? "conversation:conversation:trace" : undefined,
      kind: span.phase === "planner" || span.phase === "synthesis" ? "ai" : span.phase === "tool_mapping" ? "tool" : "deterministic",
      name: span.phase,
      outputRef: index === TIMINGS.length - 1 ? `${runId}:response` : undefined,
      runId, sequence: index + 1, status: span.skipped ? "skipped" : "completed", stepId: `${runId}:step:${index + 1}:${span.phase}`,
    });
  }
  // The request record of the turn that proposed the action, as the route completes it.
  const requestStore = createTransactionalOrbitAgentChatRequestStore({ actorId: ACTOR_A, client, workspaceId, now: () => clock.now });
  await requestStore.reserve(`request:card:${label}`, `fingerprint:card:${label}`, `session:card:${label}`);
  await requestStore.complete(`request:card:${label}`, `fingerprint:card:${label}`, {
    success: true, data: { runId, activeConversationId: "conversation:trace", diagnostics: { maxLoopSteps: 3, timings: TIMINGS } },
  });

  const { status, body } = await getRunDetail(ACTOR_A, runId, () => postgres.runtime);
  assert.equal(status, 200);
  const expected = await reference.runtime.getRun(runId);
  assert.ok(expected);
  const cardView = (detail: { steps: unknown; progress: unknown; actions: unknown; run: unknown }) => ({
    progress: detail.progress,
    steps: (detail.steps as Array<Record<string, unknown>>).map(({ stepId, name, kind, status: stepStatus, sequence }) => ({ stepId, name, kind, status: stepStatus, sequence })),
    actions: (detail.actions as Array<Record<string, unknown>>).map(({ actionId, status: actionStatus, runId: actionRunId }) => ({ actionId, status: actionStatus, runId: actionRunId })),
    runStatus: (detail.run as Record<string, unknown>).status,
  });
  assert.deepEqual(
    cardView(body.data as never),
    // JSON round trip: the route serialises the detail, dropping undefined fields.
    cardView(JSON.parse(JSON.stringify({ ...expected, progress: agentRunProgress(expected) }))),
    "status card inputs (steps, progress, action states) are unchanged",
  );
  assert.equal(((body.data as { outbox: unknown[] }).outbox).length, 1);
  assert.equal(((body.data as { receipts: unknown[] }).receipts).length, 1);

  const entries = async (runtime: AgentRuntimeService) => {
    const result = await createRuntimeBackedAgentLedgerService({ runtime }).listEntries({});
    assert.equal(result.success, true);
    // As the ledger route serialises them. provenance.collectedAt is the read's
    // wall-clock time (runtime-adapter), so two reads can differ by a millisecond.
    return result.success
      ? (JSON.parse(JSON.stringify(result.data.entries)) as Array<{ provenance?: { collectedAt?: string } }>)
        .map((entry) => ({ ...entry, provenance: { ...entry.provenance, collectedAt: undefined } }))
      : [];
  };
  const ledgerEntries = await entries(postgres.runtime);
  assert.equal(ledgerEntries.length, 1);
  assert.deepEqual(ledgerEntries, await entries(reference.runtime), "Agent ledger entries are unchanged");
});

// SC-0110-04: the AI trace used to read every record of each collection the
// planned tools touch, only to count them. It now reads nothing for that.
test("tracing a turn reads no whole collections to count records; the interaction names the tools' collections without counts", { skip, timeout: 60_000 }, async () => {
  const subspace = `${workspaceId}:trace-count`;
  const store = createPostgresLiveRecordStore({ client });
  const at = "2026-09-27T00:00:00.000Z";
  for (let index = 0; index < 30; index += 1) {
    for (const collectionName of ["contacts", "events", "evidence"]) {
      const recordId = `${collectionName}_${index}`;
      await store.upsertRecord({ workspaceId: subspace, collectionName, recordId, sourceType: "contact", sourceId: recordId,
        sourceLabel: "Trace fixture", evidenceIds: [], lifecycleState: "active", searchText: recordId, payload: { id: recordId }, createdAt: at, updatedAt: at });
    }
  }
  const plannerOutput = JSON.stringify({
    assistantMessage: "我会从活动和人脉上下文里准备一个可复核推荐。",
    intent: "event_recommendations",
    toolRequests: [{ arguments: { topic: "interesting events" }, requiresUserConfirmation: true, toolName: "events.recommend" }],
  });
  const trace = createLiveOrbitAgentTrace({
    apiKey: "test-gemini-key",
    // The model provider boundary (no network): the planner asks for events.recommend.
    fetchImplementation: (async () => new Response(JSON.stringify({ steps: [{ content: [{ text: plannerOutput, type: "text" }], type: "model_output" }] }),
      { headers: { "content-type": "application/json" }, status: 200 })) as typeof fetch,
    liveRecordStore: store,
    liveRecordWorkspaceId: subspace,
    maxLoopSteps: 1,
  });
  const { result, cost } = await ledger.measure("ai.trace.tool-collections", () => trace.traceMessage({ locale: "zh", message: "帮我看看有什么值得参加的活动" }));
  console.info(JSON.stringify({ event: "ai_trace_tool_collection_read_cost", cost }));
  assert.equal(result.success, true);
  assert.deepEqual(cost, { queries: 0, rows: 0, bytes: 0 }, "the trace issues no collection scans");
  const interaction = result.success ? result.data.fullChain.databaseInteractions[0] : undefined;
  assert.equal(interaction?.adapterKind, "remote");
  assert.equal(interaction?.liveDatabaseReadExecuted, false);
  assert.equal(interaction?.operation, "skipped");
  assert.deepEqual(interaction?.collections.map((collection) => collection.collectionName),
    ["accounts", "attendees", "connections", "contacts", "eventParticipantIntents", "events", "evidence", "matchRecommendations", "profiles", "recommendationTests"]);
  assert.ok(interaction?.collections.every((collection) => collection.selectedForTools && collection.recordCount === undefined));
});
