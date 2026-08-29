import assert from "node:assert/strict";
import test from "node:test";

import {
  XIAOYU_SEED_CONTACT_NAMES,
  buildXiaoyuThreeMonthSeed,
} from "../../features/tasks/xiaoyu-three-month-seed";
import { resolveXiaoyuSeedAccountId } from "../../scripts/seed-xiaoyu-three-month-planner";

const FROM = "2026-08-29";

test("Xiao Yu seed writes to the canonical account owner instead of the Auth user", () => {
  const accountId = resolveXiaoyuSeedAccountId({
    authUserId: "user_mry5y200_58jpi8",
    graph: {
      accounts: [
        {
          id: "account_orbit_generated",
          name: "Orbit Generated Relationship Workspace",
          createdAt: "2026-08-19T00:00:00.000Z",
          updatedAt: "2026-08-19T00:00:00.000Z",
        },
      ],
      evidenceIds: [],
      generatedAt: "2026-08-19T00:00:00.000Z",
      profiles: [
        {
          id: "user_mry5y200_58jpi8",
          accountId: "account_orbit_generated",
          displayName: "小雨",
          createdAt: "2026-08-19T00:00:00.000Z",
          updatedAt: "2026-08-19T00:00:00.000Z",
        },
      ],
    },
  });

  assert.equal(accountId, "account_orbit_generated");
});

test("Xiao Yu seed covers the next three months with founder-realistic frequency", () => {
  const seed = buildXiaoyuThreeMonthSeed(FROM);

  assert.equal(seed.fromDate, FROM);
  assert.equal(seed.throughDate, "2026-11-29");
  assert.ok(seed.openTasks.length >= 45 && seed.openTasks.length <= 60);
  assert.ok(seed.scheduleItems.length >= 28 && seed.scheduleItems.length <= 38);
  assert.equal(seed.completedTasks.length, 10);
  assert.ok(seed.openTasks.filter((item) => item.plannedDate === FROM).length >= 2);
  assert.ok(seed.scheduleItems.filter((item) => item.date === FROM).length >= 1);

  for (const task of seed.openTasks) {
    assert.ok(task.plannedDate >= FROM && task.plannedDate <= seed.throughDate);
  }
  for (const item of seed.scheduleItems) {
    assert.ok(item.date >= FROM && item.date <= seed.throughDate);
  }
});

test("seed workload stays readable and uses every meaningful task and schedule category", () => {
  const seed = buildXiaoyuThreeMonthSeed(FROM);
  const taskCountByDate = new Map<string, number>();
  const scheduleCountByDate = new Map<string, number>();
  for (const task of seed.openTasks) {
    taskCountByDate.set(task.plannedDate, (taskCountByDate.get(task.plannedDate) ?? 0) + 1);
  }
  for (const item of seed.scheduleItems) {
    scheduleCountByDate.set(item.date, (scheduleCountByDate.get(item.date) ?? 0) + 1);
  }

  assert.ok(Math.max(...taskCountByDate.values()) <= 3);
  assert.ok(Math.max(...scheduleCountByDate.values()) <= 2);
  assert.deepEqual(
    new Set(seed.openTasks.map((item) => item.category)),
    new Set(["event", "meeting", "personal", "relationship", "work"]),
  );
  assert.deepEqual(
    new Set(seed.scheduleItems.map((item) => item.kind)),
    new Set(["event", "meeting", "personal"]),
  );
});

test("relationship work references known Xiao Yu contacts and generation is deterministic", () => {
  const first = buildXiaoyuThreeMonthSeed(FROM);
  const second = buildXiaoyuThreeMonthSeed(FROM);
  assert.deepEqual(first, second);

  const knownNames = new Set<string>(XIAOYU_SEED_CONTACT_NAMES);
  const linked = first.openTasks.filter((item) => item.relatedContactName);
  assert.ok(linked.length >= 12);
  assert.equal(linked.every((item) => knownNames.has(item.relatedContactName!)), true);
  assert.equal(
    first.scheduleItems
      .filter((item) => item.relatedContactName)
      .every((item) => knownNames.has(item.relatedContactName!)),
    true,
  );
});

test("completed history is prior to the seed window and remains useful to the Agent", () => {
  const seed = buildXiaoyuThreeMonthSeed(FROM);
  assert.equal(seed.completedTasks.every((item) => item.completedAt.slice(0, 10) < FROM), true);
  assert.equal(seed.completedTasks.every((item) => item.notes.length >= 12), true);
});
