import type { AppErrorCode } from "../../shared/errors/app-error";

// Profile contract 描述用户手动资料编辑和完整度评分。
// 它是 onboarding/profile 页的主读写模型，不包含外部文档解析或自动信号应用。
export const PROFILE_ERROR_CODES = [
  "PROFILE_REQUIRED",
  "PROFILE_VALIDATION_FAILED",
  "PROFILE_UPDATE_PENDING",
] as const;

export type ProfileErrorCode = (typeof PROFILE_ERROR_CODES)[number];

export type ProfileScenario = "complete" | "empty" | "pending";

export type ProfileViewState = "success" | "empty" | "pending";

export type ProfileCompletenessStatus =
  | "not-started"
  | "action-needed"
  | "ready";

// profile 错误定义区分缺资料、校验失败和等待人工复核。
export interface ProfileErrorDefinition {
  code: ProfileErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const PROFILE_ERROR_DEFINITIONS = {
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
} as const satisfies Record<ProfileErrorCode, ProfileErrorDefinition>;

// provenance 说明资料来自 demo profile 边界。
export interface ProfileProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-profile-only";
}

// ManualProfile 是用户可直接编辑的核心资料。
export interface ManualProfile {
  id: string;
  displayName: string;
  headline: string;
  organization: string;
  role: string;
  homeMarket: string;
  relationshipGoal: string;
  targetRelationshipTypes: readonly string[];
  preferredFollowUpWindow: string;
  preferredIntroChannels: readonly string[];
  updatedAt: string;
}

// UpdateInput 只包含可编辑字段；缺失字段表示保持不变。
export interface ManualProfileUpdateInput {
  displayName?: string;
  headline?: string;
  organization?: string;
  role?: string;
  homeMarket?: string;
  relationshipGoal?: string;
  targetRelationshipTypes?: readonly string[];
  preferredFollowUpWindow?: string;
  preferredIntroChannels?: readonly string[];
}

// CompletenessField 是完整度评分会检查的字段集合。
export type ProfileCompletenessField =
  | "displayName"
  | "headline"
  | "relationshipGoal"
  | "homeMarket"
  | "targetRelationshipTypes"
  | "preferredIntroChannels";

// completeness 用于驱动 UI 的“还缺什么”提示。
export interface ProfileCompleteness {
  score: number;
  status: ProfileCompletenessStatus;
  completedFields: readonly ProfileCompletenessField[];
  missingFields: readonly ProfileCompletenessField[];
  nextBestField: ProfileCompletenessField | null;
}

// editor state 描述当前表单能否保存以及哪些字段有改动。
export interface ProfileEditorState {
  canSave: boolean;
  lastSavedAt: string | null;
  dirtyFields: readonly ProfileCompletenessField[];
  validationMessages: readonly string[];
}

// ProfilePayload 是资料页成功响应的完整读模型。
export interface ProfilePayload {
  state: ProfileViewState;
  profile: ManualProfile | null;
  completeness: ProfileCompleteness;
  editor: ProfileEditorState;
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
