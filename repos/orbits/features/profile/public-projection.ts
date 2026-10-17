import type {
  ManualProfileContract,
  PublicProfileProjectionContract,
} from "../../shared/contract/profile";

// Runtime projection stays in the profile feature. Its explicit allowlist
// excludes private fields such as birthDate, handles, and follow-up settings.
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
