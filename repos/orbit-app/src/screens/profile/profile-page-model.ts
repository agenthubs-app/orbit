import {
  projectPublicProfile,
  type ManualProfileContract,
  type PublicProfileProjectionContract,
} from "../../api/contract/profile";
import {
  normalizeProfileTagValues,
  type ProfileEditSession,
} from "../../data/profile-edit-session";

export function profileSeekingCandidates(profile: ManualProfileContract): string[] {
  return normalizeProfileTagValues([
    ...(profile.seeking ?? []),
    profile.relationshipGoal,
    ...profile.targetRelationshipTypes,
    ...(profile.topics ?? []),
  ]);
}

export function profilePreviewFromSession(
  session: ProfileEditSession,
  baseProfile: ManualProfileContract,
): PublicProfileProjectionContract {
  const draft = session.draft;
  return projectPublicProfile({
    ...baseProfile,
    bio: draft.bio,
    displayName: draft.displayName,
    headline: draft.headline,
    homeMarket: draft.homeMarket,
    offering: [...draft.offering],
    organization: draft.organization,
    preferredIntroChannels: [...draft.preferredIntroChannels],
    relationshipGoal: draft.relationshipGoal,
    role: draft.role,
    seeking: [...draft.seeking],
    spokenLanguages: [...draft.spokenLanguages],
    targetRelationshipTypes: [...draft.targetRelationshipTypes],
    topics: [...draft.topics],
    ...(draft.industry === undefined ? {} : { industry: draft.industry }),
    ...(draft.primaryIndustryId === undefined
      ? {}
      : { primaryIndustryId: draft.primaryIndustryId }),
    ...(draft.secondaryIndustryId === undefined
      ? {}
      : { secondaryIndustryId: draft.secondaryIndustryId }),
  });
}
