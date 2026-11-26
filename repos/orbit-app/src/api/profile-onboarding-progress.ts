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

export async function readProfileOnboardingSetup(client: OrbitApiClient): Promise<
  { ok: true; progress: AppProfileOnboardingProgress | null; legacyRepair: boolean } | Extract<ProgressResult, { ok: false }>
> {
  const response = await client.get<unknown>(`${PROFILE_ONBOARDING_PROGRESS_PATH}?view=setup`);
  if (!response.success || response.status < 200 || response.status >= 300) {
    return { ok: false, kind: !response.success && response.error.code === "ORBIT_APP_NETWORK_ERROR" ? "offline" : "failed" };
  }
  const setup = z.object({ progress: progressSchema.nullable(), legacyRepair: z.boolean() }).safeParse(response.data);
  if (setup.success) return { ok: true, ...setup.data };
  // A server without the setup view still returns the original progress envelope.
  const progress = progressSchema.nullable().safeParse(response.data);
  return progress.success ? { ok: true, progress: progress.data, legacyRepair: false } : { ok: false, kind: "failed" };
}

export async function updateProfileOnboardingProgress(
  client: OrbitApiClient,
  command: ProfileOnboardingProgressCommandContract,
): Promise<ProgressResult> {
  const response = await client.post<unknown>(PROFILE_ONBOARDING_PROGRESS_PATH, { body: command, headers: { "x-orbit-platform": "app" } });
  if (!response.success || response.status < 200 || response.status >= 300) {
    return { ok: false, kind: !response.success && response.error.code === "ORBIT_APP_NETWORK_ERROR" ? "offline" : "failed" };
  }
  const parsed = progressSchema.safeParse(response.data);
  if (!parsed.success) return { ok: false, kind: "failed" };
  const readback = await readProfileOnboardingProgress(client);
  return readback.ok && readback.progress?.revision === parsed.data.revision ? readback : { ok: false, kind: "failed" };
}
