import type {
  DashboardAggregateFailure,
  DashboardAggregateInput,
  DashboardAggregateResult,
  DashboardAggregateSummaryInput,
  DashboardAggregateSummaryResult,
} from "./contract";
import {
  dashboardAggregateFailureContext,
  dashboardAggregateFailureToAppError,
} from "./contract";

export interface DashboardAggregateService {
  getDashboardAggregate: (
    input?: DashboardAggregateInput,
  ) => DashboardAggregateResult;
  getDashboardSummary: (
    input?: DashboardAggregateSummaryInput,
  ) => DashboardAggregateSummaryResult;
}

export {
  dashboardAggregateFailureContext,
  dashboardAggregateFailureToAppError,
};

export type {
  DashboardAggregateFailure,
  DashboardAggregateInput,
  DashboardAggregateResult,
  DashboardAggregateSummaryInput,
  DashboardAggregateSummaryResult,
};
