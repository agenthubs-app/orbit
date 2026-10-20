import { z } from "zod";

import type { OrbitApiClient } from "./client";
import type { ProfileOnboardingProgressCommandContract } from "./contract/profile";

export const PROFILE_ONBOARDING_PROGRESS_PATH = "/api/profile/onboarding-progress";

const progressSchema = z.object({
  version: z.literal(1),
  currentScreen: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
  lastConfirmedScreen: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  finishedAt: z.string().nullable(),
  deferred: z.boolean(),
  revision: z.string(),
});
export type AppProfileOnboardingProgress = z.infer<typeof progressSchema>;
type ProgressResult = { ok: true; progress: AppProfileOnboardingProgress | null } | { ok: false; kind: "offline" | "failed" };

export async function readProfileOnboardingProgress(client: OrbitApiClient): Promise<ProgressResult> {
  const response = await client.get<unknown>(PROFILE_ONBOARDING_PROGRESS_PATH);
  if (!response.success || response.status < 200 || response.status >= 300) {
    return { ok: false, kind: !response.success && response.error.code === "ORBIT_APP_NETWORK_ERROR" ? "offline" : "failed" };
  }
  if (response.data === null) return { ok: true, progress: null };
  const parsed = progressSchema.safeParse(response.data);
  return parsed.success ? { ok: true, progress: parsed.data } : { ok: false, kind: "failed" };
}

export async function updateProfileOnboardingProgress(
  client: OrbitApiClient,
  command: ProfileOnboardingProgressCommandContract,
): Promise<ProgressResult> {
  const response = await client.post<unknown>(PROFILE_ONBOARDING_PROGRESS_PATH, { body: command });
  if (!response.success || response.status < 200 || response.status >= 300) {
    return { ok: false, kind: !response.success && response.error.code === "ORBIT_APP_NETWORK_ERROR" ? "offline" : "failed" };
  }
  const parsed = progressSchema.safeParse(response.data);
  if (!parsed.success) return { ok: false, kind: "failed" };
  const readback = await readProfileOnboardingProgress(client);
  return readback.ok && readback.progress?.revision === parsed.data.revision ? readback : { ok: false, kind: "failed" };
}
