import assert from "node:assert/strict";
import test from "node:test";
import type { TaskCardContract } from "../src/api/contract/task-page";
import type { TaskItemContract } from "../src/api/contract/tasks";
import {
  todaySummaryPath,
  todaySummaryQuestions,
  todaySummaryToHomeView,
  overlayTodayTaskSummaryView,
  todayTaskNextPagePath,
  todayTaskPagePath,
  todayTaskPageToView,
  todayTaskWindow,
  overlayTodayTaskPageView,
} from "../src/view-models/today-task-pages";
import type { LocalSyncQueuedMutation } from "../src/data/sync/local-sync-repository";

const actorId = "account:one";
const date = "2026-09-26";
const zone = "Asia/Tokyo";
const now = new Date("2026-09-26T01:00:00.000Z");
const dueWindow = todayTaskWindow(date, zone);

function card(id: string, overrides: Partial<TaskCardContract> = {}): TaskCardContract {
  return {
    id,
    titlePreview: `Preview ${id}`,
    locationPreview: "Shibuya",
    status: "open",
    category: "work",
    priority: "normal",
    plannedDate: date,
    dueAt: null,
    updatedAt: now.toISOString(),
    completedAt: null,
    relatedContact: null,
    ...overrides,
  };
}

function page(items = Array.from({ length: 20 }, (_, index) => card(`task:${index + 1}`)), overrides: Record<string, unknown> = {}) {
  return {
    actorId,
    status: "open",
    scope: "all",
    query: "",
    dueWindow,
    items,
    counts: { open: 21, completed: 4 },
    total: 21,
    hasMore: true,
    nextCursor: "signed:next",
    asOf: now.toISOString(),
    ...overrides,
  };
}

function todayPayload(taskPage = page(), overrides: Record<string, unknown> = {}) {
  return {
    taskMode: "page",
    date,
    timeZone: zone,
    completedCount: 4,
    summary: { openTaskCount: 21, completedCount: 4, suggestionCount: 0, scheduleCount: 0 },
    suggestions: [],
    schedule: [],
    taskPage,
    ...overrides,
  };
}

test("Today page requests use the task-mode endpoint and continuation preserves the exact window", () => {
  const first = new URL(todayTaskPagePath(zone), "https://orbit.test");
  assert.equal(first.pathname, "/api/today");
  assert.equal(first.searchParams.get("timeZone"), zone);
  assert.equal(first.searchParams.get("taskMode"), "page");
  assert.equal(first.searchParams.get("limit"), "20");

  const summary = new URL(todaySummaryPath(zone), "https://orbit.test");
  assert.equal(summary.searchParams.get("taskMode"), "summary");
  assert.equal(summary.searchParams.get("timeZone"), zone);
  assert.equal(summary.searchParams.has("limit"), false);

  const next = new URL(todayTaskNextPagePath(dueWindow, "signed:next"), "https://orbit.test");
  assert.equal(next.pathname, "/api/tasks/page");
  assert.equal(next.searchParams.get("status"), "open");
  assert.equal(next.searchParams.get("scope"), "all");
  assert.equal(next.searchParams.get("query"), "");
  assert.equal(next.searchParams.get("limit"), "20");
  assert.equal(next.searchParams.get("plannedThrough"), date);
  assert.equal(next.searchParams.get("dueBefore"), dueWindow.dueBefore);
  assert.equal(next.searchParams.get("cursor"), "signed:next");
});

test("Today accepts a matching actor/date/time-zone/window and projects explicit preview fields", () => {
  const result = todayTaskPageToView(todayPayload(), actorId, date, now, zone, "en");
  assert.ok(result);
  assert.equal(result.totalTaskCount, 21);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, "signed:next");
  assert.deepEqual(result.tasks[0], {
    id: "task:1",
    titlePreview: "Preview task:1",
    locationPreview: "Shibuya",
    categoryLabel: "Work",
    dueLabel: "Today",
    dueTone: "muted",
    priority: "normal",
    category: "work",
    plannedDate: date,
    updatedAt: now.toISOString(),
  });
  assert.equal(result.tasks.length, 20);
  assert.equal(result.schedule.length, 0);
  assert.equal(result.completedCount, 4);
});

