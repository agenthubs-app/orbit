import assert from "node:assert/strict";
import test from "node:test";

import { createTodayService } from "../../features/tasks/today-service";
import type { TaskPageQuery } from "../../features/tasks/task-page";
import type { TaskPageContract } from "../../shared/contract/task-page";
import type { ScheduleItemDTO } from "../../features/tasks/today-contract";

const actorId = "account:xiaoyu";
const now = "2026-08-29T03:30:00.000Z"; // 12:30 in Tokyo
const timeZone = "Asia/Tokyo";

function emptyPage(): TaskPageContract {
  return {
    actorId,
    status: "open",
    scope: "all",
    query: "",
    dueWindow: { plannedThrough: "2026-08-29", dueBefore: "2026-08-29T15:00:00.000Z" },
    items: [],
    counts: { open: 0, completed: 0 },
    total: 0,
    hasMore: false,
    nextCursor: null,
    asOf: now,
  };
}

function service(input: {
  read?: (query: TaskPageQuery) => Promise<TaskPageContract>;
  completedCount?: number;
  schedule?: readonly ScheduleItemDTO[];
  suggestions?: readonly Record<string, unknown>[];
} = {}) {
  const observed: TaskPageQuery[] = [];
  return {
    observed,
    value: createTodayService({
      taskPageReader: {
        async read(_actorId, query) {
          observed.push({ ...query });
          return input.read ? input.read(query) : emptyPage();
        },
        async readToday() { throw new Error("Page mode does not request AI signals"); },
      },
      completedCounter: { async count(query) {
        assert.deepEqual(query, { actorId, now, timeZone });
        return input.completedCount ?? 0;
      } },
      suggestionService: { async list() { return input.suggestions ?? []; } } as never,
      scheduleProvider: { async list() { return input.schedule ?? []; } },
    }),
  };
}

test("page mode sends the local Today OR window to the reader and keeps exact counts and side data", async () => {
  const taskPage = emptyPage();
  const card = {
    id: "task:today",
    titlePreview: "整理活动参会名单",
    locationPreview: null,
    status: "open" as const,
    category: "event" as const,
    priority: "normal" as const,
    plannedDate: "2026-08-29",
    dueAt: null,
    updatedAt: "2026-08-28T10:00:00.000Z",
    relatedContact: null,
  };
  const fixtures = service({
    completedCount: 1,
    suggestions: [
      { id: "s1", title: "建议一", reason: "理由", category: "relationship", status: "pending" },
      { id: "s2", title: "建议二", reason: "理由", category: "relationship", status: "pending" },
      { id: "s3", title: "建议三", reason: "理由", category: "relationship", status: "pending" },
    ],
    schedule: [
      { id: "schedule:morning", kind: "meeting", category: "meeting", state: "upcoming", title: "团队周会", startsAt: "2026-08-29T01:00:00.000Z", endsAt: "2026-08-29T02:00:00.000Z", sourceId: "appointment:weekly" },
      { id: "schedule:evening", kind: "event", category: "event", state: "upcoming", title: "交流会", startsAt: "2026-08-29T09:30:00.000Z", sourceId: "event:kansai" },
      { id: "schedule:future", kind: "personal", category: "personal", state: "upcoming", title: "下周体检", startsAt: "2026-09-02T01:00:00.000Z", sourceId: "calendar:health-check" },
    ],
    read: async () => ({ ...taskPage, items: [card], counts: { open: 1, completed: 1 }, total: 1 }),
  });

  const result = await fixtures.value.getToday({ actorId, now, timeZone });

  assert.deepEqual(fixtures.observed, [{
    status: "open",
    scope: "all",
    query: "",
    limit: 20,
    dueWindow: { plannedThrough: "2026-08-29", dueBefore: "2026-08-29T15:00:00.000Z" },
  }]);
  assert.equal(result.taskMode, "page");
  assert.equal(result.taskPage.total, 1);
  assert.deepEqual(result.taskPage.items.map((item) => item.id), ["task:today"]);
  assert.equal(result.completedCount, 1);
  assert.equal(result.summary.openTaskCount, 1);
  assert.equal(result.summary.completedCount, 1);
  assert.equal(result.summary.suggestionCount, 3);
  assert.equal(result.suggestions.length, 2);
  assert.deepEqual(result.schedule.map((item) => [item.id, item.state]), [
    ["schedule:morning", "ended"],
    ["schedule:evening", "upcoming"],
  ]);
  assert.equal("tasks" in result, false);
});

test("task page and completion counter failures fail the whole Today response", async () => {
  const failingPage = createTodayService({
    taskPageReader: { async read() { throw new Error("Reader unavailable"); }, async readToday() { throw new Error("unused"); } },
    completedCounter: { async count() { return 0; } },
    suggestionService: { async list() { return []; } } as never,
    scheduleProvider: { async list() { return []; } },
  });
  await assert.rejects(failingPage.getToday({ actorId, now, timeZone }), /Reader unavailable/);

  const failingCounter = createTodayService({
    taskPageReader: { async read() { return emptyPage(); }, async readToday() { throw new Error("unused"); } },
    completedCounter: { async count() { throw new Error("Counter unavailable"); } },
    suggestionService: { async list() { return []; } } as never,
    scheduleProvider: { async list() { return []; } },
  });
  await assert.rejects(failingCounter.getToday({ actorId, now, timeZone }), /Counter unavailable/);
});
