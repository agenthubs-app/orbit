import {
  CONNECTION_EVIDENCE_CONTRIBUTIONS,
  CONNECTION_EVIDENCE_SERVICE_ERROR_DEFINITIONS,
  CONNECTION_EVIDENCE_SOURCE_TYPES,
  type ConnectionAddEvidenceInput,
  type ConnectionEvidenceAddPendingFailure,
  type ConnectionEvidenceAddResult,
  type ConnectionEvidenceContribution,
  type ConnectionEvidenceDetailResult,
  type ConnectionEvidenceErrorCode,
  type ConnectionEvidenceFailure,
  type ConnectionEvidenceFailureForCode,
  type ConnectionEvidenceInvalidBodyFailure,
  type ConnectionEvidenceListInput,
  type ConnectionEvidenceListResult,
  type ConnectionEvidenceLookupInput,
  type ConnectionEvidenceScenario,
  type ConnectionEvidenceSourceType,
} from "./contract";
import {
  buildAddedConnectionEvidencePayload,
  mockAddedConnectionEvidenceFixture,
  mockConnectionDetailFixture,
  mockConnectionEvidenceFailureProvenance,
  mockConnectionsListFixture,
  mockEmptyConnectionDetailFixture,
  mockEmptyConnectionsListFixture,
  mockPendingConnectionDetailFixture,
  mockPendingConnectionsListFixture,
} from "./fixtures";
import type { ConnectionEvidenceService } from "./service";

// Connection evidence mock service 维护“关系 + 证据”的只读/追加模拟。
// addEvidence 返回派生 payload，但不持久写入；它用于证明来源字段和贡献类型的 contract。
const supportedScenarios = new Set<ConnectionEvidenceScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);
const supportedSourceTypes = new Set<ConnectionEvidenceSourceType>(
  CONNECTION_EVIDENCE_SOURCE_TYPES,
);
const supportedContributions = new Set<ConnectionEvidenceContribution>(
  CONNECTION_EVIDENCE_CONTRIBUTIONS,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // connection detail/list fixture 会被多个测试复用，返回 clone 防止调用方改共享对象。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function listSuccess(
  payload: typeof mockConnectionsListFixture,
): ConnectionEvidenceListResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function detailSuccess(
  payload: typeof mockConnectionDetailFixture,
): ConnectionEvidenceDetailResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure<TCode extends ConnectionEvidenceErrorCode>(
  code: TCode,
): ConnectionEvidenceFailureForCode<TCode> {
  // 泛型保留“错误码 -> 失败类型”的映射，route 测试可以断言具体错误分支。
  const definition = CONNECTION_EVIDENCE_SERVICE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockConnectionEvidenceFailureProvenance,
      evidenceIds: mockConnectionEvidenceFailureProvenance.evidenceIds,
    },
  } as ConnectionEvidenceFailureForCode<TCode>;
}

function normalizeScenario(
  scenario?: ConnectionEvidenceListInput["scenario"],
): ConnectionEvidenceScenario {
  // scenario 是 mock 状态控制面，只接受 contract 白名单。
  if (
    scenario &&
    supportedScenarios.has(scenario as ConnectionEvidenceScenario)
  ) {
    return scenario as ConnectionEvidenceScenario;
  }

  return "success";
}

function isDemoConnection(connectionId: string): boolean {
  // 当前 fixture 只提供一个完整 demo connection；非 demo id 走 NOT_FOUND 分支。
  return connectionId.trim() === "demo-connection-1";
}

