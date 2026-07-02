import type { OrbitProfileViewModel } from "../../orbit-profile-route-view-model";
import type { AppProfileRouteViewModel } from "./profile-route-view-model";

function splitHeadline(value: string): { company: string; title: string } {
  const [title, company] = value.split("·").map((part) => part.trim());

  return {
    company: company || "",
    title: title || value,
  };
}

export function profileRouteToOrbitProfileViewModel(
  routeModel: Extract<AppProfileRouteViewModel, { state: "success" }>,
): OrbitProfileViewModel {
  const profile = routeModel.profile.profile;
  const headlineParts = splitHeadline(profile.headline);
  const company = profile.organization || headlineParts.company;
  const title = profile.role || headlineParts.title;
  const offeringTags = Array.from(
    new Set([
      ...profile.preferredIntroChannels,
      routeModel.profile.action.preferredChannels,
      routeModel.profile.nextProfileFieldLabel,
      "relationship context",
    ].filter(Boolean)),
  );
  const seekingTags = Array.from(
    new Set([
      profile.relationshipGoal,
      profile.homeMarket,
      ...profile.targetRelationshipTypes,
      "relevant introductions",
    ].filter(Boolean)),
  );
  const topics = Array.from(
    new Set([
      ...profile.targetRelationshipTypes,
      profile.homeMarket,
      routeModel.profile.reviewSummary,
      "follow-up",
      "warm introductions",
    ].filter(Boolean)),
  );

  return {
    industries: Array.from(
      new Set([
        profile.homeMarket,
        ...profile.targetRelationshipTypes,
        "Relationship operations",
        "Community",
      ].filter(Boolean)),
    ),
    offeringTags,
    profile: {
      bio: `${title} working from ${company || profile.homeMarket}.`,
      company,
      email: "",
      fullName: profile.displayName,
      headline: profile.headline,
      industry: profile.homeMarket || profile.targetRelationshipTypes[0] || "Relationship operations",
      intro: profile.relationshipGoal,
      lineId: "",
      offering: profile.preferredIntroChannels.slice(0, 3),
      seeking: profile.targetRelationshipTypes.slice(0, 3),
      title,
      topics: topics.slice(0, 5),
      wechatName: "",
    },
    seekingTags,
    topics,
  };
}
