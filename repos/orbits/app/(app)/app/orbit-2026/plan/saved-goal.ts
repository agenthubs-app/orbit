"use client";

// Onboarding step 2 saves the goal only on the profile (`relationshipGoal`); a plan is made
// separately. Screens that have no plan yet read the saved goal so they can say "make a plan
// from your goal" instead of asking for a goal the person already gave, and the goal input
// starts from it.
import { useEffect, useState } from "react";

import { firstProfileGoalForPlan, type ProfileGoalPlanKind } from "../../../../../shared/compute/profile-onboarding-goal";

export type SavedPlanGoal = { text: string; suggestedKind: ProfileGoalPlanKind | null };

let cached: SavedPlanGoal | null | undefined;
// Readers mounting together share one request.
let inFlight: Promise<SavedPlanGoal | null> | undefined;

export async function readSavedPlanGoal(fetcher: typeof fetch = fetch): Promise<SavedPlanGoal | null> {
  const response = await fetcher("/api/profile", { cache: "no-store" });
  const body = await response.json() as { success?: boolean; data?: { profile?: { relationshipGoal?: string | null } | null } };
  if (!response.ok || body.success !== true) throw new Error("PROFILE_UNAVAILABLE");
  const goal = firstProfileGoalForPlan(body.data?.profile?.relationshipGoal ?? "");
  return goal.text.trim() ? { text: goal.text.trim(), suggestedKind: goal.suggestedKind } : null;
}

/** The goal saved on the profile (first one, as the plan step reads it); null while loading or when there is none. */
export function useSavedPlanGoal(enabled = true): SavedPlanGoal | null {
  const [goal, setGoal] = useState<SavedPlanGoal | null>(cached ?? null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    inFlight ??= readSavedPlanGoal().finally(() => { inFlight = undefined; });
    void inFlight.then((value) => { cached = value; if (alive) setGoal(value); }).catch(() => undefined);
    return () => { alive = false; };
  }, [enabled]);
  return goal;
}
