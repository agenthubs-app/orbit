import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import { createAiProviderRunGetHandler } from "../../app/api/ai/runs/[id]/handler";
import {
  LegacyTraceCleanupRefused,
  assertLegacyTraceCleanupTarget,
  countLegacyTrace,
  runLegacyTraceCleanup,
} from "../../features/agent/retention/legacy-trace-cleanup";
import { createAgentRunRetentionMaintenanceTask } from "../../features/agent/retention/maintenance-task";
import { runAgentRunRetention } from "../../features/agent/retention/run-retention";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import type { AgentRuntimeRepository } from "../../features/agent/runtime/repository";
import { createAgentRuntimeService, type AgentRuntimeService } from "../../features/agent/runtime/service";
import {
  AGENT_RUN_TARGET_BACKFILL_SQL,
  createStorageAgentRuntimeRepository,
} from "../../features/agent/storage/agent-runtime-live-record-provider";
import { handleMaintenanceRequest } from "../../features/operations/maintenance/http";
import { runMaintenancePass } from "../../features/operations/maintenance/pass";
import { createTransactionalOrbitAgentChatRequestStore } from "../../features/orbit-ai/storage/orbit-agent-chat-request-store";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import {
  createTransactionalPostgresClient,
  type TransactionalPostgresClient,
} from "../../shared/storage/transactional-postgres";

/**
 * Sprint 0111 (AI A4 + A5) against a real PostgreSQL schema created by the
 * production migration. Runs are recorded by the real agent runtime and
 * storage repository, request records by the real reliable request store, the
 * run detail is read through GET /api/ai/runs/[id] and the maintenance pass
 * through the real /api/internal/maintenance handler with its bearer check.
 * Deletion is irreversible, so every test compares the exact rows left.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `agent_run_retention_${randomUUID().replaceAll("-", "")}`;
const DAY_MS = 86_400_000;
const NOW = new Date("2026-09-28T03:00:00.000Z");
const daysAgo = (days: number, from = NOW) => new Date(from.getTime() - days * DAY_MS).toISOString();
const CHILD_COLLECTIONS = ["agentRunSteps", "agentActionsV2", "agentOutbox", "agentExecutionReceipts"];
const envKeys = ["ORBIT_FEATURE_MODE", "ORBIT_MODULE_MODE", "ORBIT_DATABASE_TARGET", "ORBIT_LOCAL_DATABASE_URL", "ORBIT_LOCAL_WORKSPACE_ID"] as const;
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

let admin: Pool;
let scoped: Pool;
let client: TransactionalPostgresClient;
let tmp: string;
let workspaceSeq = 0;

function scopedUrl(): string {
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

/** A fresh base workspace per test, so tests never see each other's rows. */
function newWorkspace(name: string): string {
  workspaceSeq += 1;
  return `workspace:retention-${workspaceSeq}-${name}`;
}
const subspaceOf = (workspaceId: string, actorId: string) => `${workspaceId}:agent-actor:${actorId}`;

function repositoryFor(subspace: string): AgentRuntimeRepository {
  return createStorageAgentRuntimeRepository({ store: createPostgresLiveRecordStore({ client }), sqlClient: client, workspaceId: subspace });
}

function runtimeFor(subspace: string, clock: { now: string }): AgentRuntimeService {
  return createAgentRuntimeService({
    repository: repositoryFor(subspace),
    now: () => clock.now,
    id: () => randomUUID(),
    executors: createAgentExecutorRegistry([{ key: "tests.persist", riskLevel: "write", async execute(payload) {
      return { resultRef: `test:${String(payload.recordId)}`, summary: "Controlled test execution" };
    } }]),
  });
}

function actionInput(runId: string, name: string) {
  const actionId = `action:natural-language:${name}`;
  return {
    actionId, runId, workflowKey: "agent_natural_language_actions_v1", workflowVersion: 1,
    title: `Action ${name}`, whyNow: "Explicit request", preview: "Test only", riskLevel: "write" as const, payloadVersion: 1,
    compensation: { supported: false }, evidenceChips: [], evidenceIds: [], sourceRefs: [],
    operations: [{ operationId: `${actionId}:operation:1`, operationType: "create_followup_task" as const, executorKey: "tests.persist",
      idempotencyKey: `${actionId}:v1`, payloadVersion: 1, payload: { recordId: name }, preview: "Test only",
      riskLevel: "write" as const, compensation: { supported: false } }],
  };
}

