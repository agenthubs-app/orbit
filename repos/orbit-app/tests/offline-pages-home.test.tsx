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
  assert.ok((await requestsOf(page)).some((request) => request.startsWith("get:/api/contacts/completion-question")));
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
