import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import { createRuntimeBackedAgentLedgerService } from "../../features/agent/ledger/runtime-adapter";
import type { AgentActionRecord, AgentExecutionReceipt, AgentRunStep } from "../../features/agent/runtime/contract";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import type { AgentRuntimeRepository } from "../../features/agent/runtime/repository";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createReadCostLedger } from "../performance/read-cost-ledger";

/**
 * Sprint 0121 item 1 (Codex review of 0103) against real PostgreSQL: the Agent
 * ledger filters in SQL before it limits, pages explicitly, and the reads used
 * for completeness (one run's children, the idempotency receipt, "does this
 * action exist") are never answered from a truncated list. The repository,
 * runtime service and ledger service are the production ones.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `agent_ledger_paging_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:agent-ledger-paging:${schema}`;
const readCost = createReadCostLedger();
let admin: Pool;
let client: TransactionalPostgresClient;

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 3, options: `-c search_path=${schema} -c statement_timeout=20000` });
  client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool, readMetrics: readCost.observer });
  await runOrbitRecordsMigration(client);
}, { timeout: 120_000 });

after(async () => {
  if (skip) return;
  try { await client.close(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

function repository(subspace: string): AgentRuntimeRepository {
  return createStorageAgentRuntimeRepository({ store: createPostgresLiveRecordStore({ client }), sqlClient: client, workspaceId: `${workspaceId}:${subspace}` });
}

function ledgerFor(repo: AgentRuntimeRepository) {
  const runtime = createAgentRuntimeService({
    repository: repo,
    now: () => "2026-09-27T12:00:00.000Z",
    executors: createAgentExecutorRegistry([]),
  });
  return { runtime, ledger: createRuntimeBackedAgentLedgerService({ runtime }) };
}

const at = (index: number) => new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString();

function action(index: number, fields: Partial<AgentActionRecord> = {}): AgentActionRecord {
  const actionId = `action:${String(index).padStart(4, "0")}`;
  return {
    actionId, runId: `run:${actionId}`, workflowKey: "wf_bulk", workflowVersion: 1, title: `Action ${index}`, whyNow: "Test",
    status: "completed", riskLevel: "write", payloadVersion: 1,
    operations: [{ operationId: `${actionId}:op`, operationType: "create_followup_task", executorKey: "tests.persist",
      idempotencyKey: `${actionId}:v1`, payloadVersion: 1, payload: {}, preview: "Test", riskLevel: "write", compensation: { supported: false } }],
    evidenceChips: [], evidenceIds: [], sourceRefs: [], preview: "Test", compensation: { supported: false },
    createdAt: at(index), updatedAt: at(index), immutablePayloadHash: `hash:${index}`,
    ...fields,
  } as AgentActionRecord;
}

/** Codex's reproduction: one old action that still needs the user, then 500 newer completed ones. */
async function seedCodexScenario(repo: AgentRuntimeRepository): Promise<void> {
  await repo.saveAction(action(0, { status: "awaiting_confirmation", workflowKey: "wf_old" }));
  for (let index = 1; index <= 500; index += 1) await repo.saveAction(action(index));
}

test("0121 an old awaiting action behind 500 newer completed ones is found by status, workflow and date", { skip, timeout: 180_000 }, async () => {
  const repo = repository("codex");
  await seedCodexScenario(repo);
  assert.deepEqual((await repo.listActions({ status: "awaiting_confirmation" })).map((a) => a.actionId), ["action:0000"]);
  assert.deepEqual((await repo.listActions({ workflowKey: "wf_old" })).map((a) => a.actionId), ["action:0000"]);
  assert.deepEqual((await repo.listActions({ createdBefore: at(0) })).map((a) => a.actionId), ["action:0000"]);
  assert.deepEqual((await repo.listActions({ createdAfter: at(500) })).map((a) => a.actionId), ["action:0500"]);

  const { ledger } = ledgerFor(repo);
  const awaiting = await ledger.listEntries({ status: "awaiting_confirmation" });
  assert.ok(awaiting.success);
  assert.deepEqual(awaiting.data.entries.map((entry) => entry.entryId), ["action:0000"], "the ledger does not say 0 entries");
  assert.equal(awaiting.data.state, "success");
  assert.equal(awaiting.data.nextCursor, null);
});

