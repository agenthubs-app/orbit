import type {
  ManualProfileContract,
  PublicProfileProjectionContract,
} from "../../shared/contract/profile";

// Runtime projection stays in the profile feature. Its explicit allowlist
// excludes private fields such as birthDate, handles, and follow-up settings.
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
