/**
 * R07 review M5, product decision (a) (2026-10-10): Task › プラン shows the existing
 * 「我的计划」 screen (IOrbitPlan, W0009–W0021) until R25 rewrites the segment. This is
 * the composition the old /app/agent/plan page did, moved here unchanged:
 * the guide's sample plan, the actor's current plan with contact names and
 * tracking, or 「计划暂时读不到」.
 *
 * R23: with neither a v2 nor a v1 plan the person gets the goal input (目標入力)
 * instead of null. R24: an active v2 plan shows the プラン概要 (it replaces R23's
 * minimal 「已確定」 card). The guide / demo branch is unchanged.
 */
import type { ReactNode } from "react";

import {
  planContactIds,
  readPlanContactNames,
  readPlanPeriodContacts,
  type PlanContactName,
} from "../../../../../features/plans/contact-names";
import type { PlanService, PlanViewSnapshot } from "../../../../../features/plans/contract";
import { isAiPlanGeneratorConfigured } from "../../../../../features/plans/generator-service-factory";
import { planWeekState } from "../../../../../features/plans/week";
import { resolvePlanV2Service } from "../../../../../features/plans/v2/service-factory";
import { createProfileService } from "../../../../../features/profile/service-factory";
import { redesignContractMode } from "../../../../../features/redesign-contracts/route";
import { readGuideDemoConfig } from "../../../../../shared/config/guide-demo";
import { resolveModuleMode } from "../../../../../shared/services/module-mode";
import { readDemoModeViewForActor } from "../../_demo/demo-guide-view";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { pickActiveV2Plan, type ActivePlanCard } from "../../orbit-2026/plan/plan-model";
import { PlanGoalEntry } from "../../orbit-2026/plan/PlanGoalEntry";
import { PlanOverview } from "../../orbit-2026/plan/PlanOverview";
import { PlanSlotError } from "../../orbit-2026/plan/PlanSlotError";
import { IOrbitPlan } from "../iorbit-0918/iorbit-plan";
import type { PlanTrackingInput } from "./plan-route-view-model";
import { readCurrentPlan } from "./read-current-plan";

async function readTracking(actorId: string, service: PlanService | null, snapshot: PlanViewSnapshot | null | "unavailable"): Promise<PlanTrackingInput | null> {
  if (!service || !snapshot || snapshot === "unavailable") return null;
  // Each read degrades on its own: no quota → button disabled; no goal → no hint; no contacts → review falls back.
  const settle = <T,>(read: () => Promise<T>): Promise<T | null> => Promise.resolve().then(read).catch(() => null);
  const [quota, goal, periodContacts] = await Promise.all([
    settle(async () => (await service.reanalysisQuota()).remaining),
    settle(async () => {
      const result = await createProfileService(resolveModuleMode()).getProfile({ actorId });
      return result.success ? result.data.profile?.relationshipGoal ?? null : null;
    }),
    settle(async () =>
      planWeekState(snapshot.plan, new Date()).ended
        ? readPlanPeriodContacts(actorId, new Date(`${snapshot.plan.startsOn}T00:00:00+09:00`).toISOString())
        : null),
  ]);
  return { aiProvider: isAiPlanGeneratorConfigured(), currentGoal: goal, periodContacts, quotaRemaining: quota };
}

async function readContactNames(actorId: string, snapshot: PlanViewSnapshot | null | "unavailable"): Promise<Record<string, PlanContactName>> {
  if (!snapshot || snapshot === "unavailable") return {};
  try { return await readPlanContactNames(actorId, planContactIds(snapshot)); } catch { return {}; }
}

/** Where the 「目標を決める」 empty state sends a person with no plan. */
export function planStartHref(): string {
  return readGuideDemoConfig().enabled ? "/app/start" : "/app/agent";
}

/**
 * The actor's active v2 plan (same mode as `GET /api/agent/plans/v2/summary`). Not set
 * up at all (no v2 service: 「尚未実装」) → null, the slot carries on; a read that
 * fails → "unavailable", the slot shows an error with retry (R23 review m10).
 */
async function readActiveV2Plan(actorId: string): Promise<ActivePlanCard | null | "unavailable"> {
  try {
    const resolution = resolvePlanV2Service({ actorId, mode: redesignContractMode("plan-v2-summary") });
    if (resolution.success === false) return null;
    return pickActiveV2Plan(await resolution.service.summary());
  } catch {
    return "unavailable";
  }
}

/** The プラン segment for this actor: the v2 overview, the v1 plan screen, or the goal input. */
export async function loadPlanSlot(actor: { id: string }, userId: string): Promise<ReactNode | null> {
  const frame = (node: ReactNode) => <><OrbitReferenceStyles /><OrbitVisualFreezeRuntime />{node}</>;
  const guide = await readDemoModeViewForActor({ actorId: actor.id, userId });
  if (guide) return frame(<IOrbitPlan guide={guide} guideEnabled initialSnapshot={null} />);
  const active = await readActiveV2Plan(actor.id);
  if (active === "unavailable") return <PlanSlotError />;
  if (active) return <PlanOverview planId={active.planId} />;
  const { service, snapshot } = await readCurrentPlan(actor.id);
  if (snapshot === null) return <PlanGoalEntry />;
  const [contactNames, tracking] = await Promise.all([readContactNames(actor.id, snapshot), readTracking(actor.id, service, snapshot)]);
  return frame(<IOrbitPlan contactNames={contactNames} guideEnabled={readGuideDemoConfig().enabled} initialSnapshot={snapshot} tracking={tracking} />);
}
