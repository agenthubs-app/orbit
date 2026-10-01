/**
 * W0006 SC-02 / SC-04（服务层）：引导页 /app/start 的步骤规则与服务端读取。
 *
 * - 纯函数：第 1 步（≥3 位 / 跳过 / D2 老用户）、第 2 步（有目标 / 老用户）、第 3 步（有计划）；
 *   W0035 起只有这 3 步，严格顺序；进页面停在哪一步；
 * - 引导记录：step1Skipped 只能置 true、currentStep 1–3、completedAt 只写一次并清空 currentStep，
 *   v1 旧记录按默认值补齐；存量 currentStep = 4（W0035 前写的）读成 null；
 * - 读取器：开关关零读取；新用户 / 老用户 / 跳过；前 3 步完成时写 completedAt；读不到时 unavailable。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createStorageGuideStateService,
  GUIDE_STATE_COLLECTION,
  guideStateWorkspaceId,
  type GuideStatePayload,
} from "../../features/guide/guide-state";
import {
  decideGuideDemo,
  deriveGuideProgress,
  readGuideStatusForActor,
  readStartGuideForActor,
  type StartGuideDependencies,
} from "../../features/guide/progress";
import {
  canOpenStartStep,
  deriveStartGuideFlags,
  GUIDE_START_STEPS,
  firstIncompleteStartStep,
  parseStartStepParam,
  resolveRequestedStartView,
  resolveStartView,
  startStepStatus,
  viewAfterStepDone,
  type StartGuideFlags,
} from "../../features/guide/start-steps";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE = "workspace:guide-start-test";
const ON = { enabled: true, since: new Date("2026-10-15T00:00:00.000Z") };

const base = {
  confirmedContacts: 0,
  grandfathered: false,
  hasActivePlan: false,
  relationshipGoal: "",
  step1Skipped: false,
};
const flagsOf = (overrides: Partial<typeof base>): StartGuideFlags => deriveStartGuideFlags({ ...base, ...overrides });

/* ── 纯函数 ───────────────────────────────────────────────────────────── */

test("step 1 is done by 3 confirmed contacts, by skipping, or for a D2 legacy user", () => {
  assert.equal(flagsOf({ confirmedContacts: 2 }).contacts, false);
  assert.equal(flagsOf({ confirmedContacts: 3 }).contacts, true);
  assert.equal(flagsOf({ confirmedContacts: 1, step1Skipped: true }).contacts, true);
  assert.equal(flagsOf({ grandfathered: true }).contacts, true);
});

test("W0035: the guide has exactly 3 steps and no events flag", () => {
  assert.deepEqual([...GUIDE_START_STEPS], [1, 2, 3]);
  assert.deepEqual(Object.keys(flagsOf({})).sort(), ["contacts", "goal", "plan"]);
});

test("step 2 needs a non-blank goal (legacy users count as done); step 3 an active plan", () => {
  assert.equal(flagsOf({ relationshipGoal: "   " }).goal, false);
  assert.equal(flagsOf({ relationshipGoal: "三个月内找到 5 家试用客户" }).goal, true);
  assert.equal(flagsOf({ grandfathered: true }).goal, true);
  assert.equal(flagsOf({}).plan, false);
  assert.equal(flagsOf({ hasActivePlan: true }).plan, true);
});

test("steps 1–3 unlock strictly in order; there is no 'open' status any more", () => {
  const fresh = flagsOf({});
  assert.deepEqual(
    GUIDE_START_STEPS.map((step) => startStepStatus(fresh, step)),
    ["current", "locked", "locked"],
  );
  assert.equal(canOpenStartStep(fresh, 2), false);
  assert.equal(canOpenStartStep(fresh, 3), false);

  // 有目标但名片没做完：第 2 步算完成，但第 3 步仍然锁着（顺序锁看第一个没完成的步骤）。
  const goalFirst = flagsOf({ relationshipGoal: "找渠道" });
  assert.deepEqual(
    GUIDE_START_STEPS.map((step) => startStepStatus(goalFirst, step)),
    ["current", "done", "locked"],
  );
  assert.equal(firstIncompleteStartStep(goalFirst), 1);

  const legacy = flagsOf({ grandfathered: true });
  assert.deepEqual(
    GUIDE_START_STEPS.map((step) => startStepStatus(legacy, step)),
    ["done", "done", "current"],
  );
  const complete = flagsOf({ confirmedContacts: 3, relationshipGoal: "x", hasActivePlan: true });
  assert.deepEqual(
    GUIDE_START_STEPS.map((step) => startStepStatus(complete, step)),
    ["done", "done", "done"],
  );
});

