import assert from "node:assert/strict";
import test from "node:test";

import { fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

const timeZone = "Asia/Tokyo";
const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const createdAt = new Date().toISOString();
const signal = { key: "agent_signal:signal-1", source: "agent_signal", sourceId: "signal-1",
  titlePreview: "山本さんへ連絡", createdAt, draftAvailable: false, contactId: "contact-1" };
const todoPage = (item: typeof signal & { taskId?: string }) => ({
  date, timeZone, asOf: createdAt, counts: { decisions: 0, nextMoves: 1, followups: 0, overdue: 0 },
  countsCapped: { decisions: false, nextMoves: false }, decisions: { items: [], next: {} },
  nextMoves: { items: [item], next: {} }, followups: { items: [], next: {} },
  sources: { agent_signal: "ok", task: "ok" },
});
const task = { id: "task-1", accountId: "account:one", ownerUserId: "account:one", title: "Follow up", status: "open",
  category: "relationship", priority: "normal", source: "manual", relatedContactId: "contact-1", createdAt, updatedAt: createdAt };

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => { harness = await startOfflinePageHarness([{ name: "todo", importPath: "./src/screens/todo/TodoScreen", exportName: "TodoScreen" }]); });
test.after(async () => { await harness?.close(); });

test("handwritten contact handoff asks after leaving and records one actor-scoped encounter", async t => {
  const page = await harness.open(t, { screen: "todo", language: "ja", echoEncounter: true,
    responses: { "/api/todo/page?": todoPage(signal) } });
  await page.getByRole("button", { name: "手書きする" }).click();
  await page.getByRole("textbox", { name: "メッセージ本文" }).fill("こんにちは");
  await page.getByRole("button", { name: "閉じる" }).click();
  await page.getByText("送りましたか？").waitFor({ timeout: 3_000 });
  await page.reload();
  await page.getByText("送りましたか？").waitFor();
  await page.getByRole("button", { name: "はい" }).waitFor({ timeout: 3_000 });
  await page.getByRole("button", { name: "はい" }).click();
  await page.getByText("送りましたか？").waitFor({ state: "detached" });
  const requests = await requestsOf(page);
  assert.equal(requests.filter(value => value === "post:/api/encounters").length, 1);
  assert.equal(requests.some(value => value.startsWith("patch:")), false, "untasked signal must not invent a task");
  const [encounter] = await fixtureValue<Array<{ body: Record<string, unknown>; headers: Record<string, string> }>>(page, "encounterRequests");
  assert.equal(encounter?.body.contactId, "contact-1");
  assert.equal(encounter?.body.privacy, "private");
  assert.match(encounter?.headers["Idempotency-Key"] ?? "", /^ios:todo-sent:/u);
  assert.equal(await page.getByText("送りましたか？").count(), 0);
});

test("a task-linked encounter failure keeps one task completion and retries the same encounter", async t => {
  const page = await harness.open(t, { screen: "todo", language: "ja", echoEncounter: true, failEncounterOnce: true,
    echoTaskCompletion: true, responses: { "/api/todo/page?": todoPage({ ...signal, taskId: "task-1" }),
      "/api/tasks/task-1": { task } } });
  await page.getByRole("button", { name: "手書きする" }).click();
  await page.getByRole("textbox", { name: "メッセージ本文" }).fill("こんにちは");
  await page.getByRole("button", { name: "閉じる" }).click();
  await page.getByText("送りましたか？").waitFor({ timeout: 3_000 });
  await page.getByRole("button", { name: "はい" }).click();
  await page.getByRole("button", { name: "記録をもう一度試す" }).waitFor();
  await page.getByRole("button", { name: "記録をもう一度試す" }).click();
  await page.getByRole("button", { name: "記録をもう一度試す" }).waitFor({ state: "detached" });
  const requests = await requestsOf(page);
  assert.deepEqual(requests.filter(value => /^(get|patch):\/api\/tasks\/task-1$|^post:\/api\/encounters$/u.test(value)), [
    "get:/api/tasks/task-1", "patch:/api/tasks/task-1", "post:/api/encounters", "post:/api/encounters",
  ]);
  assert.equal(requests.filter(value => value === "get:/api/tasks/task-1").length, 1);
  assert.equal(requests.filter(value => value === "patch:/api/tasks/task-1").length, 1);
  assert.equal(requests.filter(value => value === "post:/api/encounters").length, 2);
  const [first, second] = await fixtureValue<Array<{ body: Record<string, unknown>; headers: Record<string, string> }>>(page, "encounterRequests");
  assert.deepEqual(second, first, "retry keeps its idempotency identity and exact body");
});
