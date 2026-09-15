import type { AppErrorCode } from "../../shared/errors/app-error";
import type { OrbitLanguage } from "../../shared/contract/language";
import type { IndustrySelectionContract } from "../../shared/contract/industries";
import type { SeniorityLevel } from "../../shared/domain/source-types";
import type { ContractMatches } from "../../shared/contract-check";
import type {
  ManualProfileContract,
  ContactHandlesContract,
  ProfileCompletenessContract,
  ProfileCompletenessFieldCode,
  ProfileCompletenessStatusCode,
  ProfileEditorStateContract,
  ProfileOnboardingContract,
  ProfileSaveConcurrencyContract,
  ProfileViewStateCode,
  SeniorityLevelCode,
} from "../../shared/contract/profile";

// Profile contract 描述用户手动资料编辑和完整度评分。
// 它是 onboarding/profile 页的主读写模型，不包含外部文档解析或自动信号应用。
export const PROFILE_ERROR_CODES = [
  "PROFILE_REQUIRED",
  "PROFILE_ACTOR_REQUIRED",
  "PROFILE_VALIDATION_FAILED",
  "PROFILE_UPDATE_PENDING",
  "PROFILE_LIVE_STORE_UNCONFIGURED",
  "PROFILE_BIRTH_DATE_INVALID",
  "PROFILE_MUTATION_INVALID",
  "PROFILE_VERSION_CONFLICT",
  "PROFILE_MUTATION_ID_REUSED",
  "PROFILE_SAVE_UNAVAILABLE",
] as const;

export type ProfileErrorCode = (typeof PROFILE_ERROR_CODES)[number];

export type ProfileScenario = "complete" | "empty" | "pending";

// 客户端可见的资料形状声明在 shared/contract/profile.ts，这里只做改名转发。
export type {
  ManualProfileContract as ManualProfile,
  ProfileCompletenessContract as ProfileCompleteness,
  ProfileCompletenessFieldCode as ProfileCompletenessField,
  ProfileCompletenessStatusCode as ProfileCompletenessStatus,
  ProfileEditorStateContract as ProfileEditorState,
  ProfileViewStateCode as ProfileViewState,
} from "../../shared/contract/profile";

// profile 错误定义区分缺资料、校验失败和等待人工复核。
export interface ProfileErrorDefinition {
  code: ProfileErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const PROFILE_ERROR_DEFINITIONS = {
  PROFILE_MUTATION_INVALID: {
    code: "PROFILE_MUTATION_INVALID",
    appCode: "VALIDATION_ERROR",
    message: "The save request is missing a valid version or request ID.",
    recovery: "Keep your draft and reload the latest profile before saving again.",
  },
  PROFILE_VERSION_CONFLICT: {
    code: "PROFILE_VERSION_CONFLICT",
    appCode: "CONFLICT",
    message: "Your profile changed after you opened it. This draft was not saved.",
    recovery: "Keep your draft and review the latest profile before saving again.",
  },
  PROFILE_MUTATION_ID_REUSED: {
    code: "PROFILE_MUTATION_ID_REUSED",
    appCode: "CONFLICT",
    message: "This request ID was already used for a different edit.",
    recovery: "Keep your draft and submit the changed edit with a new request ID.",
  },
  PROFILE_SAVE_UNAVAILABLE: {
    code: "PROFILE_SAVE_UNAVAILABLE",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The profile save could not be confirmed.",
    recovery: "Keep your draft and retry the same request.",
  },
  PROFILE_BIRTH_DATE_INVALID: {
    code: "PROFILE_BIRTH_DATE_INVALID",
    appCode: "VALIDATION_ERROR",
    message: "Enter a valid birth date in YYYY-MM-DD format, no later than today.",
    recovery: "Check the year, month and day, then save again.",
  },
  PROFILE_ACTOR_REQUIRED: {
    code: "PROFILE_ACTOR_REQUIRED",
    appCode: "UNAUTHORIZED",
    message: "An authenticated actor is required for live profile access.",
    recovery: "Sign in before reading or updating a live profile.",
  },
  PROFILE_REQUIRED: {
    code: "PROFILE_REQUIRED",
    appCode: "NOT_FOUND",
    message: "No mock profile exists for this onboarding scenario.",
    recovery:
      "Render the empty profile state and keep the user inside the mock boundary.",
  },
  PROFILE_VALIDATION_FAILED: {
    code: "PROFILE_VALIDATION_FAILED",
    appCode: "VALIDATION_ERROR",
    message: "A display name is required before the mock profile can save.",
    recovery:
      "Ask for a display name and retry the deterministic profile update.",
  },
  PROFILE_UPDATE_PENDING: {
    code: "PROFILE_UPDATE_PENDING",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The mock profile update is waiting for manual review.",
    recovery:
      "Render the pending state and avoid persisting profile changes elsewhere.",
  },
  PROFILE_LIVE_STORE_UNCONFIGURED: {
    code: "PROFILE_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live profile store is not configured.",
    recovery:
      "Configure ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before using live profile data.",
  },
} as const satisfies Record<ProfileErrorCode, ProfileErrorDefinition>;

// provenance 说明资料来自 demo profile 边界。
export interface ProfileProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "actor-scoped-profile" | "demo-profile-only";
}

// ManualProfile 是用户可直接编辑的核心资料。

// UpdateInput 只包含可编辑字段；缺失字段表示保持不变。
export interface ManualProfileUpdateInput extends IndustrySelectionContract, ProfileSaveConcurrencyContract {
  displayName?: string;
  birthDate?: string | null;
  headline?: string;
  organization?: string;
  role?: string;
  homeMarket?: string;
  relationshipGoal?: string;
  targetRelationshipTypes?: readonly string[];
  preferredFollowUpWindow?: string;
  preferredLanguage?: OrbitLanguage;
  preferredIntroChannels?: readonly string[];
  handles?: ContactHandlesContract;
  industry?: string;
  seniorityLevel?: SeniorityLevel;
  bio?: string;
  offering?: readonly string[];
  seeking?: readonly string[];
  topics?: readonly string[];
  spokenLanguages?: readonly string[];
}

// ProfilePayload 是资料页成功响应的完整读模型。
// state/profile/completeness/editor 的形状在 shared/contract/profile.ts，
// provenance 是服务端溯源元数据，客户端不渲染，所以留在这里。
export interface ProfilePayload {
  state: ProfileViewStateCode;
  profile: ManualProfileContract | null;
  // Older payloads can omit this field; current services always calculate it.
  onboarding?: ProfileOnboardingContract;
  mutationId?: string;
  completeness: ProfileCompletenessContract;
  editor: ProfileEditorStateContract;
  provenance: ProfileProvenance;
  nextAction: string;
}

export interface ProfileSuccess {
  success: true;
  data: ProfilePayload;
}

export interface ProfileFailure {
  success: false;
  error: ProfileErrorDefinition & {
    state: "failure";
    provenance: ProfileProvenance;
    evidenceIds: readonly string[];
  };
}

export type ProfileResult = ProfileSuccess | ProfileFailure;

// 跨客户端契约一致性断言：职级枚举的常量数组在 shared/domain/source-types.ts，
// 字符串联合另有一份在 shared/contract/profile.ts。
export type SeniorityLevelMatchesContract = ContractMatches<
  SeniorityLevel,
  SeniorityLevelCode
>;
