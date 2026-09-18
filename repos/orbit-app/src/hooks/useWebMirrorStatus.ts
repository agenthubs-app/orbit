import { useSyncExternalStore } from "react";

import { syncLifecycle, type WebMirrorStatus } from "../data/sync/sync-lifecycle.web";

/** Browser-only: what the local mirror is doing right now, for the settings surface. */
export function useWebMirrorStatus(): WebMirrorStatus {
  return useSyncExternalStore(syncLifecycle.subscribe, syncLifecycle.status, syncLifecycle.status);
}
