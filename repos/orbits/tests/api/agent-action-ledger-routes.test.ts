/**
 * Agent ledger API route 测试：直接调用 route handler，校验 envelope 与状态码。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { GET as listLedger } from "../../app/api/agent/ledger/route";
import { POST as applyTransition } from "../../app/api/agent/ledger/[id]/transition/route";
import { PATCH as updateDraft } from "../../app/api/agent/ledger/[id]/draft/route";
import { resetSharedMockAgentLedgerServiceForTests } from "../../features/agent/ledger/mock-runtime-service";
import {
  createOrbitAgentRuntimeService,
  resetOrbitAgentRuntimeServicesForTests,
} from "../../features/agent/runtime/service-factory";

test.beforeEach(() => {
  resetSharedMockAgentLedgerServiceForTests();
  resetOrbitAgentRuntimeServicesForTests();
});

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

test("GET /api/agent/ledger returns the ledger envelope", async () => {
  const response = await listLedger(
    new Request("http://localhost/api/agent/ledger"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.entries.length, 6);
});

test("POST transition confirm executes selected operations", async () => {
  const response = await applyTransition(
    new Request("http://localhost/api/agent/ledger/ledger-followup-alex-chen/transition", {
      body: JSON.stringify({
        transition: "confirm",
        selectedOperationIds: ["op-alex-save-note", "op-alex-reminder", "op-alex-draft"],
        actorLabel: "航太郎",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    routeContext("ledger-followup-alex-chen"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.entry.status, "completed");
});

test("POST transition applies draft edits and confirms a runtime action in one request", async () => {
  const runtime = createOrbitAgentRuntimeService("mock");
  const runId = "run:atomic-edit-confirm";
  const actionId = "action:atomic-edit-confirm";
  const operationId = `${actionId}:create-task`;
  await runtime.createRun({
    runId,
    workflowKey: "post_event_followup_v1",
    trigger: "manual",
  });
  await runtime.proposeAction({
    actionId,
    runId,
    workflowKey: "post_event_followup_v1",
    workflowVersion: 1,
    title: "建立跟进任务",
    whyNow: "测试一次请求编辑并确认。",
    riskLevel: "write",
    payloadVersion: 1,
    preview: "创建原始任务",
    compensation: {
      supported: true,
      executorKey: "followups.createTask",
    },
    operations: [
      {
        operationId,
        operationType: "create_followup_task",
        executorKey: "followups.createTask",
        idempotencyKey: `${actionId}:v1`,
        payloadVersion: 1,
        payload: {
          title: "原始任务",
          evidenceIds: [],
        },
        preview: "创建原始任务",
        riskLevel: "write",
        compensation: {
          supported: true,
          executorKey: "followups.createTask",
        },
      },
    ],
    evidenceChips: [],
    evidenceIds: [],
    sourceRefs: [],
  });

  const response = await applyTransition(
    new Request(
      `http://localhost/api/agent/ledger/${encodeURIComponent(actionId)}/transition`,
      {
        body: JSON.stringify({
          transition: "confirm",
          selectedOperationIds: [operationId],
          draftUpdates: [
            {
              operationId,
              field: "title",
              draftText: "与 Kenji 确认试点范围",
            },
            {
              operationId,
              field: "dueAt",
              draftText: "2026-07-31T05:30:00.000Z",
            },
          ],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    routeContext(actionId),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.entry.status, "completed");
  const action = (await runtime.listActions({})).find(
    (candidate) => candidate.actionId === actionId,
  );
  assert.equal(action?.operations[0].payload.title, "与 Kenji 确认试点范围");
  assert.equal(
    action?.operations[0].payload.dueAt,
    "2026-07-31T05:30:00.000Z",
  );
});

test("POST transition with unknown entry returns 404 envelope", async () => {
  const response = await applyTransition(
    new Request("http://localhost/api/agent/ledger/nope/transition", {
      body: JSON.stringify({ transition: "confirm", selectedOperationIds: ["x"] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    routeContext("nope"),
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.context.agentLedgerErrorCode, "AGENT_LEDGER_ENTRY_NOT_FOUND");
});

test("PATCH draft updates the draft preview", async () => {
  const response = await updateDraft(
    new Request("http://localhost/api/agent/ledger/ledger-followup-alex-chen/draft", {
      body: JSON.stringify({
        operationId: "op-alex-draft",
        draftText: "Alex，周三下午方便吗？",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    routeContext("ledger-followup-alex-chen"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  const draft = body.data.entry.operations.find(
    (operation: { operationId: string }) => operation.operationId === "op-alex-draft",
  );
  assert.equal(draft.draftPreview, "Alex，周三下午方便吗？");
});
