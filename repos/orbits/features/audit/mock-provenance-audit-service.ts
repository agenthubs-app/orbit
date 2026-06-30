import {
  SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_DEFINITIONS,
  type SourceConsistencyProvenanceAuditErrorCode,
  type SourceConsistencyProvenanceAuditFailure,
  type SourceConsistencyProvenanceAuditInput,
  type SourceConsistencyProvenanceAuditPayload,
  type SourceConsistencyProvenanceAuditResult,
  type SourceConsistencyProvenanceAuditRunPayload,
  type SourceConsistencyProvenanceAuditRunResult,
  type SourceConsistencyProvenanceAuditScenario,
  type SourceConsistencyProvenanceAuditService,
} from "./provenance-contract";
import {
  mockEmptySourceConsistencyProvenanceAuditFixture,
  mockEmptySourceConsistencyProvenanceAuditRunFixture,
  mockPendingSourceConsistencyProvenanceAuditFixture,
  mockPendingSourceConsistencyProvenanceAuditRunFixture,
  mockSourceConsistencyProvenanceAuditFailureProvenance,
  mockSourceConsistencyProvenanceAuditFixture,
  mockSourceConsistencyProvenanceAuditRunFixture,
} from "./provenance-fixtures";

const supportedScenarios = new Set<SourceConsistencyProvenanceAuditScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

// Provenance audit mock service 汇总来源一致性和证据覆盖情况。
// 它不扫描生产数据库，只返回 fixture 或本地 run fixture，供 UI/route 验证审计边界。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function auditSuccess(
  data: SourceConsistencyProvenanceAuditPayload,
): SourceConsistencyProvenanceAuditResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function runSuccess(
  data: SourceConsistencyProvenanceAuditRunPayload,
): SourceConsistencyProvenanceAuditRunResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: SourceConsistencyProvenanceAuditErrorCode,
): SourceConsistencyProvenanceAuditFailure {
  // audit failure 代表本地审计 fixture 失败，不代表真实后台审计任务失败。
  const definition = SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockSourceConsistencyProvenanceAuditFailureProvenance,
      evidenceIds:
        mockSourceConsistencyProvenanceAuditFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: SourceConsistencyProvenanceAuditInput["scenario"],
): SourceConsistencyProvenanceAuditScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as SourceConsistencyProvenanceAuditScenario)
  ) {
    return scenario as SourceConsistencyProvenanceAuditScenario;
  }

  return "success";
}

function auditScenarioResult(
  scenario: SourceConsistencyProvenanceAuditScenario,
): SourceConsistencyProvenanceAuditResult {
  // snapshot 是当前审计视图；run 是一次审计执行结果，两者共享 scenario 控制。
  switch (scenario) {
    case "empty":
      return auditSuccess(mockEmptySourceConsistencyProvenanceAuditFixture);
    case "pending":
      return auditSuccess(mockPendingSourceConsistencyProvenanceAuditFixture);
    case "failure":
      return failure("SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED");
    case "success":
    default:
      return auditSuccess(mockSourceConsistencyProvenanceAuditFixture);
  }
}

function runScenarioResult(
  scenario: SourceConsistencyProvenanceAuditScenario,
): SourceConsistencyProvenanceAuditRunResult {
  switch (scenario) {
    case "empty":
      return runSuccess(mockEmptySourceConsistencyProvenanceAuditRunFixture);
    case "pending":
      return runSuccess(mockPendingSourceConsistencyProvenanceAuditRunFixture);
    case "failure":
      return failure("SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED");
    case "success":
    default:
      return runSuccess(mockSourceConsistencyProvenanceAuditRunFixture);
  }
}

export function createMockSourceConsistencyProvenanceAuditService(): SourceConsistencyProvenanceAuditService {
  // getAuditSnapshot 和 runAudit 都不产生副作用，只返回各自的 deterministic payload。
  return {
    getAuditSnapshot(
      input = {},
    ): SourceConsistencyProvenanceAuditResult {
      return auditScenarioResult(normalizeScenario(input.scenario));
    },

    runAudit(input = {}): SourceConsistencyProvenanceAuditRunResult {
      return runScenarioResult(normalizeScenario(input.scenario));
    },
  };
}

export type {
  SourceConsistencyProvenanceAuditResult,
  SourceConsistencyProvenanceAuditRunResult,
  SourceConsistencyProvenanceAuditService,
};
