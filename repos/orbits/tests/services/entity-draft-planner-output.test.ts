import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseGeminiOrbitAgentPlannerOutput } from "../../features/orbit-ai/gemini-provider";

function plan(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    actionRequests: [],
    assistantMessage: "这条待办已经整理好，确认后才会创建。",
    intent: "action_proposal",
    toolRequests: [],
    ...overrides,
  });
}

test("a planner reply carrying an entity draft is accepted without an action request", () => {
  const parsed = parseGeminiOrbitAgentPlannerOutput(plan({
    entityDraft: {
      fields: { dueAt: "2026-09-20T09:00:00.000Z", title: "整理笔记的后续行动" },
      kind: "task",
      sourceRefs: [{ id: "note:1", kind: "note" }],
    },
  }));

  assert.equal(parsed?.intent, "action_proposal");
  assert.equal(parsed?.entityDraft?.kind, "task");
  assert.equal(parsed?.entityDraft?.fields.title, "整理笔记的后续行动");
  assert.deepEqual(parsed?.actionRequests, []);
});

test("a draft that does not parse rejects the whole plan rather than vanishing", () => {
  // Dropping the field would leave the assistant message promising a card that
  // never appears, which is the failure this sprint removes.
  for (const entityDraft of [
    { fields: { title: "x" }, kind: "invoice" },
    { fields: {}, kind: "task" },
    { fields: { notes: "x" }, kind: "task" },
    { fields: { title: "x" }, kind: "schedule" },
    { fields: { title: "x" }, kind: "task", sourceRefs: [{ id: "n", kind: "ledger" }] },
  ]) {
    assert.equal(parseGeminiOrbitAgentPlannerOutput(plan({ entityDraft })), null, JSON.stringify(entityDraft));
  }
});

test("only action_proposal may carry a draft", () => {
  assert.equal(
    parseGeminiOrbitAgentPlannerOutput(JSON.stringify({
      actionRequests: [],
      assistantMessage: "这是你的待办。",
      entityDraft: { fields: { title: "x" }, kind: "task" },
      intent: "general_chat",
      toolRequests: [],
    })),
    null,
  );
});

test("action_proposal with neither a draft nor an action request is still rejected", () => {
  assert.equal(parseGeminiOrbitAgentPlannerOutput(plan({})), null);
});

test("a plan with no draft field keeps working exactly as before", () => {
  const parsed = parseGeminiOrbitAgentPlannerOutput(JSON.stringify({
    actionRequests: [],
    assistantMessage: "好的。",
    intent: "general_chat",
    toolRequests: [],
  }));
  assert.equal(parsed?.intent, "general_chat");
  assert.equal(parsed?.entityDraft, undefined);
});