function listScenarioResult(
  scenario: ConnectionEvidenceScenario,
): ConnectionEvidenceListResult | null {
  switch (scenario) {
    case "empty":
      return listSuccess(mockEmptyConnectionsListFixture);
    case "pending":
      return listSuccess(mockPendingConnectionsListFixture);
    case "failure":
      return failure("CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function detailScenarioResult(
  scenario: ConnectionEvidenceScenario,
): ConnectionEvidenceDetailResult | null {
  switch (scenario) {
    case "empty":
      return detailSuccess(mockEmptyConnectionDetailFixture);
    case "pending":
      return detailSuccess(mockPendingConnectionDetailFixture);
    case "failure":
      return failure("CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function addScenarioResult(
  scenario: ConnectionEvidenceScenario,
): ConnectionEvidenceAddResult | null {
  if (scenario === "pending") {
    return addPendingFailure();
  }

  return detailScenarioResult(scenario);
}

function invalidBodyFailure(): ConnectionEvidenceInvalidBodyFailure {
  return failure("CONNECTION_EVIDENCE_INVALID_BODY");
}

function addPendingFailure(): ConnectionEvidenceAddPendingFailure {
  return failure("CONNECTION_EVIDENCE_ADD_PENDING");
}

function normalizedSourceType(
  sourceType?: ConnectionAddEvidenceInput["sourceType"],
): ConnectionEvidenceSourceType | null {
  // 未传 sourceType 默认为 manual；传了不支持的值则显式失败，避免来源类型被静默污染。
  const normalized = sourceType?.trim();

  if (!normalized) {
    return "manual";
  }

  if (supportedSourceTypes.has(normalized as ConnectionEvidenceSourceType)) {
    return normalized as ConnectionEvidenceSourceType;
  }

  return null;
}

function normalizedContribution(
  contribution?: ConnectionAddEvidenceInput["contribution"],
): ConnectionEvidenceContribution {
  // contribution 是证据对关系的作用；未知值保守回落到 follow_up_signal。
  const normalized = contribution?.trim();

  if (
    normalized &&
    supportedContributions.has(normalized as ConnectionEvidenceContribution)
  ) {
    return normalized as ConnectionEvidenceContribution;
  }

  return "follow_up_signal";
}

function normalizeAddInput(
  input: ConnectionAddEvidenceInput,
): ConnectionAddEvidenceInput | ConnectionEvidenceFailure {
  // addEvidence 的输入归一化先校验 sourceType，再补默认 contribution。
  const sourceType = normalizedSourceType(input.sourceType);

  if (!sourceType) {
    return failure("CONNECTION_EVIDENCE_SOURCE_NOT_SUPPORTED");
  }

  return {
    ...input,
    contribution: normalizedContribution(input.contribution),
    sourceType,
  };
}

function isConnectionEvidenceFailure(
  value: ConnectionAddEvidenceInput | ConnectionEvidenceFailure,
): value is ConnectionEvidenceFailure {
  return "success" in value && value.success === false;
}

export function createMockConnectionEvidenceService(): ConnectionEvidenceService {
  // list/get 使用固定 fixture；addEvidence 根据输入生成一个新的 detail payload。
  return {
    listConnections(input = {}): ConnectionEvidenceListResult {
      const scenarioResult = listScenarioResult(normalizeScenario(input.scenario));

      if (scenarioResult) {
        return scenarioResult;
      }

      return listSuccess(mockConnectionsListFixture);
    },

    getConnection(input: ConnectionEvidenceLookupInput): ConnectionEvidenceDetailResult {
      const scenarioResult = detailScenarioResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      if (!isDemoConnection(input.connectionId)) {
        return failure("CONNECTION_NOT_FOUND");
      }

      return detailSuccess(mockConnectionDetailFixture);
    },

    addEvidence(input: ConnectionAddEvidenceInput): ConnectionEvidenceAddResult {
      const scenarioResult = addScenarioResult(normalizeScenario(input.scenario));

      if (scenarioResult) {
        return scenarioResult;
      }

      if (!isDemoConnection(input.connectionId)) {
        return failure("CONNECTION_NOT_FOUND");
      }

      const normalizedInput = normalizeAddInput(input);

      if (isConnectionEvidenceFailure(normalizedInput)) {
        return normalizedInput;
      }

      if (
        normalizedInput.sourceType === "manual" &&
        normalizedInput.sourceLabel === "Operator follow-up note" &&
        normalizedInput.title === "Operator confirmed warm introduction path" &&
        normalizedInput.excerpt ===
          "Kenji wants the storage pilot operator intro before the partner review call."
      ) {
        return detailSuccess(mockAddedConnectionEvidenceFixture);
      }

      return detailSuccess(buildAddedConnectionEvidencePayload(normalizedInput));
    },

    invalidAddEvidenceBody(): ConnectionEvidenceInvalidBodyFailure {
      return invalidBodyFailure();
    },
  };
}

export type {
  ConnectionEvidenceAddResult,
  ConnectionEvidenceDetailResult,
  ConnectionEvidenceFailure,
  ConnectionEvidenceListResult,
};
