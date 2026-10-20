import type { PlanGoalKind } from "../../../../shared/contract/plan-v2";
import { planFlowHref } from "../../../../shared/compute/plan-href";

const ROOT = "/api/agent/plans/intakes";

export class OnboardingIntakeError extends Error {
  constructor(readonly code: "READ_FAILED" | "CREATE_FAILED" | "CONTRACT_ERROR") { super(code); }
}

async function data(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await response.json(); } catch { throw new OnboardingIntakeError("CONTRACT_ERROR"); }
  if (!response.ok || !body || typeof body !== "object" || (body as { success?: unknown }).success !== true) {
    throw new OnboardingIntakeError("READ_FAILED");
  }
  const value = (body as { data?: unknown }).data;
  if (!value || typeof value !== "object") throw new OnboardingIntakeError("CONTRACT_ERROR");
  return value as Record<string, unknown>;
}

function validatedHref(detail: Record<string, unknown>, goalText: string, goalKind: PlanGoalKind): string {
  if (detail.source !== "onboarding" || detail.goal !== goalText || detail.goalKind !== goalKind || typeof detail.intakeId !== "string" || !detail.intakeId) {
    throw new OnboardingIntakeError("CONTRACT_ERROR");
  }
  const expected = planFlowHref("web", detail.intakeId);
  if (detail.href !== expected) throw new OnboardingIntakeError("CONTRACT_ERROR");
  return expected;
}

export async function resumeOrCreateOnboardingIntake(input: {
  fetcher?: typeof fetch;
  goalText: string;
  goalKind: PlanGoalKind;
  idempotencyKey: string;
  language: string;
}): Promise<string> {
  const fetcher = input.fetcher ?? fetch;
  const goalText = input.goalText.trim();
  if (!goalText || !input.idempotencyKey.trim()) throw new OnboardingIntakeError("CONTRACT_ERROR");
  const headers = { accept: "application/json", "x-orbit-lang": input.language, "x-orbit-platform": "web" };
  const list = await data(await fetcher(ROOT, { cache: "no-store", headers }));
  if (!Array.isArray(list.intakes)) throw new OnboardingIntakeError("CONTRACT_ERROR");
  for (const candidate of list.intakes) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    if (item.goal !== goalText || typeof item.intakeId !== "string") continue;
    const detail = await data(await fetcher(`${ROOT}/${encodeURIComponent(item.intakeId)}`, { cache: "no-store", headers }));
    if (detail.source !== "onboarding" || detail.goalKind !== input.goalKind) continue;
    return validatedHref(detail, goalText, input.goalKind);
  }
  const created = await data(await fetcher(ROOT, {
    body: JSON.stringify({ goalText, goalKind: input.goalKind, source: "onboarding", idempotencyKey: input.idempotencyKey }),
    headers: { ...headers, "content-type": "application/json" },
    method: "POST",
  }));
  return validatedHref(created, goalText, input.goalKind);
}
