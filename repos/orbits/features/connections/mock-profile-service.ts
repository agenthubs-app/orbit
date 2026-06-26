import { RUNTIME_BOUNDARY_HEADER_VALUES, type ApiErrorContext } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import {
  isRelationshipStage,
  isRelationshipValueType,
  type RelationshipStage,
  type RelationshipValueType,
} from "../../shared/domain/source-types";
import { AppError } from "../../shared/errors/app-error";
import {
  RELATIONSHIP_PROFILE_ERROR_DEFINITIONS,
  RELATIONSHIP_PROFILE_TYPES,
  mockEmptyRelationshipProfileFixture,
  mockPendingRelationshipProfileFixture,
  mockRelationshipProfileFailureProvenance,
  mockRelationshipProfileRecord,
  mockRelationshipProfileUpdateFixture,
  mockRelationshipStageUpdateFixture,
  type RelationshipMutualValue,
  type RelationshipNextAction,
  type RelationshipProfileErrorCode,
  type RelationshipProfileFailure,
  type RelationshipProfileFailureForCode,
  type RelationshipProfileInvalidBodyFailure,
  type RelationshipProfileMutualValueInput,
  type RelationshipProfileNextActionInput,
  type RelationshipProfilePayload,
  type RelationshipProfileResult,
  type RelationshipProfileScenario,
  type RelationshipProfileType,
  type RelationshipProfileUpdateInput,
  type RelationshipStageAndProfileService,
  type RelationshipStageUpdateInput,
} from "./profile-contract";

const supportedScenarios = new Set<RelationshipProfileScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);
const supportedProfileTypes = new Set<RelationshipProfileType>(
  RELATIONSHIP_PROFILE_TYPES,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function successPayload(
  payload: RelationshipProfilePayload,
): RelationshipProfileResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure<TCode extends RelationshipProfileErrorCode>(
  code: TCode,
): RelationshipProfileFailureForCode<TCode> {
  const definition = RELATIONSHIP_PROFILE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockRelationshipProfileFailureProvenance,
      evidenceIds: mockRelationshipProfileFailureProvenance.evidenceIds,
    },
  } as RelationshipProfileFailureForCode<TCode>;
}

function normalizeScenario(
  scenario?: RelationshipStageUpdateInput["scenario"],
): RelationshipProfileScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as RelationshipProfileScenario)
  ) {
    return scenario as RelationshipProfileScenario;
  }

  return "success";
}