test("the page opens on the recorded step when it can, otherwise the first unfinished step or the finish card", () => {
  const fresh = flagsOf({});
  assert.equal(resolveStartView(fresh, null), 1);
  // 记录指向锁定的步骤（例如别的设备写的旧值）：不越过顺序。
  assert.equal(resolveStartView(fresh, 3), 1);
  const onPlan = flagsOf({ confirmedContacts: 3, relationshipGoal: "x" });
  assert.equal(resolveStartView(onPlan, 3), 3);
  assert.equal(resolveStartView(onPlan, 1), 1, "a done step can be reopened");
  assert.equal(resolveStartView(onPlan, null), 3);
  const complete = flagsOf({ confirmedContacts: 3, relationshipGoal: "x", hasActivePlan: true });
  assert.equal(resolveStartView(complete, null), "finish");
  assert.equal(resolveStartView(complete, 2), 2, "a finished user may reopen a done step");
  assert.equal(viewAfterStepDone(flagsOf({ step1Skipped: true })), 2);
  assert.equal(viewAfterStepDone(complete), "finish");
});

test("W0022/W0035: ?step= takes exactly one of 1–3; anything else (4, abc, 9, 0, 3.0, blank, repeated) is ignored", () => {
  assert.equal(parseStartStepParam("3"), 3);
  assert.equal(parseStartStepParam("2"), 2);
  assert.equal(parseStartStepParam("1"), 1);
  for (const value of ["4", "abc", "9", "0", "3.0", " 3", "", "03", undefined, null, 3, 4, ["3"], ["4"], ["3", "4"]]) {
    assert.equal(parseStartStepParam(value), null, JSON.stringify(value));
  }
});

test("W0022: a requested step opens only when it can; a locked or missing one falls back to the recorded / first unfinished step", () => {
  // D2 老用户，记录停在第 1 步：?step=3 直接回到第 3 步。
  const legacy = flagsOf({ grandfathered: true });
  assert.equal(resolveRequestedStartView(legacy, 1, 3), 3);
  assert.equal(resolveRequestedStartView(legacy, 1, null), 1, "no request keeps the recorded step");
  // 前 2 步已完成、没有记录：?step=3 同样放行。
  const onPlan = flagsOf({ confirmedContacts: 3, relationshipGoal: "x" });
  assert.equal(resolveRequestedStartView(onPlan, null, 3), 3);
  // 新用户：?step=3 锁着，不解锁，按原逻辑（记录可开就用记录，否则第一个未完成）。
  const fresh = flagsOf({});
  assert.equal(resolveRequestedStartView(fresh, null, 3), 1);
  assert.equal(resolveRequestedStartView(fresh, 1, 3), 1);
  assert.equal(resolveRequestedStartView(fresh, null, 2), 1);
  // 前 3 步完成、没有记录也没有请求（含 ?step=4 被丢弃后的 null）：完成卡片。
  const complete = flagsOf({ confirmedContacts: 3, relationshipGoal: "x", hasActivePlan: true });
  assert.equal(resolveRequestedStartView(complete, null, null), "finish");
  assert.equal(resolveRequestedStartView(complete, null, parseStartStepParam("4")), "finish");
  assert.equal(resolveRequestedStartView(fresh, null, parseStartStepParam("4")), 1);
  // 与原函数一致：没有请求时结果完全等于 resolveStartView。
  for (const flags of [fresh, legacy, onPlan, complete]) {
    for (const recorded of [null, 1, 2, 3] as const) {
      assert.equal(resolveRequestedStartView(flags, recorded, null), resolveStartView(flags, recorded));
    }
  }
});

test("the demo exits once step 1 is skipped and steps 2–3 are done (the skip flag feeds the W0004 progress)", () => {
  const progress = deriveGuideProgress({
    confirmedContacts: 1,
    hasActivePlan: true,
    relationshipGoal: "找渠道",
    step1Skipped: true,
  });
  assert.equal(progress.steps.contacts, true);
  assert.equal(progress.completed, 3);
  assert.equal(decideGuideDemo({ enabled: true, grandfathered: false, progress }), false);
});

