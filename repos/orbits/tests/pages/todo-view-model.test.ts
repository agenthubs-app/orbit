import assert from "node:assert/strict";
import test from "node:test";
import { todoPageView } from "../../app/(app)/app/orbit-2026/todo/todo-view-model";
import type { TodoPageContract } from "../../shared/contract/todo-page";

const page: TodoPageContract = {
  date: "2026-10-18", timeZone: "Asia/Tokyo", asOf: "2026-10-18T00:00:00Z",
  counts: { decisions: 4, nextMoves: 1, followups: 2, overdue: 1 }, countsCapped: { decisions: false, nextMoves: false },
  decisions: { items: [
    { key: "entity_draft:d1", source: "entity_draft", sourceId: "d1", titlePreview: "Draft", createdAt: "2026-10-18T00:00:00Z", actions: ["open"], conversationId: "live-orbit-agent-conversation" },
    { key: "contact_draft:c1", source: "contact_draft", sourceId: "c1", titlePreview: "Contact draft", createdAt: "2026-10-18T00:00:00Z", actions: ["open"] },
    { key: "task_suggestion:s1", source: "task_suggestion", sourceId: "s1", titlePreview: "Suggestion", createdAt: "2026-10-18T00:00:00Z", actions: ["accept", "dismiss", "snooze", "open"] },
    { key: "completion_question:q1", source: "completion_question", sourceId: "q1", titlePreview: "Question", createdAt: "2026-10-18T00:00:00Z", actions: ["open"] },
  ], next: { task_suggestion: "signed" } },
  nextMoves: { items: [{ key: "agent_signal:n1", source: "agent_signal", sourceId: "n1", titlePreview: "Write draft", reasonPreview: "Reason", createdAt: "2026-10-18T00:00:00Z", draftAvailable: true }], next: {} },
  followups: { items: [
    { key: "relationship_task:t/1", source: "relationship_task", sourceId: "t/1", taskId: "t/1", titlePreview: "Lifecycle", createdAt: "2026-10-18T00:00:00Z", kind: "lifecycle", status: "open", overdue: true },
    { key: "task:t/1", source: "task", sourceId: "t/1", taskId: "t/1", titlePreview: "Plain task", createdAt: "2026-10-18T00:00:00Z", kind: "task", status: "open", overdue: false, deferralCount: 2 },
  ], next: {} },
  sources: { task_suggestion: "ok", agent_action: "ok", plan_pending: "ok", entity_draft: "ok", contact_draft: "ok", completion_question: "ok", agent_signal: "ok", plan_today_chance: "ok", relationship_task: "ok", task: "ok" },
};

test("unavailable and unimplemented sources never turn a partial count into an exact zero", () => {
  const view = todoPageView({ ...page, counts: { ...page.counts, decisions: 0, nextMoves: 0 }, decisions: { items: [], next: {} }, nextMoves: { items: [], next: {} }, sources: { ...page.sources, completion_question: "not_implemented", agent_signal: "unavailable" } });
  assert.equal(view.decisions.count.value, null);
  assert.equal(view.decisions.count.partial, true);
  assert.equal(view.decisions.state, "partial");
  assert.equal(view.nextMoves.state, "partial");
  assert.equal(view.nextMoves.count.value, null);
  assert.deepEqual(view.nextMoves.issues, [{ source: "agent_signal", status: "unavailable" }]);
  assert.equal(view.followups.count.value, 2);
  assert.equal(view.followups.count.partial, false);
});

test("positive partial and capped counts remain explicit lower bounds; healthy zero is a real empty state", () => {
  const view = todoPageView({ ...page, countsCapped: { decisions: true, nextMoves: false }, counts: { ...page.counts, followups: 0, overdue: 0 }, followups: { items: [], next: {} }, sources: { ...page.sources, completion_question: "not_implemented" } });
  assert.deepEqual(view.decisions.count, { value: 4, partial: true, capped: true });
  assert.equal(view.followups.state, "empty");
  assert.equal(view.followups.count.value, 0);
});

test("entity drafts never mistake provider conversation IDs for saved sessions; contact drafts retain the acquisition flow", () => {
  const view = todoPageView(page);
  assert.equal(view.decisions.items[0].href, "/app/agent");
  assert.equal(view.decisions.items[0].unverifiedConversation, true);
  assert.deepEqual(view.decisions.items[0].actions, []);
  assert.equal(view.decisions.items[1].href, "/app/contacts/new/drafts");
  assert.deepEqual(view.decisions.items[1].actions, []);
  assert.deepEqual(view.decisions.items[2].actions, ["accept", "dismiss", "snooze"]);
  assert.equal(view.decisions.items[3].question, true);
  assert.deepEqual(view.decisions.items[3].actions, []);
});

test("same-ID lifecycle and plain tasks keep their distinct routes, order and deferral behavior", () => {
  const view = todoPageView(page);
  assert.deepEqual(view.followups.items.map(item => item.key), ["relationship_task:t/1", "task:t/1"]);
  assert.equal(view.followups.items[0].href, undefined, "legacy relationship route requires a connection ID, not this task ID");
  assert.equal(view.followups.items[0].detailUnavailable, true);
  assert.equal(view.followups.items[1].href, "/app/tasks/t%2F1");
  assert.equal(view.followups.items[0].deferralCount, undefined);
  assert.equal(view.followups.items[1].deferralCount, 2);
  assert.equal(view.followups.items[0].overdue, true);
  assert.equal(view.nextMoves.items[0].draftAvailable, true);
});

test("a lifecycle task with a known contact can open the actual contact entry, never an invented connection route", () => {
  const view = todoPageView({ ...page, followups: { ...page.followups, items: [{ ...page.followups.items[0], contactId: "contact/1" }] } });
  assert.equal(view.followups.items[0].href, "/app/contacts/contact%2F1");
  assert.equal(view.followups.items[0].detailUnavailable, true);
});

test("an entirely unavailable source group is a retry state, not an empty success", () => {
  const view = todoPageView({ ...page, sources: { ...page.sources, relationship_task: "unavailable", task: "unavailable" }, counts: { ...page.counts, followups: 0, overdue: 0 }, followups: { items: [], next: {} } });
  assert.equal(view.followups.state, "failed");
  assert.equal(view.followups.count.value, null);
  assert.equal(view.overdue, null);
});

test("sample or unavailable source rows cannot expose active mutation controls", () => {
  const unavailable = todoPageView({ ...page, sources: { ...page.sources, task_suggestion: "unavailable" } });
  assert.deepEqual(unavailable.decisions.items[2].actions, []);
  const sample = todoPageView({ ...page, decisions: { ...page.decisions, items: page.decisions.items.map(item => ({ ...item, sample: true })) } });
  assert.deepEqual(sample.decisions.items[2].actions, []);
});

test("a capped zero is unknown rather than a healthy empty block", () => {
  const view = todoPageView({ ...page, counts: { ...page.counts, decisions: 0 }, countsCapped: { ...page.countsCapped, decisions: true }, decisions: { items: [], next: {} } });
  assert.equal(view.decisions.count.value, null);
  assert.equal(view.decisions.state, "partial");
});
