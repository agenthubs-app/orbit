import assert from "node:assert/strict";
import test from "node:test";
import { createActorScopedQueryArtifactService } from "../../features/orbit-ai/data-query/query-artifact-service";
import { artifactSummaryForSynthesis, createLiveOrbitAgentRuntime, runLiveOrbitAgentRuntime } from "../../features/orbit-ai/live-agent-runtime";
import { taskLiveRecordFromPayload } from "../../features/tasks/task-record";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

async function setup(count = 1) {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  for (const actorId of ["actor:a", "actor:b"]) for (let i = 0; i < count; i++) {
    await store.upsertRecord(taskLiveRecordFromPayload({ workspaceId: "workspace:reply", payload: {
      version: 1, activities: [], task: {
        id: `task:${actorId}:${i}`, accountId: actorId, ownerUserId: actorId,
        title: actorId === "actor:a" ? `Cloud task ${i}` : "Foreign task",
        status: "open", category: "work", priority: "normal", source: "manual",
        createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
      },
    } }));
  }
  const artifactTaskService = createActorScopedQueryArtifactService({ actorId: "actor:a", store, workspaceId: "workspace:reply" });
  const runtime = createLiveOrbitAgentRuntime({ artifactTaskService, maxLoopSteps: 2 });
  runtime.planner.plan = async () => ({ success: true, data: {
    assistantMessage: "I will query your tasks.", intent: "tasks_query", actionRequests: [],
    toolRequests: [{ toolName: "tasks.query", requiresUserConfirmation: true, arguments: { operation: "list", limit: 2 } }],
    model: "test", provider: "gemini", rawOutputText: "", source: "provider:gemini-interactions-api",
  } });
  runtime.planner.synthesize = async () => { throw new Error("Two-step runtime must not call synthesis"); };
  return { runtime, store, artifactTaskService };
}

test("default two-step query replies with retrieved title/status, not the planner acknowledgement", async () => {
  const { runtime, store } = await setup();
  const before = await store.listRecords({ limit: "unbounded", workspaceId: "workspace:reply", collectionName: "tasks" });
  const result = await runLiveOrbitAgentRuntime(runtime, { message: "Show my tasks", locale: "zh" });
  assert.equal(result.state, "completed");
  if (result.state !== "completed") return;
  assert.match(result.finalAssistantMessage, /Cloud task 0/);
  assert.match(result.finalAssistantMessage, /open/);
  assert.doesNotMatch(result.finalAssistantMessage, /Foreign task|I will query/);
  assert.equal(result.conversation.assistantMessage, result.finalAssistantMessage);
  assert.equal(result.shouldSynthesizeAfterTools, false);
  assert.equal(result.conversation.provenance.safety.liveDatabaseReadExecuted, true);
  assert.deepEqual(await store.listRecords({ limit: "unbounded", workspaceId: "workspace:reply", collectionName: "tasks" }), before);
});

test("a failed synthesis still returns query evidence and a one-step budget never claims a read", async () => {
  const { runtime } = await setup();
  runtime.maxLoopSteps = 3;
  runtime.planner.synthesize = async () => ({ success: false, error: {
    code: "MODEL_REQUEST_FAILED", message: "unavailable", provider: "gemini", source: "provider:gemini-interactions-api",
  } });
  const result = await runLiveOrbitAgentRuntime(runtime, { message: "Show my tasks", locale: "en" });
  assert.equal(result.state, "completed");
  if (result.state === "completed") assert.match(result.finalAssistantMessage, /Cloud task 0/);
  runtime.maxLoopSteps = 1;
  const planned = await runLiveOrbitAgentRuntime(runtime, { message: "Show my tasks", locale: "en" });
  assert.equal(planned.state, "completed");
  if (planned.state === "completed") {
    assert.equal(planned.artifacts.length, 0);
    assert.doesNotMatch(planned.finalAssistantMessage, /Cloud task 0/);
    assert.equal(planned.conversation.provenance.safety.liveDatabaseReadExecuted, false);
  }
});

test("query reply distinguishes an empty result and a bounded page", async () => {
  for (const count of [0, 3]) {
    const { runtime } = await setup(count);
    const result = await runLiveOrbitAgentRuntime(runtime, { message: "Show my tasks", locale: "en" });
    assert.equal(result.state, "completed");
    if (result.state !== "completed") continue;
    assert.match(result.finalAssistantMessage, count === 0 ? /No matching/ : /more|partial/i);
    assert.doesNotMatch(result.finalAssistantMessage, /I will query|Foreign task/);
  }
});

test("data-query synthesis evidence retains status instead of only titles", async () => {
  const { artifactTaskService } = await setup();
  const response = await artifactTaskService.createArtifactTask({ kind: "data_query", query: "Show my tasks", toolArguments: { queryToolName: "tasks.query", operation: "list" } });
  assert.equal(response.success, true);
  if (!response.success) return;
  const summary = artifactSummaryForSynthesis(response.data).summary;
  assert.match(summary, /Cloud task 0/);
  assert.match(summary, /open/);
  assert.match(summary, /untrusted/);
});
