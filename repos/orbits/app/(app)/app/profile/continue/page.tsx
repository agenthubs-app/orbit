import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { createProfileService } from "../../../../../features/profile/service-factory";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import type { ProfileOnboardingContract } from "../../../../../shared/contract/profile";
import {
  normalizeProfileOnboardingNext,
  profileOnboardingPath,
} from "../profile-onboarding-navigation";

type ProfileContinueSearchParams = {
  next?: string | string[];
};

function isProfileOnboardingContract(
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

/**
 * The authenticated post-sign-in handoff. It reads only the actor-scoped
 * profile and sends incomplete profiles to the existing editor; optional
 * extraction and suggestions are deliberately outside this navigation path.
 */
export default async function AppProfileContinuePage({
  searchParams,
}: {
  searchParams?: Promise<ProfileContinueSearchParams>;
} = {}) {
  const resolvedSearchParams = await searchParams;
  const next = normalizeProfileOnboardingNext(resolvedSearchParams?.next);
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(next)}`);
  }

  if (resolveFeatureMode() !== "live") {
    redirect(profileOnboardingPath(next));
  }

  let actor;
  try {
    actor = await resolveAuthenticatedApiActorFromSession({
      email: session.user.email,
      name: session.user.name,
      userId: session.user.id,
    });
  } catch {
    actor = null;
  }

  if (!actor) {
    redirect(profileOnboardingPath(next));
  }

  let profileService: ReturnType<typeof createProfileService>;
  try {
    profileService = createProfileService("live");
  } catch {
    redirect(profileOnboardingPath(next));
  }

  let result: Awaited<ReturnType<typeof profileService.getProfile>>;
  try {
    result = await profileService.getProfile({ actorId: actor.id });
  } catch {
    redirect(profileOnboardingPath(next));
  }

  if (
    result.success === false ||
    !isProfileOnboardingContract(result.data.onboarding)
  ) {
    redirect(profileOnboardingPath(next));
  }

  if (result.data.profile && result.data.onboarding.status === "complete") {
    redirect(next);
  }

  redirect(profileOnboardingPath(next));
}
