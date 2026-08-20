import type { MobileAuthUser } from "../api/mobile-auth";
import type { ProfileSummary } from "./profile";

const XIAOYU_AUTH_USER_ID = "user_mry5y200_58jpi8";

const xiaoyuProfile: Omit<ProfileSummary, "timezone"> = {
  bio: "Orbit 创始人，专注用 AI 帮助企业重构业务流程、提升效率并降低运营成本。",
  displayName: "小雨",
  headline: "Orbit 创始人 · 企业 AI 应用顾问",
  industry: "企业 AI 应用",
  offering: [
    "企业 AI 场景梳理与落地",
    "业务流程自动化与降本增效",
    "中日企业、技术与服务商资源对接"
  ],
  organization: "Orbit",
  relationshipGoal:
    "连接有真实业务场景的企业与合作伙伴，通过资源互换推进可落地的合作。",
  role: "创始人",
  seeking: [
    "希望用 AI 改造业务流程的企业决策者",
    "具备行业场景与落地需求的合作伙伴",
    "中日跨境业务与生态伙伴"
  ],
  topics: ["企业 AI 落地", "Agent 工作流", "中日商业合作"]
};

function hasChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function preferredText(current: string, fallback: string): string {
  return hasChinese(current) ? current : fallback;
}

function preferredList(current: string[], fallback: string[]): string[] {
  return current.some(hasChinese) ? current : fallback;
}

export function mobileUserDisplayName(
  user: MobileAuthUser | null | undefined,
  fallback = ""
): string {
  if (user?.id === XIAOYU_AUTH_USER_ID) {
    return xiaoyuProfile.displayName;
  }

  return user?.name.trim() || fallback;
}

export function profileSummaryForMobileUser(
  profile: ProfileSummary,
  user: MobileAuthUser | null | undefined
): ProfileSummary {
  if (!user) {
    return profile;
  }

  if (user.id !== XIAOYU_AUTH_USER_ID) {
    return {
      ...profile,
      displayName: mobileUserDisplayName(user, profile.displayName)
    };
  }

  return {
    bio: preferredText(profile.bio, xiaoyuProfile.bio),
    displayName: xiaoyuProfile.displayName,
    headline: preferredText(profile.headline, xiaoyuProfile.headline),
    industry: preferredText(profile.industry, xiaoyuProfile.industry),
    offering: preferredList(profile.offering, xiaoyuProfile.offering),
    organization: preferredText(
      profile.organization,
      xiaoyuProfile.organization
    ),
    relationshipGoal: preferredText(
      profile.relationshipGoal,
      xiaoyuProfile.relationshipGoal
    ),
    role: preferredText(profile.role, xiaoyuProfile.role),
    seeking: preferredList(profile.seeking, xiaoyuProfile.seeking),
    timezone: profile.timezone,
    topics: preferredList(profile.topics, xiaoyuProfile.topics)
  };
}
