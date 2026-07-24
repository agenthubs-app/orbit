export interface ProfileSummary {
  bio: string;
  displayName: string;
  headline: string;
  industry: string;
  offering: string[];
  organization: string;
  relationshipGoal: string;
  role: string;
  seeking: string[];
  timezone: string;
  topics: string[];
}

const orbitFounderProfile: ProfileSummary = {
  bio:
    "我是 Orbit 的创始人，主要帮企业把 AI 接进真实业务：销售线索整理、客服知识库、内部检索、运营报表、员工助理和跨系统工作流。很多团队不是缺工具，而是缺一个能先跑起来的切入点。我通常会从最重复、最容易漏、最占人力的环节开始，把试点拆小，再推进到能稳定使用的生产流程。",
  displayName: "小雨",
  headline: "Orbit 创始人，帮企业把 AI 用到销售、客服、运营和内部知识库里",
  industry: "AI 企业应用 · 日本市场 · B2B",
  offering: [
    "企业 AI 导入路径梳理",
    "知识库 / 内部检索 / 员工助手方案",
    "销售、客服、运营流程自动化",
    "日本落地服务商与合作方连接",
    "创业者、投资人、企业服务资源引荐"
  ],
  organization: "Orbit",
  relationshipGoal:
    "通过 Orbit 找到值得互相帮忙的人：我会优先介绍明确需求、靠谱交付和能形成长期合作的资源。",
  role: "创始人",
  seeking: [
    "正在导入 AI 或准备做试点的企业",
    "有日本市场落地经验的合作伙伴",
    "企业服务、SaaS、自动化和数据治理资源"
  ],
  timezone: "Tokyo",
  topics: [
    "企业 AI 导入",
    "知识库与内部检索",
    "Agent 工作流",
    "销售和客服自动化",
    "中日商务合作"
  ]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function stringListField(
  record: Record<string, unknown>,
  fieldName: string
): string[] {
  const value = record[fieldName];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && !!item.trim());
}

function isKnownDemoProfile(profile: Record<string, unknown>): boolean {
  return (
    stringField(profile, "id") === "profile_orbit_generated_operator" ||
    stringField(profile, "displayName") === "小雨" ||
    stringField(profile, "displayName") === "赵翔" ||
    stringField(profile, "displayName") === "Xinyi Zhao" ||
    stringField(profile, "organization") === "OPPO Japan Research"
  );
}

export function profileToSummary(data: unknown): ProfileSummary {
  const profile = isRecord(data)
    ? data.profile
    : null;

  if (!isRecord(profile) || isKnownDemoProfile(profile)) {
    return orbitFounderProfile;
  }

  return {
    bio: stringField(profile, "bio", orbitFounderProfile.bio),
    displayName: stringField(profile, "displayName", orbitFounderProfile.displayName),
    headline: stringField(profile, "headline", orbitFounderProfile.headline),
    industry: stringField(profile, "industry", orbitFounderProfile.industry),
    offering: stringListField(profile, "offering"),
    organization: stringField(profile, "organization", orbitFounderProfile.organization),
    relationshipGoal: stringField(
      profile,
      "relationshipGoal",
      orbitFounderProfile.relationshipGoal
    ),
    role: stringField(profile, "role", orbitFounderProfile.role),
    seeking: stringListField(profile, "seeking"),
    timezone:
      stringField(profile, "timezone") ||
      stringField(profile, "homeMarket", orbitFounderProfile.timezone),
    topics: stringListField(profile, "topics")
  };
}
