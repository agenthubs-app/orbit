import {
  OPPORTUNITY_REMINDER_ANALYTICS_ERROR_DEFINITIONS,
  mockEmptyOpportunityReminderAnalyticsFixture,
  mockEmptyOpportunityReminderRecomputeFixture,
  mockOpportunityReminderAnalyticsFailureProvenance,
  mockOpportunityReminderAnalyticsFixture,
  mockOpportunityReminderRecomputeFixture,
  mockPendingOpportunityReminderAnalyticsFixture,
  mockPendingOpportunityReminderRecomputeFixture,
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

const supportedScenarios = new Set<OpportunityReminderAnalyticsScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

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
      return opportunityScenarioResult(normalizeScenario(input.scenario));
    },

    recomputeOpportunityReminderAnalytics(
      input = {},
    ): OpportunityReminderRecomputeResult {
      return recomputeScenarioResult(normalizeScenario(input.scenario));
    },
  };
}

export type {
  OpportunityReminderAnalyticsResult,
  OpportunityReminderAnalyticsService,
  OpportunityReminderRecomputeResult,
};
