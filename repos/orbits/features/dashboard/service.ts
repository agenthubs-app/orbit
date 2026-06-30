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

// DashboardAggregateService 聚合首页所需的跨模块概览。
// 它面向 UI 提供读模型，不承担 contacts/events/followups 的写操作。
export interface DashboardAggregateService {
  // 返回首页完整聚合数据。
  getDashboardAggregate: (
    input?: DashboardAggregateInput,
  ) => DashboardAggregateResult;
  // 返回更轻量的摘要数据，适合导航或小组件使用。
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
