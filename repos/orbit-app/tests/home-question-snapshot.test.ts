import assert from "node:assert/strict";
import test from "node:test";
import { homeQuestionSnapshot } from "../src/view-models/home-question-snapshot";
import { todayHomeQuestions } from "../src/view-models/today-tasks";

const relationship = { tasks: [{ id: "follow", title: "已有跟进", category: "relationship", status: "open", priority: "normal" }] };
const input = { scope: "account/server", payload: relationship, ready: true, refreshing: false };

test("first resolved data selects contextual questions, then background changes cannot replace them", () => {
  const loading = homeQuestionSnapshot(null, { ...input, ready: false });
  assert.equal(loading.questions, null);
  const resolved = homeQuestionSnapshot(loading, input);
  assert.deepEqual(resolved.questions?.map((q) => q.kind), ["followup", "discovery"]);
  assert.equal(homeQuestionSnapshot(resolved, { ...input, payload: {} }), resolved);
});

test("an explicit refresh keeps visible questions until completion and then selects again", () => {
  const first = homeQuestionSnapshot(null, input);
  const refreshing = homeQuestionSnapshot(first, { ...input, refreshing: true });
  assert.equal(refreshing.questions, first.questions);
  const next = homeQuestionSnapshot(refreshing, { ...input, payload: {}, refreshing: false });
  assert.deepEqual(next.questions?.map((q) => q.kind), ["tasks", "discovery"]);
});

test("account or server changes discard the old selection and wait for that resource to reload", () => {
  const first = homeQuestionSnapshot(null, input);
  const newInput = { ...input, scope: "other/server" };
  const changed = homeQuestionSnapshot(first, newInput);
  assert.equal(changed.questions, null);
  assert.equal(homeQuestionSnapshot(changed, newInput), changed, "old resource data must not be accepted under a new account");
  const loading = homeQuestionSnapshot(changed, { ...newInput, ready: false });
  const resolved = homeQuestionSnapshot(loading, { ...newInput, payload: {} });
  assert.deepEqual(resolved.questions?.map((q) => q.kind), ["tasks", "discovery"]);
});

test("malformed, completed and cancelled records do not manufacture contextual recommendations", () => {
  for (const payload of [null, [], { tasks: [null, { category: "relationship" }] }, {
    tasks: ["completed", "cancelled"].map((status) => ({ ...relationship.tasks[0], status })),
    schedule: [{ id: "past", title: "过去的活动", kind: "event", category: "event", state: "ended", startsAt: "2020-01-01T00:00:00Z", sourceId: "past" }]
  }]) {
    assert.deepEqual(todayHomeQuestions(payload).map((q) => q.kind), ["tasks", "discovery"]);
  }
});

test("a scope change after an earlier refresh accepts the resource's refreshing-only reload cycle", () => {
  const first = homeQuestionSnapshot(null, { ...input, payload: {} });
  const changedInput = { ...input, scope: "another-account/server" };
  const changed = homeQuestionSnapshot(first, changedInput);
  const refreshing = homeQuestionSnapshot(changed, { ...changedInput, refreshing: true });
  assert.equal(refreshing.questions, null, "do not accept old data while the new account is loading");
  const resolved = homeQuestionSnapshot(refreshing, changedInput);
  assert.deepEqual(resolved.questions?.map((q) => q.kind), ["followup", "discovery"]);
});

test("overdue open work wins over an upcoming event and invalid dates are not urgency", () => {
  const now = new Date("2026-09-07T00:00:00Z");
  const payload = { tasks: [{ ...relationship.tasks[0], dueAt: "2026-09-06T23:59:59Z" }] };
  assert.deepEqual(todayHomeQuestions(payload, now).map((q) => q.kind), ["tasks", "discovery"]);
  const invalid = { tasks: [{ ...relationship.tasks[0], dueAt: "invalid" }] };
  assert.deepEqual(todayHomeQuestions(invalid, now).map((q) => q.kind), ["followup", "discovery"]);
});