test("Today overlays personal task queue writes while keeping relationship tasks out of the offline draft list", () => {
  const items = [card("personal:one", { category: "personal" }), card("relationship:one", { category: "relationship" }), ...Array.from({ length: 18 }, (_, index) => card(`task:${index + 3}`))];
  const payload = todayPayload(page(items));
  const base = todayTaskPageToView(payload, actorId, date, now, zone, "en");
  assert.ok(base);
  const queued = [
    {
      actorId, workspaceId: "workspace-a", domainId: "tasks", mutationId: "local-create", kind: "task", id: "local:task-a", operation: "create",
      state: "queued", patch: { category: "personal", title: "Offline task", plannedDate: date }, requestJson: JSON.stringify({ idempotencyKey: "local-create", category: "personal", title: "Offline task", plannedDate: date }),
      baseRevision: null, createdAt: "2026-09-26T01:00:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null, serverSnapshot: null,
    },
    {
      actorId, workspaceId: "workspace-a", domainId: "tasks", mutationId: "complete-personal", kind: "task", id: "personal:one", operation: "complete",
      state: "queued", patch: {}, requestJson: JSON.stringify({ action: "complete", idempotencyKey: "complete-personal" }),
      baseRevision: "revision-1", createdAt: "2026-09-26T01:01:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null, serverSnapshot: null,
    },
  ] as LocalSyncQueuedMutation[];
  const result = overlayTodayTaskPageView(base, [], queued, actorId, date, now, zone, "en");
  assert.ok(result);
  assert.equal(result.tasks.find(task => task.id === "personal:one"), undefined);
  assert.equal(result.tasks.find(task => task.id === "local:task-a")?.category, "personal");
  assert.equal(result.tasks.find(task => task.id === "relationship:one")?.category, "relationship");
  assert.equal(result.tasks.length, 20);
  assert.equal(result.totalTaskCount, 21);
});

test("Today rejects foreign, stale, malformed, or differently-windowed page data", () => {
  const base = todayPayload();
  assert.equal(todayTaskPageToView(base, "account:other", date, now, zone), null);
  assert.equal(todayTaskPageToView(base, actorId, "2026-09-27", now, zone), null);
  assert.equal(todayTaskPageToView(base, actorId, date, now, "UTC"), null);
  assert.equal(todayTaskPageToView(todayPayload(page([], { dueWindow: todayTaskWindow(date, "UTC") })), actorId, date, now, zone), null);
  assert.equal(todayTaskPageToView(todayPayload(page(Array.from({ length: 20 }, (_, index) => card(`bad:${index}`, { status: "completed" })))), actorId, date, now, zone), null);
  assert.equal(todayTaskPageToView({ ...base, taskPage: { ...base.taskPage, actorId: "account:other" } }, actorId, date, now, zone), null);
  assert.equal(todayTaskPageToView({ ...base, date: "2026-09-25" }, actorId, date, now, zone), null);
});

test("Today keeps live pages when the continuation total changes below already loaded cards", () => {
  const first = todayPayload();
  const loaded = [...first.taskPage.items, card("task:21"), card("task:22")];
  const liveProgress = {
    hasMore: true,
    nextCursor: "signed:later",
    total: 18,
    counts: { open: 18, completed: 7 },
  };

  const result = todayTaskPageToView(first, actorId, date, now, zone, "en", loaded, liveProgress);
  assert.ok(result);
  assert.equal(result.tasks.length, 22);
  assert.equal(result.totalTaskCount, 18);
  assert.equal(result.completedCount, 4, "Today completed count is sourced from its independent completed-today counter");
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, "signed:later");

  const terminal = todayTaskPageToView(first, actorId, date, now, zone, "en", first.taskPage.items, {
    hasMore: false,
    nextCursor: null,
    total: 3,
    counts: { open: 3, completed: 9 },
  });
  assert.ok(terminal);
  assert.equal(terminal.totalTaskCount, 3);
  assert.equal(terminal.completedCount, 4);
  assert.equal(terminal.hasMore, false);
  assert.equal(terminal.nextCursor, null, "a terminal live page must not fall back to the first cursor");
});

