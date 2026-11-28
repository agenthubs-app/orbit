// 跨客户端契约：个人资料。
// R18a owner: C line; consumers: Web account and App me. Additive fields only.
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

// 2026-11-28 匹配字段：身份 / 业务细类 / 卖给谁 / 客户行业 / 投资阶段。每项记来源：
// "inferred" = 系统（名片或 AI）推断，等本人确认；"confirmed" = 本人确认或填写过。未知值留空，不猜。
export type ProfileIdentityCode =
  | "founder"
  | "investor"
  | "finance_advisor"
  | "corporate"
  | "channel"
  | "professional"
  | "student"
  | "other";
export type ProfileSellsToCode = "business" | "consumer" | "both";
export type ProfileInvestStageCode = "seed" | "angel" | "series_a" | "series_b_plus" | "growth";
export type ProfileMatchFieldCode = "identity" | "businessCategoryIds" | "sellsTo" | "customerIndustryIds" | "investStages";
export type ProfileMatchFieldSourceCode = "inferred" | "confirmed";
export interface ProfileMatchFieldsContract {
  identity?: ProfileIdentityCode | null;
  /** shared/domain/business-categories.ts ids, main business first, at most 2. */
  businessCategoryIds?: readonly string[];
  sellsTo?: ProfileSellsToCode | null;
  /** Industry ids (top-level or secondary) of their customers, at most 3; only when sellsTo is business or both. */
  customerIndustryIds?: readonly string[];
  /** Only for investors. */
  investStages?: readonly ProfileInvestStageCode[];
  sources?: Partial<Record<ProfileMatchFieldCode, ProfileMatchFieldSourceCode>>;
  /** Why an inferred value was chosen (short, from the person's own profile text); never shown publicly. */
  evidence?: Partial<Record<ProfileMatchFieldCode, string>>;
  inferredAt?: string;
}

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
  policyVersion: 1 | 2;
  status: "incomplete" | "complete";
  missingFields: readonly ProfileOnboardingFieldCode[];
  /**
   * 2026-11-28 matching fields still to confirm (empty, or inferred and not yet confirmed). Separate from `status` so
   * clients that do not know these fields are never gated by them; clients that do show the confirmation once.
   */
  matchFields?: { status: "pending" | "complete"; missingFields: readonly ProfileMatchFieldCode[] };
}

// GET/POST /api/profile/onboarding-progress. The server owns the actor and all
// derived fields. Screen one can also record the user's contact methods review.
export interface ProfileOnboardingProgressContract {
  version: 1;
  currentScreen: 1 | 2 | 3 | 4 | 5 | null;
  lastConfirmedScreen: 0 | 1 | 2 | 3 | 4 | 5;
  finishedAt: string | null;
  deferred: boolean;
  revision: string;
}

/** Opt-in GET /api/profile/onboarding-progress?view=setup. */
export interface ProfileOnboardingSetupContract {
  progress: ProfileOnboardingProgressContract | null;
  legacyRepair: boolean;
}

export type ProfileOnboardingProgressCommandContract =
  | { action: "initialize" | "defer" | "finish" | "finish_repair"; expectedRevision: string | null; mutationId: string }
  | { action: "confirm"; screen: 1 | 2 | 3 | 4 | 5; expectedRevision: string | null; mutationId: string; contactMethodsConfirmed?: true };

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

export interface ProfilePublicFieldsContract {
  companyRole: boolean;
  offeringSeeking: boolean;
  intro: boolean;
}

export interface ProfileCardCompletenessContract {
  score: number;
  items: readonly { key: string; weight: number; done: boolean }[];
}

// 用户可直接编辑的核心资料。名片档案扩展字段全部可选，容忍稀疏数据。
export interface ManualProfileContract extends IndustrySelectionContract {
  publicFields?: ProfilePublicFieldsContract;
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
  matchFields?: ProfileMatchFieldsContract;
  updatedAt: string;
}

// Public profile responses use this explicit shape. Private profile fields are
// deliberately absent; each client owns its runtime projection helper.
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

// 驱动客户端的「还缺什么」提示。
export interface ProfileCompletenessContract {
  card?: ProfileCardCompletenessContract;
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
