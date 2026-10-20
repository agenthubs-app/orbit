import { z } from "zod";

import type { OrbitApiClient } from "./client";
import type { GuideProgressContract } from "./contract/guide";

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

export async function readAppGuideProgress(client: OrbitApiClient): Promise<AppGuideProgressResult> {
  const result = await client.get<unknown>(GUIDE_PROGRESS_PATH);
  if (!result.success || result.status < 200 || result.status >= 300) {
    return { ok: false, kind: !result.success && result.error.code === "ORBIT_APP_NETWORK_ERROR" ? "offline" : "failed" };
  }
  const parsed = guideProgressSchema.safeParse(result.data);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, kind: "failed" };
}