test("AI summary projects task and schedule unions locally and uses full-set question signals", () => {
  const payload = {
    taskMode: "summary",
    date,
    timeZone: zone,
    summary: { openTaskCount: 97, suggestionCount: 6 },
    items: [
      { kind: "task", task: { id: "task:a/b", titlePreview: "先联系对方", category: "relationship", priority: "high", plannedDate: date, dueAt: null } },
      { kind: "schedule", schedule: { id: "event:one", titlePreview: "设计评审", category: "meeting", kind: "event", state: "upcoming", startsAt: "2026-09-26T02:30:00.000Z", locationPreview: "线上" } },
    ],
    questionSignals: { urgentTask: true, relationshipTask: true, preparation: true },
  };
  const view = todaySummaryToHomeView(payload, date, zone, now, "en");
  assert.ok(view);
  assert.equal(view.openTaskCount, 97);
  assert.equal(view.suggestionCount, 6);
  assert.deepEqual(view.items.map(({ kind, href, context, index }) => ({ kind, href, context, index })), [
    { kind: "task", href: "/tasks/task%3Aa%2Fb", context: "Relationship · Today", index: 1 },
    { kind: "schedule", href: "/schedule", context: "11:30 · 线上", index: 2 },
  ]);
  assert.deepEqual(todaySummaryQuestions(payload, "en").map(question => question.kind), ["tasks", "discovery"]);

  const relationshipOnly = { ...payload, questionSignals: { urgentTask: false, relationshipTask: true, preparation: true } };
  assert.deepEqual(todaySummaryQuestions(relationshipOnly, "en").map(question => question.kind), ["preparation", "discovery"]);
  const followup = { ...payload, questionSignals: { urgentTask: false, relationshipTask: true, preparation: false } };
  assert.deepEqual(todaySummaryQuestions(followup, "en").map(question => question.kind), ["followup", "discovery"]);
});

test("AI home summary reflects queued task completion and creation without replacing its schedule cards", () => {
  const payload = {
    taskMode: "summary", date, timeZone: zone, summary: { openTaskCount: 1, suggestionCount: 0 },
    items: [
      { kind: "task", task: { id: "personal:one", titlePreview: "Old title", category: "personal", priority: "normal", plannedDate: date, dueAt: null } },
      { kind: "schedule", schedule: { id: "event:one", titlePreview: "Review", category: "meeting", kind: "event", state: "upcoming", startsAt: "2026-09-26T02:30:00.000Z", locationPreview: "Online" } },
    ], questionSignals: { urgentTask: false, relationshipTask: false, preparation: false },
  };
  const base = todaySummaryToHomeView(payload, date, zone, now, "en");
  assert.ok(base);
  const canonical: TaskItemContract[] = [{ id: "personal:one", accountId: actorId, ownerUserId: actorId, title: "Old title", status: "open", category: "personal", priority: "normal", source: "manual", createdAt: now.toISOString(), updatedAt: now.toISOString(), plannedDate: date }];
  const queued = [
    { actorId, workspaceId: "workspace-a", domainId: "tasks", mutationId: "complete", kind: "task", id: "personal:one", operation: "complete", state: "queued", patch: {}, requestJson: JSON.stringify({ action: "complete", idempotencyKey: "complete" }), baseRevision: "r1", createdAt: now.toISOString(), retryCount: 0, nextRetryAt: null, lastErrorCode: null, serverSnapshot: null },
    { actorId, workspaceId: "workspace-a", domainId: "tasks", mutationId: "create", kind: "task", id: "local:new", operation: "create", state: "queued", patch: { category: "personal", title: "New task", plannedDate: date }, requestJson: JSON.stringify({ idempotencyKey: "create", category: "personal", title: "New task", plannedDate: date }), baseRevision: null, createdAt: now.toISOString(), retryCount: 0, nextRetryAt: null, lastErrorCode: null, serverSnapshot: null },
  ] as LocalSyncQueuedMutation[];
  const result = overlayTodayTaskSummaryView(base, canonical, queued, actorId, date, now, zone, "en");
  assert.ok(result);
  assert.deepEqual(result.items.map(item => item.kind === "task" ? item.title : item.title), ["Review", "New task"]);
  assert.equal(result.openTaskCount, 1);
});

test("AI home keeps the server task summary when no matching local queue intent exists", () => {
  const date = "2026-09-12", now = new Date("2026-09-12T03:00:00.000Z");
  const base = {
    items: [{ id: "task:server-only", kind: "task" as const, title: "整理访谈记录", context: "工作", href: "/tasks/task%3Aserver-only", index: 1 }],
    openTaskCount: 1,
    suggestionCount: 0,
  };
  assert.deepEqual(overlayTodayTaskSummaryView(base, [], [], actorId, date, now, zone), base);
});

