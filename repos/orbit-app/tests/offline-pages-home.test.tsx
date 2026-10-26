import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_LAYOUT } from "../src/api/schema/home-layout";
import { homeLayoutStorageKey } from "../src/screens/home/home-layout-storage";
import { fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";
import { profilePayload } from "./helpers/profile-detail-fixtures";

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

test("UX-2: edit mode shows an × on every widget, a fixed + / 完成 bar, and the widget list", async (t) => {
  const page = await harness.open(t, { screen: "home", responses });
  await page.getByText("今日待办").waitFor();
  await page.getByRole("button", { name: "编辑" }).click();
  for (const title of ["今日待办", "计划分数", "下一场活动", "人脉", "秘书建议"]) await page.getByRole("button", { name: `${title} 移除` }).waitFor();
  assert.equal(await page.getByRole("button", { name: /上移|下移/ }).count(), 0, "the old arrow controls are gone");
  await page.getByRole("button", { name: "秘书建议 移除" }).click();
  assert.equal(await page.getByRole("button", { name: "秘书建议 移除" }).count(), 0);
  await page.getByRole("button", { name: "添加小组件" }).click();
  await page.getByRole("button", { name: "秘书建议 添加" }).waitFor();
  await page.getByText("下一步建议").waitFor();
  await page.getByRole("button", { name: "笔记 添加" }).click();
  await page.getByRole("button", { name: "笔记 移除" }).waitFor();
  await page.getByRole("button", { name: "完成" }).click();
  await page.getByRole("button", { name: "编辑" }).waitFor();
});

test("HomeWidgetsScreen refreshes the Today suggestions line after answering", async (t) => {
  const page = await harness.open(t, { screen: "home", responses: {
    ...responses,
    "/api/todo/page": { ...emptyTodo, counts: { ...emptyTodo.counts, decisions: 1 } },
    "/api/contacts/completion-question/question%3Aone/answer": { questionId: question.id, status: "answered", next: null },
  } });
  await page.getByText(question.question).waitFor();
  // UX: agent suggestions are a quiet 「建议 N 条」 line, not a big 待决定 number.
  await page.getByText("建议 1 条 →").waitFor();
  const before = (await requestsOf(page)).filter((request) => request.startsWith("resource:/api/todo/page")).length;
  await page.evaluate(() => { (window as any).fixture.responses["/api/todo/page"].counts.decisions = 0; (window as any).fixture.responses["/api/contacts/completion-question"] = null; });
  await page.getByText("朋友介绍").click();
  await page.waitForFunction((count) => (window as any).fixture.requests.filter((request: string) => request.startsWith("resource:/api/todo/page")).length > count, before, { timeout: 5000 });
  await page.getByText(question.question).waitFor({ state: "detached", timeout: 5000 });
  assert.equal(await page.getByText("建议 1 条 →").count(), 0);
});

const A = "account:one";
const task = (id: string, title: string, patch: Record<string, unknown>) => ({ id, accountId: A, ownerUserId: A, title, status: "open", category: "work", priority: "normal", source: "manual", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z", ...patch });

test("UX: the Today card counts the to-do tab's 今天 / 已逾期 tasks from the device, and unbuilt server parts are not a failure", async (t) => {
  const page = await harness.open(t, { screen: "home", responses: {
    ...responses,
    "/api/home/guide-progress": { kind: "hidden", reason: "done" },
    "/api/todo/page": { ...emptyTodo, counts: { ...emptyTodo.counts, decisions: 100 }, countsCapped: { decisions: false, nextMoves: false },
      sources: { task: "ok", completion_question: "not_implemented", plan_today_chance: "not_implemented" } },
    "/api/relationship-tasks/page": { actorId: A, mode: "open", items: [{ itemKey: "r1", taskId: "rt1", connectionId: "connection:1", contactId: "contact:1", contactNamePreview: "张伟", titlePreview: "回访张伟", status: "open", dueAt: "2020-01-02T01:00:00.000Z" }], total: 1, hasMore: false, nextCursor: null, asOf: "2026-09-28T01:00:00.000Z" },
  }, records: { task: [task("t1", "准备路演材料", { plannedDate: date }), task("t2", "交报销单", { plannedDate: "2020-01-01" }), task("t3", "下周的事", { plannedDate: "2099-01-01" })] } });
  await page.getByText("准备路演材料 →").waitFor();
  await page.getByText("建议 100 条 →").waitFor();
  await page.waitForFunction(() => /2\s*已逾期/u.test(document.body.innerText), undefined, { timeout: 5000 }).catch(() => undefined);
  const all = await page.locator("body").innerText();
  const body = all.slice(all.indexOf("今日待办"), all.indexOf("计划分数"));
  assert.match(body, /1\s*今天/u);
  assert.match(body, /2\s*已逾期/u, "an overdue task and an overdue follow-up");
  assert.match(body, /0\s*日程/u);
  assert.doesNotMatch(body, /暂时无法加载/u, "not_implemented sources are not a load failure");
  assert.doesNotMatch(body, /今日下一步|待决定/u);
  assert.equal(await page.getByText("下周的事 →").count(), 0);
});

test("UX: the avatar opens 我的, and the greeting uses the profile card's name", async (t) => {
  const page = await harness.open(t, { screen: "home", responses: { ...responses, "/api/profile": profilePayload } });
  await page.getByText(/程川/u).waitFor();
  await page.getByRole("button", { name: "我的" }).click();
  assert.ok((await fixtureValue<string[]>(page, "navigation")).includes("/profile"));
});

test("UX: without secretary notices the 秘书建议 card shows the agent's suggestions, not a no-contacts empty line", async (t) => {
  const page = await harness.open(t, { screen: "home", responses: { ...responses, "/api/todo/page": { ...emptyTodo, counts: { ...emptyTodo.counts, decisions: 1 },
    decisions: { items: [{ key: "agent_action:a1", source: "agent_action", sourceId: "a1", titlePreview: "给佐藤发感谢邮件", createdAt: "2026-10-17T00:00:00Z", actions: ["accept", "dismiss"] }], next: {} } } } });
  await page.getByText("给佐藤发感谢邮件 →").click();
  assert.ok((await fixtureValue<string[]>(page, "navigation")).some((href) => href.includes("/task?seg=todo&entry=a1")));
  assert.doesNotMatch(await page.locator("body").innerText(), /有人脉和活动后/u);
});

test("HomeWidgetsScreen reopens its scoped layout offline and queues an edit locally", async (t) => {
  const page = await harness.open(t, { screen: "home", online: false });
  const key = homeLayoutStorageKey(actor, baseUrl);
  assert.ok(key);
  await page.evaluate(({ storageKey, snapshot }) => {
    localStorage.setItem(storageKey, JSON.stringify({ snapshot, fetchedAt: "2026-10-20T00:00:00Z", draft: null }));
  }, { storageKey: key, snapshot: DEFAULT_HOME_LAYOUT });
  await page.reload();
  await page.getByText("今日待办").waitFor();
  // UX-4: a saved layout is shown as the layout — no "old data" notice until an edit is waiting to be sent.
  assert.equal(await page.getByText(/以前的信息 · 联网后保存/).count(), 0);
  await page.getByRole("button", { name: "编辑" }).click();
  await page.getByRole("button", { name: "今日待办 移除" }).click(); // UX-2: the × badge replaced the move buttons
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

test("UX: the plan card keeps the goal on one line and lists at most two score parts as their own rows", async (t) => {
  const seg = (key: string, shortLabel: string, allocation: number) => ({ key, shortLabel, emoji: "👤", allocation, earned: 0, overflow: 0, skipped: false });
  const summary = { current: { goal: "Raise Series A next year", goalKind: "launch", planId: "plan_ux", score: { overflow: 0, remainingToFull: 100, skipped: 0, talked: 0, todayDelta: 0, total: 0,
    segments: [seg("cfo", "前 CFO", 10), seg("founder", "融过资的创业者", 15), seg("angel", "天使投资人", 20)] } }, goals: [] };
  const page = await harness.open(t, { screen: "home", responses: { ...responses, "/api/agent/plans/v2/summary": summary } });
  await page.getByText("前 CFO", { exact: true }).waitFor();
  await page.getByText("融过资的创业者", { exact: true }).waitFor();
  assert.equal(await page.getByText("0/10", { exact: true }).count(), 1);
  assert.equal(await page.getByText(/天使投资人/u).count(), 0, "a third part is left to the plan page");
  assert.equal(await page.getByText(/ · /u).filter({ hasText: "前 CFO" }).count(), 0, "no run-on dotted list");
});
