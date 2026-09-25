import assert from "node:assert/strict";
import test from "node:test";

import { createTodayService } from "../../features/tasks/today-service";

const actorId = "account:today-mode";
const now = "2026-09-26T03:30:00.000Z";
const timeZone = "Asia/Tokyo";

const cards = [
  { id: "task:1", titlePreview: "Task one", locationPreview: null, status: "open", category: "work", priority: "normal", plannedDate: "2026-09-26", dueAt: null, updatedAt: "2026-09-25T00:00:00.000Z", relatedContact: null },
  { id: "task:2", titlePreview: "Task two", locationPreview: null, status: "open", category: "work", priority: "normal", plannedDate: "2026-09-26", dueAt: null, updatedAt: "2026-09-25T00:00:00.000Z", relatedContact: null },
  { id: "task:3", titlePreview: "Task three", locationPreview: null, status: "open", category: "work", priority: "normal", plannedDate: "2026-09-26", dueAt: null, updatedAt: "2026-09-25T00:00:00.000Z", relatedContact: null },
];

function taskPage(items = cards, total = 4) {
  return {
    actorId,
    status: "open" as const,
    scope: "all" as const,
    query: "",
    dueWindow: { plannedThrough: "2026-09-26", dueBefore: "2026-09-26T15:00:00.000Z" },
    items,
    counts: { open: total, completed: 1 },
    total,
    hasMore: total > items.length,
    nextCursor: total > items.length ? "next-cursor" : null,
    asOf: now,
  };
}

function schedule() {
  return [
    { id: "meeting:upcoming", kind: "meeting" as const, category: "meeting" as const, state: "upcoming" as const, title: "Preparation", startsAt: "2026-09-26T04:00:00.000Z", location: "Room A", sourceId: "appointment:a" },
    { id: "personal:ongoing", kind: "personal" as const, category: "personal" as const, state: "ongoing" as const, title: "Walk", startsAt: "2026-09-26T02:00:00.000Z", endsAt: "2026-09-26T04:00:00.000Z", location: "Park", sourceId: "schedule:b" },
    { id: "event:future", kind: "event" as const, category: "event" as const, state: "upcoming" as const, title: "Tomorrow", startsAt: "2026-09-26T16:00:00.000Z", sourceId: "event:c" },
  ];
}

function baseDependencies(input: {
  read?: (actorId: string, query: Record<string, unknown>) => Promise<unknown>;
  readToday?: (actorId: string, query: Record<string, unknown>, now: string) => Promise<unknown>;
  items?: ReturnType<typeof schedule>;
  suggestions?: unknown[];
  completedCount?: number;
} = {}) {
  return {
    taskService: {
      async list() { throw new Error("Today page modes must not read every task"); },
      async history() { throw new Error("Today page modes must not read task history"); },
    } as never,
    taskPageReader: {
      async read(actorId: string, query: Record<string, unknown>) {
        return input.read ? input.read(actorId, query) : taskPage();
      },
      async readToday(actorId: string, query: Record<string, unknown>, readAt: string) {
        return input.readToday
          ? input.readToday(actorId, query, readAt)
          : { ...taskPage(), todaySignals: { urgentTask: true, relationshipTask: true } };
      },
    },
    completedCounter: { async count() { return input.completedCount ?? 8; } },
    suggestionService: {
      async list() {
        return input.suggestions ?? [
          { id: "suggestion:1", title: "Suggestion one", reason: "reason", category: "work", status: "pending" },
          { id: "suggestion:2", title: "Suggestion two", reason: "reason", category: "work", status: "pending" },
          { id: "suggestion:3", title: "Suggestion three", reason: "reason", category: "work", status: "pending" },
        ];
      },
    } as never,
    scheduleProvider: { async list() { return input.items ?? schedule(); } },
  };
}

