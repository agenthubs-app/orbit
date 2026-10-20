import { z } from "zod";

import type { OrbitApiClient } from "./client";
import type { GuideProgressContract } from "./contract/guide";
import { readOnboardingProfile } from "./profile-onboarding";

export const GUIDE_PROGRESS_PATH = "/api/guide/progress";

const guideProgressSchema = z.object({
  snapshot: z.object({
    completedAt: z.string().nullable(),
    confirmedContacts: z.number().int().nonnegative(),
    currentStep: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
    grandfathered: z.boolean(),
    hasActivePlan: z.boolean(),
    step1Skipped: z.boolean(),
    contactSamples: z.array(z.object({ displayName: z.string(), organization: z.string().nullable(), role: z.string().nullable() })),
  }),
  relationshipGoal: z.string(),
  flags: z.object({ contacts: z.boolean(), goal: z.boolean(), plan: z.boolean() }),
  completed: z.number().int().min(0).max(3),
});

export type AppGuideProgress = GuideProgressContract;
export type AppGuideProgressResult = { ok: true; data: AppGuideProgress } | { ok: false; kind: "offline" | "failed" };

/** A saved later step never skips an unfinished earlier step. */
export function nextAppGuideStep(flags: AppGuideProgress["flags"]): "contacts" | "goal" | "plan" | null {
  return !flags.contacts ? "contacts" : !flags.goal ? "goal" : !flags.plan ? "plan" : null;
}

export async function readAppGuideProgress(client: OrbitApiClient): Promise<AppGuideProgressResult> {
  const result = await client.get<unknown>(GUIDE_PROGRESS_PATH);
  if (!result.success || result.status < 200 || result.status >= 300) {
    return { ok: false, kind: !result.success && result.error.code === "ORBIT_APP_NETWORK_ERROR" ? "offline" : "failed" };
  }
  const parsed = guideProgressSchema.safeParse(result.data);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, kind: "failed" };
}

export async function readAppGuideEntry(client: OrbitApiClient): Promise<
  { kind: "ready"; guide: AppGuideProgress } | { kind: "onboarding" | "failed" }
> {
  const profile = await readOnboardingProfile(client);
  if (!profile.ok) return { kind: "failed" };
  if (profile.detail.onboarding?.status !== "complete") return { kind: "onboarding" };
  const progress = await readAppGuideProgress(client);
  return progress.ok ? { kind: "ready", guide: progress.data } : { kind: "failed" };
}
