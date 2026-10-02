/**
 * W0004 SC-01 / SC-02：引导进度推导、D2 老用户判定、是否进入示例，以及引导记录的按人隔离。
 *
 * 纯函数覆盖 `ORBIT_GUIDE_DEMO_SINCE` 前后注册、读不到创建时间的退化规则；读取器用注入的
 * 计数器 / 计划读取 / 内存引导记录覆盖：开关关闭零读取、新用户进入、老用户不进入、
 * 完成第 1–3 步后退出、「首次判定后再扫满 3 张」仍不是老用户、任何来源失败都 fail closed、
 * 两个用户互不影响。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { readGuideDemoConfig } from "../../shared/config/guide-demo";
import {
  createStorageGuideStateService,
  GUIDE_STATE_COLLECTION,
  guideStateWorkspaceId,
  type GuideStatePayload,
  type GuideStateService,
} from "../../features/guide/guide-state";
import {
  decideGrandfathered,
  decideGuideDemo,
  deriveGuideProgress,
  readGuideStatusForActor,
  type GuideStatusDependencies,
} from "../../features/guide/progress";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE = "workspace:guide-test";
const SINCE = new Date("2026-10-15T00:00:00.000Z");
const ON = { enabled: true, since: SINCE };

/* ── 开关 ─────────────────────────────────────────────────────────────── */

test("the demo flag defaults to off and only on / true / 1 turn it on", () => {
  assert.deepEqual(readGuideDemoConfig({}), { enabled: false, since: null });
  assert.equal(readGuideDemoConfig({ ORBIT_GUIDE_DEMO: "off" }).enabled, false);
  assert.equal(readGuideDemoConfig({ ORBIT_GUIDE_DEMO: "yes" }).enabled, false);
  for (const value of ["on", "ON", " true ", "1"]) {
    assert.equal(readGuideDemoConfig({ ORBIT_GUIDE_DEMO: value }).enabled, true, value);
  }
  assert.equal(readGuideDemoConfig({ ORBIT_GUIDE_DEMO_SINCE: "not a date" }).since, null);
});

test("ORBIT_GUIDE_DEMO_SINCE: a date means 00:00 Tokyo; timestamps need Z or an offset", () => {
  const since = (value: string) => readGuideDemoConfig({ ORBIT_GUIDE_DEMO_SINCE: value }).since?.toISOString() ?? null;
  assert.equal(since("2026-10-15"), "2026-10-14T15:00:00.000Z");
  assert.equal(since(" 2026-01-01 "), "2025-12-31T15:00:00.000Z");
  assert.equal(since("2026-10-15T00:00:00Z"), "2026-10-15T00:00:00.000Z");
  assert.equal(since("2026-10-15T09:30:00+09:00"), "2026-10-15T00:30:00.000Z");
  assert.equal(since("2026-10-15T00:00:00.250-05:00"), "2026-10-15T05:00:00.250Z");
  // 没有时区的时间戳会随服务器时区漂移：无效。
  assert.equal(since("2026-10-15T00:00:00"), null);
  assert.equal(since("2026-10-15 00:00"), null);
  assert.equal(since("2026-02-30"), null);
  assert.equal(since("20261015"), null);
  assert.equal(since(""), null);

  // 边界：东京 10/15 00:00 之前一秒注册的是老账号，正好在那一刻注册的不是。
  const boundary = readGuideDemoConfig({ ORBIT_GUIDE_DEMO_SINCE: "2026-10-15" }).since;
  assert.equal(decideGrandfathered({ accountCreatedAt: "2026-10-14T14:59:59.999Z", confirmedContacts: 3, since: boundary }), true);
  assert.equal(decideGrandfathered({ accountCreatedAt: "2026-10-14T15:00:00.000Z", confirmedContacts: 3, since: boundary }), false);
  assert.equal(decideGrandfathered({ accountCreatedAt: "2026-10-15T08:00:00+09:00", confirmedContacts: 3, since: boundary }), false);
});

