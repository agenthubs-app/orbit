import {
  OPPORTUNITY_REMINDER_ANALYTICS_ERROR_DEFINITIONS,
  type OpportunityReminderAnalyticsErrorCode,
  type OpportunityReminderAnalyticsFailure,
  type OpportunityReminderAnalyticsInput,
  type OpportunityReminderAnalyticsPayload,
  type OpportunityReminderAnalyticsResult,
  type OpportunityReminderAnalyticsScenario,
  type OpportunityReminderAnalyticsService,
  type OpportunityReminderRecomputePayload,
  type OpportunityReminderRecomputeResult,
} from "./opportunity-contract";
import {
  mockEmptyOpportunityReminderAnalyticsFixture,
  mockEmptyOpportunityReminderRecomputeFixture,
  mockOpportunityReminderAnalyticsFailureProvenance,
  mockOpportunityReminderAnalyticsFixture,
  mockOpportunityReminderRecomputeFixture,
  mockPendingOpportunityReminderAnalyticsFixture,
  mockPendingOpportunityReminderRecomputeFixture,
} from "./opportunity-fixtures";

const supportedScenarios = new Set<OpportunityReminderAnalyticsScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

// Opportunity reminder mock 模拟 dashboard 中“机会提醒”和“重新计算”两条路径。
// 当前只在稳定 fixture 间切换，不访问真实任务、联系人或提醒数据。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function opportunitiesSuccess(
  data: OpportunityReminderAnalyticsPayload,
): OpportunityReminderAnalyticsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function recomputeSuccess(
  data: OpportunityReminderRecomputePayload,
): OpportunityReminderRecomputeResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: OpportunityReminderAnalyticsErrorCode,
): OpportunityReminderAnalyticsFailure {
  // 失败响应保留机会提醒的 mock provenance，便于 UI 显示数据来源。
  const definition = OPPORTUNITY_REMINDER_ANALYTICS_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockOpportunityReminderAnalyticsFailureProvenance,
      evidenceIds: mockOpportunityReminderAnalyticsFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: OpportunityReminderAnalyticsInput["scenario"],
): OpportunityReminderAnalyticsScenario {
  // 未知 scenario 不进入异常分支，默认展示 success fixture。
  if (
    scenario &&
    supportedScenarios.has(scenario as OpportunityReminderAnalyticsScenario)
  ) {
    return scenario as OpportunityReminderAnalyticsScenario;
  }

  return "success";
}

function opportunityScenarioResult(
  scenario: OpportunityReminderAnalyticsScenario,
): OpportunityReminderAnalyticsResult {
  // 读取分析和重算动作共享同一组 scenario 语义。
  switch (scenario) {
    case "empty":
      return opportunitiesSuccess(mockEmptyOpportunityReminderAnalyticsFixture);
    case "pending":
      return opportunitiesSuccess(mockPendingOpportunityReminderAnalyticsFixture);
    case "failure":
      return failure("OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED");
    case "success":
    default:
      return opportunitiesSuccess(mockOpportunityReminderAnalyticsFixture);
  }
}

function recomputeScenarioResult(
  scenario: OpportunityReminderAnalyticsScenario,
): OpportunityReminderRecomputeResult {
  switch (scenario) {
    case "empty":
      return recomputeSuccess(mockEmptyOpportunityReminderRecomputeFixture);
    case "pending":
      return recomputeSuccess(mockPendingOpportunityReminderRecomputeFixture);
    case "failure":
      return failure("OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED");
    case "success":
    default:
      return recomputeSuccess(mockOpportunityReminderRecomputeFixture);
  }
}

export function createMockOpportunityReminderAnalyticsService(): OpportunityReminderAnalyticsService {
  return {
    getOpportunityReminderAnalytics(
      input = {},
    ): OpportunityReminderAnalyticsResult {
      // dashboard 只读分析视图。
      return opportunityScenarioResult(normalizeScenario(input.scenario));
    },

    recomputeOpportunityReminderAnalytics(
      input = {},
    ): OpportunityReminderRecomputeResult {
      // recompute 返回“已重算”的 fixture，不触发真实后台计算。
      return recomputeScenarioResult(normalizeScenario(input.scenario));
    },
  };
}

export type {
  OpportunityReminderAnalyticsResult,
  OpportunityReminderAnalyticsService,
  OpportunityReminderRecomputeResult,
};
