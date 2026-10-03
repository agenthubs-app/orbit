import type { ReachabilityListener } from "../../api/server-reachability";

/** Design step 8: the foreground poll that also uploads a non-empty queue. */
export const OUTBOX_POLL_INTERVAL_MS = 15_000;

interface AppStateLike {
  readonly currentState: string | null;
  addEventListener(event: "change", listener: (state: string) => void): { remove(): void };
}

interface IntervalTimers {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultTimers: IntervalTimers = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * Sprint 0136 (承接 0035 SC-03): the App's upload entry points in one place. Each
 * one calls `syncOutbox`, which runs the coordinator's single order — confirm the
 * session online (lease) → upload the queue → pull. The coordinator merges entry
 * points that arrive together into one flight.
 *   - cold start / sign-in: once, as soon as a signed-in scope exists;
 *   - back to the foreground;
 *   - the server answers again after being unreachable (network restored);
 *   - every 15 seconds while the App is active.
 * The fourth entry, a notification tap, is `syncThenNavigate`.
 */
export function startOutboxUploadTriggers(input: {
  syncOutbox: () => void;
  appState: AppStateLike;
  reachability: { subscribe(listener: ReachabilityListener): () => void };
  baseUrl: string;
  timers?: IntervalTimers;
  intervalMs?: number;
}): () => void {
  const timers = input.timers ?? defaultTimers;
  const target = input.baseUrl.trim().replace(/\/+$/u, "");
  input.syncOutbox();
  const periodic = timers.setInterval(() => {
    if (input.appState.currentState === "active") input.syncOutbox();
  }, input.intervalMs ?? OUTBOX_POLL_INTERVAL_MS);
  const foreground = input.appState.addEventListener("change", state => {
    if (state === "active") input.syncOutbox();
  });
  const unsubscribeReachability = input.reachability.subscribe((url, state, previous) => {
    if (state === "reachable" && previous === "unreachable" && url === target) input.syncOutbox();
  });
  return () => {
    timers.clearInterval(periodic);
    foreground.remove();
    unsubscribeReachability();
  };
}

/**
 * A notification tap: upload and pull first, then open the target either way, so
 * the page opens on server state that already includes this device's own writes.
 * The notification's own data is never trusted as business data.
 */
export function syncThenNavigate(
  session: { synchronize(kind: "note", options: { reason: "explicit" }): { promise: Promise<unknown> } } | null,
  navigate: () => void,
): Promise<void> {
  if (!session) {
    navigate();
    return Promise.resolve();
  }
  return session.synchronize("note", { reason: "explicit" }).promise.then(() => navigate(), () => navigate());
}
