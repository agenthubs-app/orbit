import type { AppErrorCode } from "../../shared/errors/app-error";

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

export interface ProfileProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-profile-only";
}

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

export type ProfileCompletenessField =
  | "displayName"
  | "headline"
  | "relationshipGoal"
  | "homeMarket"
  | "targetRelationshipTypes"
  | "preferredIntroChannels";

export interface ProfileCompleteness {
  score: number;
  status: ProfileCompletenessStatus;
  completedFields: readonly ProfileCompletenessField[];
  missingFields: readonly ProfileCompletenessField[];
  nextBestField: ProfileCompletenessField | null;
}

export interface ProfileEditorState {
  canSave: boolean;
  lastSavedAt: string | null;
  dirtyFields: readonly ProfileCompletenessField[];
  validationMessages: readonly string[];
}

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
