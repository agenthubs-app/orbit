import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";
import { SCHEDULE_OFFLINE_BANNER, fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

// Sprint 0134: on the phone, non-recurring personal schedules are created, edited
// and deleted offline into the device outbox; repeating series stay online-only;
// a conflict keeps both versions and a conflicting delete asks twice.
const A = "account:one";
const updatedAt = "2026-10-01T00:00:00.000Z";
const item = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, sourceId: id, accountId: A, ownerUserId: A, kind: "personal", category: "personal", state: "upcoming",
  title, startsAt: "2026-12-20T01:00:00.000Z", endsAt: "2026-12-20T01:30:00.000Z", timeZone: "Asia/Tokyo", createdAt: updatedAt, updatedAt, ...extra });
const series = item("personal:series", "每周例会", { recurrence: { frequency: "weekly" } });
const localNote = "local:7f3a0000-0000-4000-8000-000000000001";
const queuedNote = { domainId: "notes", mutationId: "note-create", kind: "note", id: localNote, operation: "create", patch: { title: "和陈总聊的三件事", body: "报价、介绍、年底再约" },
  requestJson: JSON.stringify({ title: "和陈总聊的三件事", body: "报价、介绍、年底再约", idempotencyKey: "note-create" }), baseRevision: null, createdAt: updatedAt, retryCount: 0, nextRetryAt: null,
  lastErrorCode: null, actorId: A, workspaceId: "workspace:one", state: "queued", attemptCount: 0, firstAttemptAt: null, serverSnapshot: null, dependsOn: null };
const queuedSchedule = (row: Record<string, unknown>) => ({ domainId: "personal-schedule", kind: "personal_schedule", baseRevision: "1", createdAt: "2026-10-02T00:00:00.000Z", retryCount: 0,
  nextRetryAt: null, lastErrorCode: null, actorId: A, workspaceId: "workspace:one", state: "queued", attemptCount: 1, firstAttemptAt: "2026-10-02T00:00:00.000Z", serverSnapshot: null, dependsOn: null, ...row });

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => {
  harness = await startOfflinePageHarness([
    { name: "editor", importPath: "./src/screens/schedule/PersonalScheduleScreen", exportName: "PersonalScheduleScreen" },
    { name: "detail", importPath: "./src/screens/schedule/PersonalScheduleDetailScreen", exportName: "PersonalScheduleDetailScreen" },
  ]);
});
test.after(async () => { await harness?.close(); });

