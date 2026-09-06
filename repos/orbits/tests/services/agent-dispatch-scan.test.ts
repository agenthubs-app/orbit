import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPgLiveRecordSqlClient, createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { redispatchPendingAgentActions } from "../../features/agent/runtime/dispatch-scan";
import { handleAgentDispatchScanRequest } from "../../features/agent/runtime/dispatch-scan-http";
import { processAgentActionQueueWake } from "../../features/agent/runtime/action-queue-worker";
import type { AgentActionWake } from "../../features/agent/runtime/background-dispatch";

test("Postgres dispatch scan recovers unpublished work with exact scope, due-time and approval fences", { timeout: 30_000 }, async () => {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  assert.ok(config);
  const schema = `agent_dispatch_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: config.connectionString, max: 1 });
  const url = new URL(config.connectionString);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const client = createPgLiveRecordSqlClient({ connectionString: url.toString(), max: 2 });
  const store = createPostgresLiveRecordStore<{ entity: unknown }>({ client });
  const workspaceId = "workspace:dispatch%_";
  let clock = "2026-09-06T00:00:00.000Z";
  const executed: string[] = [];
  const make = (actorId: string, base = workspaceId) => {
    const repository = createStorageAgentRuntimeRepository({ store, sqlClient: client, workspaceId: `${base}:agent-actor:${actorId}` });
    const runtime = createAgentRuntimeService({ repository, now: () => clock, id: randomUUID,
      executors: createAgentExecutorRegistry([{ key: "test.dispatch", riskLevel: "write", async execute(payload) {
        executed.push(String(payload.name)); return { summary: "Stored", resultRef: "test:stored" };
      } }]),
    });
    return { repository, runtime };
  };
  const seed = async (actorId: string, approve = true, base = workspaceId, operationCount = 1) => {
    const value = make(actorId, base);
    await value.runtime.createRun({ runId: `run:${actorId}`, workflowKey: "test_dispatch", trigger: "manual" });
    await value.runtime.proposeAction({
      actionId: `action:${actorId}`, runId: `run:${actorId}`, workflowKey: "test_dispatch", workflowVersion: 1,
      title: "Test", whyNow: "Test", preview: "Private test content", riskLevel: "write", payloadVersion: 1,
      compensation: { supported: false }, evidenceChips: [], evidenceIds: [], sourceRefs: [],
      operations: Array.from({ length: operationCount }, (_, index) => ({
        operationId: `operation:${actorId}:${index}`, operationType: "create_followup_task" as const,
        executorKey: "test.dispatch", idempotencyKey: `once:${actorId}:${index}`, payloadVersion: 1,
        payload: { name: `${actorId}:${index}` }, preview: "Test", riskLevel: "write" as const, compensation: { supported: false },
      })),
    });
    if (approve) await value.runtime.approveAction({ actionId: `action:${actorId}`, actorLabel: "Test" });
    return value;
  };
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const first = await seed("first", true, workspaceId, 2);
    await seed("second");
    const cancelled = await seed("cancelled");
    await cancelled.runtime.cancelAction("action:cancelled");
    const unconfirmed = await seed("unconfirmed", false);
    const orphan = (await first.runtime.getRun("run:first"))!.outbox[0];
    await unconfirmed.repository.saveOutbox({ ...orphan, outboxId: "outbox:orphan", actionId: "action:unconfirmed", runId: "run:unconfirmed" });
    const leased = await seed("leased");
    await leased.repository.claimReadyOutbox({ now: clock, limit: 1, workerId: "lost-worker" });
    const future = await seed("future");
    const futureEvent = (await future.runtime.getRun("run:future"))!.outbox[0];
    await future.repository.saveOutbox({ ...futureEvent, status: "retry_scheduled", availableAt: "2026-09-07T00:00:00.000Z" });
    await seed("neighbor", true, "workspace:dispatchAA");
    await seed("neighbor-prefix", true, `${workspaceId}-other`);
    const messages: AgentActionWake[] = [];
    const scan = (limit = 100, publish = async (message: AgentActionWake) => { messages.push(message); }) =>
      redispatchPendingAgentActions({ client, workspaceId, publish, now: new Date(clock), limit });
    assert.equal((await scan()).examined, 0, "give the original publisher two minutes before redispatch");
    clock = "2026-09-06T00:03:00.000Z";
    assert.deepEqual(await scan(), { examined: 2, published: 2, failed: 0, truncated: false });
    assert.deepEqual(messages.map((message) => message.actorId).sort(), ["first", "second"]);
    assert.equal(messages.filter((message) => message.actorId === "first").length, 1, "group multiple operations into one wake");
    const bounded = await scan(1);
    assert.deepEqual(bounded, { examined: 1, published: 1, failed: 0, truncated: true });
    assert.deepEqual(await scan(100, async () => { throw new Error("private queue credential"); }),
      { examined: 2, published: 0, failed: 2, truncated: false });
    assert.equal((await scan()).published, 2, "failed publishing must remain retryable");
    for (const message of messages) {
      const runtime = make(message.actorId).runtime;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try { await processAgentActionQueueWake(message, runtime); break; }
        catch (error) { assert.equal((error as Error).message, "Agent action execution remains pending."); }
      }
    }
    assert.deepEqual(executed.sort(), ["first:0", "first:1", "second:0"]);
    assert.equal((await scan()).examined, 0, "completed work is no longer redispatched");
    clock = "2026-09-06T00:16:00.000Z";
    messages.length = 0;
    assert.deepEqual(await scan(), { examined: 1, published: 1, failed: 0, truncated: false });
    assert.equal(messages[0].actorId, "leased");
    await processAgentActionQueueWake(messages[0], make("leased").runtime);
    assert.equal(executed.filter((name) => name === "leased:0").length, 1);
    assert.equal((await scan()).examined, 0);
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});

test("dispatch HTTP boundary authenticates before configuration and never accepts identity overrides", async () => {
  const secret = "s".repeat(40);
  let calls = 0;
  const run = async () => { calls += 1; return { examined: 1, published: 1, failed: 0, truncated: false }; };
  for (const authorization of ["", `Bearer ${"x".repeat(40)}`, "Bearer short"]) {
    assert.equal((await handleAgentDispatchScanRequest(new Request("https://orbit.test/api/internal/agent/dispatch", { headers: { authorization } }), run, secret)).status, 401);
  }
  assert.equal(calls, 0);
  const headers = { authorization: `Bearer ${secret}` };
  const overridden = await handleAgentDispatchScanRequest(new Request("https://orbit.test/api/internal/agent/dispatch?workspaceId=other", { headers }), run, secret);
  assert.equal(overridden.status, 400);
  assert.equal(calls, 0);
  const request = new Request("https://orbit.test/api/internal/agent/dispatch", { headers });
  const response = await handleAgentDispatchScanRequest(request, run, secret);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const failed = await handleAgentDispatchScanRequest(request, async () => { throw new Error(secret); }, secret);
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes(secret), false);
  const partial = await handleAgentDispatchScanRequest(request, async () => ({ examined: 2, published: 1, failed: 1, truncated: false }), secret);
  assert.equal(partial.status, 503);
});
