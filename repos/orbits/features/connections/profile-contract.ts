import type {
  RelationshipStage,
  RelationshipValueType,
} from "../../shared/domain/source-types";
import type { AppErrorCode } from "../../shared/errors/app-error";

// Relationship Profile contract 描述单条关系的阶段、类型、互惠价值和下一步动作。
// 这里的更新是 staged/mock profile update，不直接写生产关系库。
export const RELATIONSHIP_PROFILE_TYPES = [
  "event_peer",
  "customer_candidate",
  "partner_candidate",
  "mentor_or_advisor",
  "community_bridge",
] as const;

export type RelationshipProfileType =
  (typeof RELATIONSHIP_PROFILE_TYPES)[number];

export const RELATIONSHIP_PROFILE_ERROR_CODES = [
  "RELATIONSHIP_PROFILE_NOT_FOUND",
  "RELATIONSHIP_PROFILE_INVALID_BODY",
  "RELATIONSHIP_PROFILE_STAGE_NOT_SUPPORTED",
  "RELATIONSHIP_PROFILE_PENDING",
  "RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED",
] as const;

export type RelationshipProfileErrorCode =
  (typeof RELATIONSHIP_PROFILE_ERROR_CODES)[number];

export type RelationshipProfileScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type RelationshipProfileState = "success" | "empty" | "pending";

// 错误定义把 profile 缺失、非法 body、不支持 stage 和 pending guard 分开。
export interface RelationshipProfileErrorDefinition {
  code: RelationshipProfileErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const RELATIONSHIP_PROFILE_ERROR_DEFINITIONS = {
  RELATIONSHIP_PROFILE_NOT_FOUND: {
    code: "RELATIONSHIP_PROFILE_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "That mock connection is not available for profile staging.",
    recovery:
      "Use demo-connection-1 before previewing relationship stage or profile fields.",
  },
  RELATIONSHIP_PROFILE_INVALID_BODY: {
    code: "RELATIONSHIP_PROFILE_INVALID_BODY",
    appCode: "VALIDATION_ERROR",
    message: "The mock relationship profile request body must be valid JSON.",
    recovery:
      "Send a JSON object with relationship stage, type, context, mutual value, or next-action fields.",
  },
  RELATIONSHIP_PROFILE_STAGE_NOT_SUPPORTED: {
    code: "RELATIONSHIP_PROFILE_STAGE_NOT_SUPPORTED",
    appCode: "VALIDATION_ERROR",
    message: "The requested relationship stage is not supported by Orbit.",
    recovery:
      "Use one of Orbit's shared relationship stage values before updating the mock profile.",
  },
  RELATIONSHIP_PROFILE_PENDING: {
    code: "RELATIONSHIP_PROFILE_PENDING",
    appCode: "CONFLICT",
    message: "The mock relationship profile update is waiting for fixture review.",
    recovery:
      "Render the pending state and avoid provider, database, notification, calendar, or email work.",
  },
  RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED: {
    code: "RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock relationship stage and profile boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry any live service.",
  },
} as const satisfies Record<
  RelationshipProfileErrorCode,
  RelationshipProfileErrorDefinition
>;

export interface RelationshipMutualValue {
  contactReceives: string;
  orbitUserReceives: string;
  valueTypes: readonly RelationshipValueType[];
}

// NextAction 是关系画像建议的下一步，不会自动创建任务或通知。
export interface RelationshipNextAction {
  label: string;
  rationale: string;
  dueAt?: string;
}

// LatestSummary 是关系画像摘要，来自 fixture/rule，不来自 live AI。
export interface RelationshipLatestSummary {
  text: string;
  generatedAt: string;
  evidenceIds: readonly string[];
  generationMethod: "fixture" | "rule-based-relationship-profile";
  createdBy: "mock-relationship-stage-and-profile-service";
}

// RelationshipProfileRecord 是详情页可编辑/可复核的关系画像读模型。
export interface RelationshipProfileRecord {
  connectionId: string;
  contactId: string;
  displayName: string;
  relationshipType: RelationshipProfileType;
  relationshipStage: RelationshipStage;
  context: string;
  mutualValue: RelationshipMutualValue;
  latestSummary: RelationshipLatestSummary;
  nextAction: RelationshipNextAction;
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

// provenance 记录没有执行真实数据库读写、AI、日历、邮件或通知。
export interface RelationshipProfileProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-relationship-profile-only";
  generationMethod: "fixture" | "rule-based-relationship-profile";
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

// update 输入按 stage 和 profile 字段拆分，便于 API route 做精确校验。
export interface RelationshipStageUpdateInput {
  connectionId: string;
  relationshipStage?: RelationshipStage | string | null;
  scenario?: RelationshipProfileScenario | string | null;
}

export interface RelationshipProfileMutualValueInput {
  contactReceives?: string | null;
  orbitUserReceives?: string | null;
  valueTypes?: readonly (RelationshipValueType | string)[] | null;
}

export interface RelationshipProfileNextActionInput {
  label?: string | null;
  rationale?: string | null;
  dueAt?: string | null;
}

export interface RelationshipProfileUpdateInput {
  connectionId: string;
  context?: string | null;
  mutualValue?: RelationshipProfileMutualValueInput | null;
  nextAction?: RelationshipProfileNextActionInput | null;
  relationshipType?: RelationshipProfileType | string | null;
  scenario?: RelationshipProfileScenario | string | null;
}

export interface RelationshipProfilePayload {
  state: RelationshipProfileState;
  profile: RelationshipProfileRecord | null;
  summary: string;
  provenance: RelationshipProfileProvenance;
  nextAction: string;
  updateSummary: string;
}

export interface RelationshipProfileSuccess {
  success: true;
  data: RelationshipProfilePayload;
}

export interface RelationshipProfileFailure {
  success: false;
  error: RelationshipProfileErrorDefinition & {
    state: "failure";
    provenance: RelationshipProfileProvenance;
    evidenceIds: readonly string[];
  };
}

export type RelationshipProfileFailureForCode<
  TCode extends RelationshipProfileErrorCode,
> = Omit<RelationshipProfileFailure, "error"> & {
  error: RelationshipProfileFailure["error"] & {
    code: TCode;
  };
};

export type RelationshipProfileInvalidBodyFailure =
  RelationshipProfileFailureForCode<"RELATIONSHIP_PROFILE_INVALID_BODY">;

export type RelationshipProfileResult =
  | RelationshipProfileSuccess
  | RelationshipProfileFailure;

export interface RelationshipStageAndProfileService {
  updateStage: (input: RelationshipStageUpdateInput) => RelationshipProfileResult;
  updateProfile: (
    input: RelationshipProfileUpdateInput,
  ) => RelationshipProfileResult;
  invalidRelationshipProfileBody: () => RelationshipProfileInvalidBodyFailure;
}
