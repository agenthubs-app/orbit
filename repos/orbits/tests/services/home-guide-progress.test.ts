import assert from "node:assert/strict";
import test from "node:test";

import { readHomeGuideProgress } from "../../features/home/guide-progress";
import type { GuideState, GuideStateService } from "../../features/guide/guide-state";

const actor = "actor:home-guide";
const state = (patch: Partial<GuideState> = {}): GuideState => ({
  bannerCollapsed: false, completedAt: null, currentStep: 3, grandfathered: false,
  step1Skipped: false, version: 2, ...patch,
});

function sources(input: { contacts?: number; goal?: string | null; plan?: boolean; state?: GuideState; fail?: string } = {}) {
  let current = input.state ?? state();
  const writes = { completed: 0, grandfathered: 0 };
  const guide: GuideStateService = {
    get: async () => { if (input.fail === "state") throw Error("unavailable"); return current; },
    markCompleted: async () => { writes.completed += 1; current = { ...current, completedAt: "2026-10-20T00:00:00Z" }; return current; },
    recordGrandfathered: async (value) => { writes.grandfathered += 1; current = { ...current, grandfathered: value }; return current; },
    setBannerCollapsed: async () => current,
    update: async () => current,
  };
  return {
    writes,
    guideState: (_actorId: string) => guide,
    countContacts: async () => { if (input.fail === "contacts") throw Error("unavailable"); return input.contacts ?? 0; },
    readGoal: async () => { if (input.fail === "goal") throw Error("unavailable"); return input.goal ?? null; },
    hasActivePlan: async () => { if (input.fail === "plan") throw Error("unavailable"); return input.plan ?? false; },
    readAccountCreatedAt: async () => "2026-10-20T00:00:00Z",
    since: new Date("2026-10-15T00:00:00Z"),
  };
}

test("home GET reads real guide facts at 0/3, 1/3, 2/3, 3/3 without writing a latch", async () => {
  const empty = sources();
  const zero = await readHomeGuideProgress({ actorId: actor, userId: "user:home" }, empty);
  assert.equal(zero.kind, "progress");
  if (zero.kind === "progress") assert.deepEqual([zero.completed, zero.nextStep], [0, "contacts"]);
  for (const [input, expected] of [
    [{ contacts: 3 }, [1, "goal"]],
    [{ contacts: 3, goal: "協業を増やす" }, [2, "plan"]],
    [{ contacts: 3, goal: "協業を増やす", plan: true }, [3, null]],
  ] as const) {
    const result = await readHomeGuideProgress({ actorId: actor, userId: "user:home" }, sources(input));
    assert.equal(result.kind, "progress");
    if (result.kind === "progress") assert.deepEqual([result.completed, result.nextStep], expected);
  }
  const complete = sources({ contacts: 3, goal: "協業を増やす", plan: true });
  assert.equal((await readHomeGuideProgress({ actorId: actor, userId: "user:home" }, complete)).kind, "progress");
  assert.deepEqual(complete.writes, { completed: 0, grandfathered: 0 });
  await complete.guideState(actor).markCompleted();
  assert.deepEqual(await readHomeGuideProgress({ actorId: actor, userId: "user:home" }, complete),
    { kind: "hidden", reason: "completed" });
  assert.deepEqual(complete.writes, { completed: 1, grandfathered: 0 }, "only the explicit state write latches completion");
});

test("demo switch does not affect the home projection; old users stay hidden", async () => {
  const original = process.env.ORBIT_GUIDE_DEMO;
  try {
    const dependency = sources({ contacts: 2, goal: "目標" });
    process.env.ORBIT_GUIDE_DEMO = "on";
    const on = await readHomeGuideProgress({ actorId: actor }, dependency);
    process.env.ORBIT_GUIDE_DEMO = "off";
    assert.deepEqual(await readHomeGuideProgress({ actorId: actor }, dependency), on);
    assert.deepEqual(await readHomeGuideProgress({ actorId: actor }, sources({ state: state({ grandfathered: true }) })),
      { kind: "hidden", reason: "grandfathered" });
  } finally {
    if (original === undefined) delete process.env.ORBIT_GUIDE_DEMO; else process.env.ORBIT_GUIDE_DEMO = original;
  }
});

test("an unavailable required source never becomes a false 0/3", async () => {
  for (const fail of ["state", "contacts", "goal", "plan"]) {
    assert.deepEqual(await readHomeGuideProgress({ actorId: actor }, sources({ fail })), { kind: "unavailable" });
  }
});

test("GET derives the old-user decision without persisting it", async () => {
  const old = sources({ contacts: 3, state: state({ grandfathered: null }) });
  old.readAccountCreatedAt = async () => "2025-01-01T00:00:00Z";
  assert.deepEqual(await readHomeGuideProgress({ actorId: actor, userId: "user:old" }, old),
    { kind: "hidden", reason: "grandfathered" });
  assert.deepEqual(old.writes, { completed: 0, grandfathered: 0 });
  assert.equal((await old.guideState(actor).get()).grandfathered, null);
});
