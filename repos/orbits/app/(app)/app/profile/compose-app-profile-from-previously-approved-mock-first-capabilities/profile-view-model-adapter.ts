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
  const offering = [...(profile.offering ?? [])];
  const seeking = [...(profile.seeking ?? [])];
  const profileTopics = [...(profile.topics ?? [])];
  const offeringTags = Array.from(
    new Set([
      ...offering,
      ...profile.preferredIntroChannels,
    ].filter(Boolean)),
  );
  const seekingTags = Array.from(
    new Set([
      ...seeking,
      profile.relationshipGoal,
      profile.homeMarket,
      ...profile.targetRelationshipTypes,
    ].filter(Boolean)),
  );
  const topics = Array.from(
    new Set([
      ...profileTopics,
      ...profile.targetRelationshipTypes,
      profile.homeMarket,
    ].filter(Boolean)),
  );

  return {
    industries: Array.from(
      new Set([
        profile.industry ?? "",
        profile.homeMarket,
        ...profile.targetRelationshipTypes,
      ].filter(Boolean)),
    ),
    offeringTags,
    profile: {
      bio: profile.bio ?? "",
      company,
      email: profile.handles?.email ?? "",
      fullName: profile.displayName,
      headline: profile.headline,
      industry: profile.industry ?? profile.homeMarket,
      intro: profile.relationshipGoal,
      lineId: profile.handles?.lineId ?? "",
      offering,
      seeking,
      title,
      topics: profileTopics,
      wechatName: profile.handles?.wechatId ?? "",
    },
    seekingTags,
    topics,
  };
}
