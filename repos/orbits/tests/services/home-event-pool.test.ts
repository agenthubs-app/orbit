/**
 * W0036 SC-04：首页共享推荐活动池（`features/agent/home-event-pool.ts`，W0037／W0038 只消费）。
 *
 * 顺序：计划点名 → 目标匹配 → 近期可报名；按 eventId 去重（先到的理由为准）；剔除已开始、
 * 已报名；**组完池之后**才截到 limit（默认 8）。理由只来自真实来源：goal 的 tokens 原样取
 * matchedTokens，空数组不能标 goal。费用不填（W36-5）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHomeEventPool,
  HOME_EVENT_POOL_LIMIT,
  type HomeEventPoolCandidate,
} from "../../features/agent/home-event-pool";

const NOW = new Date("2026-10-01T03:00:00.000Z");

function candidate(index: number, overrides: Partial<HomeEventPoolCandidate> = {}): HomeEventPoolCandidate {
  const day = String(index + 1).padStart(2, "0");
  return {
    endsAt: `2026-11-${day}T12:00:00.000Z`,
    eventId: `event:${index}`,
    publicCode: `code-${index}`,
    startsAt: `2026-11-${day}T10:00:00.000Z`,
    title: `Event ${index}`,
    venue: `Venue ${index}`,
    ...overrides,
  };
}

const upcoming13 = Array.from({ length: 13 }, (_, index) => candidate(index + 1));

test("the pool is plan → goal → recent, deduplicated with the first reason winning", () => {
  const pool = buildHomeEventPool({
    goalMatches: [
      { eventId: "event:3", matchedTokens: ["ai"] },
      { eventId: "event:2", matchedTokens: ["founders", "ai"] },
    ],
    now: NOW,
    planEventIds: ["event:2"],
    registeredEventIds: new Set(),
    upcoming: upcoming13.slice(0, 5),
  });
  assert.deepEqual(
    pool.map((item) => [item.eventId, item.reason.kind]),
    [
      ["event:2", "plan"],
      ["event:3", "goal"],
      ["event:1", "recent"],
      ["event:4", "recent"],
      ["event:5", "recent"],
    ],
  );
  assert.deepEqual(pool[1]!.reason, { kind: "goal", tokens: ["ai"] });
  // 展示字段取自 upcoming；地点是来源原文；费用不填。
  assert.deepEqual(pool[0], {
    endsAt: "2026-11-03T12:00:00.000Z",
    eventId: "event:2",
    place: "Venue 2",
    publicCode: "code-2",
    reason: { kind: "plan" },
    startsAt: "2026-11-03T10:00:00.000Z",
    title: "Event 2",
  });
  assert.ok(pool.every((item) => !("feeLabel" in item)));
});

test("a plan event 13th by start time and not a goal match still heads the pool (no server-side truncation)", () => {
  const pool = buildHomeEventPool({
    goalMatches: [{ eventId: "event:4", matchedTokens: ["ai"] }],
    now: NOW,
    planEventIds: ["event:13"],
    registeredEventIds: new Set(),
    upcoming: upcoming13,
  });
  assert.equal(pool.length, HOME_EVENT_POOL_LIMIT);
  assert.deepEqual(pool[0]!.eventId, "event:13");
  assert.deepEqual(pool[0]!.reason, { kind: "plan" });
  assert.equal(pool[1]!.eventId, "event:4");
  // 截断发生在组池之后：剩下 6 个名额是最早的近期活动。
  assert.deepEqual(
    pool.slice(2).map((item) => item.eventId),
    ["event:1", "event:2", "event:3", "event:5", "event:6", "event:7"],
  );
});

test("plan ids that are not bookable (not in upcoming nor goal matches) are dropped, not invented", () => {
  const pool = buildHomeEventPool({
    goalMatches: [],
    now: NOW,
    planEventIds: ["event:gone", "event:1"],
    registeredEventIds: new Set(),
    upcoming: upcoming13.slice(0, 2),
  });
  assert.deepEqual(pool.map((item) => [item.eventId, item.reason.kind]), [
    ["event:1", "plan"],
    ["event:2", "recent"],
  ]);
});

test("started and registered events are removed; an empty goal match never becomes a goal reason", () => {
  const pool = buildHomeEventPool({
    goalMatches: [
      { eventId: "event:2", matchedTokens: [] },
      // 目标匹配不在 upcoming 里时用推荐项自带的展示字段。
      {
        eventId: "event:goal-only",
        matchedTokens: ["dx"],
        publicCode: "goal-only",
        startsAt: "2026-12-01T10:00:00.000Z",
        title: "Goal only",
        venue: "Marunouchi",
      },
    ],
    now: NOW,
    planEventIds: [],
    registeredEventIds: new Set(["event:3"]),
    upcoming: [
      candidate(0, { startsAt: "2026-10-01T02:00:00.000Z" }),
      candidate(1, { startsAt: NOW.toISOString() }),
      ...upcoming13.slice(1, 4),
    ],
  });
  assert.deepEqual(pool.map((item) => [item.eventId, item.reason.kind]), [
    ["event:goal-only", "goal"],
    ["event:2", "recent"],
    ["event:4", "recent"],
  ]);
  assert.equal(pool[0]!.title, "Goal only");
  assert.equal(pool[0]!.place, "Marunouchi");
  assert.equal(pool[0]!.publicCode, "goal-only");
});

test("a goal match without display fields and not in upcoming cannot be shown, so it is skipped", () => {
  const pool = buildHomeEventPool({
    goalMatches: [{ eventId: "event:ghost", matchedTokens: ["ai"] }],
    now: NOW,
    planEventIds: [],
    registeredEventIds: new Set(),
    upcoming: [],
  });
  assert.deepEqual(pool, []);
});

test("limit is applied after composing, and defaults to 8", () => {
  const input = {
    goalMatches: [],
    now: NOW,
    planEventIds: [],
    registeredEventIds: new Set<string>(),
    upcoming: upcoming13,
  };
  assert.equal(buildHomeEventPool(input).length, 8);
  assert.equal(buildHomeEventPool({ ...input, limit: 3 }).length, 3);
  assert.equal(HOME_EVENT_POOL_LIMIT, 8);
});

test("an empty catalogue gives an empty pool", () => {
  assert.deepEqual(
    buildHomeEventPool({ goalMatches: [], now: NOW, planEventIds: ["event:1"], registeredEventIds: new Set(), upcoming: [] }),
    [],
  );
});
