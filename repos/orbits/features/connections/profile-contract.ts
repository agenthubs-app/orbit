import type {
  RelationshipStage,
  RelationshipValueType,
} from "../../shared/domain/source-types";
import type { AppErrorCode } from "../../shared/errors/app-error";

export const RELATIONSHIP_PROFILE_FIXTURE_SOURCE =
  "fixture:features/connections/profile-contract.ts" as const;

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

export interface RelationshipNextAction {
  label: string;
  rationale: string;
  dueAt?: string;
}

export interface RelationshipLatestSummary {
  text: string;
  generatedAt: string;
  evidenceIds: readonly string[];
  generationMethod: "fixture" | "rule-based-relationship-profile";
  createdBy: "mock-relationship-stage-and-profile-service";
}

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

const fixtureCollectedAt = "2026-06-25T20:00:00.000Z";
const fixtureGeneratedAt = "2026-06-25T20:05:00.000Z";
const relationshipEvidenceIds = [
  "evidence:connection-climate-dinner",
  "evidence:connection-storage-pilot",
  "evidence:connection-email-context",
  "evidence:relationship-profile-rule",
] as const;

export const mockRelationshipProfileProvenance: RelationshipProfileProvenance = {
  source: RELATIONSHIP_PROFILE_FIXTURE_SOURCE,
  sourceLabel: "Mock relationship stage and profile fixture",
  evidenceIds: relationshipEvidenceIds,
  collectedAt: fixtureCollectedAt,
  privacy: "demo-relationship-profile-only",
  generationMethod: "fixture",
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyRelationshipProfileProvenance: RelationshipProfileProvenance =
  {
    ...mockRelationshipProfileProvenance,
    sourceLabel: "Mock empty relationship profile rule",
    evidenceIds: ["evidence:relationship-profile-empty"],
    generationMethod: "rule-based-relationship-profile",
  };

export const mockPendingRelationshipProfileProvenance: RelationshipProfileProvenance =
  {
    ...mockRelationshipProfileProvenance,
    sourceLabel: "Mock pending relationship profile rule",
    evidenceIds: ["evidence:relationship-profile-pending"],
    generationMethod: "rule-based-relationship-profile",
  };

export const mockRelationshipProfileFailureProvenance: RelationshipProfileProvenance =
  {
    ...mockRelationshipProfileProvenance,
    sourceLabel: "Mock relationship profile controlled failure rule",
    evidenceIds: ["evidence:relationship-profile-controlled-failure"],
    generationMethod: "rule-based-relationship-profile",
  };

export const mockRelationshipProfileRecord: RelationshipProfileRecord = {
  connectionId: "demo-connection-1",
  contactId: "contact:kenji-watanabe",
  displayName: "Kenji Watanabe",
  relationshipType: "event_peer",
  relationshipStage: "active",
  context:
    "Kenji asked for a storage pilot operator introduction after the climate founders dinner.",
  mutualValue: {
    contactReceives: "A warm operator introduction for storage pilot validation.",
    orbitUserReceives:
      "A qualified climate infrastructure founder conversation.",
    valueTypes: ["commercial_opportunity", "knowledge_exchange"],
  },
  latestSummary: {
    text:
      "Kenji is now active because the climate dinner context and follow-up evidence point to a concrete operator intro.",
    generatedAt: fixtureGeneratedAt,
    evidenceIds: relationshipEvidenceIds,
    generationMethod: "rule-based-relationship-profile",
    createdBy: "mock-relationship-stage-and-profile-service",
  },
  nextAction: {
    label: "Send storage pilot operator intro",
    rationale:
      "The intro is the highest-signal action from the latest source-backed context.",
    dueAt: "2026-06-26T09:00:00.000Z",
  },
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockRelationshipStageUpdateFixture: RelationshipProfilePayload = {
  state: "success",
  profile: mockRelationshipProfileRecord,
  summary:
    "Kenji Watanabe has a deterministic relationship stage and profile ready for review.",
  provenance: {
    ...mockRelationshipProfileProvenance,
    generationMethod: "rule-based-relationship-profile",
  },
  nextAction: "Send storage pilot operator intro",
  updateSummary:
    "Relationship stage active was calculated from local fixture evidence without provider calls.",
};

export const mockRelationshipProfileUpdateFixture: RelationshipProfilePayload = {
  ...mockRelationshipStageUpdateFixture,
  profile: {
    ...mockRelationshipProfileRecord,
    relationshipType: "customer_candidate",
  },
  updateSummary:
    "Relationship profile customer_candidate was calculated from local fixture evidence without provider calls.",
};

export const mockEmptyRelationshipProfileFixture: RelationshipProfilePayload = {
  state: "empty",
  profile: null,
  summary: "No mock connection is selected for relationship profiling.",
  provenance: mockEmptyRelationshipProfileProvenance,
  nextAction:
    "Select a mock connection before calculating relationship stage and profile fields.",
  updateSummary: "No relationship profile fields were calculated.",
};

export const mockPendingRelationshipProfileFixture: RelationshipProfilePayload = {
  state: "pending",
  profile: null,
  summary: "Relationship stage and profile calculation is pending fixture review.",
  provenance: mockPendingRelationshipProfileProvenance,
  nextAction:
    "Wait for mock fixture review before applying profile automation.",
  updateSummary: "Relationship stage and profile calculation is pending.",
};
