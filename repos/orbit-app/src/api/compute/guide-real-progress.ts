/** R10/R28 shared projection of the real three-step guide facts. No demo-mode input. */
export type GuideRealStep = "contacts" | "goal" | "plan";

export interface GuideRealFacts {
  completedAt: string | null;
  confirmedContacts: number;
  /** null means the first old-user decision has not been persisted yet. */
  grandfathered: boolean | null;
  hasActivePlan: boolean;
  relationshipGoal: string | null | undefined;
  /** Read-only compatibility with accounts that skipped step 1 before W0054. */
  step1Skipped: boolean;
}

export type GuideRealProgress =
  | { kind: "hidden"; reason: "completed" | "grandfathered" }
  | { kind: "unavailable" }
  | {
    kind: "progress";
    completed: number;
    confirmedContacts: number;
    nextStep: GuideRealStep | null;
    steps: Readonly<Record<GuideRealStep, boolean>>;
  };

const ORDER: readonly GuideRealStep[] = ["contacts", "goal", "plan"];

export function computeGuideRealProgress(facts: GuideRealFacts): GuideRealProgress {
  // A prior completion or the persisted old-user decision is a latch. Losing a
  // contact or plan later must not bring onboarding back.
  if (facts.completedAt) return { kind: "hidden", reason: "completed" };
  if (facts.grandfathered === true) return { kind: "hidden", reason: "grandfathered" };
  if (facts.grandfathered === null || !Number.isSafeInteger(facts.confirmedContacts) || facts.confirmedContacts < 0) {
    return { kind: "unavailable" };
  }
  const steps = {
    contacts: facts.step1Skipped || facts.confirmedContacts >= 3,
    goal: Boolean(facts.relationshipGoal?.trim()),
    plan: facts.hasActivePlan,
  };
  return {
    kind: "progress",
    completed: ORDER.filter((key) => steps[key]).length,
    confirmedContacts: facts.confirmedContacts,
    nextStep: ORDER.find((key) => !steps[key]) ?? null,
    steps,
  };
}
