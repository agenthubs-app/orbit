/**
 * R22（DESIGN §3.6，复核 S1）：「我现在需要哪些人」的合并读取——本人所有生效计划（v1 + v2 各目标）的人脉需求。
 *
 * `PlanService.getCurrent()` 只认 v1；人脉分析快照、三个分析标签、覆盖度、联系人详情的计划说明改经这里读，
 * 这样只有 v2 计划的人也有数据。形状仍是 `PlanSnapshot`（这些消费方的纯投影不用改）：
 * - 有 v1 计划：v1 原样，后面接上 v2 的人物类型（`kind: network_need`）；
 * - 只有 v2：用最近打开的 v2 计划做「计划头」，`horizon` 只在这个内存投影里填 `year`（v2 没有周次，
 *   周级行动为空），不写库；
 * - 已跳过（習熟済み）的人物类型不算需求；v2 只在 live（真实库）时合并，mock 下示例计划不混进分析。
 */
import type { PlanItem, PlanSnapshot } from "../contract";
import type { ModuleMode } from "../../../shared/services/module-mode";
import { needStatus } from "./repository";
import type { ActiveTypeNeeds } from "./service";
import { resolvePlanV2Service } from "./service-factory";

export type ReadV2Needs = (actorId: string) => Promise<ActiveTypeNeeds | null>;

/** live 时读本人的 v2 生效需求；mock、未配置、表还没迁移（42P01）时为 null。 */
export async function readActiveV2Needs(actorId: string, mode?: ModuleMode | string): Promise<ActiveTypeNeeds | null> {
  const resolution = resolvePlanV2Service({ actorId, mode });
  if (resolution.success === false || resolution.mode !== "live") return null;
  try {
    const result = await resolution.service.activeTypeNeeds();
    return result.plans.length > 0 ? result : null;
  } catch (error) {
    if ((error as { code?: unknown })?.code === "42P01") return null;
    throw error;
  }
}

export function mergeActivePlanNeeds(v1: PlanSnapshot | null, v2: ActiveTypeNeeds | null): PlanSnapshot | null {
  if (!v2 || v2.plans.length === 0) return v1;
  const items: PlanItem[] = v2.needs
    .filter((need) => !need.skipped)
    .map((need, index) => ({
      answer: null,
      carriedFromItemId: null,
      completedAt: null,
      contactLinks: need.contactLinks,
      createdAt: v2.plans.find((plan) => plan.planId === need.planId)?.createdAt ?? "",
      criteria: { description: need.description, primaryIndustryId: need.primaryIndustryId, secondaryIndustryId: need.secondaryIndustryId, targetCount: need.targetCount, titleKeywords: [] },
      deferralCount: 0,
      detail: need.description,
      id: need.itemId,
      kind: "network_need",
      linkedContactIds: need.contactLinks.map((link) => link.contactId),
      linkedEventId: null,
      meta: { planModel: 2 },
      phaseKey: null,
      planId: need.planId,
      sortKey: 100_000 + index,
      status: needStatus(need.contactLinks),
      suggestedWeek: null,
      title: need.title,
      updatedAt: v2.plans.find((plan) => plan.planId === need.planId)?.updatedAt ?? "",
    }));
  if (v1) return { ...v1, items: [...v1.items, ...items] };
  const head = v2.plans[0]!;
  return {
    items,
    log: [],
    plan: {
      analysis: {},
      archivedAt: null,
      createdAt: head.createdAt,
      goalSnapshot: v2.plans.map((plan) => plan.goalText).join(" / "),
      horizon: "year",
      id: head.planId,
      phases: [],
      previousPlanId: null,
      sourceSessionId: null,
      startsOn: head.startsOn,
      status: "active",
      updatedAt: head.updatedAt,
      version: 0,
    },
  };
}

/** 合并后的生效需求里关联过的联系人（R11 的 `goalRelated` 筛选用）：v1 需求 + v2 各目标的人物类型，去重排序。 */
export function goalRelatedContactIds(snapshot: Pick<PlanSnapshot, "items"> | null): string[] {
  if (!snapshot) return [];
  const ids = new Set<string>();
  for (const item of snapshot.items) {
    if (item.kind !== "network_need") continue;
    for (const link of item.contactLinks) ids.add(link.contactId);
  }
  return [...ids].sort();
}

/** R11 用：本人和生效目标有关的联系人（live 时含 v2；读不到计划时为空）。 */
export async function planGoalRelatedContactIds(actorId: string, deps: { readV1?: () => Promise<PlanSnapshot | null>; readV2?: ReadV2Needs } = {}): Promise<string[]> {
  const v1 = deps.readV1 ? await deps.readV1() : await readV1Current(actorId);
  const v2 = deps.readV2 ? await deps.readV2(actorId) : await readActiveV2Needs(actorId, "live");
  return goalRelatedContactIds(mergeActivePlanNeeds(v1, v2));
}

async function readV1Current(actorId: string): Promise<PlanSnapshot | null> {
  const { resolvePlanService } = await import("../service-factory");
  const resolution = resolvePlanService({ actorId, mode: "live" });
  if (resolution.success === false) return null;
  try {
    return await resolution.service.getCurrent();
  } catch (error) {
    if ((error as { code?: unknown })?.code === "42P01") return null;
    throw error;
  }
}
