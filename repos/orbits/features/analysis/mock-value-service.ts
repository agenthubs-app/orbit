import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import {
  RELATIONSHIP_VALUE_ERROR_DEFINITIONS,
  mockEmptyRelationshipValueScoringFixture,
  mockPendingRelationshipValueScoringFixture,
  mockRecomputedRelationshipValueFixture,
  mockRelationshipValueFailureProvenance,
  mockRelationshipValueScoringFixture,
  type RelationshipValueErrorCode,
  type RelationshipValueFailure,
  type RelationshipValueFailureForCode,
  type RelationshipValueInvalidBodyFailure,
  type RelationshipValueLookupInput,
  type RelationshipValueRecomputeInput,
  type RelationshipValueResult,
  type RelationshipValueScenario,
  type RelationshipValueScoringService,
} from "./value-contract";

const supportedScenarios = new Set<RelationshipValueScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function successPayload(
  payload: typeof mockRelationshipValueScoringFixture,
): RelationshipValueResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure<TCode extends RelationshipValueErrorCode>(
  code: TCode,
): RelationshipValueFailureForCode<TCode> {
  const definition = RELATIONSHIP_VALUE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockRelationshipValueFailureProvenance,
      evidenceIds: mockRelationshipValueFailureProvenance.evidenceIds,
    },
  } as RelationshipValueFailureForCode<TCode>;
}

function normalizeScenario(
  scenario?: RelationshipValueLookupInput["scenario"],
): RelationshipValueScenario {
  if (scenario && supportedScenarios.has(scenario as RelationshipValueScenario)) {
    return scenario as RelationshipValueScenario;
  }

  return "success";
}

function isDemoConnection(connectionId: string): boolean {
  return connectionId.trim() === "demo-connection-1";
}

function scenarioResult(
  scenario: RelationshipValueScenario,
): RelationshipValueResult | null {
  switch (scenario) {
    case "empty":
      return successPayload(mockEmptyRelationshipValueScoringFixture);
    case "pending":
      return successPayload(mockPendingRelationshipValueScoringFixture);
    case "failure":
      return failure("RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function recomputeScenarioResult(
  scenario: RelationshipValueScenario,
): RelationshipValueResult | null {
  if (scenario === "pending") {
    return failure("RELATIONSHIP_VALUE_RECOMPUTE_PENDING");
  }

  return scenarioResult(scenario);
}

function invalidRecomputeBodyFailure(): RelationshipValueInvalidBodyFailure {
  return failure("RELATIONSHIP_VALUE_RECOMPUTE_INVALID_BODY");
}

export function relationshipValueFailureToAppError(
  serviceFailure: RelationshipValueFailure,
): AppError {
  return new AppError(
    serviceFailure.error.appCode,
    serviceFailure.error.message,
  );
}

export function relationshipValueFailureContext(
  serviceFailure: RelationshipValueFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock relationship value scoring failure came from deterministic fixture rules.",
    relationshipValueErrorCode: serviceFailure.error.code,
    service: "relationship-value-scoring-mock",
  };
}

export function createMockRelationshipValueScoringService(): RelationshipValueScoringService {
  return {
    getRelationshipValue(input: RelationshipValueLookupInput): RelationshipValueResult {
      const currentScenario = normalizeScenario(input.scenario);
      const currentScenarioResult = scenarioResult(currentScenario);

      if (currentScenarioResult) {
        return currentScenarioResult;
      }

      if (!isDemoConnection(input.connectionId)) {
        return failure("RELATIONSHIP_VALUE_NOT_FOUND");
      }

      return successPayload(mockRelationshipValueScoringFixture);
    },

    recomputeRelationshipValue(
      input: RelationshipValueRecomputeInput,
    ): RelationshipValueResult {
      const currentScenario = normalizeScenario(input.scenario);
      const currentScenarioResult = recomputeScenarioResult(currentScenario);

      if (currentScenarioResult) {
        return currentScenarioResult;
      }

      if (!isDemoConnection(input.connectionId)) {
        return failure("RELATIONSHIP_VALUE_NOT_FOUND");
      }

      return successPayload(mockRecomputedRelationshipValueFixture);
    },

    invalidRecomputeBody(): RelationshipValueInvalidBodyFailure {
      return invalidRecomputeBodyFailure();
    },
  };
}

export type {
  RelationshipValueResult,
  RelationshipValueScoringService,
} from "./value-contract";