/* ── 引导记录 ─────────────────────────────────────────────────────────── */

function stateWorld() {
  const store = createMemoryLiveRecordStore<GuideStatePayload>();
  let tick = 0;
  const serviceFor = (actorId: string) =>
    createStorageGuideStateService({
      actorId,
      now: () => new Date(Date.UTC(2026, 9, 20, 0, 0, tick++)).toISOString(),
      store,
      workspaceId: WORKSPACE,
    });
  return { serviceFor, store };
}

test("guide state v2: step1Skipped, currentStep and completedAt; v1 records read with defaults", async () => {
  const { serviceFor, store } = stateWorld();
  // v1 记录（W0004 写的）：只有 grandfathered / bannerCollapsed。
  await store.upsertRecord({
    collectionName: GUIDE_STATE_COLLECTION,
    createdAt: "2026-10-01T00:00:00.000Z",
    evidenceIds: [],
    lifecycleState: "active",
    payload: { bannerCollapsed: true, grandfathered: false, version: 1 },
    recordId: "current",
    sourceId: "guide-state",
    sourceType: "manual",
    updatedAt: "2026-10-01T00:00:00.000Z",
    userId: "actor:old",
    workspaceId: guideStateWorkspaceId(WORKSPACE, "actor:old"),
  });
  const old = serviceFor("actor:old");
  assert.deepEqual(await old.get(), {
    bannerCollapsed: true,
    completedAt: null,
    currentStep: null,
    grandfathered: false,
    step1Skipped: false,
    version: 2,
  });

  const updated = await old.update({ currentStep: 2, step1Skipped: true });
  assert.equal(updated.currentStep, 2);
  assert.equal(updated.step1Skipped, true);
  assert.equal(updated.bannerCollapsed, true, "other fields survive");
  await assert.rejects(() => old.update({ currentStep: 7 as never }), /1–3/);
  await assert.rejects(() => old.update({ currentStep: 4 as never }), /1–3/, "W0035: step 4 is gone");
  assert.equal((await old.get()).currentStep, 2);

  const completed = await old.markCompleted();
  assert.ok(completed.completedAt);
  assert.equal(completed.currentStep, null, "completion clears the recorded step (finish card)");
  // completedAt 只写一次。
  await old.update({ currentStep: 2 });
  const again = await old.markCompleted();
  assert.equal(again.completedAt, completed.completedAt);
  assert.equal(again.currentStep, 2);
  const rows = await store.listRecords({
    collectionName: GUIDE_STATE_COLLECTION,
    limit: 10,
    workspaceId: guideStateWorkspaceId(WORKSPACE, "actor:old"),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.payload.version, 2);
});

test("garbage stored values read as defaults instead of leaking out", async () => {
  const { serviceFor, store } = stateWorld();
  await store.upsertRecord({
    collectionName: GUIDE_STATE_COLLECTION,
    createdAt: "2026-10-01T00:00:00.000Z",
    evidenceIds: [],
    lifecycleState: "active",
    payload: { completedAt: "not a date", currentStep: 9, step1Skipped: "yes", version: 2 } as unknown as GuideStatePayload,
    recordId: "current",
    sourceId: "guide-state",
    sourceType: "manual",
    updatedAt: "2026-10-01T00:00:00.000Z",
    userId: "actor:odd",
    workspaceId: guideStateWorkspaceId(WORKSPACE, "actor:odd"),
  });
  const state = await serviceFor("actor:odd").get();
  assert.equal(state.completedAt, null);
  assert.equal(state.currentStep, null);
  assert.equal(state.step1Skipped, false);
});

/** W0035 前写下的存量 `currentStep: 4`（未完成或已完成两种）。 */
async function seedStoredStep4(
  store: ReturnType<typeof stateWorld>["store"],
  actorId: string,
  completedAt: string | null,
) {
  await store.upsertRecord({
    collectionName: GUIDE_STATE_COLLECTION,
    createdAt: "2026-10-01T00:00:00.000Z",
    evidenceIds: [],
    lifecycleState: "active",
    payload: {
      currentStep: 4,
      grandfathered: false,
      step1Skipped: false,
      version: 2,
      ...(completedAt ? { completedAt } : {}),
    },
    recordId: "current",
    sourceId: "guide-state",
    sourceType: "manual",
    updatedAt: "2026-10-01T00:00:00.000Z",
    userId: actorId,
    workspaceId: guideStateWorkspaceId(WORKSPACE, actorId),
  });
}

test("W0035: a stored currentStep of 4 reads as null, both before and after completion, without a rewrite", async () => {
  const { serviceFor, store } = stateWorld();
  await seedStoredStep4(store, "actor:open4", null);
  await seedStoredStep4(store, "actor:done4", "2026-09-30T00:00:00.000Z");

  const open = await serviceFor("actor:open4").get();
  assert.equal(open.currentStep, null);
  assert.equal(open.completedAt, null);
  const done = await serviceFor("actor:done4").get();
  assert.equal(done.currentStep, null);
  assert.equal(done.completedAt, "2026-09-30T00:00:00.000Z");

  // 读取不改记录：原始 payload 里的 4 原样留着，直到下次写 currentStep。
  for (const actorId of ["actor:open4", "actor:done4"]) {
    const [row] = await store.listRecords({
      collectionName: GUIDE_STATE_COLLECTION,
      limit: 10,
      workspaceId: guideStateWorkspaceId(WORKSPACE, actorId),
    });
    assert.equal(row!.payload.currentStep, 4);
    assert.equal(row!.updatedAt, "2026-10-01T00:00:00.000Z");
  }
  // 下一次合法写入覆盖它。
  assert.equal((await serviceFor("actor:open4").update({ currentStep: 1 })).currentStep, 1);
});

/* ── 读取器 ───────────────────────────────────────────────────────────── */

function readerWorld() {
  const { serviceFor, store } = stateWorld();
  const contacts = new Map<string, number>();
  const plans = new Set<string>();
  const createdAt = new Map<string, string | null>();
  const calls: string[] = [];
  const deps = (actorId: string, overrides: Partial<StartGuideDependencies> = {}): StartGuideDependencies => ({
    config: ON,
    countConfirmedContacts: async (id) => {
      calls.push(`contacts:${id}`);
      return contacts.get(id) ?? 0;
    },
    guideState: serviceFor(actorId),
    hasActivePlan: async (id) => {
      calls.push(`plan:${id}`);
      return plans.has(id);
    },
    readAccountCreatedAt: async ({ actorId: id }) => {
      calls.push(`account:${id}`);
      return createdAt.get(id) ?? null;
    },
    sampleConfirmedContacts: async (id) => {
      calls.push(`samples:${id}`);
      return [{ displayName: `${id} 的联系人`, organization: null, role: null }];
    },
    ...overrides,
  });
  const read = (actorId: string, goal: string | null, overrides: Partial<StartGuideDependencies> = {}) =>
    readStartGuideForActor({ actorId, relationshipGoal: goal, userId: `subject:${actorId}` }, deps(actorId, overrides));
  return { calls, contacts, createdAt, plans, read, serviceFor, store };
}

test("flag off: disabled without a single read or write", async () => {
  const w = readerWorld();
  let resolved = false;
  const result = await readStartGuideForActor(
    { actorId: "actor:a", relationshipGoal: null },
    {
      config: { enabled: false, since: null },
      countConfirmedContacts: async () => {
        w.calls.push("contacts");
        return 0;
      },
      get guideState() {
        resolved = true;
        return null;
      },
    },
  );
  assert.deepEqual(result, { kind: "disabled" });
  assert.deepEqual(w.calls, []);
  assert.equal(resolved, false);
});

test("a new user gets a snapshot starting at step 1; the D2 decision is persisted as false", async () => {
  const w = readerWorld();
  w.contacts.set("actor:new", 1);
  const result = await w.read("actor:new", null);
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.deepEqual(result.snapshot, {
    completedAt: null,
    confirmedContacts: 1,
    contactSamples: [{ displayName: "actor:new 的联系人", organization: null, role: null }],
    currentStep: null,
    grandfathered: false,
    hasActivePlan: false,
    step1Skipped: false,
  });
  assert.equal((await w.serviceFor("actor:new").get()).grandfathered, false);
  // 读取器只以本人 id 读。
  assert.ok(w.calls.every((call) => call.endsWith(":actor:new")));
});

test("a D2 legacy user has steps 1–2 done and stops at step 3 (plan still read)", async () => {
  const w = readerWorld();
  w.contacts.set("actor:legacy", 8);
  w.createdAt.set("actor:legacy", "2026-06-01T00:00:00Z");
  const result = await w.read("actor:legacy", "");
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.snapshot.grandfathered, true);
  assert.ok(w.calls.includes("plan:actor:legacy"));
  const flags = deriveStartGuideFlags({ ...result.snapshot, relationshipGoal: "" });
  assert.equal(resolveStartView(flags, result.snapshot.currentStep), 3);
  // 同一个人在 W0004 的判定里永远不进示例。
  const demo = await readGuideStatusForActor(
    { actorId: "actor:legacy", relationshipGoal: "" },
    { config: ON, guideState: w.serviceFor("actor:legacy") },
  );
  assert.equal(demo?.inDemo, false);
});

