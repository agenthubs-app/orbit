import assert from "node:assert/strict";
import test from "node:test";
import { homeQuestionSnapshot } from "../src/view-models/home-question-snapshot";

const question = (kind: "tasks" | "followup" | "preparation") => [{ kind, label: `prompt:${kind}` }, { kind: "discovery" as const, label: "prompt:discovery" }];
const input = { scope: "account/server", questions: question("followup"), ready: true, refreshing: false };

test("first resolved summary stores server-signal questions and ignores background changes", () => {
  const loading = homeQuestionSnapshot(null, { ...input, ready: false });
  assert.equal(loading.questions, null);
  const resolved = homeQuestionSnapshot(loading, input);
  assert.deepEqual(resolved.questions?.map(item => item.kind), ["followup", "discovery"]);
  assert.equal(homeQuestionSnapshot(resolved, { ...input, questions: question("tasks") }), resolved);
});

test("an explicit refresh keeps visible questions until the fresh summary resolves", () => {
  const first = homeQuestionSnapshot(null, input);
  const refreshing = homeQuestionSnapshot(first, { ...input, refreshing: true, questions: question("tasks") });
  assert.equal(refreshing.questions, first.questions);
  const next = homeQuestionSnapshot(refreshing, { ...input, questions: question("preparation") });
  assert.deepEqual(next.questions?.map(item => item.kind), ["preparation", "discovery"]);
});

test("account or server changes discard the old selection until the new summary loads", () => {
  const first = homeQuestionSnapshot(null, input);
  const nextInput = { ...input, scope: "other/server", questions: question("tasks") };
  const changed = homeQuestionSnapshot(first, nextInput);
  assert.equal(changed.questions, null);
  assert.equal(homeQuestionSnapshot(changed, nextInput), changed, "do not reuse an old account's signal result");
  const loading = homeQuestionSnapshot(changed, { ...nextInput, ready: false });
  const resolved = homeQuestionSnapshot(loading, nextInput);
  assert.deepEqual(resolved.questions?.map(item => item.kind), ["tasks", "discovery"]);
});

test("a scope change during refresh waits for the new scoped request", () => {
  const first = homeQuestionSnapshot(null, { ...input, refreshing: false });
  const nextInput = { ...input, scope: "another-account/server", questions: question("preparation") };
  const changed = homeQuestionSnapshot(first, nextInput);
  const refreshing = homeQuestionSnapshot(changed, { ...nextInput, refreshing: true });
  assert.equal(refreshing.questions, null);
  const resolved = homeQuestionSnapshot(refreshing, nextInput);
  assert.deepEqual(resolved.questions?.map(item => item.kind), ["preparation", "discovery"]);
});
