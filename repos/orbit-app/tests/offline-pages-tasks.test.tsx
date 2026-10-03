import assert from "node:assert/strict";
import test from "node:test";
import { OFFLINE_BANNER, TASKS_OFFLINE_BANNER, fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

// Sprint 0131: Today, the task list with its relationship follow-ups and
// suggestions, the task detail and a relationship's next step read the device
// copy (sync domains and page copies) and stay readable offline with 「截至」;
// every write needs the network.
const A = "account:one";
const zone = "Asia/Tokyo";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dayStart = Date.parse(`${today}T00:00:00+09:00`);
const dueWindow = { plannedThrough: today, dueBefore: new Date(dayStart + 86_400_000).toISOString() };
const card = (id: string, title: string) => ({ id, titlePreview: title, locationPreview: null, status: "open", category: "work", priority: "normal", plannedDate: today, dueAt: null, updatedAt: "2026-09-27T00:00:00.000Z", completedAt: null, relatedContact: null });
const todayPayload = { taskMode: "page", date: today, timeZone: zone, completedCount: 1,
  summary: { openTaskCount: 2, completedCount: 1, suggestionCount: 0, scheduleCount: 0 }, suggestions: [], schedule: [],
  taskPage: { actorId: A, status: "open", scope: "all", query: "", dueWindow, items: [card("t1", "准备周五的路演"), card("t2", "给林悦发会议纪要")], counts: { open: 2, completed: 1 }, total: 2, hasMore: false, nextCursor: null, asOf: new Date().toISOString() } };
const task = (id: string, title: string, patch: Record<string, unknown> = {}) => ({ id, accountId: A, ownerUserId: A, title, status: "open", category: "relationship", priority: "normal", source: "manual", plannedDate: "2026-09-10", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z", notes: "带上储能资料", ...patch });
const relationshipPage = { actorId: A, mode: "open", items: [{ itemKey: "r1", taskId: "rt1", connectionId: "connection:1", contactId: "contact:1", contactNamePreview: "张伟", titlePreview: "约张伟聊试点", status: "open", dueAt: null }], total: 1, hasMore: false, nextCursor: null, asOf: "2026-09-28T01:00:00.000Z" };
const suggestionPage = { actorId: A, scope: "relationship", items: [{ id: "s1", titlePreview: "问候佐藤", reasonPreview: "两个月没联系", category: "relationship", updatedAt: "2026-09-27T00:00:00.000Z" }], total: 1, nextCursor: null, hasMore: false, asOf: "2026-09-28T01:00:00.000Z" };
const date = "2026-09-16T00:00:00.000Z";
const identity = { actorId: A, connectionId: "connection:1", contactId: "contact:1", version: 1, createdAt: date, updatedAt: date };
const lifecycle = { snapshot: { connection: { ...identity, stage: "needs_follow_up", activeGoal: null }, tasks: [{ ...identity, taskId: "rt1", title: "约张伟聊试点", dueAt: date, status: "open", purpose: "follow_up" }] } };
const copy = (data: unknown) => ({ data, syncedAt: "2026-09-28T01:10:00.000Z" });

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => {
  harness = await startOfflinePageHarness([
    { name: "today", importPath: "./src/screens/today/TodayScreen", exportName: "TodayScreen" },
    { name: "tasks", importPath: "./src/screens/tasks/TasksScreen", exportName: "TasksScreen" },
    { name: "detail", importPath: "./src/screens/tasks/TaskDetailScreen", exportName: "TaskDetailScreen" },
    { name: "lifecycle", importPath: "./src/screens/tasks/RelationshipLifecycleScreen", exportName: "RelationshipLifecycleScreen" },
  ]);
});
test.after(async () => { await harness?.close(); });

test("Today online saves its first page; offline it shows that copy with 截至 and adding or completing needs the network", async (t) => {
  const online = await harness.open(t, { screen: "today", responses: { "/api/today": todayPayload } });
  await online.getByText("准备周五的路演").waitFor();
  assert.deepEqual(await fixtureValue<string[]>(online, "saves"), ["today-page|main"]);
  const page = await harness.open(t, { screen: "today", online: false, copies: { "today-page|main": copy(todayPayload) } });
  await page.getByText(OFFLINE_BANNER).waitFor();
  await page.getByText("给林悦发会议纪要").waitFor();
  const complete = page.getByRole("checkbox", { name: /准备周五的路演.*需要联网/ });
  assert.equal(await complete.isDisabled(), true);
  await complete.click({ force: true });
  assert.equal(await page.getByPlaceholder(/需要联网/).isEditable(), false, "quick add is off");
  assert.deepEqual((await requestsOf(page)).filter((entry) => !entry.startsWith("get:")), []);
});

test("Today offline without a copy says it is not on this device (no error block)", async (t) => {
  const page = await harness.open(t, { screen: "today", online: false });
  await page.getByText("这项内容还没保存在这台设备上，联网打开一次后断网也能看。").waitFor();
  assert.equal(await page.getByText("暂时无法连接 Orbit 服务，请检查网络后再试。").count(), 0);
});

test("the task list offline: 截至, local tasks, relationship follow-ups and suggestions from their copies, reminders from the device inbox", async (t) => {
  const page = await harness.open(t, {
    screen: "tasks", online: false, syncStatus: "stale", params: { scope: "relationship" },
    records: { task: [task("t9", "回访佐藤")], inbox_notification: [] },
    copies: { "relationship-tasks|open": copy(relationshipPage), "task-suggestions|main": copy(suggestionPage) },
  });
  await page.getByText(OFFLINE_BANNER).first().waitFor();
  await page.getByText("回访佐藤").waitFor();
  await page.getByText("约张伟聊试点").waitFor();
  await page.getByText("问候佐藤").waitFor();
  const check = page.getByRole("checkbox", { name: /回访佐藤.*需要联网/ });
  assert.equal(await check.isDisabled(), true);
  assert.equal((await requestsOf(page)).some((entry) => entry.includes("/api/inbox/notifications")), false, "reminders are counted on the device");
  assert.deepEqual((await requestsOf(page)).filter((entry) => !entry.startsWith("get:") && !entry.startsWith("resource:")), []);
});

test("task detail offline comes from the device copy, read-only with 截至", async (t) => {
  const page = await harness.open(t, { screen: "detail", online: false, syncStatus: "stale", params: { id: "t9" }, records: { task: [task("t9", "回访佐藤")] } });
  await page.getByText(OFFLINE_BANNER).waitFor();
  await page.getByText("带上储能资料").waitFor();
  const title = page.getByLabel("标题", { exact: false }).first();
  assert.equal(await title.isEditable(), false);
  assert.deepEqual((await requestsOf(page)).filter((entry) => !entry.startsWith("get:") && !entry.startsWith("resource:")), []);
});

test("a relationship's next step: online saved per relationship; offline the copy with 截至 and saving needs the network", async (t) => {
  const online = await harness.open(t, { screen: "lifecycle", params: { id: "connection:1" }, responses: { "/api/connections/connection%3A1/lifecycle": lifecycle } });
  await online.getByText("约张伟聊试点").first().waitFor();
  assert.deepEqual(await fixtureValue<string[]>(online, "saves"), ["relationship-lifecycle|connection:1"]);
  const page = await harness.open(t, { screen: "lifecycle", online: false, params: { id: "connection:1" }, copies: { "relationship-lifecycle|connection:1": copy(lifecycle) } });
  await page.getByText(OFFLINE_BANNER).waitFor();
  await page.getByText("约张伟聊试点").first().waitFor();
  const save = page.getByRole("button", { name: /完成并保存下一步 · 需要联网/ });
  assert.equal(await save.isDisabled(), true);
  const never = await harness.open(t, { screen: "lifecycle", online: false, params: { id: "connection:2" } });
  await never.getByText("这项内容还没保存在这台设备上，联网打开一次后断网也能看。").waitFor();
});

test("task detail on the phone: a snapshot-cache answer while the server is unreachable still shows the device copy with 截至, read-only", async (t) => {
  // Found on the Simulator (0131 runtime pass): the native snapshot store answered the offline read as if it
  // were the server (success), so there was no 截至 notice and 标记完成 stayed enabled.
  const cached = { task: { ...task("t9", "回访佐藤"), title: "缓存里的旧标题" } };
  const page = await harness.open(t, { screen: "detail", startUnreachable: true, cacheAnswers: true, syncStatus: "stale", params: { id: "t9" }, records: { task: [task("t9", "回访佐藤")] }, responses: { "/api/tasks/t9": cached } });
  await page.getByText(OFFLINE_BANNER).waitFor();
  await page.getByText("带上储能资料").waitFor();
  assert.equal(await page.getByLabel("标题", { exact: false }).first().isEditable(), false);
  assert.equal(await page.getByText("缓存里的旧标题").count(), 0, "the lease-bound device copy, not the snapshot");
});

test("task detail on the phone offline: the actor's own work task completes, cancels and deletes into the device outbox (0133)", async (t) => {
  const work = task("t7", "整理路演材料", { category: "work" });
  const open = () => harness.open(t, { screen: "detail", platform: "ios", taskOutbox: true, online: false, syncStatus: "stale", params: { id: "t7" }, records: { task: [work] } });
  const writes = async (page: Awaited<ReturnType<typeof open>>) => (await requestsOf(page)).filter((entry) => !entry.startsWith("get:") && !entry.startsWith("resource:"));
  const enqueued = (page: Awaited<ReturnType<typeof open>>) => fixtureValue<Array<{ operation: string; id: string; requestJson: string }>>(page, "enqueued");

  const page = await open();
  await page.getByText(TASKS_OFFLINE_BANNER).waitFor();
  assert.equal(await page.getByLabel("待办标题").isEditable(), true, "own work task is editable offline");
  const complete = page.getByRole("button", { name: "标记完成", exact: true });
  assert.equal(await complete.isDisabled(), false, "the dock's complete button works offline for an own task");
  await complete.dispatchEvent("click");
  await page.waitForFunction(() => ((window as any).fixture.enqueued ?? []).length === 1);
  assert.deepEqual((await enqueued(page)).map(({ operation, id }) => ({ operation, id })), [{ operation: "complete", id: "t7" }]);

  const cancelPage = await open();
  await cancelPage.getByText(TASKS_OFFLINE_BANNER).waitFor();
  await cancelPage.getByRole("button", { name: "更多待办操作" }).first().dispatchEvent("click");
  await cancelPage.getByRole("button", { name: "取消待办", exact: true }).dispatchEvent("click");
  await cancelPage.waitForFunction(() => ((window as any).fixture.enqueued ?? []).length === 1);
  const [cancel] = await enqueued(cancelPage);
  assert.equal(cancel?.operation, "cancel");
  assert.deepEqual(Object.keys(JSON.parse(cancel!.requestJson)).sort(), ["action", "idempotencyKey"], "status operations carry no version (D5)");

  const deletePage = await open();
  await deletePage.getByText(TASKS_OFFLINE_BANNER).waitFor();
  await deletePage.getByRole("button", { name: "更多待办操作" }).first().dispatchEvent("click");
  await deletePage.getByRole("button", { name: "删除待办", exact: true }).dispatchEvent("click");
  await deletePage.waitForFunction(() => ((window as any).fixture.enqueued ?? []).length === 1);
  const [remove] = await enqueued(deletePage);
  assert.equal(remove?.operation, "delete");
  assert.equal(JSON.parse(remove!.requestJson).expectedUpdatedAt, "2026-09-27T00:00:00.000Z", "offline delete carries the mirrored version (D5)");
  for (const p of [page, cancelPage, deletePage]) assert.deepEqual(await writes(p), [], "nothing is sent while offline");
});

test("task detail offline shows its own queued change while other tasks also have queued changes (0133)", async (t) => {
  const work = task("t7", "整理路演材料", { category: "work" });
  const other = task("t8", "另一条待办", { category: "work" });
  const queuedOther = { domainId: "tasks", mutationId: "m-other", kind: "task", id: "t8", operation: "complete", patch: {}, requestJson: JSON.stringify({ action: "complete", idempotencyKey: "m-other" }),
    baseRevision: "1", createdAt: "2026-09-28T02:00:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null, actorId: A, workspaceId: "workspace:one", state: "queued", attemptCount: 0, firstAttemptAt: null, serverSnapshot: null, dependsOn: null };
  const page = await harness.open(t, { screen: "detail", platform: "ios", taskOutbox: true, online: false, syncStatus: "stale", params: { id: "t7" }, records: { task: [work, other] }, queuedTasks: [queuedOther] });
  await page.getByText(TASKS_OFFLINE_BANNER).waitFor();
  await page.getByRole("button", { name: "标记完成", exact: true }).dispatchEvent("click");
  await page.waitForFunction(() => ((window as any).fixture.enqueued ?? []).length === 1);
  await page.getByText("尚未同步", { exact: true }).waitFor();
  await page.getByRole("button", { name: "恢复待办", exact: true }).waitFor();
});

test("the task list offline labels only follow-ups as needing the network; an unchanged own task is not called unsynced (0133)", async (t) => {
  const page = await harness.open(t, { screen: "tasks", platform: "ios", taskOutbox: true, online: false, syncStatus: "stale",
    records: { task: [task("t7", "整理路演材料", { category: "work" }), task("t9", "回访佐藤")], inbox_notification: [] } });
  await page.getByText(TASKS_OFFLINE_BANNER).first().waitFor();
  const own = page.getByRole("checkbox", { name: "完成：整理路演材料", exact: true });
  await own.waitFor();
  assert.equal(await own.isDisabled(), false);
  assert.equal(await page.getByRole("checkbox", { name: /回访佐藤.*需要联网/ }).isDisabled(), true);
});
