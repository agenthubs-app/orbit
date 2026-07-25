import assert from "node:assert/strict";
import test from "node:test";

import { resetSharedMockAgentLedgerServiceForTests } from "../../features/agent/ledger/mock-runtime-service";
import { createAgentLedgerService } from "../../features/agent/service-factory";
import {
  createOrbitAgentRuntimeService,
  resetOrbitAgentRuntimeServicesForTests,
} from "../../features/agent/runtime/service-factory";

test.beforeEach(() => {
  resetSharedMockAgentLedgerServiceForTests();
  resetOrbitAgentRuntimeServicesForTests();
});

test.afterEach(() => {
  resetSharedMockAgentLedgerServiceForTests();
  resetOrbitAgentRuntimeServicesForTests();
});

test("mock ledger state survives service recreation across request boundaries", async () => {
  const firstRequest = createAgentLedgerService("mock");
  const transition = await firstRequest.applyTransition({
    entryId: "ledger-followup-alex-chen",
    transition: "confirm",
    selectedOperationIds: ["op-alex-save-note", "op-alex-reminder"],
  });
  assert.equal(transition.success, true);

  const nextRequest = createAgentLedgerService("mock");
  const result = await nextRequest.listEntries();
  assert.equal(result.success, true);
  if (result.success === false) return;
  assert.equal(
    result.data.entries.find(
      (entry) => entry.entryId === "ledger-followup-alex-chen",
    )?.status,
    "completed",
  );
});

test("runtime workflow actions appear in the mock Today ledger", async () => {
  const runtime = createOrbitAgentRuntimeService("mock");
  const runId = "run:cross-request-ledger";
  const actionId = "action:cross-request-ledger";
  await runtime.createRun({
    runId,
    workflowKey: "post_event_followup_v1",
    workflowVersion: 1,
    trigger: "manual",
  });
  await runtime.proposeAction({
    actionId,
    runId,
    workflowKey: "post_event_followup_v1",
    workflowVersion: 1,
    title: "跨请求会后跟进",
    whyNow: "验证 workflow Action 能进入 Today。",
    riskLevel: "write",
    payloadVersion: 1,
    preview: "创建会后跟进任务",
    compensation: { supported: false },
    operations: [
      {
        operationId: `${actionId}:task`,
        operationType: "create_followup_task",
        executorKey: "followups.createTask",
        idempotencyKey: `${actionId}:v1`,
        payloadVersion: 1,
        payload: { taskId: "task:cross-request-ledger", title: "会后跟进" },
        preview: "创建会后跟进任务",
        riskLevel: "write",
        compensation: { supported: false },
      },
    ],
    evidenceChips: [],
    evidenceIds: [],
    sourceRefs: [],
  });

  const ledger = createAgentLedgerService("mock");
  const result = await ledger.listEntries();
  assert.equal(result.success, true);
  if (result.success === false) return;
  assert.equal(
    result.data.entries.find((entry) => entry.entryId === actionId)?.status,
    "awaiting_confirmation",
  );
});

test("confirming a runtime action executes its mock outbox work", async () => {
  const runtime = createOrbitAgentRuntimeService("mock");
  const runId = "run:mock-request-worker";
  const actionId = "action:mock-request-worker";
  await runtime.createRun({
    runId,
    workflowKey: "post_event_followup_v1",
    workflowVersion: 1,
    trigger: "manual",
  });
  await runtime.proposeAction({
    actionId,
    runId,
    workflowKey: "post_event_followup_v1",
    workflowVersion: 1,
    title: "执行会后跟进任务",
    whyNow: "验证 mock 请求也通过 Outbox executor 完成工作。",
    riskLevel: "write",
    payloadVersion: 1,
    preview: "创建会后任务",
    compensation: { supported: false },
    operations: [
      {
        operationId: `${actionId}:task`,
        operationType: "create_followup_task",
        executorKey: "followups.createTask",
        idempotencyKey: `${actionId}:v1`,
        payloadVersion: 1,
        payload: {
          taskId: "task:mock-request-worker",
          title: "执行会后任务",
        },
        preview: "创建会后任务",
        riskLevel: "write",
        compensation: { supported: false },
      },
    ],
    evidenceChips: [],
    evidenceIds: [],
    sourceRefs: [],
  });

  const result = await createAgentLedgerService("mock").applyTransition({
    entryId: actionId,
    transition: "confirm",
    selectedOperationIds: [`${actionId}:task`],
  });
  assert.equal(result.success, true);
  if (result.success === false) return;
  assert.equal(result.data.entry.status, "completed");
  assert.equal(result.data.entry.operations[0]?.status, "succeeded");
});
