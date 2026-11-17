export { pendingTargetsOf } from "./card-pending-targets";

/** agent-design AG07, browser: writes never queue in the browser build (D2), so no card is held back by an unsynced edit. */
export function useCardLocalPendingEdits(_enabled = true): { pendingTargets: readonly string[]; syncedAt: string | null } {
  return { pendingTargets: [], syncedAt: null };
}
