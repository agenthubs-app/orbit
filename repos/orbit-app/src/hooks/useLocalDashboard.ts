import { useLocalDashboardSource, type LocalDashboardState } from "./local-dashboard-source";

export type { LocalDashboardState } from "./local-dashboard-source";

/**
 * Sprint 0117, native: the device mirror is always the source for the
 * dashboard and the contacts analysis. `probe`: ask the server on open.
 */
export function useLocalDashboard(probe = true): LocalDashboardState {
  return useLocalDashboardSource(true, probe);
}
