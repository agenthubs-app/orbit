import {
  SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_DEFINITIONS,
  mockEmptySourceConsistencyProvenanceAuditFixture,
  mockEmptySourceConsistencyProvenanceAuditRunFixture,
  mockPendingSourceConsistencyProvenanceAuditFixture,
  mockPendingSourceConsistencyProvenanceAuditRunFixture,
  mockSourceConsistencyProvenanceAuditFailureProvenance,
  mockSourceConsistencyProvenanceAuditFixture,
  mockSourceConsistencyProvenanceAuditRunFixture,
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

const supportedScenarios = new Set<SourceConsistencyProvenanceAuditScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

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