function scenarioResult(
  scenario: RelationshipProfileScenario,
): RelationshipProfileResult | null {
  switch (scenario) {
    case "empty":
      return successPayload(mockEmptyRelationshipProfileFixture);
    case "pending":
      return successPayload(mockPendingRelationshipProfileFixture);
    case "failure":
      return failure("RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function isDemoConnection(connectionId: string): boolean {
  return connectionId.trim() === "demo-connection-1";
}

function normalizeProfileType(
  relationshipType?: RelationshipProfileUpdateInput["relationshipType"],
): RelationshipProfileType {
  const normalized = relationshipType?.trim();

  if (
    normalized &&
    supportedProfileTypes.has(normalized as RelationshipProfileType)
  ) {
    return normalized as RelationshipProfileType;
  }

  return "customer_candidate";
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : fallback;
}

function normalizeValueTypes(
  valueTypes: RelationshipProfileMutualValueInput["valueTypes"] | undefined,
): readonly RelationshipValueType[] {
  if (!valueTypes || valueTypes.length === 0) {
    return mockRelationshipProfileRecord.mutualValue.valueTypes;
  }

  const filtered = valueTypes.filter(isRelationshipValueType);

  return filtered.length > 0
    ? filtered
    : mockRelationshipProfileRecord.mutualValue.valueTypes;
}

function normalizeMutualValue(
  input?: RelationshipProfileMutualValueInput | null,
): RelationshipMutualValue {
  const fallback = mockRelationshipProfileRecord.mutualValue;

  return {
    contactReceives: normalizeText(
      input?.contactReceives,
      fallback.contactReceives,
    ),
    orbitUserReceives: normalizeText(
      input?.orbitUserReceives,
      fallback.orbitUserReceives,
    ),
    valueTypes: normalizeValueTypes(input?.valueTypes),
  };
}

function normalizeNextAction(
  input?: RelationshipProfileNextActionInput | null,
): RelationshipNextAction {
  const fallback = mockRelationshipProfileRecord.nextAction;

  return {
    label: normalizeText(input?.label, fallback.label),
    rationale: normalizeText(input?.rationale, fallback.rationale),
    dueAt: normalizeText(input?.dueAt, fallback.dueAt ?? ""),
  };
}

function buildStagePayload(stage: RelationshipStage): RelationshipProfilePayload {
  if (stage === mockRelationshipStageUpdateFixture.profile?.relationshipStage) {
    return mockRelationshipStageUpdateFixture;
  }

  const profile = {
    ...mockRelationshipProfileRecord,
    relationshipStage: stage,
    latestSummary: {
      ...mockRelationshipProfileRecord.latestSummary,
      text: `Kenji moved to ${stage} through deterministic relationship profile rules backed by local evidence.`,
    },
  };

  return {
    ...mockRelationshipStageUpdateFixture,
    profile,
    updateSummary: `Relationship stage ${stage} was calculated from local fixture evidence without provider calls.`,
  };
}

function buildProfilePayload(
  input: RelationshipProfileUpdateInput,
): RelationshipProfilePayload {
  const relationshipType = normalizeProfileType(input.relationshipType);
  const context = normalizeText(
    input.context,
    mockRelationshipProfileRecord.context,
  );
  const mutualValue = normalizeMutualValue(input.mutualValue);
  const nextAction = normalizeNextAction(input.nextAction);

  if (
    relationshipType === "customer_candidate" &&
    context === mockRelationshipProfileRecord.context &&
    mutualValue.contactReceives ===
      mockRelationshipProfileRecord.mutualValue.contactReceives &&
    mutualValue.orbitUserReceives ===
      mockRelationshipProfileRecord.mutualValue.orbitUserReceives &&
    nextAction.label === mockRelationshipProfileRecord.nextAction.label &&
    nextAction.rationale === mockRelationshipProfileRecord.nextAction.rationale
  ) {
    return mockRelationshipProfileUpdateFixture;
  }

  return {
    ...mockRelationshipProfileUpdateFixture,
    profile: {
      ...mockRelationshipProfileRecord,
      relationshipType,
      context,
      mutualValue,
      nextAction,
      latestSummary: {
        ...mockRelationshipProfileRecord.latestSummary,
        text: `${mockRelationshipProfileRecord.displayName} is profiled as ${relationshipType} from local evidence and explicit context.`,
      },
    },
    updateSummary: `Relationship profile ${relationshipType} was calculated from local fixture evidence without provider calls.`,
  };
}

function invalidBodyFailure(): RelationshipProfileInvalidBodyFailure {
  return failure("RELATIONSHIP_PROFILE_INVALID_BODY");
}

export function relationshipProfileFailureToAppError(
  profileFailure: RelationshipProfileFailure,
): AppError {
  return new AppError(
    profileFailure.error.appCode,
    profileFailure.error.message,
  );
}

export function relationshipProfileFailureContext(
  profileFailure: RelationshipProfileFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock relationship profile failure came from deterministic fixture rules.",
    relationshipProfileErrorCode: profileFailure.error.code,
    service: "relationship-stage-and-profile-mock",
  };
}

export function createMockRelationshipStageAndProfileService(): RelationshipStageAndProfileService {
  return {
    updateStage(input: RelationshipStageUpdateInput): RelationshipProfileResult {
      const scenario = normalizeScenario(input.scenario);
      const scenarioPayload = scenarioResult(scenario);

      if (scenarioPayload) {
        return scenarioPayload;
      }

      if (!isDemoConnection(input.connectionId)) {
        return failure("RELATIONSHIP_PROFILE_NOT_FOUND");
      }

      const requestedStage = input.relationshipStage ?? "active";

      if (!isRelationshipStage(requestedStage)) {
        return failure("RELATIONSHIP_PROFILE_STAGE_NOT_SUPPORTED");
      }

      return successPayload(buildStagePayload(requestedStage));
    },

    updateProfile(
      input: RelationshipProfileUpdateInput,
    ): RelationshipProfileResult {
      const scenario = normalizeScenario(input.scenario);
      const scenarioPayload = scenarioResult(scenario);

      if (scenarioPayload) {
        return scenarioPayload;
      }

      if (!isDemoConnection(input.connectionId)) {
        return failure("RELATIONSHIP_PROFILE_NOT_FOUND");
      }

      return successPayload(buildProfilePayload(input));
    },

    invalidRelationshipProfileBody(): RelationshipProfileInvalidBodyFailure {
      return invalidBodyFailure();
    },
  };
}
