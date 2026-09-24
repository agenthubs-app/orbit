import type { ProfileOnboardingContract } from "../../../../shared/contract/profile";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import {
  resolveAuthenticatedApiActorFromSession,
  type AuthenticatedApiSessionIdentity,
} from "../../../api/_shared/authenticated-actor";
import type { ProfileService } from "../../../../features/profile/service";

export type ProfileOnboardingAccessStatus =
  | "complete"
  | "incomplete"
  | "unavailable";

export interface ProfileOnboardingAccessResult {
  actorId?: string;
  status: ProfileOnboardingAccessStatus;
}

export function isProfileOnboardingContract(
  value: unknown,
): value is ProfileOnboardingContract {
  if (!value || typeof value !== "object") return false;
  const onboarding = value as Partial<ProfileOnboardingContract>;

  return (
    onboarding.policyVersion === 1 &&
    (onboarding.status === "complete" || onboarding.status === "incomplete") &&
    Array.isArray(onboarding.missingFields)
  );
}

function unavailable(): ProfileOnboardingAccessResult {
  return { status: "unavailable" };
}

/**
 * Read only the persisted actor-scoped profile used by the page gate.
 *
 * Keep the profile service factory behind the live and canonical-actor
 * checks: importing it also imports optional extraction and signal services.
 * This helper never redirects, writes, or invokes those optional services.
 */
export async function readProfileOnboardingAccess(
  session: AuthenticatedApiSessionIdentity,
): Promise<ProfileOnboardingAccessResult> {
  if (resolveFeatureMode() !== "live") {
    return unavailable();
  }

  let actor;
  try {
    actor = await resolveAuthenticatedApiActorFromSession(session);
  } catch {
    return unavailable();
  }

  if (!actor) {
    return unavailable();
  }

  let profileService: (mode: "live") => ProfileService;
  try {
    const serviceFactory = await import("../../../../features/profile/service-factory");
    profileService = serviceFactory.createProfileService;
  } catch {
    return unavailable();
  }

  let result: Awaited<ReturnType<ProfileService["getProfile"]>>;
  try {
    const service = profileService("live");
    result = await service.getProfile({ actorId: actor.id });
  } catch {
    return unavailable();
  }

  if (
    !result ||
    result.success !== true ||
    !result.data ||
    !isProfileOnboardingContract(result.data.onboarding)
  ) {
    return unavailable();
  }

  return {
    actorId: actor.id,
    status:
      result.data.profile && result.data.onboarding.status === "complete"
        ? "complete"
        : "incomplete",
  };
}
