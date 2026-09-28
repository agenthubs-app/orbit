import { useLocalDashboardSource, type LocalDashboardState } from "./local-dashboard-source";
import { useWebMirrorStatus } from "./useWebMirrorStatus";

export type { LocalDashboardState } from "./local-dashboard-source";

/**
 * Browser build (sprint 0117): the dashboard graph is on the browser mirror
 * whitelist (threat model §2), so the mirror is the source whenever it is
 * active. Without it (non-secure context, missing OPFS/IndexedDB/Web Crypto,
 * open failure) the screens keep their server reads.
 */
export function useLocalDashboard(probe = true): LocalDashboardState {
  return useLocalDashboardSource(useWebMirrorStatus().mode === "local-mirror", probe);
}
