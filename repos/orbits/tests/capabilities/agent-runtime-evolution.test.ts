import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentExecutorRegistry,
  type AgentActionExecutor,
} from "../../features/agent/runtime/executor-registry";
import { createMemoryAgentRuntimeRepository } from "../../features/agent/runtime/repository";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { agentRunProgress } from "../../features/agent/runtime/service";
import {
  executeOrbitAgentTool,
  getOrbitAgentToolMetadata,
} from "../../features/orbit-ai/agent-tools/registry";
import type { OrbitAgentArtifactPayload } from "../../features/orbit-ai/artifact-contract";

function createHarness(input: {
  executeFailures?: number;
  compensation?: boolean;
}) {
  let clock = "2026-07-25T00:00:00.000Z";
  let executionCount = 0;
  let compensationCount = 0;
  let idCount = 0;
  const executor: AgentActionExecutor = {
    key: "tests.write",
    riskLevel: "write",
    async execute() {
      executionCount += 1;
      if (executionCount <= (input.executeFailures ?? 0)) {
        throw new Error(`planned failure ${executionCount}`);
      }
      return { resultRef: "test:written", summary: "written once" };
    },
    compensate: input.compensation
      ? async () => {
          compensationCount += 1;
          return { summary: "removed once" };
        }
      : undefined,
  };
  const repository = createMemoryAgentRuntimeRepository();
  const runtime = createAgentRuntimeService({
    executors: createAgentExecutorRegistry([executor]),
    id: () => `id-${++idCount}`,
    now: () => clock,
    repository,
  });

  return {
    runtime,
    repository,
    executionCount: () => executionCount,
    compensationCount: () => compensationCount,
    setClock: (next: string) => {
      clock = next;
    },
  };
}

async function proposeTestAction(
  harness: ReturnType<typeof createHarness>,
  input: { actionId?: string; operationCount?: number } = {},
) {
  const runId = `run:${input.actionId ?? "test"}`;
  await harness.runtime.createRun({
    runId,
    workflowKey: "test_workflow_v1",
    trigger: "manual",
  });
  const actionId = input.actionId ?? "action:test";
  return harness.runtime.proposeAction({
    actionId,
    runId,
    workflowKey: "test_workflow_v1",
    workflowVersion: 1,
    title: "Create a test record",
    whyNow: "The test explicitly requested it.",
    riskLevel: "write",
    payloadVersion: 1,
    preview: "Create the record after confirmation",
    compensation: {
      supported: true,
      executorKey: "tests.write",
    },
    operations: Array.from(
      { length: input.operationCount ?? 1 },
      (_, index) => ({
        operationId: `${actionId}:operation:${index + 1}`,
        operationType: "create_followup_task" as const,
        executorKey: "tests.write",
        idempotencyKey: `${actionId}:idempotency:${index + 1}`,
        payloadVersion: 1,
        payload: { recordId: `${actionId}:record:${index + 1}` },
        preview: `Create record ${index + 1}`,
        riskLevel: "write" as const,
        compensation: {
          supported: true,
          executorKey: "tests.write",
        },
      }),
    ),
    evidenceChips: [],
    evidenceIds: [],
    sourceRefs: [],
  });
}

test("confirmation is idempotent, freezes all proposed operations, and only queues the selected subset", async () => {
  const harness = createHarness({ compensation: true });
  const proposed = await proposeTestAction(harness, { operationCount: 2 });

  assert.equal((await harness.runtime.processOutbox()).processed, 0);
  assert.equal(harness.executionCount(), 0);

  const selectedOperationId = proposed.operations[0].operationId;
  const approved = await harness.runtime.approveAction({
    actionId: proposed.actionId,
    actorLabel: "Orbit user",
    selectedOperationIds: [selectedOperationId],
  });
  const replay = await harness.runtime.approveAction({
    actionId: proposed.actionId,
    actorLabel: "Orbit user",
    selectedOperationIds: [selectedOperationId],
  });

  assert.equal(replay.status, "approved");
  assert.equal(approved.operations.length, 2);
  assert.deepEqual(approved.selectedOperationIds, [selectedOperationId]);
  const detail = await harness.runtime.getRun(proposed.runId);
  assert.equal(detail?.outbox.length, 1);

  await harness.runtime.processOutbox();
  assert.equal(harness.executionCount(), 1);
  assert.equal((await harness.runtime.processOutbox()).processed, 0);
  assert.equal(harness.executionCount(), 1);
});