const offline = { platform: "ios", scheduleOutbox: true, online: false, syncStatus: "stale" };
const writes = async (page: Page) => (await requestsOf(page)).filter(entry => !entry.startsWith("get:") && !entry.startsWith("resource:"));
const enqueued = (page: Page) => fixtureValue<Array<{ operation: string; id: string; requestJson: string; baseRevision: string | null }>>(page, "enqueuedSchedules");
const navigation = (page: Page) => fixtureValue<string[]>(page, "navigation");
// The harness page lays the form out without a viewport-filling scroll view; set the value as typing would.
async function type(locator: ReturnType<Page["getByRole"]>, value: string) {
  await locator.evaluate((element, text) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(element, text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
async function settle(page: Page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }

test("editing a non-recurring schedule offline queues the edit with the mirrored version and opens its detail", async t => {
  const page = await harness.open(t, { ...offline, screen: "editor", params: { id: "personal:one" }, records: { personal_schedule: [item("personal:one", "和陈总通话")] } });
  const title = page.getByRole("textbox", { name: "日程标题", exact: true });
  await title.waitFor(); await settle(page);
  await type(title, "和陈总通话（改到下午）"); await settle(page);
  await page.getByRole("button", { name: "保存日程", exact: true }).dispatchEvent("click");
  await page.waitForFunction(() => ((window as any).fixture.enqueuedSchedules ?? []).length === 1);
  const [edit] = await enqueued(page);
  assert.equal(edit?.operation, "update");
  assert.equal(edit?.id, "personal:one");
  assert.equal(edit?.baseRevision, "1");
  const body = JSON.parse(edit!.requestJson);
  assert.equal(body.expectedUpdatedAt, updatedAt, "the edit carries the mirrored server version");
  assert.deepEqual(body.patch, { title: "和陈总通话（改到下午）" });
  assert.ok((await navigation(page)).some(entry => entry.startsWith("replace:/schedule/personal/personal%3Aone")));
  assert.deepEqual(await writes(page), [], "nothing is sent while offline");
});

test("deleting a non-recurring schedule offline queues a versioned delete after the existing confirmation", async t => {
  const page = await harness.open(t, { ...offline, screen: "editor", params: { id: "personal:one" }, records: { personal_schedule: [item("personal:one", "和陈总通话")] } });
  await page.getByRole("button", { name: "删除个人日程", exact: true }).dispatchEvent("click");
  await page.getByRole("button", { name: "确认删除个人日程", exact: true }).dispatchEvent("click");
  await page.waitForFunction(() => ((window as any).fixture.enqueuedSchedules ?? []).length === 1);
  const [remove] = await enqueued(page);
  assert.equal(remove?.operation, "delete");
  assert.deepEqual(Object.keys(JSON.parse(remove!.requestJson)).sort(), ["expectedUpdatedAt", "idempotencyKey"]);
  assert.ok((await navigation(page)).includes("replace:/schedule"));
  assert.deepEqual(await writes(page), []);
});

test("a repeating schedule offline cannot be edited or deleted and says it needs the network", async t => {
  const page = await harness.open(t, { ...offline, screen: "editor", params: { id: "personal:series" }, records: { personal_schedule: [series] } });
  await page.getByText("重复日程需要联网才能修改。").first().waitFor();
  assert.equal(await page.getByRole("button", { name: "保存日程", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "删除个人日程", exact: true }).isDisabled(), true);
  const detail = await harness.open(t, { ...offline, screen: "detail", params: { id: "personal:series" }, records: { personal_schedule: [series] } });
  const edit = detail.getByRole("button", { name: /编辑.*需要联网/ });
  await edit.waitFor();
  assert.equal(await edit.isDisabled(), true);
  const oneOff = await harness.open(t, { ...offline, screen: "detail", params: { id: "personal:one" }, records: { personal_schedule: [item("personal:one", "和陈总通话")] } });
  const editOne = oneOff.getByRole("button", { name: "编辑", exact: true });
  await editOne.waitFor();
  assert.equal(await editOne.isDisabled(), false, "a one-off schedule is editable offline");
});

test("a new schedule created offline can link a note created offline and is queued under a temporary id", async t => {
  const page = await harness.open(t, { ...offline, screen: "editor", params: {}, records: { personal_schedule: [], note: [] }, queuedNotes: [queuedNote] });
  await type(page.getByRole("textbox", { name: "日程标题", exact: true }), "和陈总复盘"); await settle(page);
  await page.getByRole("button", { name: "调整日期和时间", exact: true }).dispatchEvent("click"); await settle(page);
  const month = await page.getByRole("dialog").getByRole("button", { name: /^\d{4}-\d{2}-\d{2}$/ }).first().getAttribute("aria-label");
  await page.getByRole("dialog").getByRole("button", { name: `${month!.slice(0, 7)}-28`, exact: true }).dispatchEvent("click");
  await page.getByRole("dialog").getByRole("button", { name: "完成", exact: true }).dispatchEvent("click"); await settle(page);
  await page.getByRole("button", { name: "开始时间", exact: true }).dispatchEvent("click"); await settle(page);
  await page.getByRole("radio", { name: "HH 10", exact: true }).dispatchEvent("click");
  await page.getByRole("radio", { name: "mm 00", exact: true }).dispatchEvent("click");
  await page.getByRole("dialog").getByRole("button", { name: "完成", exact: true }).dispatchEvent("click"); await settle(page);
  await page.getByRole("button", { name: "关联笔记", exact: true }).dispatchEvent("click"); await settle(page);
  const choice = page.getByRole("checkbox", { name: "和陈总聊的三件事", exact: true });
  await choice.waitFor();
  await choice.dispatchEvent("click"); await settle(page);
  await page.getByRole("dialog", { name: "关联笔记", exact: true }).getByRole("button", { name: "关闭", exact: true }).dispatchEvent("click"); await settle(page);
  await page.getByRole("button", { name: "和陈总聊的三件事", exact: true }).waitFor();
  await page.getByRole("button", { name: "保存日程", exact: true }).dispatchEvent("click");
  await page.waitForFunction(() => ((window as any).fixture.enqueuedSchedules ?? []).length === 1);
  const [create] = await enqueued(page);
  assert.equal(create?.operation, "create");
  assert.match(create!.id, /^local:[0-9a-f-]{36}$/u);
  assert.equal(create?.baseRevision, null);
  const body = JSON.parse(create!.requestJson);
  assert.equal(body.title, "和陈总复盘");
  assert.deepEqual(body.noteIds, [localNote], "the link keeps the temporary note id until that note is uploaded");
  assert.ok((await navigation(page)).some(entry => entry.startsWith(`replace:/schedule/personal/${encodeURIComponent(create!.id)}`)));
  assert.deepEqual(await writes(page), []);
});

test("a schedule created offline shows 未同步 on its detail page; a failed linked note explains why it was not saved", async t => {
  const localId = "local:b21c0000-0000-4000-8000-000000000002";
  const create = queuedSchedule({ mutationId: "s-create", id: localId, operation: "create", baseRevision: null, attemptCount: 0, firstAttemptAt: null,
    patch: { title: "和陈总复盘", startsAt: "2026-12-21T01:00:00.000Z", noteIds: [localNote] },
    requestJson: JSON.stringify({ title: "和陈总复盘", startsAt: "2026-12-21T01:00:00.000Z", noteIds: [localNote], idempotencyKey: "s-create" }) });
  const page = await harness.open(t, { ...offline, screen: "detail", params: { id: localId }, records: { personal_schedule: [], note: [] }, queuedSchedules: [create], queuedNotes: [queuedNote] });
  await page.getByText("和陈总复盘").first().waitFor();
  await page.getByText("未同步", { exact: true }).waitFor();
  await page.getByRole("button", { name: "和陈总聊的三件事", exact: true }).waitFor();
  const failed = await harness.open(t, { ...offline, screen: "detail", params: { id: localId }, records: { personal_schedule: [], note: [] },
    queuedSchedules: [{ ...create, state: "failed", lastErrorCode: "NOTE_DEPENDENCY_FAILED" }] });
  await failed.getByText("未能保存", { exact: true }).waitFor();
  await failed.getByText("关联的笔记没有保存成功，这条日程也未能保存。内容已保留在本机。").waitFor();
  // Sprint 0136: the phone's banner says personal schedule changes sync later; 重试 / 放弃 act on the refused write.
  await failed.getByText(SCHEDULE_OFFLINE_BANNER).waitFor();
  await failed.getByRole("button", { name: "重试保存：和陈总复盘", exact: true }).click();
  await failed.waitForFunction(() => ((window as any).fixture.settledWrites ?? []).length === 1);
  const discarding = await harness.open(t, { ...offline, screen: "detail", params: { id: localId }, records: { personal_schedule: [], note: [] },
    queuedSchedules: [{ ...create, state: "failed", lastErrorCode: "INVALID_REQUEST" }] });
  await discarding.getByRole("button", { name: "放弃这次修改：和陈总复盘", exact: true }).click();
  await discarding.waitForFunction(() => ((window as any).fixture.navigation ?? []).includes("replace:/schedule"));
  assert.deepEqual(await fixtureValue(failed, "settledWrites"), [["retry", "personal_schedule", "s-create"]]);
  assert.deepEqual(await fixtureValue(discarding, "settledWrites"), [["discard", "personal_schedule", "s-create"]]);
  assert.deepEqual(await writes(discarding), [], "retry and discard never write to the network themselves");
});

test("a conflicting edit keeps both versions; keeping mine re-sends against the server version", async t => {
  const conflict = queuedSchedule({ mutationId: "s-edit", id: "personal:one", operation: "update", state: "conflict", lastErrorCode: "CONFLICT",
    patch: { title: "手机上的标题" }, requestJson: JSON.stringify({ expectedUpdatedAt: updatedAt, idempotencyKey: "s-edit", patch: { title: "手机上的标题" } }),
    serverSnapshot: item("personal:one", "网页上的标题", { updatedAt: "2026-10-02T03:00:00.000Z" }) });
  const page = await harness.open(t, { ...offline, screen: "detail", params: { id: "personal:one" }, records: { personal_schedule: [item("personal:one", "原标题")] }, queuedSchedules: [conflict] });
  await page.getByText("这条日程在别处改过。请选择要保留的版本，另一个不会被悄悄覆盖。").waitFor();
  await page.getByText("服务器版本：网页上的标题").waitFor();
  await page.getByText("手机上的标题").first().waitFor();
  await page.getByRole("button", { name: "保留我的版本", exact: true }).dispatchEvent("click");
  await page.waitForFunction(() => ((window as any).fixture.resolvedSchedules ?? []).length === 1);
  const [resolved] = await fixtureValue<Array<{ mutationId: string; resolution: string; replacement?: { operation: string; requestJson: string } }>>(page, "resolvedSchedules");
  assert.equal(resolved?.mutationId, "s-edit");
  assert.equal(resolved?.resolution, "replace");
  const body = JSON.parse(resolved!.replacement!.requestJson);
  assert.equal(body.expectedUpdatedAt, "2026-10-02T03:00:00.000Z", "the kept local version is based on the server version");
  assert.deepEqual(body.patch, { title: "手机上的标题" });
  assert.notEqual(body.idempotencyKey, "s-edit", "a new request gets a new receipt key");

  const server = await harness.open(t, { ...offline, screen: "detail", params: { id: "personal:one" }, records: { personal_schedule: [item("personal:one", "原标题")] }, queuedSchedules: [conflict] });
  await server.getByRole("button", { name: "使用服务器版本", exact: true }).dispatchEvent("click");
  await server.waitForFunction(() => ((window as any).fixture.resolvedSchedules ?? []).length === 1);
  assert.deepEqual(await fixtureValue(server, "resolvedSchedules"), [{ mutationId: "s-edit", resolution: "server" }]);
});

test("a conflicting delete shows the server version first and deletes only after a second confirmation", async t => {
  const conflict = queuedSchedule({ mutationId: "s-delete", id: "personal:one", operation: "delete", state: "conflict", lastErrorCode: "CONFLICT", patch: {},
    requestJson: JSON.stringify({ expectedUpdatedAt: updatedAt, idempotencyKey: "s-delete" }),
    serverSnapshot: item("personal:one", "网页上改过的日程", { updatedAt: "2026-10-02T03:00:00.000Z", location: "大阪" }) });
  const page = await harness.open(t, { ...offline, screen: "detail", params: { id: "personal:one" }, records: { personal_schedule: [item("personal:one", "原标题")] }, queuedSchedules: [conflict] });
  await page.getByText("你在本机删除了它，但它在别处被改过。请先查看服务器上现在的内容，再决定。").waitFor();
  await page.getByText("服务器版本：网页上改过的日程").waitFor();
  await page.getByRole("button", { name: "仍然删除", exact: true }).dispatchEvent("click"); await settle(page);
  assert.equal(await fixtureValue(page, "resolvedSchedules") ?? null, null, "the first press only asks again");
  await page.getByRole("button", { name: "确认删除更新后的日程", exact: true }).dispatchEvent("click");
  await page.waitForFunction(() => ((window as any).fixture.resolvedSchedules ?? []).length === 1);
  const [resolved] = await fixtureValue<Array<{ resolution: string; replacement?: { operation: string; requestJson: string } }>>(page, "resolvedSchedules");
  assert.equal(resolved?.replacement?.operation, "delete");
  assert.equal(JSON.parse(resolved!.replacement!.requestJson).expectedUpdatedAt, "2026-10-02T03:00:00.000Z");
  assert.ok((await navigation(page)).includes("replace:/schedule"));
});
