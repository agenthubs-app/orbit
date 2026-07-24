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

export interface ProfileBusinessCardTagGroup {
  overflow: number;
  values: string[];
}

export interface ProfileBusinessCardView {
  headline: string;
  initial: string;
  metaLine: string;
  name: string;
  offering: ProfileBusinessCardTagGroup;
  seeking: ProfileBusinessCardTagGroup;
}

export interface ProfileUpdateSuggestionView {
  confidenceLabel: string;
  currentValue: string;
  evidenceExcerpt: string;
  fieldLabel: string;
  id: string;
  rationale: string;
  sourceLabel: string;
  statusLabel: string;
  suggestedValue: string;
}

export interface ProfileUpdateSuggestionsView {
  nextAction: string;
  stateLabel: string;
  suggestions: ProfileUpdateSuggestionView[];
  title: string;
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

function envelopeData(data: unknown): unknown {
  if (!isRecord(data)) {
    return data;
  }

  return data.success === true && "data" in data ? data.data : data;
}

function listField(record: Record<string, unknown>, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function segmentLooksChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/u.test(value) && !/[\u3040-\u30ff]/u.test(value);
}

function preferredChineseSegment(value: string): string {
  const markerMatch = /ZH:\s*([^/]+?)(?:\s+EN:|\s+JA:|$)/u.exec(value);
  if (markerMatch?.[1]?.trim()) {
    return markerMatch[1].trim();
  }

  const segments = value
    .split(/\s*\/\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.find(segmentLooksChinese) ?? value.trim();
}

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|fixture|provider|source-backed|implementation|operator review|sourced profile)\b/i.test(
    value
  );
}

function chineseText(value: string, fallback: string): string {
  const chinese = preferredChineseSegment(value);

  if (
    !chinese ||
    !segmentLooksChinese(chinese) ||
    containsImplementationLabel(chinese)
  ) {
    return fallback;
  }

  return chinese;
}

function profileSignalSourceLabel(sourceKind: string): string {
  const normalized = sourceKind.trim().toLowerCase();

  if (normalized === "chat") {
    return "聊天信号";
  }

  if (normalized === "activity") {
    return "活动信号";
  }

  if (normalized === "contact") {
    return "联系人信号";
  }

  return "资料信号";
}

function profileSignalFieldLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    headline: "标题",
    homeMarket: "主要市场",
    preferredFollowUpWindow: "跟进时间",
    preferredIntroChannels: "介绍渠道",
    relationshipGoal: "关系目标",
    targetRelationshipTypes: "目标关系类型"
  };

  return labels[fieldName] ?? "资料字段";
}

function profileSignalConfidenceLabel(confidence: string): string {
  const normalized = confidence.trim().toLowerCase();

  if (normalized === "high") {
    return "高可信";
  }

  if (normalized === "low") {
    return "低可信";
  }

  return "中可信";
}

function profileSignalStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();

  if (normalized === "accepted") {
    return "已接受";
  }

  if (normalized === "dismissed") {
    return "已忽略";
  }

  return "待确认";
}

function profileSuggestionKnownValue(value: string): string {
  const knownValues: Record<string, string> = {
    "24 hours after hosted events": "活动后 24 小时内",
    "48 hours": "48 小时",
    "Founder building a relationship operating system": "围绕关系系统创业",
    "Founder focused on event-grounded relationship workflows":
      "围绕活动场景做人脉关系工作流的创始人",
    "Tokyo and Singapore": "东京和新加坡"
  };

  return knownValues[value.trim()] ?? value.trim();
}

function profileSuggestionValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map(profileSuggestionKnownValue)
      .filter(Boolean)
      .join("、");
  }

  if (typeof value !== "string") {
    return "";
  }

  return chineseText(value, profileSuggestionKnownValue(value));
}

function profileSuggestionFallbackRationale(sourceKind: string): string {
  const normalized = sourceKind.trim().toLowerCase();

  if (normalized === "chat") {
    return "这个建议来自最近的聊天摘要，不会自动修改你的档案。";
  }

  if (normalized === "contact") {
    return "这个建议来自最近新增联系人，不会自动修改你的档案。";
  }

  if (normalized === "activity") {
    return "这个建议来自最近活动记录，不会自动修改你的档案。";
  }

  return "这个建议来自有来源的资料信号，不会自动修改你的档案。";
}

function profileSuggestionFallbackEvidence(sourceKind: string): string {
  const normalized = sourceKind.trim().toLowerCase();

  if (normalized === "chat") {
    return "最近的聊天摘要提到活动场景下的人脉工作流。";
  }

  if (normalized === "activity") {
    return "最近活动记录里出现了可补充到档案的信息。";
  }

  if (normalized === "contact") {
    return "最近联系人提供了可补充到档案的信息。";
  }

  return "这个建议有来源记录，可在应用前先复核。";
}

function profileSignalStateLabel(state: string, count: number): string {
  const normalized = state.trim().toLowerCase();

  if (count === 0 || normalized === "empty") {
    return "暂无建议";
  }

  if (normalized === "pending") {
    return "等待确认";
  }

  return "待复核";
}

function profileSignalNextAction(value: string, count: number): string {
  if (count === 0) {
    return "资料暂时不需要更新。";
  }

  return chineseText(value, "先逐条确认来源，再决定是否应用到个人资料。");
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

function previewGroup(values: string[]): ProfileBusinessCardTagGroup {
  const visibleValues = values
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    overflow: Math.max(0, visibleValues.length - 2),
    values: visibleValues.slice(0, 2)
  };
}

export function profileBusinessCard(
  profile: ProfileSummary
): ProfileBusinessCardView {
  return {
    headline: profile.headline.trim(),
    initial: profile.displayName.trim().slice(0, 1).toUpperCase() || "O",
    metaLine: [profile.organization, profile.role, profile.industry]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" · "),
    name: profile.displayName.trim() || "Orbit 用户",
    offering: previewGroup(profile.offering),
    seeking: previewGroup(profile.seeking)
  };
}

export function profileUpdateSuggestionsToView(
  data: unknown
): ProfileUpdateSuggestionsView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const suggestions = listField(record, "suggestions")
    .filter(isRecord)
    .map((suggestion, index) => {
      const evidence = listField(suggestion, "evidence").find(isRecord);
      const sourceKind = stringField(suggestion, "sourceKind");

      return {
        confidenceLabel: profileSignalConfidenceLabel(
          stringField(suggestion, "confidence")
        ),
        currentValue: profileSuggestionValue(suggestion.currentValue),
        evidenceExcerpt: chineseText(
          evidence ? stringField(evidence, "excerpt") : "",
          profileSuggestionFallbackEvidence(sourceKind)
        ),
        fieldLabel: profileSignalFieldLabel(
          stringField(suggestion, "targetProfileField")
        ),
        id: stringField(suggestion, "id", `profile-suggestion-${index}`),
        rationale: chineseText(
          stringField(suggestion, "rationale"),
          profileSuggestionFallbackRationale(sourceKind)
        ),
        sourceLabel: profileSignalSourceLabel(sourceKind),
        statusLabel: profileSignalStatusLabel(stringField(suggestion, "status")),
        suggestedValue: profileSuggestionValue(suggestion.suggestedValue)
      };
    });

  return {
    nextAction: profileSignalNextAction(
      stringField(record, "nextAction"),
      suggestions.length
    ),
    stateLabel: profileSignalStateLabel(
      stringField(record, "state"),
      suggestions.length
    ),
    suggestions,
    title: "资料更新建议"
  };
}
