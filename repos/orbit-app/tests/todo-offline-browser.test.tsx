import assert from "node:assert/strict";
import test from "node:test";

import { fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

const timeZone = "Asia/Tokyo";
const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const page = {
  date, timeZone, asOf: new Date().toISOString(),
  counts: { decisions: 0, nextMoves: 0, followups: 2, overdue: 0 },
  countsCapped: { decisions: false, nextMoves: false },
  decisions: { items: [], next: {} }, nextMoves: { items: [], next: {} },
  followups: { items: [
    { key: "task:owned", source: "task", sourceId: "owned", taskId: "owned", titlePreview: "山本さんへ返信", createdAt: new Date().toISOString(), kind: "task", status: "open", overdue: false, deferralCount: 0 },
    { key: "relationship_task:lifecycle", source: "relationship_task", sourceId: "lifecycle", taskId: "lifecycle", titlePreview: "次の段階を決める", createdAt: new Date().toISOString(), kind: "lifecycle", status: "open", overdue: false },
  ], next: {} },
  sources: { task_suggestion: "ok", task: "ok", relationship_task: "ok", completion_question: "not_implemented" },
};

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => {
  harness = await startOfflinePageHarness([{ name: "todo", importPath: "./src/screens/todo/TodoScreen", exportName: "TodoScreen" }]);
});
test.after(async () => { await harness?.close(); });

test("Task To-do saves its page copy and shows both follow-up kinds offline without writes", async t => {
  const online = await harness.open(t, { screen: "todo", language: "ja", responses: { "/api/todo/page?": page } });
  await online.getByText("山本さんへ返信").waitFor();
  assert.deepEqual(await fixtureValue<string[]>(online, "saves"), ["todo-page|main"]);

  const offline = await harness.open(t, { screen: "todo", language: "ja", online: false,
    copies: { "todo-page|main": { data: page, syncedAt: new Date().toISOString() } } });
  await offline.getByText("山本さんへ返信").waitFor();
  await offline.getByText("次の段階を決める").waitFor();
  assert.equal(await offline.getByRole("button", { name: "次の段階を決める" }).count(), 0, "lifecycle detail needs a current server identity");
  assert.deepEqual((await requestsOf(offline)).filter(request => /^(post|patch|delete):/u.test(request)), []);
});

test("Task To-do without a device copy shows an unavailable state and makes no writes", async t => {
  const offline = await harness.open(t, { screen: "todo", language: "ja", online: false });
  await offline.getByText("タスクを開けません").waitFor();
  assert.equal(await offline.getByText("山本さんへ返信").count(), 0);
  assert.deepEqual((await requestsOf(offline)).filter(request => /^(post|patch|delete):/u.test(request)), []);
});
