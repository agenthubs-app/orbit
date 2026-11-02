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

// Sprint 0141: the page thinks it is online, but the save itself loses the connection (status 0). On the phone an
// own personal task goes to the device outbox under the same receipt key; a server error answer is never queued.
const A = "account:one";
const owned = { id: "owned", accountId: A, ownerUserId: A, title: "山本さんへ返信", status: "open", category: "personal", priority: "normal", source: "manual",
  plannedDate: date, createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z", notes: "" };
const dropped = (patch: Record<string, unknown> = {}) => ({ screen: "todo", platform: "ios", taskOutbox: true, toasts: true, writeFailure: 0,
  responses: { "/api/todo/page?": page, "/api/tasks/owned": { task: owned } }, records: { task: [owned] }, ...patch });
const enqueued = (target: Awaited<ReturnType<typeof harness.open>>) => fixtureValue<Array<{ operation: string; id: string; requestJson: string }> | undefined>(target, "enqueued");
const writesOf = async (target: Awaited<ReturnType<typeof harness.open>>) => (await requestsOf(target)).filter(request => /^(post|patch|delete):/u.test(request));

test("SC-0141-01 To-do 完成 whose request loses the connection is queued with its receipt key and shows 尚未同步", async t => {
  const online = await harness.open(t, dropped());
  await online.getByText("山本さんへ返信").waitFor();
  await online.getByRole("button", { name: "完成", exact: true }).first().click();
  await online.waitForFunction(() => ((window as any).fixture.enqueued ?? []).length === 1);
  const [complete] = (await enqueued(online))!;
  assert.deepEqual({ operation: complete!.operation, id: complete!.id }, { operation: "complete", id: "owned" });
  const body = JSON.parse(complete!.requestJson);
  assert.match(body.idempotencyKey, /^ios:todo-complete:/u);
  assert.deepEqual(await writesOf(online), ["patch:/api/tasks/owned"], "the request was tried once, then queued");
  await online.getByText("尚未同步", { exact: true }).waitFor();
  assert.equal(await online.getByText("现在无法操作", { exact: true }).count(), 0);
});

test("SC-0141-01 To-do 推迟 whose request loses the connection is queued as the same later-date update", async t => {
  const online = await harness.open(t, dropped());
  await online.getByText("山本さんへ返信").waitFor();
  await online.getByRole("button", { name: "推迟", exact: true }).first().click();
  await online.getByRole("dialog").getByRole("button", { name: "完成", exact: true }).click();
  await online.waitForFunction(() => ((window as any).fixture.enqueued ?? []).length === 1);
  const [later] = (await enqueued(online))!;
  assert.equal(later!.operation, "update");
  const body = JSON.parse(later!.requestJson);
  assert.equal(body.expectedUpdatedAt, owned.updatedAt);
  assert.ok(body.patch.plannedDate > date, "the date moved later");
  assert.match(body.idempotencyKey, /^ios:todo-defer:/u);
  await online.getByText("尚未同步", { exact: true }).waitFor();
});

test("SC-0141-03 To-do 完成 answered with a server error is not queued and says what it says today", async t => {
  for (const status of [409, 500]) {
    const online = await harness.open(t, dropped({ writeFailure: status }));
    await online.getByText("山本さんへ返信").waitFor();
    await online.getByRole("button", { name: "完成", exact: true }).first().click();
    await online.getByText("现在无法操作", { exact: true }).waitFor();
    assert.equal((await enqueued(online)) ?? null, null, `HTTP ${status} is not queued`);
  }
});

test("SC-0141-03 To-do 完成 for a task the device cannot queue (meeting task) is not queued when the connection drops", async t => {
  const meeting = { ...owned, category: "meeting" };
  const online = await harness.open(t, dropped({ records: { task: [meeting] }, responses: { "/api/todo/page?": page, "/api/tasks/owned": { task: meeting } } }));
  await online.getByText("山本さんへ返信").waitFor();
  await online.getByRole("button", { name: "完成", exact: true }).first().click();
  await online.getByText("现在无法操作", { exact: true }).waitFor();
  assert.equal((await enqueued(online)) ?? null, null);
});
