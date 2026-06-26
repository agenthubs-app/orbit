import {
  DASHBOARD_AGGREGATE_ERROR_DEFINITIONS,
  buildDashboardAggregateSummary,
  mockDashboardAggregateFailureProvenance,
  mockDashboardAggregateFixture,
  mockDashboardAggregateSummaryFixture,
  mockEmptyDashboardAggregateFixture,
  mockPendingDashboardAggregateFixture,
  type DashboardAggregateErrorCode,
  type DashboardAggregateFailure,
  type DashboardAggregateInput,
  type DashboardAggregatePayload,
  type DashboardAggregateResult,
  type DashboardAggregateScenario,
  type DashboardAggregateSummaryInput,
  type DashboardAggregateSummaryPayload,
  type DashboardAggregateSummaryResult,
} from "./contract";
import type { DashboardAggregateService } from "./service";

const supportedScenarios = new Set<DashboardAggregateScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function aggregateSuccess(
  data: DashboardAggregatePayload,
): DashboardAggregateResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function summarySuccess(
  data: DashboardAggregateSummaryPayload,
): DashboardAggregateSummaryResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: DashboardAggregateErrorCode,
): DashboardAggregateFailure {
  const definition = DASHBOARD_AGGREGATE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockDashboardAggregateFailureProvenance,
      evidenceIds: mockDashboardAggregateFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?:
    | DashboardAggregateInput["scenario"]
    | DashboardAggregateSummaryInput["scenario"],
): DashboardAggregateScenario {
  if (scenario && supportedScenarios.has(scenario as DashboardAggregateScenario)) {
    return scenario as DashboardAggregateScenario;
  }

  return "success";
}

function normalizedActivityLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function aggregateScenarioResult(
  scenario: DashboardAggregateScenario,
): DashboardAggregateResult | null {
  switch (scenario) {
    case "empty":
      return aggregateSuccess(mockEmptyDashboardAggregateFixture);
    case "pending":
      return aggregateSuccess(mockPendingDashboardAggregateFixture);
    case "failure":
      return failure("DASHBOARD_AGGREGATE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function summaryScenarioResult(
  scenario: DashboardAggregateScenario,
): DashboardAggregateSummaryResult | null {
  switch (scenario) {
    case "empty":
      return summarySuccess(
        buildDashboardAggregateSummary(mockEmptyDashboardAggregateFixture),
      );
    case "pending":
      return summarySuccess(
        buildDashboardAggregateSummary(mockPendingDashboardAggregateFixture),
      );
    case "failure":
      return failure("DASHBOARD_AGGREGATE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function applyActivityLimit(
  payload: DashboardAggregatePayload,
  activityLimit?: number | null,
): DashboardAggregatePayload {
  const limit = normalizedActivityLimit(activityLimit);

  if (limit === null) {
    return payload;
  }

  return {
    ...payload,
    recentActivity: payload.recentActivity.slice(0, limit),
    provenance: {
      ...payload.provenance,
      sourceLabel: "Mock dashboard aggregate activity limit rule",
      generationMethod: "rule-based-activity-limit",
    },
  };
}

export function createMockDashboardAggregateService(): DashboardAggregateService {
  return {
    getDashboardAggregate(input = {}): DashboardAggregateResult {
      const scenarioResult = aggregateScenarioResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      return aggregateSuccess(
        applyActivityLimit(
          mockDashboardAggregateFixture,
          input.activityLimit,
        ),
      );
    },

    getDashboardSummary(input = {}): DashboardAggregateSummaryResult {
      const scenarioResult = summaryScenarioResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      return summarySuccess(mockDashboardAggregateSummaryFixture);
    },
  };
}

export type {
  DashboardAggregateResult,
  DashboardAggregateService,
  DashboardAggregateSummaryResult,
};
