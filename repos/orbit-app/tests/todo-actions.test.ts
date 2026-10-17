import assert from "node:assert/strict";
import test from "node:test";

import { laterTaskDatePatch, todoDecisionHref, todoFollowupHref, todoInitialView, todoNativeDecisionReceipt, todoNativeDecisionRequest, todoNativeSnoozeReceipt, todoNativeSnoozeRequest, todoSuggestionDecisionRequest, todoSuggestionDecisionReceipt, todoSuggestionSnoozeRequest, todoSuggestionSnoozeReceipt, todoTaskCompletionReceipt } from "../src/screens/todo/todo-actions";

test("To-do opens only destinations with a stable, owned route", () => {
  const base = { key: "agent_action:a1", sourceId: "a1", titlePreview: "Review", createdAt: "2026-10-18T00:00:00Z", actions: ["open"] as const };
  assert.equal(todoDecisionHref({ ...base, source: "agent_action" }), null);
  assert.equal(todoDecisionHref({ ...base, source: "contact_draft" }), "/contacts/new/drafts");
  assert.equal(todoDecisionHref({ ...base, source: "plan_pending" }), "/task?seg=plan");
  assert.equal(todoDecisionHref({ ...base, source: "entity_draft", conversationId: "provider-local-id" }), null);
  assert.equal(todoDecisionHref({ ...base, source: "completion_question" }), null);
});

test("To-do follow-ups retain task versus lifecycle detail identity", () => {
  const base = { key: "task:t1", source: "task" as const, sourceId: "t1", taskId: "t1", titlePreview: "Follow up", createdAt: "2026-10-18T00:00:00Z", status: "open" as const, overdue: false };
  assert.equal(todoFollowupHref({ ...base, kind: "task" }), "/tasks/t1");
  assert.equal(todoFollowupHref({ ...base, kind: "lifecycle" }), null);
});

test("To-do suggestion decisions are source-owned and reject sample or mismatched actions", () => {
  const item = { key: "task_suggestion:s1", source: "task_suggestion" as const, sourceId: "s1", titlePreview: "Review", createdAt: "2026-10-18T00:00:00Z", actions: ["accept", "dismiss"] as const };
  assert.deepEqual(todoSuggestionDecisionRequest(item, "accept", "ios:todo:s1"), {
    path: "/api/task-suggestions/s1/accept", body: { idempotencyKey: "ios:todo:s1" },
  });
  assert.equal(todoSuggestionDecisionRequest({ ...item, sample: true }, "accept", "ios:todo:s1"), null);
  assert.equal(todoSuggestionDecisionRequest({ ...item, key: "other:s1" }, "accept", "ios:todo:s1"), null);
  assert.equal(todoSuggestionDecisionRequest({ ...item, source: "plan_pending" }, "accept", "ios:todo:s1"), null);
  assert.equal(todoSuggestionDecisionRequest({ ...item, actions: ["open"] }, "accept", "ios:todo:s1"), null);
  assert.equal(todoSuggestionDecisionRequest(item, "accept", ""), null);
});

test("To-do suggestion decision requires an authoritative matching receipt", () => {
  const accepted = { suggestion: { id: "s1", status: "accepted", acceptedTaskId: "t1" }, task: { id: "t1", suggestionId: "s1", status: "open" } };
  assert.equal(todoSuggestionDecisionReceipt(accepted, "s1", "accept"), true);
  assert.equal(todoSuggestionDecisionReceipt({ ...accepted, task: { ...accepted.task, suggestionId: "s2" } }, "s1", "accept"), false);
  assert.equal(todoSuggestionDecisionReceipt({ ...accepted, suggestion: { ...accepted.suggestion, id: "s2" } }, "s1", "accept"), false);
  assert.equal(todoSuggestionDecisionReceipt({ suggestion: { id: "s1", status: "dismissed" } }, "s1", "dismiss"), true);
  assert.equal(todoSuggestionDecisionReceipt({ suggestion: { id: "s1", status: "pending" } }, "s1", "dismiss"), false);
});

test("To-do suggestion Later uses the source snooze endpoint at next local 09:00 and verifies the receipt", () => {
  const item = { key: "task_suggestion:s1", source: "task_suggestion" as const, sourceId: "s1", titlePreview: "Review", createdAt: "2026-10-18T00:00:00Z", actions: ["snooze"] as const };
  const request = todoSuggestionSnoozeRequest(item, "ios:todo:snooze", "2026-10-18", "Asia/Tokyo", new Date("2026-10-18T12:00:00Z"));
  assert.deepEqual(request, { path: "/api/task-suggestions/s1/snooze", body: { idempotencyKey: "ios:todo:snooze", nextVisibleAt: "2026-10-19T00:00:00.000Z" } });
  assert.equal(todoSuggestionSnoozeReceipt({ suggestion: { id: "s1", status: "snoozed", nextVisibleAt: request?.body.nextVisibleAt } }, "s1", request!.body.nextVisibleAt), true);
  assert.equal(todoSuggestionSnoozeReceipt({ suggestion: { id: "s1", status: "pending", nextVisibleAt: request?.body.nextVisibleAt } }, "s1", request!.body.nextVisibleAt), false);
  assert.equal(todoSuggestionSnoozeReceipt({ suggestion: { id: "s2", status: "snoozed", nextVisibleAt: request?.body.nextVisibleAt } }, "s1", request!.body.nextVisibleAt), false);
  assert.equal(todoSuggestionSnoozeRequest({ ...item, sample: true }, "ios:todo:snooze", "2026-10-18", "Asia/Tokyo", new Date("2026-10-18T12:00:00Z")), null);
  assert.equal(todoSuggestionSnoozeRequest(item, "ios:todo:snooze", "2026-10-18", "Asia/Tokyo", new Date("2026-10-19T01:00:00Z")), null);
});