/** A confirmed and executed action run whose every timestamp is `at`: run, step, action, outbox, receipt. */
async function recordCompletedActionRun(subspace: string, name: string, at: string): Promise<string> {
  const clock = { now: at };
  const runtime = runtimeFor(subspace, clock);
  const runId = `run:natural-language:${name}`;
  await runtime.createRun({ runId, workflowKey: "agent_natural_language_actions_v1", trigger: "chat", conversationId: "conversation:retention" });
  await runtime.addRunStep({ attempt: 1, inputRef: "conversation:retention", kind: "ai", name: "validate_natural_language_action_proposals",
    outputRef: `${runId}:proposals`, runId, status: "completed", stepId: `${runId}:validate` });
  const input = actionInput(runId, name);
  await runtime.proposeAction(input);
  await runtime.approveAction({ actionId: input.actionId, actorLabel: "Test user", selectedOperationIds: [input.operations[0]!.operationId] });
  await runtime.processOutbox({ workerId: "test-worker", limit: 5 });
  const detail = await runtime.getRun(runId);
  assert.equal(detail?.run.status, "completed");
  assert.deepEqual(detail?.actions.map((action) => action.status), ["completed"]);
  return runId;
}

/** An action run left awaiting confirmation. */
async function recordOpenActionRun(subspace: string, name: string, at: string): Promise<string> {
  const runtime = runtimeFor(subspace, { now: at });
  const runId = `run:natural-language:${name}`;
  await runtime.createRun({ runId, workflowKey: "agent_natural_language_actions_v1", trigger: "chat", conversationId: "conversation:retention" });
  await runtime.proposeAction(actionInput(runId, name));
  return runId;
}

/** A plain answer as recorded before 0110: a completed run with eight step rows and no action. */
async function recordPlainRun(subspace: string, runId: string, at: string, steps = 8): Promise<void> {
  const repository = repositoryFor(subspace);
  await repository.saveRun({ runId, workflowKey: "agent_conversation_v1", workflowVersion: 1, trigger: "chat", status: "completed",
    actionIds: [], createdAt: at, startedAt: at, completedAt: at, updatedAt: at });
  for (let step = 1; step <= steps; step += 1) {
    await repository.saveRunStep({ stepId: `${runId}:step:${step}:phase_${step}`, runId, kind: "deterministic", name: `phase_${step}`,
      sequence: step, status: "completed", attempt: 1, createdAt: at, updatedAt: at });
  }
}

/** Analytics rows as written before 0110. */
async function seedAnalytics(subspace: string, runId: string, at: string): Promise<void> {
  const store = createPostgresLiveRecordStore({ client });
  for (const name of ["agent_run_started", "agent_run_completed"]) {
    const entity = { eventId: `analytics:${runId}:${name}`, name, occurredAt: at, runId, metadata: {} };
    await store.upsertRecord({
      workspaceId: subspace, collectionName: "agentAnalyticsEvents", recordId: entity.eventId,
      sourceType: "agent_action", sourceId: entity.eventId, sourceLabel: "Orbit Agent agentAnalyticsEvents", evidenceIds: [],
      lifecycleState: "active", searchText: JSON.stringify(entity), payload: { entity }, createdAt: at, updatedAt: at,
    });
  }
}

/** The request record of the turn that produced `runId`, linked to it by the real store (0103). */
async function seedRequest(workspaceId: string, actorId: string, runId: string): Promise<string> {
  const requestId = `request:${runId}`;
  const store = createTransactionalOrbitAgentChatRequestStore({ actorId, client, workspaceId });
  await store.reserve(requestId, `fingerprint:${runId}`, `session:${runId}`);
  await store.complete(requestId, `fingerprint:${runId}`, {
    success: true, data: { runId, activeConversationId: "conversation:retention", diagnostics: { maxLoopSteps: 3, timings: [] } },
  });
  return requestId;
}

/** An unrelated record in a collection that retention must never touch. */
async function seedUnrelated(workspaceId: string, collectionName: string, recordId: string, at: string): Promise<void> {
  await createPostgresLiveRecordStore({ client }).upsertRecord({
    workspaceId, collectionName, recordId, sourceType: "manual", sourceId: recordId, evidenceIds: [],
    lifecycleState: "active", searchText: "", payload: { entity: { runId: "run:shared-name", at } }, createdAt: at, updatedAt: at,
  });
}

interface Row { workspace_id: string; collection_name: string; record_id: string; target_type: string | null; target_id: string | null; payload: unknown }

/** Every row whose workspace starts with the prefix, ordered, full content. */
async function snapshot(prefix: string): Promise<Row[]> {
  return (await scoped.query<Row>(
    `select workspace_id, collection_name, record_id, target_type, target_id, payload from orbit_records
      where left(workspace_id, char_length($1)) = $1 order by 1, 2, 3`,
    [prefix],
  )).rows;
}
const keyOf = (row: Pick<Row, "workspace_id" | "collection_name" | "record_id">) => `${row.workspace_id}|${row.collection_name}|${row.record_id}`;

async function runSetRows(subspace: string, runId: string): Promise<string[]> {
  return (await scoped.query<{ collection_name: string }>(
    `select collection_name from orbit_records where workspace_id = $1
      and ((collection_name = 'agentRuns' and record_id = $2) or target_id = $2) order by collection_name collate "C"`,
    [subspace, runId],
  )).rows.map((row) => row.collection_name);
}

