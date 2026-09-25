import assert from "node:assert/strict";
import test from "node:test";

import { createTodayGetHandler } from "../../app/api/today/handler";
import type { TodayService } from "../../features/tasks/today-service";

const page = {
  taskMode: "page",
  date: "2026-08-29",
  timeZone: "Asia/Tokyo",
  taskPage: {
    actorId: "account:xiaoyu",
    status: "open",
    scope: "all",
    query: "",
    dueWindow: { plannedThrough: "2026-08-29", dueBefore: "2026-08-29T15:00:00.000Z" },
    items: [],
    counts: { open: 0, completed: 0 },
    total: 0,
    hasMore: false,
    nextCursor: null,
    asOf: "2026-08-29T03:30:00.000Z",
  },
  completedCount: 2,
  suggestions: [],
  schedule: [],
  summary: { openTaskCount: 0, completedCount: 2, suggestionCount: 0, scheduleCount: 0 },
};

test("Today defaults to the new task page projection and uses an explicit time zone", async () => {
  let observed: unknown;
  const service = {
    async getToday(input: unknown) { observed = input; return page; },
  } as unknown as TodayService;
  const response = await createTodayGetHandler({
    now: () => "2026-08-29T03:30:00.000Z",
    resolveActor: async () => ({ id: "account:xiaoyu" }),
    service,
  })(new Request("https://orbit.local/api/today?timeZone=Asia%2FTokyo"));

  assert.equal(response.status, 200);
  assert.deepEqual(observed, {
    actorId: "account:xiaoyu",
    now: "2026-08-29T03:30:00.000Z",
    timeZone: "Asia/Tokyo",
    taskMode: "page",
    limit: 20,
  });
  assert.deepEqual((await response.json()).data, page);
});

test("rejects unauthenticated reads and invalid time zones", async () => {
  const service = { async getToday() { return page; } } as unknown as TodayService;
  const unauthorized = await createTodayGetHandler({
    resolveActor: async () => null,
    service,
  })(new Request("https://orbit.local/api/today?timeZone=Invalid%2FZone"));
  assert.equal(unauthorized.status, 401);

  const invalid = await createTodayGetHandler({
    resolveActor: async () => ({ id: "account:xiaoyu" }),
    service,
  })(new Request("https://orbit.local/api/today?timeZone=Invalid%2FZone"));
  assert.equal(invalid.status, 400);
});