test("AI summary rejects malformed signals, counts, and union members instead of inferring from its top three", () => {
  const payload = {
    taskMode: "summary",
    date,
    timeZone: zone,
    summary: { openTaskCount: 97, suggestionCount: 6 },
    items: [],
    questionSignals: { urgentTask: false, relationshipTask: false, preparation: false },
  };
  assert.ok(todaySummaryToHomeView(payload, date, zone, now, "en"));
  assert.equal(todaySummaryToHomeView({ ...payload, summary: { ...payload.summary, openTaskCount: -1 } }, date, zone, now, "en"), null);
  assert.equal(todaySummaryToHomeView({ ...payload, questionSignals: { ...payload.questionSignals, urgentTask: 1 } }, date, zone, now, "en"), null);
  assert.equal(todaySummaryToHomeView({ ...payload, items: [{ kind: "task", task: { id: "x" } }] }, date, zone, now, "en"), null);
  assert.deepEqual(todaySummaryQuestions({ ...payload, questionSignals: { urgentTask: false, relationshipTask: true, preparation: false } }, "en").map(question => question.kind), ["followup", "discovery"]);
});

test("Today offline shows a server task this phone reopened (it was completed, so not in today's copy), and counts it (0133 finding)", async () => {
  const base = todayTaskPageToView(todayPayload(page([card("task:kept")])), actorId, date, now, zone, "en");
  assert.ok(base);
  const reopenedServerTask: TaskItemContract = { id: "task:reopened", accountId: actorId, ownerUserId: actorId, title: "Call the bank", status: "completed", category: "personal", priority: "normal", source: "manual", createdAt: now.toISOString(), updatedAt: now.toISOString(), plannedDate: date };
  const otherDay: TaskItemContract = { ...reopenedServerTask, id: "task:next-week", title: "Next week", plannedDate: "2026-10-03" };
  const reopen = (id: string) => ({ actorId, workspaceId: "workspace-a", domainId: "tasks", mutationId: `reopen-${id}`, kind: "task", id, operation: "reopen", state: "queued", patch: {},
    requestJson: JSON.stringify({ action: "reopen", idempotencyKey: `reopen-${id}` }), baseRevision: "r1", createdAt: now.toISOString(), retryCount: 0, nextRetryAt: null, lastErrorCode: null, serverSnapshot: null });
  const result = overlayTodayTaskPageView(base, [reopenedServerTask, otherDay], [reopen("task:reopened"), reopen("task:next-week")] as LocalSyncQueuedMutation[], actorId, date, now, zone, "en");
  assert.ok(result);
  assert.deepEqual(result.tasks.map(task => task.id).sort(), ["task:kept", "task:reopened"], "a reopened task outside today's window stays off the Today list");
  assert.equal(result.tasks.find(task => task.id === "task:reopened")?.localMutationState, "queued");
  assert.equal(result.totalTaskCount, base.totalTaskCount + 1);
});

test("AI home Today block offline without a copy counts today's open tasks from the device mirror and this phone's queue instead of 0", async () => {
  const { deviceTodayTaskSummaryView } = await import("../src/view-models/today-task-pages");
  const task = (id: string, overrides: Partial<TaskItemContract> = {}): TaskItemContract => ({ id, accountId: actorId, ownerUserId: actorId, title: id, status: "open", category: "personal", priority: "normal", source: "manual", createdAt: now.toISOString(), updatedAt: now.toISOString(), plannedDate: date, ...overrides });
  const canonical = [task("today:a"), (({ plannedDate: _planned, ...rest }) => rest)(task("today:b", { dueAt: "2026-09-26T05:00:00.000Z" })) as TaskItemContract, task("later", { plannedDate: "2026-10-01" }), task("done", { status: "completed" }), task("someone-else", { ownerUserId: "account:other" })];
  const queued = [{ actorId, workspaceId: "workspace-a", domainId: "tasks", mutationId: "c1", kind: "task", id: "local:new", operation: "create", state: "queued", patch: { category: "personal", title: "New", plannedDate: date },
    requestJson: JSON.stringify({ idempotencyKey: "c1", category: "personal", title: "New", plannedDate: date }), baseRevision: null, createdAt: now.toISOString(), retryCount: 0, nextRetryAt: null, lastErrorCode: null, serverSnapshot: null }] as LocalSyncQueuedMutation[];
  const view = deviceTodayTaskSummaryView(canonical, queued, actorId, date, now, zone, "en");
  assert.ok(view);
  assert.equal(view.openTaskCount, 3, "two mirrored tasks in today's window plus the offline-created one");
  assert.equal(view.items.length, 3);
  assert.equal(view.suggestionCount, 0);
  assert.ok(view.items.every(item => item.kind === "task"));
});
