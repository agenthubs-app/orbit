import { useEffect, useState } from "react";

/**
 * Sprint 0092: a loading state has to end.
 *
 * The IORBIT home regions each say "还在读" for as long as their request has not
 * settled, with no upper bound — a request that never answers spins forever and
 * leaves the user nothing to act on. This is the third face of the same rule as
 * 0078 (a failure shows the error, not an empty list) and 0087 (an empty list is
 * only a fact once a sync has happened): the outcomes have to be
 * distinguishable, and "still reading" cannot be one of them indefinitely.
 *
 * Reuses the 8s already used for a sync invalidation rather than inventing a
 * second number. Measured load for these regions is ~300ms, so the ceiling only
 * ever fires on something genuinely stuck.
 */
export const LOADING_DEADLINE_MS = 8_000;

/**
 * The timer itself, separate from the hook so it can be tested without a
 * renderer: this repo renders statically, so a test that went through React
 * could never let the clock run.
 */
export function scheduleLoadingDeadline(loading: boolean, ms: number, onOverdue: () => void): () => void {
  if (!loading) return () => {};
  const timer = setTimeout(onOverdue, ms);
  return () => { clearTimeout(timer); };
}

/**
 * True once `loading` has stayed true past the deadline.
 *
 * `attemptKey` restarts the clock. A retry can leave the resource in `loading`
 * without passing through a settled state, and would otherwise inherit the
 * expired deadline — showing the user the timeout they just dismissed.
 */
export function useLoadingDeadline(loading: boolean, attemptKey: string, ms: number = LOADING_DEADLINE_MS): boolean {
  const [overdue, setOverdue] = useState(false);
  useEffect(() => {
    setOverdue(false);
    return scheduleLoadingDeadline(loading, ms, () => { setOverdue(true); });
  }, [attemptKey, loading, ms]);
  return overdue && loading;
}
