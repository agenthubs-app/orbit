import type { z } from "zod";
import { profileOnboardingSchema } from "../../api/profile-detail-contract";
import { profileAccountSchema } from "../../api/schema/profile-account";

// Preserve the existing completion-gate metadata without expanding the shared R18a contract.
export const accountScreenResponseSchema = profileAccountSchema.extend({ onboarding: profileOnboardingSchema.optional().catch(undefined) });
export type AccountProfileData = z.infer<typeof accountScreenResponseSchema>;
export function accountCompletionDestination(data: unknown, next: string | null | undefined, offline: boolean): string | null {
  if (!next || offline || !data || typeof data !== "object") return null;
  const result = profileOnboardingSchema.safeParse((data as { onboarding?: unknown }).onboarding);
  return result.success && result.data.status === "complete" ? next : null;
}
