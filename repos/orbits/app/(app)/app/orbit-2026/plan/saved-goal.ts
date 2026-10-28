"use client";

// Onboarding step 2 saves the goal only on the profile (`relationshipGoal`); a plan is made
// separately. Screens that have no plan yet read the saved goal so they can say "make a plan
// from your goal" instead of asking for a goal the person already gave, and the goal input
// starts from it.
import { useEffect, useState } from "react";

import { firstProfileGoalForPlan, type ProfileGoalPlanKind } from "../../../../../shared/compute/profile-onboarding-goal";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";

export type SavedPlanGoal = { text: string; suggestedKind: ProfileGoalPlanKind | null };

// The last answer lives in the site's read cache (per account, cleared on sign-out, stale after a write);
// younger than FRESH.slow it is not read again. Readers mounting together share one request.
const GOAL_KEY = "plan:saved-goal";
let inFlight: Promise<SavedPlanGoal | null> | undefined;

export async function readSavedPlanGoal(fetcher: typeof fetch = fetch): Promise<SavedPlanGoal | null> {
  const response = await fetcher("/api/profile", { cache: "no-store" });
  const body = await response.json() as { success?: boolean; data?: { profile?: { relationshipGoal?: string | null } | null } };
  if (!response.ok || body.success !== true) throw new Error("PROFILE_UNAVAILABLE");
  const goal = firstProfileGoalForPlan(body.data?.profile?.relationshipGoal ?? "");
  return goal.text.trim() ? { text: goal.text.trim(), suggestedKind: goal.suggestedKind } : null;
}

/**
 * The same read, telling "not answered yet" (undefined) from "no goal" (null), for a block that must
 * wait for it rather than redraw when it lands. A failed read answers null (a previous answer stays).
 */
export function useSavedPlanGoalAnswer(enabled = true): SavedPlanGoal | null | undefined {
  const [goal, setGoal] = useState<SavedPlanGoal | null | undefined>(() => lastAnswer<{ goal: SavedPlanGoal | null }>(GOAL_KEY)?.goal);
  useEffect(() => {
    if (!enabled || answerFresh(GOAL_KEY, FRESH.slow)) return;
    let alive = true;
    inFlight ??= readSavedPlanGoal().finally(() => { inFlight = undefined; });
    void inFlight.then((value) => { rememberAnswer(GOAL_KEY, { goal: value }); if (alive) setGoal(value); })
      .catch(() => { if (alive) setGoal((current) => current === undefined ? null : current); });
    return () => { alive = false; };
  }, [enabled]);
  return goal;
}

/** The goal saved on the profile (first one, as the plan step reads it); null while loading or when there is none. */
export function useSavedPlanGoal(enabled = true): SavedPlanGoal | null {
  return useSavedPlanGoalAnswer(enabled) ?? null;
}