async function orphanChildren(prefix: string): Promise<number> {
  return Number((await scoped.query<{ n: string }>(
    `select count(*)::text as n from orbit_records c where left(c.workspace_id, char_length($1)) = $1
       and c.collection_name = any($2::text[]) and c.target_type = 'agent_run'
       and not exists (select 1 from orbit_records r where r.workspace_id = c.workspace_id and r.collection_name = 'agentRuns' and r.record_id = c.target_id)`,
    [prefix, CHILD_COLLECTIONS],
  )).rows[0]!.n);
}

function runsHandler(actorId: string, workspaceId: string) {
  return createAiProviderRunGetHandler({
    agentContext: {
      authenticate: async () => ({ user: { id: `user:${actorId}` } }),
      resolveActorFromSession: async () => ({ id: actorId }) as never,
      runtimeForActor: () => runtimeFor(subspaceOf(workspaceId, actorId), { now: NOW.toISOString() }),
    },
    requestStoreForActor: () => createTransactionalOrbitAgentChatRequestStore({ actorId, client, workspaceId }),
  });
}

async function getRunDetail(actorId: string, workspaceId: string, runId: string) {
  const response = await runsHandler(actorId, workspaceId)(
    new Request(`http://orbit.local/api/ai/runs/${encodeURIComponent(runId)}`),
    { params: Promise.resolve({ id: runId }) },
  );
  return { status: response.status, body: await response.json() as { success: boolean; data?: { runKind?: string } } };
}

const retention = (workspaceId: string, extra: Partial<Parameters<typeof runAgentRunRetention>[0]> = {}) =>
  runAgentRunRetention({ client, workspaceId, now: NOW, log: () => undefined, ...extra });

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  scoped = new Pool({ connectionString: scopedUrl(), max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 3, options: `-c search_path=${schema} -c statement_timeout=20000` });
  client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  await runOrbitRecordsMigration(client);
  tmp = mkdtempSync(path.join(os.tmpdir(), "agent-trace-cleanup-"));
}, { timeout: 120_000 });