test("0121 the ledger pages explicitly with a bounded read per page and reaches every action", { skip, timeout: 180_000 }, async () => {
  const repo = repository("paging");
  await seedCodexScenario(repo);
  const { ledger } = ledgerFor(repo);
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const result = await ledger.listEntries({ limit: "200", cursor });
    assert.ok(result.success);
    assert.ok(result.data.entries.length <= 200);
    seen.push(...result.data.entries.map((entry) => entry.entryId));
    cursor = result.data.nextCursor ?? null;
    pages += 1;
  } while (cursor && pages < 10);
  assert.equal(pages, 3);
  assert.equal(seen.length, 501);
  assert.equal(new Set(seen).size, 501, "no entry repeats across pages");
  assert.equal(seen[0], "action:0500", "newest first");
  assert.equal(seen.at(-1), "action:0000", "the old awaiting action is on the last page");
  const firstPage = await ledger.listEntries({ limit: 200 });
  assert.ok(firstPage.success);
  assert.match(firstPage.data.summary, /本页 200 条/u, "a partial page does not claim to be the whole ledger");

  // One list page returns at most limit + 1 rows from the database, whatever the history size.
  const { cost } = await readCost.measure("list-page", () => repo.listActionPage({ limit: 50 }));
  assert.ok(cost.rows <= 51, `rows read for one page: ${cost.rows}`);
  assert.equal(cost.queries, 1);

  // A tampered cursor is rejected instead of silently restarting from the top.
  await assert.rejects(() => repo.listActionPage({ limit: 50, cursor: "not-a-cursor" }), /cursor/i);
  // Filters and paging combine: completed only, pages of 300.
  const first = await repo.listActionPage({ status: "completed", limit: 300 });
  const second = await repo.listActionPage({ status: "completed", limit: 300, cursor: first.nextCursor });
  assert.equal(first.actions.length + second.actions.length, 500);
  assert.equal(second.nextCursor, null);
});

test("0121 a transition on an action older than the newest 500 is judged on the action itself, not reported missing", { skip, timeout: 180_000 }, async () => {
  const repo = repository("transition");
  await repo.saveAction(action(0, { status: "completed", workflowKey: "wf_old" }));
  for (let index = 1; index <= 500; index += 1) await repo.saveAction(action(index));
  const { ledger } = ledgerFor(repo);
  const result = await ledger.applyTransition({ entryId: "action:0000", transition: "reject" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "AGENT_LEDGER_TRANSITION_INVALID", "a completed action cannot be rejected; it is not missing");
  const missing = await ledger.applyTransition({ entryId: "action:missing", transition: "reject" });
  assert.equal(missing.success, false);
  if (!missing.success) assert.equal(missing.error.code, "AGENT_LEDGER_ENTRY_NOT_FOUND");
});

test("0121 one run with more than 500 children is read completely, and the idempotency receipt is found by its key", { skip, timeout: 180_000 }, async () => {
  const repo = repository("children");
  const runId = "run:large";
  await repo.saveRun({ runId, workflowKey: "wf_large", workflowVersion: 1, trigger: "chat", status: "running",
    createdAt: at(0), updatedAt: at(0) } as never);
  for (let index = 0; index < 520; index += 1) {
    await repo.saveRunStep({ stepId: `${runId}:step:${String(index).padStart(4, "0")}`, runId, sequence: index + 1, name: `step ${index}`,
      kind: "deterministic", status: "completed", attempt: 1, createdAt: at(index), updatedAt: at(index) } as AgentRunStep);
  }
  const receipt = (index: number, status: AgentExecutionReceipt["status"], idempotencyKey: string) => ({
    receiptId: `receipt:${String(index).padStart(4, "0")}`, runId, actionId: "action:large", operationId: "action:large:op",
    executorKey: "tests.persist", idempotencyKey, status, attempt: index + 1, createdAt: at(index), updatedAt: at(index),
  }) as unknown as AgentExecutionReceipt;
  // 510 failed attempts for other keys, then the completed receipt for the key under test.
  for (let index = 0; index < 510; index += 1) await repo.saveReceipt(receipt(index, "failed", `key:other:${index}`));
  await repo.saveReceipt(receipt(9999, "completed", "key:wanted"));

  const detail = await repo.getRun(runId);
  assert.ok(detail);
  assert.equal(detail.steps.length, 520, "every step of the run");
  assert.equal(detail.receipts.length, 511, "every receipt of the run");
  const found = await repo.getReceiptByIdempotencyKey("key:wanted", runId);
  assert.equal(found?.receiptId, "receipt:9999");
  assert.equal(await repo.getReceiptByIdempotencyKey("key:other:3", runId), null, "failed attempts do not fence retries");
  assert.equal(await repo.getReceiptByIdempotencyKey("key:wanted", "run:other"), null, "another run's receipt is not returned");
  const { cost } = await readCost.measure("receipt-lookup", () => repo.getReceiptByIdempotencyKey("key:wanted", runId));
  assert.ok(cost.rows <= 1, `exact lookup reads at most one row (${cost.rows})`);
});
