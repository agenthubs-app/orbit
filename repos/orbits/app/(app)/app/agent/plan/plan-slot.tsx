/**
 * R07 review M5, product decision (a) (2026-10-10): Task › プラン shows the existing
 * 「我的计划」 screen (IOrbitPlan, W0009–W0021) until R25 rewrites the segment. This is
 * the composition the old /app/agent/plan page did, moved here unchanged:
 * the guide's sample plan, the actor's current plan with contact names and
 * tracking, or 「计划暂时读不到」. Only a person with no plan gets null — the Task
 * container then shows the 「目標を決める」 empty state, whose button goes where
 * the old empty plan pointed (`/app/start` with the guide on, else `/app/agent`).
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
import { createProfileService } from "../../../../../features/profile/service-factory";
import { readGuideDemoConfig } from "../../../../../shared/config/guide-demo";
import { resolveModuleMode } from "../../../../../shared/services/module-mode";
import { readDemoModeViewForActor } from "../../_demo/demo-guide-view";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
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

/** The プラン segment for this actor: the plan screen, or null when there is no plan yet. */
export async function loadPlanSlot(actor: { id: string }, userId: string): Promise<ReactNode | null> {
  const frame = (node: ReactNode) => <><OrbitReferenceStyles /><OrbitVisualFreezeRuntime />{node}</>;
  const guide = await readDemoModeViewForActor({ actorId: actor.id, userId });
  if (guide) return frame(<IOrbitPlan guide={guide} guideEnabled initialSnapshot={null} />);
  const { service, snapshot } = await readCurrentPlan(actor.id);
  if (snapshot === null) return null;
  const [contactNames, tracking] = await Promise.all([readContactNames(actor.id, snapshot), readTracking(actor.id, service, snapshot)]);
  return frame(<IOrbitPlan contactNames={contactNames} guideEnabled={readGuideDemoConfig().enabled} initialSnapshot={snapshot} tracking={tracking} />);
}