test("plan pending and agent action decisions stay on their native endpoints and require matching receipts", () => {
  const base = { sourceId: "id:/?", titlePreview: "Review", createdAt: "2026-10-18T00:00:00Z", actions: ["accept", "dismiss"] as const };
  const plan = { ...base, key: "plan_pending:id:/?", source: "plan_pending" as const };
  const agent = { ...base, key: "agent_action:id:/?", source: "agent_action" as const };
  assert.deepEqual(todoNativeDecisionRequest(plan, "accept", "ios:key"), {
    path: "/api/agent/plans/v2/pending/id%3A%2F%3F/accept", body: { idempotencyKey: "ios:key" },
  });
  assert.deepEqual(todoNativeDecisionRequest(agent, "dismiss", "ios:key"), {
    path: "/api/agent/actions/id%3A%2F%3F/dismiss", body: {},
  });
  assert.equal(todoNativeDecisionRequest({ ...plan, key: "wrong" }, "accept", "ios:key"), null);
  assert.equal(todoNativeDecisionRequest({ ...agent, sample: true }, "accept", "ios:key"), null);
  assert.equal(todoNativeDecisionReceipt({ id: "id:/?", status: "accepted", replayed: false }, plan, "accept"), true);
  assert.equal(todoNativeDecisionReceipt({ id: "other", status: "accepted", replayed: false }, plan, "accept"), false);
  assert.equal(todoNativeDecisionReceipt({ state: "success", actionId: "id:/?", decision: "dismissed" }, agent, "dismiss"), true);
  assert.equal(todoNativeDecisionReceipt({ state: "success", actionId: "id:/?", decision: "accepted" }, agent, "dismiss"), false);
});

test("agent action Later maps action ID to its ledger defer transition, never to a fabricated plan snooze", () => {
  const item = { key: "agent_action:action-1", source: "agent_action" as const, sourceId: "action-1", titlePreview: "Review", createdAt: "2026-10-18T00:00:00Z", actions: ["snooze"] as const };
  assert.deepEqual(todoNativeSnoozeRequest(item), { path: "/api/agent/ledger/action-1/transition", body: { transition: "defer" } });
  assert.equal(todoNativeSnoozeRequest({ ...item, source: "plan_pending", key: "plan_pending:action-1" }), null);
  assert.equal(todoNativeSnoozeRequest({ ...item, sample: true }), null);
  assert.equal(todoNativeSnoozeReceipt({ state: "success", transition: "defer", entry: { entryId: "action-1", status: "deferred" } }, item), true);
  assert.equal(todoNativeSnoozeReceipt({ state: "success", transition: "defer", entry: { entryId: "other", status: "deferred" } }, item), false);
});

test("To-do completion acknowledges only the owned completed task receipt", () => {
  const task = { id: "t1", accountId: "a1", ownerUserId: "a1", status: "completed", title: "Follow up", category: "relationship", source: "manual", createdAt: "2026-10-17T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z" };
  assert.equal(todoTaskCompletionReceipt({ task }, "a1", "t1"), true);
  assert.equal(todoTaskCompletionReceipt({ task: { ...task, status: "open" } }, "a1", "t1"), false);
  assert.equal(todoTaskCompletionReceipt({ task: { ...task, ownerUserId: "other" } }, "a1", "t1"), false);
  assert.equal(todoTaskCompletionReceipt({ task: { ...task, id: "other" } }, "a1", "t1"), false);
});

test("To-do deferral changes only a real existing task date to a later local date", () => {
  assert.deepEqual(laterTaskDatePatch({ plannedDate: "2026-10-18" }, "2026-10-20", "Asia/Tokyo"), { plannedDate: "2026-10-20" });
  assert.equal(laterTaskDatePatch({ plannedDate: "2026-10-18" }, "2026-10-17", "Asia/Tokyo"), null);
  assert.equal(laterTaskDatePatch({ plannedDate: "2026-10-18" }, "2026-02-30", "Asia/Tokyo"), null);
  assert.equal(laterTaskDatePatch({}, "2026-10-20", "Asia/Tokyo"), null);
  assert.deepEqual(laterTaskDatePatch({ dueAt: "2026-10-18T09:30:00.000Z" }, "2026-10-20", "Asia/Tokyo"), { dueAt: "2026-10-20T09:30:00.000Z" });
});

test("legacy completed-view links preserve the task list instead of hiding it behind the aggregate", () => {
  assert.equal(todoInitialView("completed"), "tasks");
  assert.equal(todoInitialView(["completed", "open"]), "tasks");
  assert.equal(todoInitialView("open"), "home");
  assert.equal(todoInitialView(undefined), "home");
});