test("run steps expose progress and support idempotent cancellation", async () => {
  const harness = createHarness({});
  const run = await harness.runtime.createRun({
    runId: "run:progress",
    trigger: "chat",
    workflowKey: "relationship_research_v1",
  });
  await harness.runtime.addRunStep({
    attempt: 1,
    kind: "ai",
    name: "plan",
    runId: run.runId,
    status: "queued",
    stepId: "step:plan",
  });
  await harness.runtime.addRunStep({
    attempt: 1,
    kind: "tool",
    name: "read_relationship_context",
    runId: run.runId,
    status: "queued",
    stepId: "step:context",
  });
  await harness.runtime.updateRunStep({
    runId: run.runId,
    status: "running",
    stepId: "step:plan",
  });
  await harness.runtime.updateRunStep({
    outputRef: "artifact:plan",
    runId: run.runId,
    status: "completed",
    stepId: "step:plan",
  });

  let detail = (await harness.runtime.getRun(run.runId))!;
  assert.deepEqual(agentRunProgress(detail), {
    activeStepId: "step:context",
    canCancel: true,
    canRetry: false,
    completedSteps: 1,
    failedSteps: 0,
    percent: 50,
    totalSteps: 2,
  });

  detail = await harness.runtime.cancelRun(run.runId);
  assert.equal(detail.run.status, "canceled");
  assert.equal(detail.steps[1]?.status, "canceled");
  assert.equal((await harness.runtime.cancelRun(run.runId)).run.status, "canceled");
});

test("failed run steps retain their error as immutable audit evidence", async () => {
  const harness = createHarness({});
  const run = await harness.runtime.createRun({
    runId: "run:failed-step",
    trigger: "domain_signal",
    workflowKey: "signal_followup_v1",
  });
  await harness.runtime.addRunStep({
    attempt: 1,
    kind: "tool",
    name: "load_contact",
    runId: run.runId,
    status: "running",
    stepId: "step:load-contact",
  });
  await harness.runtime.updateRunStep({
    error: {
      code: "CONTACT_AMBIGUOUS",
      message: "Multiple relationships matched.",
      retryable: true,
    },
    runId: run.runId,
    status: "failed",
    stepId: "step:load-contact",
  });

  let detail = (await harness.runtime.getRun(run.runId))!;
  assert.equal(detail.run.status, "failed");
  assert.equal(detail.run.error?.code, "CONTACT_AMBIGUOUS");
  assert.equal(agentRunProgress(detail).canRetry, true);
  assert.equal(detail.steps[0]?.status, "failed");
  assert.equal(detail.steps[0]?.attempt, 1);
  assert.equal(detail.steps[0]?.error?.code, "CONTACT_AMBIGUOUS");
});

test("concurrent workers atomically claim an outbox event and execute it once", async () => {
  const harness = createHarness({});
  const action = await proposeTestAction(harness);
  await harness.runtime.approveAction({
    actionId: action.actionId,
    actorLabel: "Orbit user",
  });

  const [first, second] = await Promise.all([
    harness.runtime.processOutbox({ workerId: "worker-a" }),
    harness.runtime.processOutbox({ workerId: "worker-b" }),
  ]);
  assert.equal(first.processed + second.processed, 1);
  assert.equal(harness.executionCount(), 1);
});

test("canceling an approved action cancels its pending outbox before a worker can execute it", async () => {
  const harness = createHarness({});
  const action = await proposeTestAction(harness, {
    actionId: "action:cancel-before-worker",
  });
  await harness.runtime.approveAction({
    actionId: action.actionId,
    actorLabel: "Orbit user",
  });

  const canceled = await harness.runtime.cancelAction(action.actionId);
  assert.equal(canceled.status, "canceled");
  assert.equal(
    (await harness.runtime.getRun(action.runId))?.outbox[0]?.status,
    "canceled",
  );
  assert.equal((await harness.runtime.processOutbox()).processed, 0);
  assert.equal(harness.executionCount(), 0);
});

test("a stale worker lease is reclaimed after a worker crash", async () => {
  const harness = createHarness({});
  const action = await proposeTestAction(harness);
  await harness.runtime.approveAction({
    actionId: action.actionId,
    actorLabel: "Orbit user",
  });
  const detail = await harness.runtime.getRun(action.runId);
  const event = detail!.outbox[0];
  await harness.repository.saveOutbox({
    ...event,
    status: "processing",
    attempt: 1,
    leasedAt: "2026-07-25T00:00:00.000Z",
    leaseOwner: "crashed-worker",
  });
  harness.setClock("2026-07-25T00:16:00.000Z");

  const recovered = await harness.runtime.processOutbox({
    workerId: "recovery-worker",
  });
  assert.equal(recovered.completed, 1);
  assert.equal(harness.executionCount(), 1);
  assert.equal(
    (await harness.runtime.getRun(action.runId))?.outbox[0].attempt,
    2,
  );
});

