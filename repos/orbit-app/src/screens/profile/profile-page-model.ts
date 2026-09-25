import type {
  ManualProfileContract,
  PublicProfileProjectionContract,
} from "../../api/contract/profile";
import {
  normalizeProfileTagValues,
  type ProfileEditSession,
} from "../../data/profile-edit-session";

export function projectPublicProfile(
  profile: ManualProfileContract,
): PublicProfileProjectionContract {
  return {
    id: profile.id,
    displayName: profile.displayName,
    headline: profile.headline,
    organization: profile.organization,
    role: profile.role,
    homeMarket: profile.homeMarket,
    relationshipGoal: profile.relationshipGoal,
    targetRelationshipTypes: [...profile.targetRelationshipTypes],
    preferredIntroChannels: [...profile.preferredIntroChannels],
    ...(profile.primaryIndustryId !== undefined
      ? { primaryIndustryId: profile.primaryIndustryId }
      : {}),
    ...(profile.secondaryIndustryId !== undefined
      ? { secondaryIndustryId: profile.secondaryIndustryId }
      : {}),
    ...(profile.industry !== undefined ? { industry: profile.industry } : {}),
    ...(profile.bio !== undefined ? { bio: profile.bio } : {}),
    ...(profile.offering !== undefined ? { offering: [...profile.offering] } : {}),
    ...(profile.seeking !== undefined ? { seeking: [...profile.seeking] } : {}),
    ...(profile.topics !== undefined ? { topics: [...profile.topics] } : {}),
    ...(profile.spokenLanguages !== undefined
      ? { spokenLanguages: [...profile.spokenLanguages] }
      : {}),
    updatedAt: profile.updatedAt,
  };
}

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
