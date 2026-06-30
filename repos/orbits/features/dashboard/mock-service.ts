import {
  DASHBOARD_AGGREGATE_ERROR_DEFINITIONS,
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
import {
  buildDashboardAggregateSummary,
  mockDashboardAggregateFailureProvenance,
  mockDashboardAggregateFixture,
  mockDashboardAggregateSummaryFixture,
  mockEmptyDashboardAggregateFixture,
  mockPendingDashboardAggregateFixture,
} from "./fixtures";
import type { DashboardAggregateService } from "./service";

// Dashboard mock service 汇总多个关系视图的只读数据：
// aggregate 给完整 dashboard，summary 给轻量 header/overview。
// 它不重算真实分析，只从 deterministic fixtures 派生展示 payload。
const supportedScenarios = new Set<DashboardAggregateScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // dashboard fixture 会被多个页面共享，返回 clone 可以避免前端排序/裁剪污染源数据。
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
  // controlled failure 用于 route/UI 错误态测试，不代表真实 analytics provider 失败。
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
  // dashboard 的 scenario 参数同样只接受白名单，缺省或未知都走 success。
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
  // activityLimit 只裁剪 recentActivity，并在 provenance 中标记这是 rule-based limit。
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
  // summary 不使用 activityLimit，因为它已经是从 aggregate 提前压缩出的概览数据。
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
