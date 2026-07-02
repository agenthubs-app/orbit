import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import {
  RELATIONSHIP_VALUE_ERROR_DEFINITIONS,
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
import {
  mockEmptyRelationshipValueScoringFixture,
  mockPendingRelationshipValueScoringFixture,
  mockRecomputedRelationshipValueFixture,
  mockRelationshipValueFailureProvenance,
  mockRelationshipValueScoringFixture,
} from "./value-fixtures";

const supportedScenarios = new Set<RelationshipValueScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

// RelationshipValue mock service 模拟关系价值评分读取和重算。
// 它只支持 demo connection，不运行真实分析 job、AI 模型或数据库聚合。
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
  // 泛型保留错误码到失败类型的映射，route/test 可以精确断言错误分支。
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
  // recompute 的 pending 是阻塞错误，因为重算动作不能返回“已完成”payload。
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
  // API route 用这个 context 说明失败仍处于 relationship value runtime boundary 内。
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: serviceFailure.error.provenance.sourceLabel,
    relationshipValueErrorCode: serviceFailure.error.code,
    service: "relationship-value-scoring",
  };
}

export function createMockRelationshipValueScoringService(): RelationshipValueScoringService {
  // get 返回固定评分；recompute 返回另一份 fixture，模拟本地规则重算后的结果。
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