/* ── 纯函数 ───────────────────────────────────────────────────────────── */

test("progress: step 1 needs 3 confirmed contacts, step 2 a goal, step 3 an active plan", () => {
  assert.deepEqual(deriveGuideProgress({ confirmedContacts: 0, hasActivePlan: false, relationshipGoal: "" }), {
    completed: 0,
    confirmedContacts: 0,
    nextStep: "contacts",
    steps: { contacts: false, goal: false, plan: false },
  });
  const partial = deriveGuideProgress({ confirmedContacts: 2, hasActivePlan: false, relationshipGoal: "  找渠道  " });
  assert.equal(partial.completed, 1);
  assert.equal(partial.nextStep, "contacts");
  assert.deepEqual(partial.steps, { contacts: false, goal: true, plan: false });
  const whitespaceGoal = deriveGuideProgress({ confirmedContacts: 3, hasActivePlan: false, relationshipGoal: "   " });
  assert.equal(whitespaceGoal.nextStep, "goal");
  const done = deriveGuideProgress({ confirmedContacts: 5, hasActivePlan: true, relationshipGoal: "找渠道" });
  assert.equal(done.completed, 3);
  assert.equal(done.nextStep, null);
});

test("D2: registered before ORBIT_GUIDE_DEMO_SINCE with ≥3 contacts is a legacy user; after it is not", () => {
  assert.equal(
    decideGrandfathered({ accountCreatedAt: "2026-08-01T00:00:00Z", confirmedContacts: 3, since: SINCE }),
    true,
  );
  assert.equal(
    decideGrandfathered({ accountCreatedAt: "2026-10-20T00:00:00Z", confirmedContacts: 12, since: SINCE }),
    false,
  );
  // 老账号但联系人不够：不是老用户。
  assert.equal(
    decideGrandfathered({ accountCreatedAt: "2026-08-01T00:00:00Z", confirmedContacts: 2, since: SINCE }),
    false,
  );
});

test("D2 fallback: unknown createdAt (or no SINCE) means ≥3 confirmed contacts is legacy", () => {
  assert.equal(decideGrandfathered({ accountCreatedAt: null, confirmedContacts: 3, since: SINCE }), true);
  assert.equal(decideGrandfathered({ accountCreatedAt: "garbage", confirmedContacts: 4, since: SINCE }), true);
  assert.equal(
    decideGrandfathered({ accountCreatedAt: "2026-10-20T00:00:00Z", confirmedContacts: 3, since: null }),
    true,
  );
  assert.equal(decideGrandfathered({ accountCreatedAt: null, confirmedContacts: 2, since: SINCE }), false);
});

test("demo is entered only with the flag on, not grandfathered, and steps 1–3 incomplete", () => {
  const incomplete = deriveGuideProgress({ confirmedContacts: 0, hasActivePlan: false, relationshipGoal: "" });
  const complete = deriveGuideProgress({ confirmedContacts: 3, hasActivePlan: true, relationshipGoal: "x" });
  assert.equal(decideGuideDemo({ enabled: true, grandfathered: false, progress: incomplete }), true);
  assert.equal(decideGuideDemo({ enabled: false, grandfathered: false, progress: incomplete }), false);
  assert.equal(decideGuideDemo({ enabled: true, grandfathered: true, progress: incomplete }), false);
  assert.equal(decideGuideDemo({ enabled: true, grandfathered: false, progress: complete }), false);
  assert.equal(decideGuideDemo({ enabled: true, grandfathered: false, progress: null }), false);
});

/* ── 读取器 ───────────────────────────────────────────────────────────── */

