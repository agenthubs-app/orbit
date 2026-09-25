import assert from "node:assert/strict";
import test from "node:test";

import { createTodayGetHandler } from "../../app/api/today/handler";

const legacy = {
  date: "2026-09-26",
  timeZone: "Asia/Tokyo",
  tasks: [],
  completedCount: 2,
  suggestions: [],
  schedule: [],
  summary: { openTaskCount: 0, completedCount: 2, suggestionCount: 0, scheduleCount: 0 },
};

test("Today task page mode accepts a bounded page size", async () => {
  let observed: unknown;
  const page = { taskMode: "page", date: legacy.date, timeZone: legacy.timeZone, taskPage: { items: [], total: 0 } };
  const service = { async getToday(input: unknown) { observed = input; return page; } };
  const response = await createTodayGetHandler({
    now: () => "2026-09-26T03:30:00.000Z",
    resolveActor: async () => ({ id: "account:today" }),
    service: service as never,
  })(new Request("https://orbit.local/api/today?timeZone=Asia%2FTokyo&taskMode=page&limit=7"));

  assert.equal(response.status, 200);
  assert.deepEqual(observed, {
    actorId: "account:today",
    now: "2026-09-26T03:30:00.000Z",
    timeZone: "Asia/Tokyo",
    taskMode: "page",
    limit: 7,
  });
  assert.deepEqual((await response.json()).data, page);
});

test("Today AI summary is opt-in and has no client-selected page size", async () => {
  let observed: unknown;
  const summary = { taskMode: "summary", date: legacy.date, timeZone: legacy.timeZone, items: [] };
  const service = { async getToday(input: unknown) { observed = input; return summary; } };
  const response = await createTodayGetHandler({
    now: () => "2026-09-26T03:30:00.000Z",
    resolveActor: async () => ({ id: "account:today" }),
    service: service as never,
  })(new Request("https://orbit.local/api/today?taskMode=summary"));

  assert.equal(response.status, 200);
  assert.deepEqual(observed, {
    actorId: "account:today",
    now: "2026-09-26T03:30:00.000Z",
    timeZone: "Asia/Tokyo",
    taskMode: "summary",
  });
  assert.deepEqual((await response.json()).data, summary);
});

test("Today task modes reject malformed or mode-incompatible pagination parameters before service reads", async () => {
  let reads = 0;
  const service = { async getToday() { reads += 1; return legacy; } };
  for (const query of [
    "taskMode=unknown",
    "taskMode=page&limit=0",
    "taskMode=page&limit=51",
    "taskMode=page&limit=abc",
    "taskMode=page&cursor=anything",
    "taskMode=summary&limit=3",
    "taskMode=summary&taskMode=page",
  ]) {
    const response = await createTodayGetHandler({
      resolveActor: async () => ({ id: "account:today" }),
      service: service as never,
    })(new Request(`https://orbit.local/api/today?${query}`));
    assert.equal(response.status, 400, query);
  }
  assert.equal(reads, 0);
});
