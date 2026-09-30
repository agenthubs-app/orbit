// Sprint 0117 (dashboard D3): the dashboard aggregate service and its graph
// oracle live in the shared directory (shared/compute/dashboard-aggregate.ts);
// the App runs the same code on its device copy of the graph.
export {
  createLiveDashboardAggregateService,
  dashboardAggregateReadModelFromGraph,
  type DashboardAggregateReadModel,
  type DashboardContactRoleCount,
  type LiveDashboardAggregateProvider,
  type LiveDashboardAggregateServiceOptions,
} from "../../shared/compute/dashboard-aggregate";
