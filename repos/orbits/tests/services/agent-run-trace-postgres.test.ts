import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import ts from "typescript";

import { createAiProviderRunGetHandler } from "../../app/api/ai/runs/[id]/handler";
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

function conversationRoute(actorId: string) {
  const boundaries: Record<string, unknown> = {
    "../../../../shared/config/feature-mode": { resolveFeatureMode: () => "live" },
    "./request-context": { resolveOrbitAgentConversationRequestContext: async () => ({
      actorId, runtime: createOrbitAgentRuntimeService("live", { actorId }),
    }) },
    // The model provider boundary: a plain answer with the provider's timing spans.
    "../../../../features/orbit-ai/service-factory": { createOrbitAgentConversationServiceForActor: () => ({
      sendMessage: async () => ({ success: true, data: {
        activeConversationId: "conversation:trace", assistantMessage: "普通问答的回答。",
        messages: [{ role: "assistant", messageId: "provider-local", content: "普通问答的回答。", createdAt: "2026-09-27T00:00:00.000Z", conversationId: "conversation:trace", evidenceIds: [] }],
        artifacts: [], proposedActionRequests: [],
        diagnostics: { maxLoopSteps: 3, timings: TIMINGS },
      } }),
    }) },
    "../../../../features/orbit-ai/task-interaction-service-factory": { createConfiguredOrbitAiTaskInteractionService: () => ({ handle: async () => ({ remainingActionRequests: [] }) }) },
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
    "/conversation-runtime-links",
  ];
  const url = new URL("../../app/api/ai/conversations/route.ts", import.meta.url);
  const require = createRequire(url);
  const source = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((id: string) => {
    if (Object.hasOwn(boundaries, id)) return boundaries[id];
    if (id === "next/server" || id.startsWith("../../../../shared/") || real.some((suffix) => id.endsWith(suffix))) return require(id);
    return new Proxy({}, { get(_target, key) { throw new Error(`Unexpected dependency: ${id}.${String(key)}`); } });
  }, module, module.exports);
  return (module.exports as { POST: (request: Request) => Promise<Response> }).POST;
}

async function askPlainQuestion(actorId: string, requestId: string): Promise<{ runId: string; body: Record<string, unknown> }> {
  const response = await conversationRoute(actorId)(new Request("http://orbit.local/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({
      protocolVersion: 2, sessionId: `session:${requestId}`, requestId, clientMessageId: `user:${requestId}`,
      expectedMessageRevision: 0, references: [], locale: "zh", message: "我这周有什么安排？",
    }),
  }));
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { runId: string } };
  assert.match(body.data.runId, /^run:conversation:/);
  return { runId: body.data.runId, body: body as unknown as Record<string, unknown> };
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

// SC-0103-01
test("a plain question writes no agentRunSteps and no agentAnalyticsEvents rows; the run and request records remain", { skip, timeout: 60_000 }, async () => {
  const before = await collectionCounts();
  const { runId } = await askPlainQuestion(ACTOR_A, "request:plain-1");
  const afterCounts = await collectionCounts();
  assert.equal(afterCounts.agentRunSteps ?? 0, before.agentRunSteps ?? 0, "no step rows for a plain question");
  assert.equal(afterCounts.agentAnalyticsEvents ?? 0, before.agentAnalyticsEvents ?? 0, "no analytics rows for a plain question");
  // A2 (0107) removes the run record; in this sprint it is still written, once.
  assert.equal((afterCounts.agentRuns ?? 0) - (before.agentRuns ?? 0), 1);
  assert.equal((afterCounts.orbit_agent_chat_requests ?? 0) - (before.orbit_agent_chat_requests ?? 0), 1);
  const run = (await scoped.query<{ status: string; completed_at: string | null }>(
    "select payload->'entity'->>'status' as status, payload->'entity'->>'completedAt' as completed_at from orbit_records where collection_name = 'agentRuns' and record_id = $1",
    [runId],
  )).rows;
  assert.deepEqual(run.map((row) => row.status), ["completed"]);
  assert.ok(run[0]!.completed_at, "the run record carries its completion time");
  const request = (await scoped.query<{ target_type: string; target_id: string; user_id: string }>(
    "select target_type, target_id, user_id from orbit_records where collection_name = 'orbit_agent_chat_requests'",
  )).rows;
  assert.deepEqual(request, [{ target_type: "agent_run", target_id: runId, user_id: ACTOR_A }]);
});

// SC-0103-02
test("GET /api/ai/runs/[id] keeps its shape; steps come from the request record's timings with durationMs", { skip, timeout: 60_000 }, async () => {
  const { runId } = await askPlainQuestion(ACTOR_A, "request:plain-contract");
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
});

test("another actor can neither read the run nor reach its request record by run id", { skip, timeout: 60_000 }, async () => {
  const { runId } = await askPlainQuestion(ACTOR_A, "request:plain-isolation");
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
async function recordLegacyPlainRun({ repository }: Harness, index: number, at: string): Promise<void> {
  const runId = `run:conversation:legacy-${index}`;
  await repository.saveRun({ runId, workflowKey: "agent_conversation_v1", workflowVersion: 1, trigger: "chat", status: "completed",
    actionIds: [], createdAt: at, startedAt: at, completedAt: at, updatedAt: at });
  for (let step = 1; step <= 8; step += 1) {
    await repository.saveRunStep({ stepId: `${runId}:step:${step}:phase_${step}`, runId, kind: "deterministic", name: `phase_${step}`,
      sequence: step, status: "completed", attempt: 1, createdAt: at, updatedAt: at });
  }
  for (const name of ["agent_run_started", "agent_run_completed"] as const) {
    await repository.saveAnalyticsEvent({ eventId: `analytics:${runId}:${name}`, name, occurredAt: at, runId, metadata: {} });
  }
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
      await recordLegacyPlainRun(measured, index, clock.now);
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
test("runs with actions: the status card view and the Agent ledger match the pre-0103 behaviour", { skip, timeout: 120_000 }, async () => {
  const clock = { now: "2026-09-27T01:00:00.000Z" };
  const postgres = harness(storageRepository(`${workspaceId}:agent-actor:${ACTOR_A}:actions`), clock);
  // Reference: the in-memory repository with the pre-0103 route behaviour, i.e.
  // the conversation's timing spans written as step rows onto the action run.
  const reference = harness(createMemoryAgentRuntimeRepository(), clock);
  const runId = await recordActionRun(postgres, "card");
  assert.equal(await recordActionRun(reference, "card"), runId);
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
  const requestStore = createTransactionalOrbitAgentChatRequestStore({ actorId: ACTOR_A, client, workspaceId });
  await requestStore.reserve("request:card", "fingerprint:card", "session:card");
  await requestStore.complete("request:card", "fingerprint:card", {
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
    // As the ledger route serialises them.
    return result.success ? JSON.parse(JSON.stringify(result.data.entries)) as unknown[] : [];
  };
  const ledgerEntries = await entries(postgres.runtime);
  assert.equal(ledgerEntries.length, 1);
  assert.deepEqual(ledgerEntries, await entries(reference.runtime), "Agent ledger entries are unchanged");
});
