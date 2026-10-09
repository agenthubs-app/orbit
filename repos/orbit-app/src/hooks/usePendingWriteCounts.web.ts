import { NO_PENDING_WRITES, type PendingWriteCounts } from "./pending-write-items";

export { NO_PENDING_WRITES, pendingWriteItems, type PendingWriteCounts } from "./pending-write-items";

/** Sprint 0136, browser: writes never queue in the browser (D2), so nothing is pending and no device scope is opened. */
export function usePendingWriteCounts(_enabled = true): PendingWriteCounts {
  return NO_PENDING_WRITES;
}
