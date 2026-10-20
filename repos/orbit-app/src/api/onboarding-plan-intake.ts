import type { PlanGoalKind } from "./contract/plan-v2";
import { planFlowHref } from "./compute/plan-href";
import type { PlanApi } from "../screens/plan/plan-api";

type IntakeApi = Pick<PlanApi, "listIntakes" | "getIntake" | "createIntake">;
export type OnboardingIntakeResult = { ok: true; href: string } | { ok: false; kind: "read" | "create" | "contract" };

function appHref(view: { href: string; intakeId: string; goal: string; goalKind: string; source: string }, goal: string, kind: PlanGoalKind): string | null {
  if (view.source !== "onboarding" || view.goal !== goal || view.goalKind !== kind || !view.intakeId) return null;
  const expected = planFlowHref("app", view.intakeId);
  return view.href === expected ? expected : null;
}

export async function resumeOrCreateAppOnboardingIntake(api: IntakeApi, input: {
  goalText: string; goalKind: PlanGoalKind; idempotencyKey: string;
}): Promise<OnboardingIntakeResult> {
  const goal = input.goalText.trim();
  if (!goal || !input.idempotencyKey.trim()) return { ok: false, kind: "contract" };
  const listed = await api.listIntakes();
  if (!listed.ok) return { ok: false, kind: "read" };
  for (const item of listed.data.intakes) {
    if (item.goal !== goal) continue;
    const detail = await api.getIntake(item.intakeId);
    if (!detail.ok) return { ok: false, kind: "read" };
    if (detail.data.source !== "onboarding" || detail.data.goalKind !== input.goalKind) continue;
    const href = appHref(detail.data, goal, input.goalKind);
    return href ? { ok: true, href } : { ok: false, kind: "contract" };
  }
  const created = await api.createIntake({ goalText: goal, goalKind: input.goalKind, source: "onboarding", idempotencyKey: input.idempotencyKey });
  if (!created.ok) return { ok: false, kind: "create" };
  const href = appHref(created.data, goal, input.goalKind);
  return href ? { ok: true, href } : { ok: false, kind: "contract" };
}