test("Today page mode uses the bounded task page and keeps exact counts and old side data", async () => {
  let observed: Record<string, unknown> | undefined;
  const dependencies = baseDependencies({
    read: async (_actor, query) => { observed = query; return taskPage(cards.slice(0, 2), 4); },
  });
  const service = createTodayService(dependencies as never);

  const result = await service.getToday({ actorId, now, timeZone, taskMode: "page", limit: 2 });

  assert.deepEqual(observed, {
    status: "open",
    scope: "all",
    query: "",
    limit: 2,
    dueWindow: { plannedThrough: "2026-09-26", dueBefore: "2026-09-26T15:00:00.000Z" },
  });
  assert.equal(result.taskMode, "page");
  assert.equal(result.taskPage.total, 4);
  assert.equal(result.taskPage.items.length, 2);
  assert.equal(result.summary.openTaskCount, 4);
  assert.equal(result.completedCount, 8);
  assert.equal(result.suggestions.length, 2);
  assert.deepEqual(result.schedule.map((item) => item.id), ["personal:ongoing", "meeting:upcoming"]);
  assert.equal("tasks" in result, false);
  assert.equal("todaySignals" in result.taskPage, false);
});

test("AI summary mode uses database-wide signals beyond the first three task cards", async () => {
  let observed: { query?: Record<string, unknown>; now?: string } = {};
  const dependencies = baseDependencies({
    readToday: async (_actor, query, readAt) => {
      observed = { query, now: readAt };
      // All returned cards are ordinary work tasks; the aggregate flags represent
      // a later high-priority/overdue relationship task outside this page.
      return { ...taskPage(cards, 4), todaySignals: { urgentTask: true, relationshipTask: true } };
    },
  });
  dependencies.completedCounter = { async count() { throw new Error("AI summary does not need completed history count"); } };
  const service = createTodayService(dependencies as never);

  const result = await service.getToday({ actorId, now, timeZone, taskMode: "summary" });

  if (result.taskMode !== "summary") throw new Error("Expected Today summary mode");
  assert.deepEqual(observed, {
    query: {
      status: "open",
      scope: "all",
      query: "",
      limit: 3,
      dueWindow: { plannedThrough: "2026-09-26", dueBefore: "2026-09-26T15:00:00.000Z" },
    },
    now,
  });
  assert.equal(result.taskMode, "summary");
  assert.equal(result.summary.openTaskCount, 4);
  assert.equal(result.summary.suggestionCount, 3);
  assert.deepEqual(result.questionSignals, { urgentTask: true, relationshipTask: true, preparation: true });
  assert.deepEqual(result.items.map((item) => item.kind), ["task", "task", "task"]);
  assert.equal("tasks" in result, false);
  assert.equal("schedule" in result, false);
  assert.equal("suggestions" in result, false);
  assert.equal(JSON.stringify(result).includes("notes"), false);
});

test("AI summary fills task-first slots with compact schedule projections and localizable fields", async () => {
  const oneTask = taskPage(cards.slice(0, 1), 1);
  const service = createTodayService(baseDependencies({
    readToday: async () => ({ ...oneTask, todaySignals: { urgentTask: false, relationshipTask: false } }),
    items: [schedule()[0]!, schedule()[1]!],
    suggestions: [],
  }) as never);

  const result = await service.getToday({ actorId, now, timeZone, taskMode: "summary" });

  if (result.taskMode !== "summary") throw new Error("Expected Today summary mode");
  assert.deepEqual(result.items.map((item) => item.kind), ["task", "schedule", "schedule"]);
  assert.deepEqual(result.items[0], {
    kind: "task",
    task: { id: "task:1", titlePreview: "Task one", category: "work", priority: "normal", plannedDate: "2026-09-26", dueAt: null },
  });
  assert.deepEqual(result.items[1], {
    kind: "schedule",
    schedule: { id: "personal:ongoing", titlePreview: "Walk", category: "personal", kind: "personal", state: "ongoing", startsAt: "2026-09-26T02:00:00.000Z", locationPreview: "Park" },
  });
  assert.deepEqual(result.questionSignals, { urgentTask: false, relationshipTask: false, preparation: true });
  assert.equal("completedCount" in result, false);
});