test("the skip flag and recorded step come back from the guide record", async () => {
  const w = readerWorld();
  await w.serviceFor("actor:skip").update({ currentStep: 2, step1Skipped: true });
  const result = await w.read("actor:skip", null);
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.snapshot.step1Skipped, true);
  assert.equal(result.snapshot.currentStep, 2);
});

test("the first time steps 1–3 are all done, completedAt is written once and the recorded step is cleared", async () => {
  const w = readerWorld();
  w.contacts.set("actor:done", 2);
  w.createdAt.set("actor:done", "2026-11-01T00:00:00Z");
  await w.serviceFor("actor:done").update({ currentStep: 3, step1Skipped: true });
  w.plans.add("actor:done");
  const first = await w.read("actor:done", "找渠道");
  assert.equal(first.kind, "ready");
  if (first.kind !== "ready") return;
  assert.ok(first.snapshot.completedAt);
  assert.equal(first.snapshot.currentStep, null);

  await w.serviceFor("actor:done").update({ currentStep: 2 });
  const second = await w.read("actor:done", "找渠道");
  assert.equal(second.kind, "ready");
  if (second.kind !== "ready") return;
  assert.equal(second.snapshot.completedAt, first.snapshot.completedAt);
  assert.equal(second.snapshot.currentStep, 2, "after completion the user may still reopen a done step");
});

