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

import { requestsEntityDraft } from "../../features/orbit-ai/gemini-provider";

// Sprint 0085: the planner spends its single intent on reading, so a request
// that needs a read first never reaches action_proposal. The draft is asked for
// after the read instead — but only when the user actually asked to create
// something, so an ordinary query costs no extra model call.
test("a create request is recognised even when it also names something to read", () => {
  for (const message of [
    "请根据这篇笔记整理一个待办，并明确标题和日期。",
    "根据我的笔记整理一个待办",
    "帮我建一个日程",
    "把林玫添加为联系人",
    "记一条笔记",
    "新建一个活动",
    "create a task from this note",
    "Add a contact for Lin Mei",
  ]) {
    assert.equal(requestsEntityDraft(message), true, message);
  }
});

test("an ordinary query does not trigger the extra draft call", () => {
  for (const message of [
    "我这周有哪些待办？",
    "查一下我的日程",
    "打开标题包含云端的笔记",
    "谁可以帮我引荐餐饮行业的人",
    "show me my tasks",
    "",
    // 安排 is both a verb and a noun in the trigger, so this one is the risk case.
    "查一下我的日程安排",
    "这周的活动有哪些",
    "我的联系人里谁在餐饮行业",
    "list my notes",
  ]) {
    assert.equal(requestsEntityDraft(message), false, message);
  }
});
