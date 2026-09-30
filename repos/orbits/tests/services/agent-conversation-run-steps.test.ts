import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRunDetail } from "../../features/agent/runtime/contract";
import { withConversationTurnSteps } from "../../features/agent/runtime/conversation-run-steps";

const AT = "2026-09-27T00:00:00.000Z";

function detail(runId: string, steps: AgentRunDetail["steps"] = []): AgentRunDetail {
  return {
    run: { runId, workflowKey: "agent_conversation_v1", workflowVersion: 1, trigger: "chat", status: "completed", actionIds: [], createdAt: AT, updatedAt: AT },
    steps, actions: [], outbox: [], receipts: [],
  };
}

test("a turn without timing spans yields the single final_response step the route used to write", () => {
  const result = withConversationTurnSteps(detail("run:a"), { result: { success: true, data: { runId: "run:a" } } });
  assert.deepEqual(result.steps.map(({ stepId, name, kind, status, sequence, durationMs, outputRef, createdAt }) =>
    ({ stepId, name, kind, status, sequence, durationMs, outputRef, createdAt })), [
    { stepId: "run:a:step:1:final_response", name: "final_response", kind: "deterministic", status: "completed", sequence: 1, durationMs: 0, outputRef: "run:a:response", createdAt: AT },
  ]);
});

test("a run recorded before 0103 keeps its step rows and does not list the derived steps twice", () => {
  const legacy = detail("run:legacy", [{ stepId: "run:legacy:step:1:planner", runId: "run:legacy", kind: "ai", name: "planner", sequence: 1, status: "completed", attempt: 1, createdAt: AT, updatedAt: AT }]);
  const result = withConversationTurnSteps(legacy, { result: { data: { runId: "run:legacy", diagnostics: { timings: [{ phase: "planner", durationMs: 12 }, { phase: "synthesis", durationMs: 30 }] } } }, updatedAt: AT });
  assert.deepEqual(result.steps.map((step) => step.stepId), ["run:legacy:step:1:planner", "run:legacy:step:2:synthesis"]);
});

test("a request record that belongs to another run adds nothing, and no record leaves the stored steps", () => {
  assert.deepEqual(withConversationTurnSteps(detail("run:a"), { result: { data: { runId: "run:b", diagnostics: { timings: [{ phase: "planner", durationMs: 1 }] } } } }).steps, []);
  assert.deepEqual(withConversationTurnSteps(detail("run:a"), null).steps, []);
  assert.deepEqual(withConversationTurnSteps(detail("run:a"), { result: "not a result" }).steps, []);
});
