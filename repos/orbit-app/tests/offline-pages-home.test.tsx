import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_LAYOUT } from "../src/api/schema/home-layout";
import { homeLayoutStorageKey } from "../src/screens/home/home-layout-storage";
import { fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

const actor = "account:one";
const baseUrl = "http://fixture";
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const emptyTodo = {
  date, timeZone: "Asia/Tokyo", asOf: new Date().toISOString(),
  counts: { decisions: 0, nextMoves: 0, followups: 0, overdue: 0 },
  countsCapped: { decisions: false, nextMoves: false },
  decisions: { items: [], next: {} }, nextMoves: { items: [], next: {} }, followups: { items: [], next: {} },
  sources: { task: "ok" },
};
const guide = { kind: "progress", completed: 0, confirmedContacts: 0, nextStep: "contacts",
  steps: { contacts: false, goal: false, plan: false } };
const question = { id: "question:one", contactId: "contact:one", question: "在哪里认识测试联系人？",
  options: ["会议", "朋友介绍"], askedOn: date, skipCount: 0 };
const responses = {
  "/api/home/layout": DEFAULT_HOME_LAYOUT,
  "/api/home/guide-progress": guide,
  "/api/todo/page": emptyTodo,
  "/api/schedule-items": { scheduleItems: [] },
  "/api/contacts/completion-question": question,
};

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => { harness = await startOfflinePageHarness([{ name: "home", importPath: "./src/screens/home/HomeWidgetsScreen", exportName: "HomeWidgetsScreen" }]); });
test.after(async () => { await harness?.close(); });

test("HomeWidgetsScreen keeps today's question beside the empty three-step guide", async (t) => {
  const page = await harness.open(t, { screen: "home", responses });
  await page.getByText("开始的三步").waitFor();
  await page.getByText(question.question).waitFor();
  assert.equal(await page.getByText("0/3").count(), 1);
  assert.equal(await page.getByText("今日待办").count(), 1);
  // LF1: the question is a page copy read through the resource layer.
  assert.ok((await requestsOf(page)).some((request) => /^(get|resource):\/api\/contacts\/completion-question/.test(request)));
});

test("HomeWidgetsScreen refreshes the Today decision count after answering", async (t) => {
  const page = await harness.open(t, { screen: "home", responses: {
    ...responses,
    "/api/todo/page": { ...emptyTodo, counts: { ...emptyTodo.counts, decisions: 1 } },
    "/api/contacts/completion-question/question%3Aone/answer": { questionId: question.id, status: "answered", next: null },
  } });
  await page.getByText(question.question).waitFor();
  await page.getByText("1", { exact: true }).first().waitFor();
  const before = (await requestsOf(page)).filter((request) => request.startsWith("resource:/api/todo/page")).length;
  await page.evaluate(() => { (window as any).fixture.responses["/api/todo/page"].counts.decisions = 0; (window as any).fixture.responses["/api/contacts/completion-question"] = null; });
  await page.getByText("朋友介绍").click();
  await page.waitForFunction((count) => (window as any).fixture.requests.filter((request: string) => request.startsWith("resource:/api/todo/page")).length > count, before, { timeout: 5000 });
  await page.getByText(question.question).waitFor({ state: "detached", timeout: 5000 });
  assert.equal(await page.getByText("1", { exact: true }).count(), 0);
});

test("HomeWidgetsScreen reopens its scoped layout offline and queues an edit locally", async (t) => {
  const page = await harness.open(t, { screen: "home", online: false });
  const key = homeLayoutStorageKey(actor, baseUrl);
  assert.ok(key);
  await page.evaluate(({ storageKey, snapshot }) => {
    localStorage.setItem(storageKey, JSON.stringify({ snapshot, fetchedAt: "2026-10-20T00:00:00Z", draft: null }));
  }, { storageKey: key, snapshot: DEFAULT_HOME_LAYOUT });
  await page.reload();
  await page.getByText(/以前的信息 · 联网后保存/).waitFor();
  await page.getByText("今日待办").waitFor();
  await page.getByRole("button", { name: "编辑" }).click();
  await page.getByRole("button", { name: "今日待办 下移" }).click();
  await page.getByRole("button", { name: "完成" }).click();
  await page.waitForFunction((storageKey) => {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return stored?.draft?.app?.[0]?.key === "planScore";
  }, key);
  assert.equal((await fixtureValue<string[]>(page, "requests")).filter((request) => request === "put:/api/home/layout").length, 1);
  await page.reload();
  await page.getByText(/以前的信息 · 联网后保存/).waitFor();
  const stored = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? "null"), key);
  assert.equal(stored.draft.app[0].key, "planScore");
});

test("LF1: Home cards read the device for contacts, events, secretary and notes instead of the server", async (t) => {
  const page = await harness.open(t, { screen: "home", responses });
  await page.getByText("开始的三步").waitFor();
  await page.waitForTimeout(500);
  const requests = await requestsOf(page);
  for (const endpoint of ["/api/contacts/summary", "/api/contacts/page", "/api/events/mine", "/api/inbox/secretary/preview", "/api/notes"]) {
    assert.equal(requests.some((request) => request.includes(`:${endpoint}`)), false, `${endpoint} must come from the device mirror`);
  }
});

test("LF6: the next-event card shows a registered event from the device's event-day domains", async (t) => {
  const page = await harness.open(t, { screen: "home", responses, records: {
    registered_event: [{ eventId: "event:lf6", participantId: "p:1", title: "LF6 東京ミートアップ", description: null, venue: "渋谷", timeZone: "Asia/Tokyo",
      startsAt: "2099-01-10T10:00:00.000Z", endsAt: "2099-01-10T12:00:00.000Z", lifecycleState: "published", checkInOpensAt: null, eventStartsAt: null,
      eventEndsAt: null, profileEditDeadlineAt: null, resultsAvailableAt: null, roundOneStartsAt: null, roundTwoStartsAt: null }],
    event_registration: [{ eventId: "event:lf6", membershipStatus: "rsvped", admissionStatus: "admitted" }],
  } });
  await page.getByText("LF6 東京ミートアップ").waitFor();
  assert.equal((await requestsOf(page)).some((request) => request.includes(":/api/events/mine")), false);
});

test("LF6: offline Home cards label saved data with a readable time, never the raw ISO string", async (t) => {
  const page = await harness.open(t, { screen: "home", responses, online: false, syncStatus: "stale" });
  await page.evaluate(({ storageKey, snapshot }) => localStorage.setItem(storageKey, JSON.stringify({ snapshot, fetchedAt: "2026-10-20T00:00:00Z", draft: null })), { storageKey: homeLayoutStorageKey(actor, baseUrl)!, snapshot: DEFAULT_HOME_LAYOUT });
  await page.reload();
  await page.getByText(/以前的信息 · 联网后保存 · /).first().waitFor();
  assert.doesNotMatch(await page.locator("body").innerText(), /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u);
});