function world() {
  const store = createMemoryLiveRecordStore<GuideStatePayload>();
  let tick = 0;
  const contacts = new Map<string, number>();
  const plans = new Set<string>();
  const createdAt = new Map<string, string | null>();
  const calls: string[] = [];
  const stateFor = (actorId: string): GuideStateService =>
    createStorageGuideStateService({
      actorId,
      now: () => new Date(Date.UTC(2026, 9, 20, 0, 0, tick++)).toISOString(),
      store,
      workspaceId: WORKSPACE,
    });
  const deps = (actorId: string, overrides: Partial<GuideStatusDependencies> = {}): GuideStatusDependencies => ({
    config: ON,
    countConfirmedContacts: async (id) => {
      calls.push(`contacts:${id}`);
      return contacts.get(id) ?? 0;
    },
    guideState: stateFor(actorId),
    hasActivePlan: async (id) => {
      calls.push(`plan:${id}`);
      return plans.has(id);
    },
    readAccountCreatedAt: async ({ actorId: id }) => {
      calls.push(`account:${id}`);
      return createdAt.get(id) ?? null;
    },
    ...overrides,
  });
  const read = (actorId: string, goal: string | null, overrides: Partial<GuideStatusDependencies> = {}) =>
    readGuideStatusForActor({ actorId, relationshipGoal: goal, userId: `subject:${actorId}` }, deps(actorId, overrides));
  return { calls, contacts, createdAt, plans, read, stateFor, store };
}

test("flag off: returns null without touching a single reader", async () => {
  const w = world();
  let resolvedService = false;
  const status = await readGuideStatusForActor(
    { actorId: "actor:a", relationshipGoal: null },
    {
      config: { enabled: false, since: SINCE },
      countConfirmedContacts: async () => {
        w.calls.push("contacts");
        return 0;
      },
      get guideState() {
        resolvedService = true;
        return null;
      },
      hasActivePlan: async () => {
        w.calls.push("plan");
        return false;
      },
    },
  );
  assert.equal(status, null);
  assert.deepEqual(w.calls, []);
  assert.equal(resolvedService, false);
  // 也没有写引导记录。
  assert.deepEqual(await w.store.listRecords({ collectionName: GUIDE_STATE_COLLECTION, limit: 10, workspaceId: guideStateWorkspaceId(WORKSPACE, "actor:a") }), []);
});

test("a new user (0 contacts, no goal, no plan) enters the demo; the first decision is persisted as false", async () => {
  const w = world();
  const status = await w.read("actor:new", null);
  assert.equal(status?.inDemo, true);
  assert.equal(status?.grandfathered, false);
  assert.equal(status?.progress?.completed, 0);
  assert.equal(status?.progress?.nextStep, "contacts");
  // 联系人不足 3 位时不去读账号记录。
  assert.ok(!w.calls.includes("account:actor:new"));
  assert.equal((await w.stateFor("actor:new").get()).grandfathered, false);
});

test("a D2 legacy user (created before SINCE, ≥3 contacts) never sees the demo, even without a plan", async () => {
  const w = world();
  w.contacts.set("actor:legacy", 7);
  w.createdAt.set("actor:legacy", "2026-06-01T00:00:00Z");
  const first = await w.read("actor:legacy", "推进日本合作");
  assert.equal(first?.inDemo, false);
  assert.equal(first?.grandfathered, true);
  assert.equal((await w.stateFor("actor:legacy").get()).grandfathered, true);

  // 之后联系人被删到 0：已判定的老用户不会被切回示例，也不再读计数。
  w.contacts.set("actor:legacy", 0);
  w.calls.length = 0;
  const later = await w.read("actor:legacy", null);
  assert.equal(later?.inDemo, false);
  assert.deepEqual(w.calls, []);
});

test("unknown account createdAt falls back to ≥3 confirmed contacts = legacy", async () => {
  const w = world();
  w.contacts.set("actor:unknown", 3);
  const status = await w.read("actor:unknown", null, {
    readAccountCreatedAt: async () => {
      throw new Error("account store down");
    },
  });
  assert.equal(status?.grandfathered, true);
  assert.equal(status?.inDemo, false);
});