after(async () => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (skip) return;
  rmSync(tmp, { recursive: true, force: true });
  try { await client.close(); } catch { /* already closed */ }
  try { await scoped.end(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

// ---------------------------------------------------------------- A4 retention

// SC-0111-01
test("retention deletes a set whose action ended 366 days ago as a whole, keeps 364 days, keeps open sets, and leaves no orphan children", { skip, timeout: 120_000 }, async () => {
  const ws = newWorkspace("boundary");
  const a = subspaceOf(ws, "account:a");
  const expired = await recordCompletedActionRun(a, "expired-366", daysAgo(366));
  const recent = await recordCompletedActionRun(a, "recent-364", daysAgo(364));
  const open = await recordOpenActionRun(a, "open-400", daysAgo(400));
  // A run marked completed whose action is still deferred: the set is open.
  const deferredRun = await recordOpenActionRun(a, "deferred-400", daysAgo(400));
  await runtimeFor(a, { now: daysAgo(400) }).deferAction("action:natural-language:deferred-400");
  await scoped.query(
    `update orbit_records set payload = jsonb_set(payload, '{entity,status}', '"completed"') where workspace_id = $1 and collection_name = 'agentRuns' and record_id = $2`,
    [a, deferredRun],
  );
  // An old run that was undone 100 days ago: its set ended 100 days ago.
  const undone = await recordCompletedActionRun(a, "undone-late", daysAgo(500));
  await runtimeFor(a, { now: daysAgo(100) }).undoAction("action:natural-language:undone-late").catch(async () => {
    // Executors without compensation cannot undo; mark it as the runtime would.
    await scoped.query(
      `update orbit_records set payload = jsonb_set(jsonb_set(payload, '{entity,status}', '"undone"'), '{entity,undoneAt}', to_jsonb($3::text))
        where workspace_id = $1 and collection_name = 'agentActionsV2' and record_id = $2`,
      [a, "action:natural-language:undone-late", daysAgo(100)],
    );
  });
  assert.deepEqual(await runSetRows(a, expired), ["agentActionsV2", "agentExecutionReceipts", "agentOutbox", "agentRunSteps", "agentRuns"]);
  const before = await snapshot(ws);

  const result = await retention(ws);

  assert.equal(result.runSetsDeleted, 1);
  assert.deepEqual(
    [result.stepsDeleted, result.actionsDeleted, result.outboxDeleted, result.receiptsDeleted, result.rowsDeleted],
    [1, 1, 1, 1, 5],
  );
  assert.equal(result.keptOpen, 1, "only the completed-run-with-deferred-action reaches the set check; the awaiting run is not a candidate");
  assert.equal(result.keptRecent, 1, "the late undo keeps its old set");
  assert.deepEqual(await runSetRows(a, expired), [], "the whole expired set is gone");
  const after = await snapshot(ws);
  const gone = before.filter((row) => !after.some((kept) => keyOf(kept) === keyOf(row)));
  assert.deepEqual(gone.map((row) => row.collection_name).sort(), ["agentActionsV2", "agentExecutionReceipts", "agentOutbox", "agentRunSteps", "agentRuns"]);
  assert.ok(gone.every((row) => row.record_id === expired || row.target_id === expired), "only rows of the expired run");
  assert.deepEqual(after, before.filter((row) => !gone.includes(row)), "every other row is byte-for-byte unchanged");
  for (const runId of [recent, open, deferredRun, undone]) assert.ok((await runSetRows(a, runId)).includes("agentRuns"), runId);
  assert.equal(await orphanChildren(ws), 0);
  // A second pass has nothing left to delete.
  assert.equal((await retention(ws)).runSetsDeleted, 0);
});

test("retention never touches other workspaces, other accounts' same-named runs, unrelated collections or the legacy agentActions collection", { skip, timeout: 120_000 }, async () => {
  const ws = newWorkspace("isolation");
  const other = newWorkspace("isolation-other");
  const a = subspaceOf(ws, "account:a");
  const b = subspaceOf(ws, "account:b");
  const expired = await recordCompletedActionRun(a, "shared-name", daysAgo(400));
  await seedRequest(ws, "account:a", expired);
  // Account B has a run with the same id that is still recent, and its own request record.
  await recordCompletedActionRun(b, "shared-name", daysAgo(10));
  await seedRequest(ws, "account:b", expired);
  // Another workspace with an expired run: out of scope for this workspace's pass.
  await recordCompletedActionRun(subspaceOf(other, "account:a"), "shared-name", daysAgo(400));
  await seedUnrelated(a, "agentSignals", "signal:1", daysAgo(900));
  await seedUnrelated(a, "agentPreferences", "preferences", daysAgo(900));
  await seedUnrelated(ws, "agentActions", "legacy-action:1", daysAgo(900));
  await seedUnrelated(ws, "contacts", "contact:1", daysAgo(900));
  const beforeOther = await snapshot(other);
  const beforeB = await snapshot(b);

  const result = await retention(ws);

  assert.equal(result.runSetsDeleted, 1);
  assert.deepEqual(await runSetRows(a, expired), []);
  assert.deepEqual(await snapshot(other), beforeOther, "other workspace unchanged");
  assert.deepEqual(await snapshot(b), beforeB, "account B's subspace unchanged");
  const remaining = (await snapshot(ws)).filter((row) => row.workspace_id !== b);
  assert.deepEqual(remaining.map((row) => `${row.workspace_id.slice(ws.length)}|${row.collection_name}|${row.target_id ?? "-"}`).sort(), [
    "|agentActions|-", "|contacts|-",
    "|orbit_agent_chat_requests|-", // A's request: kept, link cleared
    `|orbit_agent_chat_requests|${expired}`, // B's request: still linked to B's run
    ":agent-actor:account:a|agentPreferences|-", ":agent-actor:account:a|agentSignals|-",
  ].sort());
});

// SC-0111-02
test("after a set is deleted its request record stays but no longer links to it, the run detail answers as for an unknown run, and the 0103 backfill does not relink it", { skip, timeout: 120_000 }, async () => {
  const ws = newWorkspace("request-link");
  const a = subspaceOf(ws, "account:a");
  const runId = await recordCompletedActionRun(a, "linked", daysAgo(400));
  const requestId = await seedRequest(ws, "account:a", runId);
  const requestBefore = (await snapshot(ws)).find((row) => row.collection_name === "orbit_agent_chat_requests")!;
  assert.equal(requestBefore.target_id, runId);
  const found = await getRunDetail("account:a", ws, runId);
  assert.equal(found.status, 200);
  assert.equal(found.body.data?.runKind, "agent");
  const unknown = await getRunDetail("account:a", ws, "run:natural-language:never-existed");

  const result = await retention(ws);

  assert.equal(result.runSetsDeleted, 1);
  assert.equal(result.requestLinksCleared, 1);
  const requestAfter = (await snapshot(ws)).find((row) => row.collection_name === "orbit_agent_chat_requests")!;
  assert.equal(requestAfter.record_id, requestBefore.record_id, "the request record is kept");
  assert.deepEqual([requestAfter.target_type, requestAfter.target_id], [null, null]);
  assert.deepEqual(requestAfter.payload, requestBefore.payload, "the conversation content is untouched");
  const deleted = await getRunDetail("account:a", ws, runId);
  assert.equal(deleted.status, unknown.status);
  assert.equal(deleted.body.success, unknown.body.success);
  assert.notEqual(deleted.body.data?.runKind, "agent");
  assert.equal(await createTransactionalOrbitAgentChatRequestStore({ actorId: "account:a", client, workspaceId: ws }).findByRunId!(runId), null);
  assert.ok(await createTransactionalOrbitAgentChatRequestStore({ actorId: "account:a", client, workspaceId: ws }).get(requestId));
  // Re-running the 0103 backfill must not point the request back at the missing run.
  await scoped.query(AGENT_RUN_TARGET_BACKFILL_SQL);
  const relinked = (await snapshot(ws)).find((row) => row.collection_name === "orbit_agent_chat_requests")!;
  assert.deepEqual([relinked.target_type, relinked.target_id], [null, null]);
});

test("child rows without the 0103 run target block their set: reported, nothing of it deleted, and deleted whole once backfilled", { skip, timeout: 120_000 }, async () => {
  const ws = newWorkspace("unlinked");
  const a = subspaceOf(ws, "account:a");
  const legacy = await recordCompletedActionRun(a, "pre-0103", daysAgo(400));
  const linked = await recordCompletedActionRun(a, "post-0103", daysAgo(400));
  await scoped.query(
    "update orbit_records set target_type = null, target_id = null where workspace_id = $1 and target_id = $2",
    [a, legacy],
  );
  const lines: string[] = [];
  const before = await snapshot(ws);
  const task = createAgentRunRetentionMaintenanceTask({ resolve: () => ({ client, workspaceId: ws }) });
  const pass = await runMaintenancePass({ tasks: [task], now: () => NOW, log: () => undefined });
  const summary = pass.tasks[0]!.summary!;
  assert.equal(pass.tasks[0]!.status, "failed", "the pass surfaces blocked sets");
  assert.equal(summary.blockedUnlinked, 1);
  assert.equal(summary.unlinkedRows, 4, "step, action, outbox and receipt of the legacy run");
  assert.equal(summary.runSetsDeleted, 1, "the linked set is still deleted");
  const after = await snapshot(ws);
  assert.equal(after.filter((row) => row.record_id === legacy || (row.payload as { entity?: { runId?: string } }).entity?.runId === legacy).length, 5,
    "the legacy set is kept whole");
  assert.deepEqual(await runSetRows(a, linked), []);
  assert.ok(before.length - after.length === 5);
  await runAgentRunRetention({ client, workspaceId: ws, now: NOW, log: (line) => lines.push(line) });
  assert.ok(lines.some((line) => line.includes("agent_run_retention_unlinked_children") && line.includes("db:migrate:agent-run-targets")));
  await scoped.query(AGENT_RUN_TARGET_BACKFILL_SQL);
  const retried = await retention(ws);
  assert.equal(retried.blockedUnlinked, 0);
  assert.equal(retried.runSetsDeleted, 1);
  assert.equal(retried.rowsDeleted, 5);
  assert.deepEqual(await snapshot(ws), []);
});

test("each pass examines a bounded number of sets in bounded pages and later passes finish the rest", { skip, timeout: 120_000 }, async () => {
  const ws = newWorkspace("bounded");
  const a = subspaceOf(ws, "account:a");
  for (let index = 0; index < 7; index += 1) await recordPlainRun(a, `run:conversation:old-${index}`, daysAgo(400), 2);
  const queries: string[] = [];
  const counting: TransactionalPostgresClient = {
    ...client,
    query: (text, values) => { queries.push(text); return client.query(text, values); },
    transaction: (operation, options) => client.transaction(operation, options),
  };
  const first = await runAgentRunRetention({ client: counting, workspaceId: ws, now: NOW, maxRunSets: 3, batchSize: 2, log: () => undefined });
  assert.deepEqual([first.examined, first.runSetsDeleted, first.rowsDeleted, first.truncated], [3, 3, 9, 1]);
  assert.ok(queries.every((text) => /limit \$6/.test(text)), "candidate reads are paged");
  const second = await runAgentRunRetention({ client, workspaceId: ws, now: NOW, maxRunSets: 3, batchSize: 2, log: () => undefined });
  assert.deepEqual([second.examined, second.runSetsDeleted, second.truncated], [3, 3, 1]);
  const third = await runAgentRunRetention({ client, workspaceId: ws, now: NOW, maxRunSets: 3, batchSize: 2, log: () => undefined });
  assert.deepEqual([third.examined, third.runSetsDeleted, third.truncated], [1, 1, 0]);
  assert.deepEqual(await snapshot(ws), []);
  // The pass deadline stops a sweep before it starts another set.
  await recordPlainRun(a, "run:conversation:deadline", daysAgo(400), 1);
  const stopped = await runAgentRunRetention({ client, workspaceId: ws, now: NOW, deadline: 0, clock: () => NOW, log: () => undefined });
  assert.deepEqual([stopped.examined, stopped.truncated], [0, 1]);
});

test("a sweep interrupted inside a set's transaction leaves that set whole; the next sweep resumes and deletes each set exactly once", { skip, timeout: 120_000 }, async () => {
  const ws = newWorkspace("interrupted");
  const a = subspaceOf(ws, "account:a");
  const runs = [];
  for (let index = 0; index < 3; index += 1) runs.push(await recordCompletedActionRun(a, `interrupt-${index}`, daysAgo(400)));
  let transactions = 0;
  const crashing: TransactionalPostgresClient = {
    ...client,
    query: (text, values) => client.query(text, values),
    // The second set's transaction runs its deletes, then the process "dies" before commit.
    transaction: (operation, options) => client.transaction(async (tx) => {
      const value = await operation(tx);
      transactions += 1;
      if (transactions === 2) throw new Error("simulated crash before commit");
      return value;
    }, options),
  };
  const interrupted = await runAgentRunRetention({ client: crashing, workspaceId: ws, now: NOW, maxRunSets: 2, log: () => undefined });
  assert.deepEqual([interrupted.runSetsDeleted, interrupted.failed], [1, 1]);
  assert.deepEqual(await runSetRows(a, runs[0]!), []);
  assert.deepEqual(await runSetRows(a, runs[1]!), ["agentActionsV2", "agentExecutionReceipts", "agentOutbox", "agentRunSteps", "agentRuns"],
    "the crashed set rolled back whole");
  const resumed = await retention(ws);
  assert.deepEqual([resumed.runSetsDeleted, resumed.rowsDeleted, resumed.failed], [2, 10, 0]);
  assert.deepEqual(await snapshot(ws), []);
  assert.equal(await orphanChildren(ws), 0);
});

// SC-0111-04
test("GET /api/internal/maintenance runs the retention task only with the cron bearer, and reports its counts", { skip, timeout: 120_000 }, async () => {
  const ws = newWorkspace("route");
  const a = subspaceOf(ws, "account:a");
  const now = new Date();
  const expired = await recordCompletedActionRun(a, "route-expired", daysAgo(370, now));
  const kept = await recordCompletedActionRun(a, "route-kept", daysAgo(30, now));
  const secret = "s".repeat(40);
  Object.assign(process.env, {
    ORBIT_FEATURE_MODE: "live", ORBIT_MODULE_MODE: "live", ORBIT_DATABASE_TARGET: "local",
    ORBIT_LOCAL_DATABASE_URL: scopedUrl(), ORBIT_LOCAL_WORKSPACE_ID: ws,
  });
  // The task resolves its database from the environment, as in production.
  const dependencies = {
    run: () => runMaintenancePass({ tasks: [createAgentRunRetentionMaintenanceTask({ env: process.env })], log: () => undefined }),
    ensureHeartbeat: async () => null,
  };
  const denied = await handleMaintenanceRequest(new Request("http://orbit.local/api/internal/maintenance", {
    headers: { authorization: `Bearer ${"x".repeat(40)}` },
  }), dependencies, secret);
  assert.equal(denied.status, 401);
  assert.equal((await runSetRows(a, expired)).length, 5, "nothing runs without the secret");
  const response = await handleMaintenanceRequest(new Request("http://orbit.local/api/internal/maintenance", {
    headers: { authorization: `Bearer ${secret}` },
  }), dependencies, secret);
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { pass: { tasks: Array<{ name: string; status: string; summary: Record<string, number> }> } } };
  const task = body.data.pass.tasks.find((entry) => entry.name === "agent_run_retention")!;
  assert.equal(task.status, "ok");
  assert.equal(task.summary.runSetsDeleted, 1);
  assert.equal(task.summary.rowsDeleted, 5);
  assert.equal(task.summary.examined, 1, "the 30-day-old run is not even a candidate");
  assert.equal(task.summary.failed, 0);
  assert.deepEqual(await runSetRows(a, expired), []);
  assert.equal((await runSetRows(a, kept)).length, 5);
});

test("a failing retention task is isolated: the pass reports it and still runs the next task", { skip, timeout: 60_000 }, async () => {
  const broken: TransactionalPostgresClient = {
    ...client,
    query: async () => { throw new Error("database gone"); },
    transaction: async () => { throw new Error("database gone"); },
  };
  let nextRan = false;
  const pass = await runMaintenancePass({
    tasks: [
      createAgentRunRetentionMaintenanceTask({ resolve: () => ({ client: broken, workspaceId: newWorkspace("broken") }) }),
      { name: "next", async run() { nextRan = true; return { done: 1 }; } },
    ],
    log: () => undefined,
  });
  assert.equal(pass.tasks[0]!.status, "failed");
  assert.equal(pass.tasks[1]!.status, "ok");
  assert.ok(nextRan);
});

// ---------------------------------------------------------------- A5 legacy cleanup

interface LegacyFixture { ws: string; a: string; b: string; other: string; actionRun: string; plainRuns: string[] }

/** Two accounts' pre-0110 history plus an action run, and another workspace. */
async function seedLegacyHistory(name: string): Promise<LegacyFixture> {
  const ws = newWorkspace(name);
  const other = newWorkspace(`${name}-other`);
  const a = subspaceOf(ws, "account:a");
  const b = subspaceOf(ws, "account:b");
  const plainRuns: string[] = [];
  for (const [subspace, actor, count] of [[a, "account:a", 3], [b, "account:b", 2]] as const) {
    for (let index = 0; index < count; index += 1) {
      const runId = `run:conversation:${actor}-${index}`;
      await recordPlainRun(subspace, runId, daysAgo(20 + index));
      await seedAnalytics(subspace, runId, daysAgo(20 + index));
      await seedRequest(ws, actor, runId);
      plainRuns.push(runId);
    }
  }
  const actionRun = await recordCompletedActionRun(a, "keep-me", daysAgo(5));
  await seedRequest(ws, "account:a", actionRun);
  await seedAnalytics(a, actionRun, daysAgo(5));
  await recordPlainRun(subspaceOf(other, "account:a"), "run:conversation:other", daysAgo(20));
  await seedAnalytics(subspaceOf(other, "account:a"), "run:conversation:other", daysAgo(20));
  await seedUnrelated(ws, "agentActions", "legacy-action:1", daysAgo(90));
  await seedUnrelated(a, "agentSignals", "signal:1", daysAgo(90));
  return { ws, a, b, other, actionRun, plainRuns };
}

function backupPath(name: string): string {
  return path.join(tmp, `${name}-${randomUUID()}.jsonl`);
}

// SC-0111-03
test("the legacy cleanup dry run counts analytics, plain runs, their steps and request links, and changes nothing", { skip, timeout: 120_000 }, async () => {
  const fixture = await seedLegacyHistory("dry-run");
  const before = await snapshot(fixture.ws);
  const result = await runLegacyTraceCleanup({ client, workspaceId: fixture.ws, execute: false });
  assert.equal(result.mode, "dry-run");
  assert.deepEqual(result.before, {
    analyticsEvents: 12, plainRuns: 5, plainRunSteps: 40, plainRunRequestLinks: 5,
    actionRuns: 1, unlinkedChildRows: 0, orphanSteps: 0,
  });
  assert.equal(result.backup, undefined);
  assert.deepEqual(await snapshot(fixture.ws), before);
});

test("the legacy cleanup exports every row it changes before deleting exactly those; runs with actions, other workspaces and collections stay; a rerun deletes 0", { skip, timeout: 120_000 }, async () => {
  const fixture = await seedLegacyHistory("execute");
  const before = await snapshot(fixture.ws);
  const beforeOther = await snapshot(fixture.other);
  const actionSetBefore = await runSetRows(fixture.a, fixture.actionRun);
  const file = backupPath("execute");

  const result = await runLegacyTraceCleanup({ client, workspaceId: fixture.ws, execute: true, backupPath: file, runBatch: 2, analyticsBatch: 5 });

  assert.deepEqual(result.deleted, { analyticsEvents: 12, plainRuns: 5, plainRunSteps: 40, requestLinksCleared: 5, skippedRuns: 0 });
  assert.deepEqual(result.after, { analyticsEvents: 0, plainRuns: 0, plainRunSteps: 0, plainRunRequestLinks: 0, actionRuns: 1, unlinkedChildRows: 0, orphanSteps: 0 });
  // Backup: a header, then every deleted row in full and every relinked request as it was.
  const lines = readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { kind: string; row: Row & Record<string, unknown> });
  assert.equal(lines[0]!.kind, "header");
  const deletedRows = lines.filter((line) => line.kind === "delete").map((line) => line.row);
  const unlinkedRows = lines.filter((line) => line.kind === "unlink").map((line) => line.row);
  assert.equal(deletedRows.length, 12 + 5 + 40);
  assert.equal(unlinkedRows.length, 5);
  assert.equal(result.backup?.rows, 62);
  const after = await snapshot(fixture.ws);
  const afterKeys = new Set(after.map(keyOf));
  const goneKeys = before.filter((row) => !afterKeys.has(keyOf(row))).map(keyOf).sort();
  assert.deepEqual(goneKeys, deletedRows.map(keyOf).sort(), "exactly the exported rows are gone");
  for (const row of deletedRows) {
    const original = before.find((candidate) => keyOf(candidate) === keyOf(row))!;
    assert.deepEqual(row.payload, original.payload, "the backup holds the full original row");
  }
  // Request records stay with their content; only the plain-run links are cleared.
  const requests = after.filter((row) => row.collection_name === "orbit_agent_chat_requests");
  assert.equal(requests.length, 6);
  assert.deepEqual(requests.filter((row) => row.target_id !== null).map((row) => row.target_id), [fixture.actionRun]);
  for (const request of requests) {
    assert.deepEqual(request.payload, before.find((row) => keyOf(row) === keyOf(request))!.payload);
  }
  assert.deepEqual(await runSetRows(fixture.a, fixture.actionRun), actionSetBefore, "the action run keeps every child, its steps included");
  assert.ok(after.some((row) => row.collection_name === "agentActions") && after.some((row) => row.collection_name === "agentSignals"));
  assert.deepEqual(await snapshot(fixture.other), beforeOther, "other workspace unchanged");
  assert.equal(await orphanChildren(fixture.ws), 0);

  const again = await runLegacyTraceCleanup({ client, workspaceId: fixture.ws, execute: true, backupPath: backupPath("again") });
  assert.deepEqual(again.deleted, { analyticsEvents: 0, plainRuns: 0, plainRunSteps: 0, requestLinksCleared: 0, skippedRuns: 0 });
  assert.deepEqual(await snapshot(fixture.ws), after);
  const dry = await runLegacyTraceCleanup({ client, workspaceId: fixture.ws, execute: false });
  assert.deepEqual([dry.before.analyticsEvents, dry.before.plainRuns, dry.before.plainRunSteps, dry.before.plainRunRequestLinks], [0, 0, 0, 0]);
});

test("the legacy cleanup refuses to delete while child rows lack the 0103 run target, and writes no backup", { skip, timeout: 120_000 }, async () => {
  const fixture = await seedLegacyHistory("refuse");
  await scoped.query("update orbit_records set target_type = null, target_id = null where workspace_id = $1 and collection_name = 'agentRunSteps' and record_id like $2",
    [fixture.a, "run:conversation:account:a-0:%"]);
  const before = await snapshot(fixture.ws);
  const dry = await runLegacyTraceCleanup({ client, workspaceId: fixture.ws, execute: false });
  assert.equal(dry.before.unlinkedChildRows, 8);
  const file = backupPath("refuse");
  await assert.rejects(runLegacyTraceCleanup({ client, workspaceId: fixture.ws, execute: true, backupPath: file }), LegacyTraceCleanupRefused);
  assert.equal(existsSync(file), false);
  assert.deepEqual(await snapshot(fixture.ws), before);
});

test("an interrupted legacy cleanup resumes: committed batches stay deleted, the rest is exported again and deleted, totals match", { skip, timeout: 120_000 }, async () => {
  const fixture = await seedLegacyHistory("resume");
  const first = backupPath("resume-1");
  await assert.rejects(runLegacyTraceCleanup({
    client, workspaceId: fixture.ws, execute: true, backupPath: first, runBatch: 2,
    afterBatch: (kind, batch) => { if (kind === "runs" && batch === 0) throw new Error("simulated interruption"); },
  }), /simulated interruption/);
  const midway = await countLegacyTrace(client, fixture.ws);
  assert.deepEqual([midway.analyticsEvents, midway.plainRuns, midway.plainRunSteps, midway.plainRunRequestLinks], [0, 3, 24, 3]);
  assert.equal(await orphanChildren(fixture.ws), 0, "a committed batch removed its runs, steps and links together");
  const second = backupPath("resume-2");
  const resumed = await runLegacyTraceCleanup({ client, workspaceId: fixture.ws, execute: true, backupPath: second, runBatch: 2 });
  assert.deepEqual(resumed.deleted, { analyticsEvents: 0, plainRuns: 3, plainRunSteps: 24, requestLinksCleared: 3, skippedRuns: 0 });
  assert.equal(resumed.backup?.rows, 3 + 24 + 3, "the second backup holds only what was left");
  assert.equal(readFileSync(first, "utf8").trim().split("\n").length - 1, 12 + 5 + 40 + 5, "the first backup still holds everything");
  assert.deepEqual([resumed.after!.plainRuns, resumed.after!.actionRuns], [0, 1]);
});

test("the legacy cleanup never overwrites an existing backup file", { skip, timeout: 60_000 }, async () => {
  const fixture = await seedLegacyHistory("no-overwrite");
  const file = backupPath("exists");
  writeFileSync(file, "keep\n");
  const before = await snapshot(fixture.ws);
  await assert.rejects(runLegacyTraceCleanup({ client, workspaceId: fixture.ws, execute: true, backupPath: file }), /EEXIST/);
  assert.equal(readFileSync(file, "utf8"), "keep\n");
  assert.deepEqual(await snapshot(fixture.ws), before);
});

test("the cleanup target guard: local runs freely, a remote database needs --execute plus a matching host/database confirmation", () => {
  const local = "postgresql://me@127.0.0.1:5432/orbit_events";
  const remote = "postgresql://user:secret@db.example.com:5432/orbit_prod?sslmode=require";
  assert.doesNotThrow(() => assertLegacyTraceCleanupTarget({ connectionString: local, target: "local", execute: true }));
  assert.doesNotThrow(() => assertLegacyTraceCleanupTarget({ connectionString: remote, target: "cloud", execute: false }));
  assert.throws(() => assertLegacyTraceCleanupTarget({ connectionString: remote, target: "cloud", execute: true }), LegacyTraceCleanupRefused);
  assert.throws(() => assertLegacyTraceCleanupTarget({ connectionString: remote, target: "cloud", execute: true, confirmRemote: "db.example.com/other" }), LegacyTraceCleanupRefused);
  assert.throws(() => assertLegacyTraceCleanupTarget({ connectionString: local, target: "cloud", execute: true }), LegacyTraceCleanupRefused,
    "a cloud target counts as remote even on a local host");
  assert.doesNotThrow(() => assertLegacyTraceCleanupTarget({ connectionString: remote, target: "cloud", execute: true, confirmRemote: "db.example.com/orbit_prod" }));
  try {
    assertLegacyTraceCleanupTarget({ connectionString: remote, target: "cloud", execute: true });
  } catch (error) {
    assert.ok(!String(error).includes("secret"), "the refusal never echoes credentials");
  }
});