test("a recovered lease with an existing receipt never replays the executor", async () => {
  const harness = createHarness({});
  const action = await proposeTestAction(harness);
  await harness.runtime.approveAction({
    actionId: action.actionId,
    actorLabel: "Orbit user",
  });
  const detail = await harness.runtime.getRun(action.runId);
  const event = detail!.outbox[0];
  await harness.repository.saveReceipt({
    receiptId: `receipt:${event.idempotencyKey}`,
    outboxId: event.outboxId,
    actionId: event.actionId,
    operationId: event.operationId,
    runId: event.runId,
    idempotencyKey: event.idempotencyKey,
    executorKey: event.executorKey,
    status: "completed",
    resultSummary: "The previous worker completed the domain write.",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  });
  await harness.repository.saveOutbox({
    ...event,
    status: "processing",
    attempt: 1,
    leasedAt: "2026-07-25T00:00:00.000Z",
    leaseOwner: "crashed-after-receipt",
  });
  harness.setClock("2026-07-25T00:16:00.000Z");

  const recovered = await harness.runtime.processOutbox({
    workerId: "recovery-worker",
  });
  assert.equal(recovered.completed, 1);
  assert.equal(harness.executionCount(), 0);
});

test("a transient executor failure remains executing until its scheduled retry succeeds", async () => {
  const harness = createHarness({ executeFailures: 1 });
  const action = await proposeTestAction(harness);
  await harness.runtime.approveAction({
    actionId: action.actionId,
    actorLabel: "Orbit user",
  });

  const failedAttempt = await harness.runtime.processOutbox();
  assert.equal(failedAttempt.failed, 1);
  assert.equal(
    (await harness.runtime.listActions({}))[0].status,
    "executing",
  );

  harness.setClock("2026-07-25T00:00:30.000Z");
  const retry = await harness.runtime.processOutbox();
  assert.equal(retry.completed, 1);
  assert.equal(
    (await harness.runtime.listActions({}))[0].status,
    "completed",
  );
  assert.equal(harness.executionCount(), 2);
});

test("outbox stops after five attempts and moves the action to failed", async () => {
  const harness = createHarness({ executeFailures: 99 });
  const action = await proposeTestAction(harness);
  await harness.runtime.approveAction({
    actionId: action.actionId,
    actorLabel: "Orbit user",
  });

  for (const timestamp of [
    "2026-07-25T00:00:00.000Z",
    "2026-07-25T00:00:30.000Z",
    "2026-07-25T00:01:30.000Z",
    "2026-07-25T00:03:30.000Z",
    "2026-07-25T00:07:30.000Z",
  ]) {
    harness.setClock(timestamp);
    await harness.runtime.processOutbox();
  }

  const detail = await harness.runtime.getRun(action.runId);
  assert.equal(detail?.outbox[0].status, "dead_letter");
  assert.equal(detail?.outbox[0].attempt, 5);
  assert.equal(detail?.actions[0].status, "failed");
  assert.equal(harness.executionCount(), 5);
});

test("undo is limited to declared compensation and repeated undo is idempotent", async () => {
  const harness = createHarness({ compensation: true });
  const action = await proposeTestAction(harness);
  await harness.runtime.approveAction({
    actionId: action.actionId,
    actorLabel: "Orbit user",
  });
  await harness.runtime.processOutbox();

  assert.equal((await harness.runtime.undoAction(action.actionId)).status, "undone");
  assert.equal((await harness.runtime.undoAction(action.actionId)).status, "undone");
  assert.equal(harness.compensationCount(), 1);
});

test("executable tool registry validates inputs and redacts observations", async () => {
  const metadata = getOrbitAgentToolMetadata("events.recommend");
  assert.ok(metadata);
  assert.equal(metadata?.riskLevel, "read");
  assert.equal(metadata?.inputSchema.parse({}).success, false);

  const output = {
    task: {
      artifactId: "artifact:test",
      kind: "event_recommendations",
    },
    result: {
      status: "success",
      provenance: { evidenceIds: ["evidence:test"] },
    },
  } as unknown as OrbitAgentArtifactPayload;
  let validatedLimit: number | undefined;
  const executed = await executeOrbitAgentTool({
    toolName: "events.recommend",
    arguments: { query: "明天的活动", limit: 2 },
    context: {
      mode: "live",
      async executeArtifactTool(_toolName, input) {
        validatedLimit = input.limit;
        return output;
      },
    },
  });
  assert.equal(validatedLimit, 2);
  assert.equal(executed.output, output);
  assert.deepEqual(executed.observation, {
    artifactId: "artifact:test",
    kind: "event_recommendations",
    status: "success",
    evidenceIds: ["evidence:test"],
  });

  await assert.rejects(
    () =>
      executeOrbitAgentTool({
        toolName: "unknown.write",
        arguments: { query: "write" },
        context: {
          mode: "live",
          async executeArtifactTool() {
            return output;
          },
        },
      }),
    /Unknown Orbit Agent tool/,
  );
});
