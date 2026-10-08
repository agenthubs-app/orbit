/**
 * W0060（G-13）：详情「为什么是 TA」的计划关联只读视图（SC-W0060-03）。
 * 只经 getCurrent 读当前生效计划：0 次写入、0 次生成器调用；已关联需求带阶段；本周行动只认恰好只关联此人或 meta.contactId 为此人。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PlanItem, PlanService, PlanSnapshot } from "../../features/plans/contract";
import { contactPlanContextFromSnapshot, readContactPlanContext } from "../../features/plans/contact-plan-context";
import { PLAN_NOW, planSnapshotFixture } from "../support/plan-snapshot-fixture";

function withPhases(snapshot: PlanSnapshot): PlanSnapshot {
  return {
    ...snapshot,
    plan: {
      ...snapshot.plan,
      phases: [
        { endWeek: 3, granularity: "week", key: "p1", startWeek: 1, summary: null, title: "盘点已有人脉" },
        { endWeek: 8, granularity: "week", key: "p2", startWeek: 4, summary: null, title: "拓展新客户" },
      ],
      startsOn: "2026-09-14",
    },
  };
}

function patchItem(snapshot: PlanSnapshot, id: string, patch: Partial<PlanItem>): PlanSnapshot {
  return { ...snapshot, items: snapshot.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) };
}

test("linked needs carry their phase; the week action is the contact's own unfinished action this week, with its detail", () => {
  let snapshot = withPhases(planSnapshotFixture());
  snapshot = patchItem(snapshot, "a-this-week", { linkedContactIds: ["contact:c1"] });
  const context = contactPlanContextFromSnapshot(snapshot, "contact:c1", PLAN_NOW);
  assert.deepEqual(context.linkedNeeds, [{ needId: "n-connector", phaseNo: 1, phaseTitle: "盘点已有人脉", title: "能帮你引荐的行业前辈" }]);
  assert.deepEqual(context.weekAction, { detail: "你已经认识 TA，是离目标最近的一步。", id: "a-this-week", phaseNo: 1, phaseTitle: "盘点已有人脉", title: "约一位老客户聊 20 分钟" });
});

test("meta.contactId also marks the contact's action; shared, finished or future actions do not count", () => {
  const base = withPhases(planSnapshotFixture());
  const viaMeta = patchItem(base, "a-overdue-1", { detail: "上周说好要回复", meta: { contactId: "contact:c9" } });
  assert.equal(contactPlanContextFromSnapshot(viaMeta, "contact:c9", PLAN_NOW).weekAction?.id, "a-overdue-1");
  const shared = patchItem(base, "a-this-week", { linkedContactIds: ["contact:c9", "contact:c8"] });
  assert.equal(contactPlanContextFromSnapshot(shared, "contact:c9", PLAN_NOW).weekAction, null, "an action shared by two people is not this person's");
  const done = patchItem(base, "a-done-this-week", { linkedContactIds: ["contact:c9"] });
  assert.equal(contactPlanContextFromSnapshot(done, "contact:c9", PLAN_NOW).weekAction, null, "finished actions are not 'now'");
  const future = patchItem(base, "a-next-phase", { linkedContactIds: ["contact:c9"] });
  assert.equal(contactPlanContextFromSnapshot(future, "contact:c9", PLAN_NOW).weekAction, null, "next phase is not this week");
  const blank = patchItem(base, "a-this-week", { detail: "   ", linkedContactIds: ["contact:c9"] });
  assert.equal(contactPlanContextFromSnapshot(blank, "contact:c9", PLAN_NOW).weekAction?.detail, null);
});

test("no plan or an archived plan → empty context", () => {
  assert.deepEqual(contactPlanContextFromSnapshot(null, "contact:c1", PLAN_NOW), { linkedNeeds: [], weekAction: null });
  const archived = withPhases(planSnapshotFixture());
  assert.deepEqual(contactPlanContextFromSnapshot({ ...archived, plan: { ...archived.plan, status: "archived" } }, "contact:c1", PLAN_NOW), { linkedNeeds: [], weekAction: null });
});

test("readContactPlanContext only calls getCurrent — 0 writes, 0 generator calls", async () => {
  const called: string[] = [];
  const snapshot = withPhases(planSnapshotFixture());
  const plans = new Proxy({} as PlanService, {
    get(_target, name) {
      return async () => {
        called.push(String(name));
        if (name !== "getCurrent") throw new Error(`unexpected ${String(name)}`);
        return snapshot;
      };
    },
  });
  const context = await readContactPlanContext({ actorId: "u1", contactId: "contact:c2", now: PLAN_NOW, plans });
  assert.deepEqual(called, ["getCurrent"]);
  assert.equal(context.linkedNeeds[0]?.needId, "n-connector");
  const source = readFileSync("features/plans/contact-plan-context.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /getCurrentView|enterCurrentPhase|generator|ai-generator|createVersion|updateItem|linkNeedContact/);
});
