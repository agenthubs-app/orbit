/**
 * R07 review M5, product decision (a) (2026-10-10): Task › プラン is the plan segment.
 *
 * R23: with no plan the person gets the goal input (目標入力). R24: an active v2 plan
 * shows the プラン概要. R25: `?plan=` picks which active goal (the switcher calls
 * `open` first, so the home widget follows); `?new=1` opens the goal input directly
 * (it explains the 2-goal limit itself); someone with only a v1 plan sees the
 * read-only 「以前のプラン」 card instead of the old plan screen (v1 creation is closed).
 * The guide / demo branch is unchanged.
 */
import type { ReactNode } from "react";

import type { PlanLegacyItem, PlanV2SummaryResponse } from "../../../../../shared/contract/plan-v2";
import { planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { resolvePlanV2Service } from "../../../../../features/plans/v2/service-factory";
import { redesignContractMode } from "../../../../../features/redesign-contracts/route";
import { readGuideDemoConfig } from "../../../../../shared/config/guide-demo";
import { readDemoModeViewForActor } from "../../_demo/demo-guide-view";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { pickActiveV2Plan, type ActivePlanCard } from "../../orbit-2026/plan/plan-model";
import { PlanGoalEntry } from "../../orbit-2026/plan/PlanGoalEntry";
import { PlanLegacyCard } from "../../orbit-2026/plan/PlanLegacy";
import { PlanOverview } from "../../orbit-2026/plan/PlanOverview";
import { PlanSlotError } from "../../orbit-2026/plan/PlanSlotError";
import { IOrbitPlan } from "../iorbit-0918/iorbit-plan";

/** Where the 「目標を決める」 empty state sends a person with no plan. */
export function planStartHref(): string {
  return readGuideDemoConfig().enabled ? "/app/start" : "/app/agent";
}

type V2State = { summary: PlanV2SummaryResponse; legacy: readonly PlanLegacyItem[] };

/**
 * The actor's v2 goals and v1 plans (same mode as `GET /api/agent/plans/v2/summary`).
 * Not set up at all (no v2 service: 「尚未実装」) → null, the slot carries on; a read
 * that fails → "unavailable", the slot shows an error with retry (R23 review m10).
 */
async function readV2State(actorId: string): Promise<V2State | null | "unavailable"> {
  try {
    const resolution = resolvePlanV2Service({ actorId, mode: redesignContractMode("plan-v2-summary") });
    if (resolution.success === false) return null;
    const summary = await resolution.service.summary();
    // 以前のプラン is only needed when no v2 goal is active; a failed read there just hides the card.
    const legacy = pickActiveV2Plan(summary) ? [] : await resolution.service.legacyList().then((list) => list.plans).catch(() => []);
    return { legacy, summary };
  } catch {
    return "unavailable";
  }
}

/** `?plan=` when it names an active goal, else the most recently opened one. */
function chooseActive(summary: PlanV2SummaryResponse | null, planId: string | null | undefined): ActivePlanCard | null {
  const asked = planId ? summary?.goals.find((goal) => goal.planId === planId && goal.status === "active") : null;
  if (asked) return { goal: asked.goal, goalKind: asked.goalKind, planId: asked.planId, total: asked.total };
  return pickActiveV2Plan(summary);
}

/** The プラン segment for this actor: the v2 overview, the goal input, or 以前のプラン. */
export async function loadPlanSlot(actor: { id: string }, userId: string, options: { planId?: string | null; newGoal?: boolean } = {}): Promise<ReactNode | null> {
  const frame = (node: ReactNode) => <><OrbitReferenceStyles /><OrbitVisualFreezeRuntime />{node}</>;
  const guide = await readDemoModeViewForActor({ actorId: actor.id, userId });
  if (guide) return frame(<IOrbitPlan guide={guide} guideEnabled initialSnapshot={null} />);
  const state = await readV2State(actor.id);
  if (state === "unavailable") return <PlanSlotError />;
  const active = chooseActive(state?.summary ?? null, options.planId);
  if (options.newGoal) return <PlanGoalEntry backHref={active ? planTaskSegmentHref("web", active.planId) : undefined} />;
  if (active) return <PlanOverview planId={active.planId} />;
  const legacy = state?.legacy.find((plan) => plan.status === "active") ?? state?.legacy[0] ?? null;
  if (legacy) return <PlanLegacyCard plan={legacy} />;
  return <PlanGoalEntry />;
}
