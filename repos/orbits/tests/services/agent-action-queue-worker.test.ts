import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createMemoryAgentRuntimeRepository } from "../../features/agent/runtime/repository";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { withAgentBackgroundDispatch, type AgentActionWake } from "../../features/agent/runtime/background-dispatch";
import { AgentActionExecutionPending, isAgentActionWake, processAgentActionQueueWake } from "../../features/agent/runtime/action-queue-worker";

async function fixture() {
  const repository = createMemoryAgentRuntimeRepository();
  let clock = "2026-09-06T00:00:00.000Z";
  let executions = 0;
  let fail = false;
  const runtime = createAgentRuntimeService({ repository, id: randomUUID, now: () => clock,
    executors: createAgentExecutorRegistry([{ key: "tests.queue", riskLevel: "write", async execute() {
      executions += 1;
      if (fail) throw new Error("private provider diagnostic");
      return { summary: "Recorded", resultRef: "record:test" };
    } }]),
  });
  await runtime.createRun({ runId: "run:test", workflowKey: "test_queue", trigger: "manual" });
  await runtime.proposeAction({
    actionId: "action:test", runId: "run:test", workflowKey: "test_queue", workflowVersion: 1,
    title: "Private title", whyNow: "Test", preview: "Private preview", riskLevel: "write", payloadVersion: 1,
    compensation: { supported: false }, evidenceChips: [], evidenceIds: [], sourceRefs: [],
    operations: [{ operationId: "operation:test", operationType: "create_followup_task", executorKey: "tests.queue",
      idempotencyKey: "idempotency:test", payloadVersion: 1, payload: { privateContent: "Never sent to queue" },
      preview: "Private content", riskLevel: "write", compensation: { supported: false } }],
  });
  const messages: AgentActionWake[] = [];
  const producer = withAgentBackgroundDispatch(runtime, "actor:test", async (message) => { messages.push(message); });
  return { repository, runtime, producer, messages,
    message: { version: 1, actorId: "actor:test", actionId: "action:test", runId: "run:test" } as const,
    executions: () => executions, fail: (value: boolean) => { fail = value; },
    clock: (value: string) => { clock = value; },
  };
}

const pending = (error: unknown) => error instanceof AgentActionExecutionPending;

test("confirmation publishes identifiers after durable approval; duplicate delivery executes once", async () => {
  const f = await fixture();
  assert.equal(f.messages.length, 0);
  await f.producer.approveAction({ actionId: "action:test", actorLabel: "Test user" });
  assert.deepEqual(f.messages, [f.message]);
  assert.equal((await f.repository.getAction("action:test"))?.status, "approved");
  const deliveries = await Promise.allSettled([
    processAgentActionQueueWake(f.message, f.runtime), processAgentActionQueueWake(f.message, f.runtime),
  ]);
  for (const result of deliveries) if (result.status === "rejected") assert.ok(pending(result.reason));
  await processAgentActionQueueWake(f.message, f.runtime);
  assert.equal(f.executions(), 1);
  assert.equal((await f.repository.getAction("action:test"))?.status, "completed");
  await f.producer.approveAction({ actionId: "action:test", actorLabel: "Test user" });
  assert.equal(f.messages.length, 1, "completed replay does not publish more work");
});

test("an accepted action survives publish failure and confirmation replay can dispatch it", async () => {
  const f = await fixture();
  const unavailable = withAgentBackgroundDispatch(f.runtime, "actor:test", async () => { throw new Error("private credential"); });
  await assert.rejects(unavailable.approveAction({ actionId: "action:test", actorLabel: "Test user" }),
    (error: unknown) => error instanceof Error && error.message.includes("saved action") && !error.message.includes("private credential"));
  assert.equal((await f.repository.getAction("action:test"))?.status, "approved");
  assert.equal((await f.runtime.getRun("run:test"))?.outbox.length, 1);
  await f.producer.approveAction({ actionId: "action:test", actorLabel: "Test user" });
  await processAgentActionQueueWake(f.messages[0], f.runtime);
  assert.equal(f.executions(), 1);
});

test("a database lease held by a killed invocation keeps the queue message pending until takeover", async () => {
  const f = await fixture();
  await f.producer.approveAction({ actionId: "action:test", actorLabel: "Test user" });
  await f.repository.claimReadyOutbox({ now: "2026-09-06T00:00:00.000Z", limit: 1, workerId: "lost-worker" });
  await assert.rejects(processAgentActionQueueWake(f.message, f.runtime), pending);
  assert.equal(f.executions(), 0);
  f.clock("2026-09-06T00:16:00.000Z");
  await processAgentActionQueueWake(f.message, f.runtime);
  assert.equal(f.executions(), 1);
  assert.equal((await f.runtime.getRun("run:test"))?.outbox[0].attempt, 2);
});

test("future retries stay pending, dead letters finish delivery, explicit retry dispatches fresh work", async () => {
  const f = await fixture();
  f.fail(true);
  await f.producer.approveAction({ actionId: "action:test", actorLabel: "Test user" });
  await assert.rejects(processAgentActionQueueWake(f.message, f.runtime), pending);
  const attempts = f.executions();
  await assert.rejects(processAgentActionQueueWake(f.message, f.runtime), pending);
  assert.equal(f.executions(), attempts, "future retry must not execute early");
  for (let index = 0; index < 10; index += 1) {
    const event = (await f.runtime.getRun("run:test"))!.outbox[0];
    if (event.status === "dead_letter") break;
    f.clock(event.availableAt);
    try { await processAgentActionQueueWake(f.message, f.runtime); }
    catch (error) { assert.ok(pending(error)); }
  }
  assert.equal((await f.repository.getAction("action:test"))?.status, "failed");
  await processAgentActionQueueWake(f.message, f.runtime);
  f.fail(false);
  await f.producer.retryAction("action:test");
  assert.equal(f.messages.length, 2);
  await processAgentActionQueueWake(f.messages[1], f.runtime);
  assert.equal((await f.repository.getAction("action:test"))?.status, "completed");
});

test("cancellation and a different actor store cannot execute queued work", async () => {
  const f = await fixture();
  await f.producer.approveAction({ actionId: "action:test", actorLabel: "Test user" });
  let claims = 0;
  await processAgentActionQueueWake(f.message, {
    async getRun() { return null; },
    async processOutbox() { claims += 1; throw new Error("Cross-actor execution"); },
  });
  assert.equal(claims, 0);
  await f.runtime.cancelAction("action:test");
  await processAgentActionQueueWake(f.message, f.runtime);
  assert.equal(f.executions(), 0);
});

test("invalid message shapes and private database failures are contained", async () => {
  const f = await fixture();
  assert.equal(isAgentActionWake(f.message), true);
  for (const value of [null, [], {}, { ...f.message, actorId: " " }, { ...f.message, version: 2 },
    { ...f.message, workspaceId: "other" }, { ...f.message, runId: "x".repeat(513) }]) assert.equal(isAgentActionWake(value), false);
  await assert.rejects(processAgentActionQueueWake(f.message, {
    async getRun() { throw new Error("private database credentials"); },
    processOutbox: f.runtime.processOutbox,
  }), { message: "Agent background execution unavailable." });
});
