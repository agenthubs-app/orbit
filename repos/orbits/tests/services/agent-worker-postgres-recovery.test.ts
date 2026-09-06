import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { Pool } from "pg";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPgLiveRecordSqlClient, createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";

test("Postgres workers recover a killed claimant without replaying a persisted receipt", { timeout: 30_000 }, async () => {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  assert.ok(config);
  const schema = `agent_recovery_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: config.connectionString, max: 1 });
  const url = new URL(config.connectionString);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const setup = new Pool({ connectionString: url.toString(), max: 1 });
  const clients: ReturnType<typeof createPgLiveRecordSqlClient>[] = [];
  const workspaceId = "worker:recovery-test";
  let clock = "2026-09-06T00:00:00.000Z";
  const executed: string[] = [];
  let child: ChildProcess | undefined;
  const repository = (workspace = workspaceId) => {
    const client = createPgLiveRecordSqlClient({ connectionString: url.toString(), max: 1 });
    clients.push(client);
    return createStorageAgentRuntimeRepository({ store: createPostgresLiveRecordStore({ client }), sqlClient: client, workspaceId: workspace });
  };
  const runtime = (repo: ReturnType<typeof repository>) => createAgentRuntimeService({
    repository: repo, now: () => clock, id: randomUUID,
    executors: createAgentExecutorRegistry([{ key: "tests.persist", riskLevel: "write", async execute(payload) {
      executed.push(String(payload.recordId));
      return { resultRef: "test:written", summary: "Controlled test execution" };
    } }]),
  });
  try {
    await admin.query(`create schema ${schema}`);
    await setup.query(ORBIT_RECORDS_SCHEMA_SQL);
    const seed = repository();
    const producer = runtime(seed);
    for (const name of ["pending", "receipt"]) {
      const runId = `run:${name}`, actionId = `action:${name}`;
      await producer.createRun({ runId, workflowKey: "test_recovery", trigger: "manual" });
      await producer.proposeAction({
        actionId, runId, workflowKey: "test_recovery", workflowVersion: 1,
        title: "Recovery test", whyNow: "Explicit test", preview: "Test only", riskLevel: "write", payloadVersion: 1,
        compensation: { supported: false }, evidenceChips: [], evidenceIds: [], sourceRefs: [],
        operations: [{ operationId: `operation:${name}`, operationType: "create_followup_task", executorKey: "tests.persist",
          idempotencyKey: `idempotency:${name}`, payloadVersion: 1, payload: { recordId: name }, preview: "Test only",
          riskLevel: "write", compensation: { supported: false } }],
      });
      await producer.approveAction({ actionId, actorLabel: "Test user" });
    }
    const event = (await seed.getRun("run:receipt"))!.outbox[0];
    await seed.saveReceipt({
      receiptId: "receipt:durable", outboxId: event.outboxId, actionId: event.actionId, operationId: event.operationId,
      runId: event.runId, idempotencyKey: event.idempotencyKey, executorKey: event.executorKey, status: "completed",
      resultSummary: "Domain write completed before crash", createdAt: clock, updatedAt: clock,
    });
    await clients.pop()!.close();
    const storageModule = pathToFileURL(resolve("shared/storage/postgres-live-record-store.ts")).href;
    const repositoryModule = pathToFileURL(resolve("features/agent/storage/agent-runtime-live-record-provider.ts")).href;
    child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      const storageModule = await import(${JSON.stringify(storageModule)});
      const { createPgLiveRecordSqlClient, createPostgresLiveRecordStore } = storageModule.default ?? storageModule;
      const repositoryModule = await import(${JSON.stringify(repositoryModule)});
      const { createStorageAgentRuntimeRepository } = repositoryModule.default ?? repositoryModule;
      const client = createPgLiveRecordSqlClient({ connectionString: process.env.ORBIT_RECOVERY_TEST_DATABASE_URL, max: 1 });
      const repo = createStorageAgentRuntimeRepository({ store: createPostgresLiveRecordStore({client}), sqlClient: client, workspaceId: 'worker:recovery-test' });
      try {
        const events = await repo.claimReadyOutbox({now:'2026-09-06T00:00:00.000Z',limit:2,workerId:'crash-worker'});
        process.send({claimed:events.length});
        setInterval(()=>{},1000);
      } catch { process.exit(1); }
    `], { cwd: process.cwd(), env: { ...process.env, ORBIT_RECOVERY_TEST_DATABASE_URL: url.toString() }, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    const claimed = await new Promise<unknown>((accept, reject) => {
      const timer = setTimeout(() => reject(new Error("Test worker did not claim in time")), 10_000);
      child!.once("message", (message) => { clearTimeout(timer); accept(message); });
      child!.once("error", () => { clearTimeout(timer); reject(new Error("Test worker failed to start")); });
      child!.once("exit", () => { clearTimeout(timer); reject(new Error("Test worker exited before reporting a claim")); });
    });
    assert.deepEqual(claimed, { claimed: 2 });
    const terminated = once(child, "exit");
    child.kill("SIGKILL");
    const [, signal] = await terminated;
    assert.equal(signal, "SIGKILL");
    child = undefined;

    const first = runtime(repository()), second = runtime(repository());
    assert.equal((await runtime(repository("unrelated:workspace")).processOutbox()).processed, 0);
    clock = "2026-09-06T00:14:59.000Z";
    assert.equal((await first.processOutbox()).processed, 0, "unexpired leases must remain exclusive");
    assert.deepEqual(executed, []);
    clock = "2026-09-06T00:15:01.000Z";
    const results = await Promise.all([
      first.processOutbox({ workerId: "replacement-a", limit: 1 }),
      second.processOutbox({ workerId: "replacement-b", limit: 1 }),
    ]);
    assert.equal(results.reduce((sum, item) => sum + item.completed, 0), 2);
    assert.deepEqual(executed, ["pending"], "persisted receipt skips replay after a real claimant process dies");
    for (const name of ["pending", "receipt"]) {
      const detail = (await first.getRun(`run:${name}`))!;
      assert.equal(detail.actions[0].status, "completed");
      assert.equal(detail.outbox[0].status, "completed");
      assert.equal(detail.outbox[0].attempt, 2);
      assert.equal(detail.receipts.length, 1);
    }
    assert.equal((await second.processOutbox()).processed, 0);
    assert.deepEqual(executed, ["pending"]);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, "exit"); child.kill("SIGKILL"); await exit;
    }
    await Promise.all(clients.map((client) => client.close()));
    await setup.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