test("registered after SINCE with ≥3 contacts is not legacy: stays in demo until goal and plan exist", async () => {
  const w = world();
  w.contacts.set("actor:fresh", 3);
  w.createdAt.set("actor:fresh", "2026-10-20T00:00:00Z");
  const status = await w.read("actor:fresh", null);
  assert.equal(status?.grandfathered, false);
  assert.equal(status?.inDemo, true);
  assert.equal(status?.progress?.completed, 1);
  assert.equal(status?.progress?.nextStep, "goal");
});

test("first decided with 1 contact, later scans up to 3: still not a legacy user", async () => {
  const w = world();
  // 老账号（创建早于 SINCE），首次判定时只有 1 位联系人。
  w.contacts.set("actor:scanner", 1);
  w.createdAt.set("actor:scanner", "2026-06-01T00:00:00Z");
  assert.equal((await w.read("actor:scanner", null))?.grandfathered, false);

  w.contacts.set("actor:scanner", 3);
  const later = await w.read("actor:scanner", null);
  assert.equal(later?.grandfathered, false);
  assert.equal(later?.inDemo, true);
  assert.equal(later?.progress?.steps.contacts, true);
});

test("finishing steps 1–3 exits the demo", async () => {
  const w = world();
  assert.equal((await w.read("actor:finisher", null))?.inDemo, true);
  w.contacts.set("actor:finisher", 3);
  assert.equal((await w.read("actor:finisher", "三个月内找到 5 家试用客户"))?.inDemo, true);
  w.plans.add("actor:finisher");
  const done = await w.read("actor:finisher", "三个月内找到 5 家试用客户");
  assert.equal(done?.inDemo, false);
  assert.equal(done?.progress?.completed, 3);
});

test("any unreadable source fails closed (null = real home) and does not lock in a decision", async () => {
  const w = world();
  const boom = async () => {
    throw new Error("down");
  };
  assert.equal(await w.read("actor:x", null, { countConfirmedContacts: boom }), null);
  assert.equal((await w.stateFor("actor:x").get()).grandfathered, null, "no decision on a failed count");
  assert.equal(await w.read("actor:y", null, { hasActivePlan: boom }), null);
  assert.equal(await w.read("actor:z", null, { guideState: null }), null);

  const failingWrite: GuideStateService = {
    get: async () => ({
      bannerCollapsed: false,
      completedAt: null,
      currentStep: null,
      grandfathered: null,
      step1Skipped: false,
      version: 2,
    }),
    markCompleted: boom,
    recordGrandfathered: boom,
    setBannerCollapsed: boom,
    update: boom,
  };
  assert.equal(await w.read("actor:w", null, { guideState: failingWrite }), null);
});

test("two users: counts, decisions and banner state never leak across actors", async () => {
  const w = world();
  w.contacts.set("actor:alice", 9);
  w.createdAt.set("actor:alice", "2026-01-01T00:00:00Z");
  w.contacts.set("actor:bob", 0);

  const alice = await w.read("actor:alice", "goal");
  const bob = await w.read("actor:bob", null);
  assert.equal(alice?.grandfathered, true);
  assert.equal(bob?.grandfathered, false);
  assert.equal(bob?.inDemo, true);
  // 读取器只被以本人 id 调用。
  assert.ok(w.calls.every((call) => call.endsWith("actor:alice") || call.endsWith("actor:bob")));

  await w.stateFor("actor:bob").setBannerCollapsed(true);
  assert.equal((await w.stateFor("actor:alice").get()).bannerCollapsed, false);
  assert.equal((await w.stateFor("actor:bob").get()).bannerCollapsed, true);
  assert.equal((await w.read("actor:bob", null))?.bannerCollapsed, true);
});

/* ── 引导记录 ─────────────────────────────────────────────────────────── */

