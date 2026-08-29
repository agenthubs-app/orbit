import assert from "node:assert/strict";
import test from "node:test";

import { createTodayGetHandler } from "../../app/api/today/handler";
import type { TodayService } from "../../features/tasks/today-service";

const aggregate = {
  date: "2026-08-29",
  timeZone: "Asia/Tokyo",
  tasks: [],
  completedCount: 2,
  suggestions: [],
  schedule: [],
  summary: {
    openTaskCount: 0,
    completedCount: 2,
    suggestionCount: 0,
    scheduleCount: 0,
  },
};

test("returns one actor-scoped Today aggregate with an explicit time zone", async () => {
  let observed: unknown;
  const service: TodayService = {
    async getToday(input) {
      observed = input;
      return aggregate;
    },
  };
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
  });
  assert.deepEqual((await response.json()).data, aggregate);
});

test("rejects unauthenticated reads and invalid time zones", async () => {
  const service: TodayService = { async getToday() { return aggregate; } };
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
