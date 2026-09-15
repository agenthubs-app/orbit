// 跨客户端契约：个人资料。
// 对应 GET/PUT /api/profile 的 data 字段。
// 常量与校验留在 features/profile/contract.ts，那边有类型断言保证一致。

import type { OrbitLanguage } from "./language";
import type { IndustrySelectionContract } from "./industries";

export type SeniorityLevelCode =
  | "individual_contributor"
  | "manager"
  | "director"
  | "vp"
  | "c_level"
  | "founder";

export type ProfileViewStateCode = "success" | "empty" | "pending";

export type ProfileCompletenessStatusCode =
  | "not-started"
  | "action-needed"
  | "ready";

export type ProfileOnboardingFieldCode =
  | "displayName"
  | "primaryIndustryId"
  | "secondaryIndustryId"
  | "birthDate";

export interface ProfileOnboardingContract {
  policyVersion: 1;
  status: "incomplete" | "complete";
  missingFields: readonly ProfileOnboardingFieldCode[];
}

// New clients send both fields; omitting both preserves the legacy update API.
export interface ProfileSaveConcurrencyContract {
  expectedUpdatedAt?: string | null;
  mutationId?: string;
}

// 完整度评分会检查的字段集合，也是编辑器标记「有改动」的字段集合。
export type ProfileCompletenessFieldCode =
  | "displayName"
  | "headline"
  | "relationshipGoal"
  | "homeMarket"
  | "targetRelationshipTypes"
  | "preferredIntroChannels";

// 社交联系方式；email/phone 之外的句柄。
export interface ContactHandlesContract {
  email?: string;
  phone?: string;
  wechatId?: string;
  lineId?: string;
  website?: string;
  linkedinUrl?: string;
  xHandle?: string;
}

// 用户可直接编辑的核心资料。名片档案扩展字段全部可选，容忍稀疏数据。
export interface ManualProfileContract extends IndustrySelectionContract {
  id: string;
  // 私密日历日期，仅本人资料编辑使用；不属于公开资料或 AI 资料投影。
  birthDate?: string | null;
  displayName: string;
  headline: string;
  organization: string;
  role: string;
  homeMarket: string;
  relationshipGoal: string;
  targetRelationshipTypes: readonly string[];
  preferredFollowUpWindow: string;
  preferredLanguage: OrbitLanguage;
  preferredIntroChannels: readonly string[];
  handles?: ContactHandlesContract;
  industry?: string;
  seniorityLevel?: SeniorityLevelCode;
  bio?: string;
  offering?: readonly string[];
  seeking?: readonly string[];
  topics?: readonly string[];
  spokenLanguages?: readonly string[];
  updatedAt: string;
}

// The profile overview, self-preview and AI self-profile reader share this
// explicit public boundary. Private profile fields are deliberately absent.
export interface PublicProfileProjectionContract extends IndustrySelectionContract {
  id: string;
  displayName: string;
  headline: string;
  organization: string;
  role: string;
  homeMarket: string;
  relationshipGoal: string;
  targetRelationshipTypes: readonly string[];
  preferredIntroChannels: readonly string[];
  industry?: string;
  bio?: string;
  offering?: readonly string[];
  seeking?: readonly string[];
  topics?: readonly string[];
  spokenLanguages?: readonly string[];
  updatedAt: string;
}

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

// 驱动客户端的「还缺什么」提示。
export interface ProfileCompletenessContract {
  score: number;
  status: ProfileCompletenessStatusCode;
  completedFields: readonly ProfileCompletenessFieldCode[];
  missingFields: readonly ProfileCompletenessFieldCode[];
  nextBestField: ProfileCompletenessFieldCode | null;
}

// 当前表单能否保存、哪些字段有改动。
export interface ProfileEditorStateContract {
  canSave: boolean;
  lastSavedAt: string | null;
  dirtyFields: readonly ProfileCompletenessFieldCode[];
  validationMessages: readonly string[];
}

// 注意：完整的 ProfilePayload 还带一个 provenance 字段，那是服务端口味的溯源元数据，
// 客户端不渲染它，它的形状也还在随 mock→live 迁移变动，所以不进契约。
// payload 的组装留在 features/profile/contract.ts。
