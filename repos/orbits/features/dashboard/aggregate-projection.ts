// Sprint 0117 (dashboard D3): the aggregate projection helpers live in the
// shared directory (shared/compute/dashboard-aggregate.ts), which the App
// runs too; this module re-exports them for the server's existing imports.
export {
  applyDashboardActivityLimit,
  dashboardContactsById,
  dashboardDueLabel,
  dashboardPriorityScore,
  dashboardShortListActivityLimit,
  dashboardValueType,
  normalizeDashboardActivityLimit,
  normalizeDashboardAggregateScenario,
} from "../../shared/compute/dashboard-aggregate";