test("W0035: stored step 4 — an unfinished user lands on the first unfinished step, a finished one on the finish card", async () => {
  const w = readerWorld();
  await seedStoredStep4(w.store, "actor:open4", null);
  const open = await w.read("actor:open4", null);
  assert.equal(open.kind, "ready");
  if (open.kind !== "ready") return;
  assert.equal(open.snapshot.currentStep, null);
  assert.equal(open.snapshot.completedAt, null);
  assert.equal(resolveStartView(deriveStartGuideFlags({ ...open.snapshot, relationshipGoal: null }), open.snapshot.currentStep), 1);

  await seedStoredStep4(w.store, "actor:done4", "2026-09-30T00:00:00.000Z");
  w.contacts.set("actor:done4", 3);
  w.plans.add("actor:done4");
  const done = await w.read("actor:done4", "找渠道");
  assert.equal(done.kind, "ready");
  if (done.kind !== "ready") return;
  assert.equal(done.snapshot.currentStep, null);
  assert.equal(done.snapshot.completedAt, "2026-09-30T00:00:00.000Z", "completedAt is not rewritten");
  assert.equal(
    resolveStartView(deriveStartGuideFlags({ ...done.snapshot, relationshipGoal: "找渠道" }), done.snapshot.currentStep),
    "finish",
  );
});

test("unreadable record, count or plan is unavailable; unreadable samples only drop the names", async () => {
  const w = readerWorld();
  const boom = async () => {
    throw new Error("down");
  };
  assert.deepEqual(await w.read("actor:x", null, { countConfirmedContacts: boom }), { kind: "unavailable" });
  assert.equal((await w.serviceFor("actor:x").get()).grandfathered, null, "no decision on a failed count");
  assert.deepEqual(await w.read("actor:y", null, { hasActivePlan: boom }), { kind: "unavailable" });
  assert.deepEqual(await w.read("actor:z", null, { guideState: null }), { kind: "unavailable" });
  const samples = await w.read("actor:s", null, { sampleConfirmedContacts: boom });
  assert.equal(samples.kind, "ready");
  if (samples.kind === "ready") assert.deepEqual(samples.snapshot.contactSamples, []);
});