test("guide state: grandfathered is write-once, bannerCollapsed toggles, both survive each other", async () => {
  const w = world();
  const service = w.stateFor("actor:rec");
  assert.deepEqual(await service.get(), {
    bannerCollapsed: false,
    completedAt: null,
    currentStep: null,
    grandfathered: null,
    step1Skipped: false,
    version: 2,
  });
  await service.setBannerCollapsed(true);
  assert.equal((await service.recordGrandfathered(false)).grandfathered, false);
  // 第二次判定不改写。
  assert.equal((await service.recordGrandfathered(true)).grandfathered, false);
  const state = await service.get();
  assert.equal(state.bannerCollapsed, true);
  assert.equal(state.grandfathered, false);
  await service.setBannerCollapsed(false);
  const toggled = await service.get();
  assert.equal(toggled.bannerCollapsed, false);
  assert.equal(toggled.grandfathered, false);

  // 一人一条，按 actor 分片的 workspace、userId 都是本人。
  const rows = await w.store.listRecords({
    collectionName: GUIDE_STATE_COLLECTION,
    limit: 10,
    workspaceId: guideStateWorkspaceId(WORKSPACE, "actor:rec"),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.userId, "actor:rec");
  assert.equal(rows[0]!.payload.version, 2);
});

/* ── W0054（W54-5）：completedAt 是唯一闩锁 ─────────────────────────── */

test("W0054 SC-02: completedAt latches — deleting down to 2 contacts never re-enters the demo and skips count/plan reads", async () => {
  const w = world();
  w.contacts.set("actor:latched", 3);
  w.createdAt.set("actor:latched", "2026-10-20T00:00:00Z");
  w.plans.add("actor:latched");
  const done = await w.read("actor:latched", "三个月内找到 5 家试用客户");
  assert.equal(done?.inDemo, false);
  // 首页路径第一次推导出 3 步完成：补写 completedAt（即使从没打开过 /app/start）。
  assert.ok((await w.stateFor("actor:latched").get()).completedAt);

  // 之后删到 2 位、计划到期、目标清空：都不回示例，也不再读联系人计数与计划。
  w.contacts.set("actor:latched", 2);
  w.plans.delete("actor:latched");
  for (const goal of ["三个月内找到 5 家试用客户", null]) {
    w.calls.length = 0;
    const later = await w.read("actor:latched", goal);
    assert.equal(later?.inDemo, false, `goal=${goal}`);
    assert.equal(later?.progress, null);
    assert.deepEqual(w.calls, [], "no contact count, plan or account reads once latched");
  }
});

test("W0054 SC-02: the first derived completion writes completedAt once; a failed write still returns inDemo:false and never throws", async () => {
  const w = world();
  w.contacts.set("actor:once", 3);
  w.createdAt.set("actor:once", "2026-10-20T00:00:00Z");
  w.plans.add("actor:once");
  const real = w.stateFor("actor:once");
  let marks = 0;
  const counting: GuideStateService = { ...real, markCompleted: async () => { marks += 1; return real.markCompleted(); } };
  assert.equal((await w.read("actor:once", "goal", { guideState: counting }))?.inDemo, false);
  assert.equal((await w.read("actor:once", "goal", { guideState: counting }))?.inDemo, false);
  assert.equal(marks, 1, "second read sees completedAt and does not write again");

  const failing: GuideStateService = {
    ...w.stateFor("actor:fails"),
    markCompleted: async () => { marks += 1; throw new Error("write down"); },
  };
  w.contacts.set("actor:fails", 3);
  w.createdAt.set("actor:fails", "2026-10-20T00:00:00Z");
  w.plans.add("actor:fails");
  marks = 0;
  const status = await w.read("actor:fails", "goal", { guideState: failing });
  assert.equal(status?.inDemo, false);
  assert.equal(status?.progress?.completed, 3);
  assert.equal(marks, 1);
});

test("W0054: an unfinished user without completedAt behaves exactly as before (no write, still in demo)", async () => {
  const w = world();
  w.contacts.set("actor:half", 2);
  const real = w.stateFor("actor:half");
  let marks = 0;
  const counting: GuideStateService = { ...real, markCompleted: async () => { marks += 1; return real.markCompleted(); } };
  const status = await w.read("actor:half", "goal", { guideState: counting });
  assert.equal(status?.inDemo, true);
  assert.equal(status?.progress?.nextStep, "contacts");
  assert.equal(marks, 0);
});
