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
  const visibility = profile.publicFields ?? { companyRole: true, offeringSeeking: true, intro: true };
  return {
    id: profile.id,
    displayName: profile.displayName,
    headline: visibility.companyRole ? profile.headline : "",
    organization: visibility.companyRole ? profile.organization : "",
    role: visibility.companyRole ? profile.role : "",
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
    ...(visibility.intro && profile.bio !== undefined ? { bio: profile.bio } : {}),
    ...(visibility.offeringSeeking && profile.offering !== undefined ? { offering: [...profile.offering] } : {}),
    ...(visibility.offeringSeeking && profile.seeking !== undefined ? { seeking: [...profile.seeking] } : {}),
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
    ...(draft.publicFields ? { publicFields: draft.publicFields } : {}),
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
