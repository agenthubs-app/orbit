/**
 * Sprint 0131: whether the Orbit server answered the App's last request, per
 * base URL. The API client records every outcome (a response of any status
 * means reachable; a thrown fetch that was not aborted means unreachable), so
 * no extra request is made to learn it.
 *
 * Two consumers:
 *   - online-only pages show the calm 「需要联网」 state instead of an error
 *     page while the server is unreachable;
 *   - reconnect: while the server is unreachable and some screen watches for
 *     it, a cheap probe runs every RECONNECT_PROBE_INTERVAL_MS; the first
 *     answer flips the state back to reachable and every listener hears it at
 *     once (the device mirror syncs immediately instead of waiting for the next
 *     15-second poll).
 */
export type ServerReachabilityState = "unknown" | "reachable" | "unreachable";
export type ReachabilityListener = (baseUrl: string, state: ServerReachabilityState, previous: ServerReachabilityState) => void;

export const RECONNECT_PROBE_INTERVAL_MS = 3000;

interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultTimers: Timers = {
  setTimeout(callback, ms) {
    const handle = setTimeout(callback, ms) as unknown as { unref?: () => void };
    // Node (tests) must not stay alive for a probe; React Native timers have no unref.
    handle.unref?.();
    return handle;
  },
  clearTimeout(handle) { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

function key(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/u, "");
}

export function createServerReachability(options: { timers?: Timers; intervalMs?: number } = {}) {
  const timers = options.timers ?? defaultTimers;
  const intervalMs = options.intervalMs ?? RECONNECT_PROBE_INTERVAL_MS;
  const states = new Map<string, ServerReachabilityState>();
  const listeners = new Set<ReachabilityListener>();
  const watchers = new Map<string, { count: number; probes: Set<() => Promise<unknown>>; timer: unknown; running: boolean }>();

  function set(baseUrl: string, state: ServerReachabilityState): void {
    const id = key(baseUrl);
    const previous = states.get(id) ?? "unknown";
    if (previous === state) return;
    states.set(id, state);
    for (const listener of [...listeners]) {
      try { listener(id, state, previous); } catch { /* a listener must not break the client */ }
    }
    schedule(id);
  }

  function schedule(id: string): void {
    const watcher = watchers.get(id);
    if (!watcher) return;
    if ((states.get(id) ?? "unknown") !== "unreachable" || watcher.count === 0) {
      if (watcher.timer !== null) timers.clearTimeout(watcher.timer);
      watcher.timer = null;
      return;
    }
    if (watcher.timer !== null || watcher.running) return;
    watcher.timer = timers.setTimeout(() => {
      watcher.timer = null;
      const probe = [...watcher.probes][0];
      if (!probe || watcher.count === 0) return;
      watcher.running = true;
      void probe().catch(() => undefined).finally(() => {
        watcher.running = false;
        schedule(id);
      });
    }, intervalMs);
  }

  return {
    state(baseUrl: string): ServerReachabilityState {
      return states.get(key(baseUrl)) ?? "unknown";
    },
    markReachable(baseUrl: string): void { set(baseUrl, "reachable"); },
    markUnreachable(baseUrl: string): void { set(baseUrl, "unreachable"); },
    subscribe(listener: ReachabilityListener): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /**
     * Keep probing while unreachable. `probe` is a request through the API
     * client (which records the outcome); the returned function stops watching.
     */
    watchReconnect(baseUrl: string, probe: () => Promise<unknown>): () => void {
      const id = key(baseUrl);
      const watcher = watchers.get(id) ?? { count: 0, probes: new Set(), timer: null, running: false };
      watchers.set(id, watcher);
      watcher.count += 1;
      watcher.probes.add(probe);
      schedule(id);
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        watcher.count -= 1;
        watcher.probes.delete(probe);
        schedule(id);
        if (watcher.count === 0 && watcher.timer === null && !watcher.running) watchers.delete(id);
      };
    },
    /** Tests only: forget every state. */
    reset(): void {
      states.clear();
      for (const watcher of watchers.values()) if (watcher.timer !== null) timers.clearTimeout(watcher.timer);
      watchers.clear();
    },
  };
}

export const serverReachability = createServerReachability();
