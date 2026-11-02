import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";

import { journeyPrep } from "../../orbits/shared/mock/demo-world/events-journey";
import { fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

// Sprint 0143: 会う準備 「添加」 (tomorrow's follow-up slot) saves like the personal schedule editor: one receipt key per
// slot for every tap and retry, the phone's own time zone, and on the phone a lost connection queues the one-off
// schedule in the device outbox (未同步) instead of failing. The browser stays online-only; HTTP errors are not queued.
// A real event (the demo copy is `sample`, which never writes the calendar).
const { sample: _sample, ...prep } = journeyPrep();
const slot = prep.followupSuggestion!;
const prepPath = `/api/events/${encodeURIComponent(prep.eventId)}/prep`;

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => {
  harness = await startOfflinePageHarness([
    { name: "prep", importPath: "./src/screens/events/v2/PrepPage", exportName: "PrepPage" },
    { name: "detail", importPath: "./src/screens/schedule/PersonalScheduleDetailScreen", exportName: "PersonalScheduleDetailScreen" },
  ]);
});
test.after(async () => { await harness?.close(); });

const phone = { platform: "ios", scheduleOutbox: true, toasts: true, online: true, syncStatus: "fresh", screen: "prep", params: { id: prep.eventId }, records: { personal_schedule: [] } };
type Enqueued = { mutationId: string; operation: string; id: string; requestJson: string; baseRevision: string | null };
const enqueued = (page: Page) => fixtureValue<Enqueued[] | undefined>(page, "enqueuedSchedules");
const posts = async (page: Page) => ((await fixtureValue<Array<{ path: string; body: Record<string, unknown> }>>(page, "postBodies")) ?? []).filter(entry => entry.path === "/api/schedule-items");
const addButton = (page: Page) => page.getByRole("button", { name: "添加", exact: true });
async function openPrep(t: Parameters<typeof harness.open>[0], patch: Record<string, unknown>) {
  const page = await harness.open(t, { ...phone, responses: { [prepPath]: prep, "/api/schedule-items": { scheduleItem: { id: "personal:new" } } }, ...patch });
  await addButton(page).waitFor();
  return page;
}

test("SC-0143-01 offline on the phone, 添加 queues a one-off schedule without a request and says it syncs later", async t => {
  const page = await openPrep(t, { syncStatus: "stale" });
  await addButton(page).dispatchEvent("click");
  await page.getByText("已存在本机，联网后同步。").waitFor();
  const rows = (await enqueued(page)) ?? [];
  assert.equal(rows.length, 1);
  const [create] = rows;
  assert.equal(create!.operation, "create");
  assert.match(create!.id, /^local:[0-9a-f-]{36}$/u);
  assert.equal(create!.baseRevision, null);
  const body = JSON.parse(create!.requestJson);
  assert.deepEqual({ title: body.title, startsAt: body.startsAt, endsAt: body.endsAt, idempotencyKey: body.idempotencyKey }, { title: slot.title, startsAt: slot.startsAt, endsAt: slot.endsAt, idempotencyKey: create!.mutationId });
  assert.deepEqual(await posts(page), [], "nothing is sent while offline");
  assert.equal(await page.getByTestId("events-prep-follow").count(), 0, "the suggestion is done");

  const detail = await harness.open(t, { ...phone, online: false, syncStatus: "stale", screen: "detail", params: { id: create!.id }, queuedSchedules: [{ ...create, actorId: "account:one", workspaceId: "workspace:one", state: "queued", attemptCount: 0, firstAttemptAt: null, serverSnapshot: null, dependsOn: null }] });
  await detail.getByText(slot.title).first().waitFor();
  await detail.getByText("未同步", { exact: true }).waitFor();
});

test("SC-0143-01 on the phone, 添加 whose request loses the connection is queued under the key it was sent with", async t => {
  const page = await openPrep(t, { writeFailure: 0 });
  await addButton(page).dispatchEvent("click");
  await page.getByText("已存在本机，联网后同步。").waitFor();
  const sent = await posts(page);
  assert.equal(sent.length, 1, "the request was tried once, then queued");
  const [create] = (await enqueued(page)) ?? [];
  assert.equal(create?.operation, "create");
  assert.equal(create!.mutationId, sent[0]!.body.idempotencyKey);
  assert.equal(JSON.parse(create!.requestJson).idempotencyKey, sent[0]!.body.idempotencyKey);
  assert.equal(await page.getByText("没有成功，请再试一次").count(), 0);
});

test("SC-0143-01 a server error is not queued and shows the failure; the browser says it needs a connection", async t => {
  for (const status of [409, 500]) {
    const page = await openPrep(t, { writeFailure: status });
    await addButton(page).dispatchEvent("click");
    await page.getByText("没有成功，请再试一次").waitFor();
    assert.equal(await enqueued(page) ?? null, null, `HTTP ${status} is not queued`);
    assert.equal(await page.getByTestId("events-prep-follow").count(), 1, "the suggestion stays for a retry");
  }
  for (const patch of [{ writeFailure: 0 }, { syncStatus: "stale" }]) {
    const web = await openPrep(t, { platform: undefined, ...patch });
    await addButton(web).dispatchEvent("click");
    await web.getByText("需要联网", { exact: true }).waitFor();
    assert.equal(await enqueued(web) ?? null, null, "the browser has no device outbox");
  }
});

test("SC-0143-02 a double tap sends once, and every retry of the same slot reuses its receipt key", async t => {
  const page = await openPrep(t, { writeFailure: 500 });
  await addButton(page).evaluate(element => { (element as HTMLElement).click(); (element as HTMLElement).click(); });
  await page.getByText("没有成功，请再试一次").first().waitFor();
  assert.equal((await posts(page)).length, 1, "a second tap while saving sends nothing");
  await page.evaluate(() => { (window as any).fixture.writeFailure = 0; });
  await addButton(page).dispatchEvent("click");
  await page.getByText("已存在本机，联网后同步。").waitFor();
  const keys = (await posts(page)).map(entry => entry.body.idempotencyKey);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1], "the retry reuses the receipt key");
  const [create] = (await enqueued(page)) ?? [];
  assert.equal(create!.mutationId, keys[0], "the queued create carries the same key, so the server keeps one");
});

test("SC-0143-03 the schedule is saved in the phone's time zone, not a fixed Tokyo zone", async t => {
  const page = await openPrep(t, { timeZoneId: "America/New_York" });
  await addButton(page).dispatchEvent("click");
  await page.getByText("已加入日程").waitFor();
  const [sent] = await posts(page);
  assert.equal(sent!.body.timeZone, "America/New_York");
  assert.deepEqual({ startsAt: sent!.body.startsAt, endsAt: sent!.body.endsAt }, { startsAt: slot.startsAt, endsAt: slot.endsAt });
  assert.ok((await requestsOf(page)).includes("post:/api/schedule-items"));
  const queued = await openPrep(t, { timeZoneId: "Europe/London", syncStatus: "stale" });
  await addButton(queued).dispatchEvent("click");
  await queued.getByText("已存在本机，联网后同步。").waitFor();
  const [create] = (await enqueued(queued)) ?? [];
  assert.equal(JSON.parse(create!.requestJson).timeZone, "Europe/London");
});
