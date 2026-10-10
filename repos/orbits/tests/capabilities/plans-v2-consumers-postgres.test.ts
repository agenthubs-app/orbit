/**
 * R22 SC-R22-06（复核 S1，真实 PostgreSQL）：只有 v2 计划的人，人脉分析快照的计划输入、覆盖度（机会标签）、
 * 结构标签的行业高亮、联系人详情的计划说明都仍有数据；两个目标的需求合并；跳过与已达成的不算；
 * 有 v1 时 v1 原样、后面接上 v2。消费方的纯投影不改，输入改经 `mergeActivePlanNeeds`。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { contactPlanContextFromSnapshot } from "../../features/plans/contact-plan-context";
import { toOpportunityPlanView } from "../../features/plans/coverage";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { mergeActivePlanNeeds } from "../../features/plans/v2/active-needs";
import { createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { planNeedsForSnapshot } from "../../features/network-analysis/input-source";
import { planNeedHighlights } from "../../app/(app)/app/contacts/analysis/structure-tab-model";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";
import { planInput } from "../support/plan-fixture";
import { ANY_REFERENCES, draftInput, steppingClock } from "../plans/v2-fixture";

const ACTOR = "actor:alice";
const NOW = new Date("2026-10-07T03:00:00.000Z");

function services(pool: import("pg").Pool) {
  const scope = { actorId: ACTOR, workspaceId: WORKSPACE };
  let n = 0;
  return {
    v1: createPlanService({ references: createAllowListPlanReferenceValidator({ actorId: ACTOR, allowList: { contactsByActor: "any", eventIds: "any" } }), repository: createPostgresPlanRepository({ pool }), scope }),
    v2: createPlanV2Service({ newId: () => `c${(n += 1)}`, now: steppingClock(), references: ANY_REFERENCES, repository: createPostgresPlanV2Repository({ pool }), scope }),
  };
}

function withIndustry(input = draftInput()) {
  return {
    ...input,
    content: {
      ...input.content,
      personTypes: input.content.personTypes.map((type) => (type.key === "vc_partner" ? { ...type, primaryIndustryId: "finance_investment" as const, secondaryIndustryId: "finance_investment.venture_capital" as const } : type)),
    },
  };
}

test("a person with only v2 plans: snapshot input, coverage, industry highlights and the contact's plan context all have data", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { v1, v2 } = services(pool);
    const first = await v2.createPlanFromDraft(withIndustry());
    const second = await v2.createPlanFromDraft(draftInput({ creationKey: "draft-2", goalId: "intake-2", goalText: "採用" }));
    const vc = first.plan.content.personTypes.find((type) => type.key === "vc_partner")!.itemId;
    await v2.award({ itemId: vc, planId: first.plan.planId, request: { basis: "talked", contactId: "contact:takahashi", idempotencyKey: "a" } });
    await v2.skip({ idempotencyKey: "s", itemId: first.plan.content.personTypes.find((type) => type.key === "lawyer")!.itemId, planId: first.plan.planId });

    assert.equal(await v1.getCurrent(), null, "v1 still sees no plan");
    const merged = mergeActivePlanNeeds(await v1.getCurrent(), await v2.activeTypeNeeds());
    assert.ok(merged, "the merged read has a plan");
    // 两个目标各 6 类，跳过的 1 类不算需求。
    assert.equal(merged!.items.length, 11);
    assert.ok(merged!.plan.goalSnapshot.includes("シリーズA") && merged!.plan.goalSnapshot.includes("採用"));
    assert.ok([first.plan.planId, second.plan.planId].includes(merged!.plan.id));

    // 人脉分析快照的计划输入：还没建立联系的需求。
    const inputs = planNeedsForSnapshot(merged);
    assert.equal(inputs.length, 10);
    // 第一个目标的 VC パートナー 已经 established（话过了），不再是缺口；第二个目标的同名类型仍在。
    assert.equal(inputs.filter((need) => need.title === "VC パートナー").length, 1);

    // 覆盖度 / 机会标签。
    const opportunity = toOpportunityPlanView(merged!, NOW);
    assert.equal(opportunity.needs.length, 11);
    assert.ok(opportunity.needs.some((need) => need.linkedContactIds.includes("contact:takahashi")));

    // 结构标签的行业高亮：VC パートナー 已有 1 人但目标 3 人，仍是 linked 之外的状态（established）→ 不高亮；
    // 其他目标的同类需求（未带行业）不影响。
    const highlights = planNeedHighlights(merged);
    assert.deepEqual(highlights, { primary: [], secondary: [] });

    // 联系人详情的计划说明。
    const context = contactPlanContextFromSnapshot(merged, "contact:takahashi", NOW);
    assert.equal(context.linkedNeeds.length, 1);
  });
});

test("industry highlights come from open v2 types; an achieved goal drops out; v1 stays first when both exist", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { v1, v2 } = services(pool);
    const created = await v2.createPlanFromDraft(withIndustry());
    let merged = mergeActivePlanNeeds(await v1.getCurrent(), await v2.activeTypeNeeds());
    assert.deepEqual(planNeedHighlights(merged), { primary: ["finance_investment"], secondary: ["finance_investment.venture_capital"] });

    await pool.query("update plans set status = 'archived', archived_at = now(), achieved_at = now() where id = $1", [created.plan.planId]);
    merged = mergeActivePlanNeeds(await v1.getCurrent(), await v2.activeTypeNeeds());
    assert.equal(merged, null, "an achieved goal is not an active plan");

    // v1 与 v2 并存（R25 之前、v2 确定前建的 v1）：v1 原样在前，v2 接在后面。
    const old = await v1.createVersion(planInput({ basePlanId: null }));
    const second = await v2.createPlanFromDraft(withIndustry(draftInput({ creationKey: "d2", goalId: "intake-2" })));
    assert.equal(second.archivedV1PlanId, old.plan.id);
  });
});

test("goal-related contacts: v2 talked and linked people across goals, de-duplicated", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { v1, v2 } = services(pool);
    const first = await v2.createPlanFromDraft(draftInput());
    const second = await v2.createPlanFromDraft(draftInput({ creationKey: "draft-2", goalId: "intake-2" }));
    const vc = (plan: typeof first.plan) => plan.content.personTypes.find((type) => type.key === "vc_partner")!.itemId;
    await v2.award({ itemId: vc(first.plan), planId: first.plan.planId, request: { basis: "talked", contactId: "contact:b", idempotencyKey: "1" } });
    await v2.award({ itemId: vc(second.plan), planId: second.plan.planId, request: { basis: "talked", contactId: "contact:b", idempotencyKey: "2" } });
    await v2.award({ itemId: vc(second.plan), planId: second.plan.planId, request: { basis: "talked", contactId: "contact:a", idempotencyKey: "3" } });
    const { planGoalRelatedContactIds } = await import("../../features/plans/v2/active-needs");
    const ids = await planGoalRelatedContactIds(ACTOR, { readV1: () => v1.getCurrent(), readV2: () => v2.activeTypeNeeds() });
    assert.deepEqual(ids, ["contact:a", "contact:b"]);
  });
});
