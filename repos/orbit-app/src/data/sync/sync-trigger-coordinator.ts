import type {
  Clock,
  Trigger,
  TriggerCoordinator,
  ValidatedInvalidation,
} from "./invalidation-transport";

type Waiter = {
  domains: ReadonlySet<string>;
  full: boolean;
  resolve(): void;
  reject(error: unknown): void;
  settled: boolean;
};

const BACKOFF_CAPS = [1000, 2000, 4000, 8000, 30000] as const;

function abortError(): Error {
  const error = new Error("ABORTED");
  error.name = "AbortError";
  return error;
}

function settle(waiters: readonly Waiter[], error?: unknown) {
  for (const waiter of waiters) {
    if (waiter.settled) continue;
    waiter.settled = true;
    if (error === undefined) waiter.resolve();
    else waiter.reject(error);
  }
}

function isCovered(waiter: Waiter, active: ReadonlySet<string>, activeFull: boolean): boolean {
  if (waiter.full) return activeFull;
  if (activeFull) return true;
  return [...waiter.domains].every(domain => active.has(domain));
}

export function createTriggerCoordinator(input: {
  clock: Clock;
  validate: (value: unknown) => ValidatedInvalidation;
  run: (domains: readonly string[], reason: Trigger, signal: AbortSignal) => Promise<void>;
  onError?: (code: "invalid") => void;
}): TriggerCoordinator {
  const dirty = new Set<string>();
  const accepted = new Map<string, { epoch: string; watermark: bigint }>();
  let dirtyAll = false;
  let disposed = false;
  let running = false;
  let activeFull = false;
  let activeBatch = new Set<string>();
  let activeWaiters: Waiter[] = [];
  let pendingWaiters: Waiter[] = [];
  let activeAbort: AbortController | undefined;
  let debounceTimer: unknown;
  let retryTimer: unknown;
  let attempt = 0;
  let pendingReason: Trigger = "hint";

  const clearRetry = () => {
    if (retryTimer === undefined) return;
    input.clock.clear(retryTimer);
    retryTimer = undefined;
  };

  const clearDebounce = () => {
    if (debounceTimer === undefined) return;
    input.clock.clear(debounceTimer);
    debounceTimer = undefined;
  };

  const queueFullRefresh = () => {
    dirtyAll = true;
    dirty.clear();
  };

  const scheduleRetry = (reason: Trigger) => {
    clearRetry();
    const cap = BACKOFF_CAPS[Math.min(attempt - 1, BACKOFF_CAPS.length - 1)]!;
    const delay = input.clock.random() * cap;
    retryTimer = input.clock.set(() => {
      retryTimer = undefined;
      void pump(reason);
    }, delay);
  };

  const pump = async (reason: Trigger): Promise<void> => {
    if (disposed || running || retryTimer !== undefined || (!dirtyAll && dirty.size === 0)) return;
    running = true;
    activeFull = dirtyAll;
    activeBatch = new Set(dirty);
    dirtyAll = false;
    dirty.clear();
    activeWaiters = pendingWaiters;
    pendingWaiters = [];
    activeAbort = new AbortController();
    const domains = activeFull ? [] : [...activeBatch];
    let failed = false;

    try {
      await input.run(domains, reason, activeAbort.signal);
      attempt = 0;
      settle(activeWaiters);
    } catch (error) {
      failed = true;
      if (activeFull) queueFullRefresh();
      else for (const domain of activeBatch) dirty.add(domain);
      settle(activeWaiters, error);
      if (!disposed && (error as { name?: string } | null)?.name !== "AbortError") {
        attempt++;
        scheduleRetry(reason);
      }
    } finally {
      activeWaiters = [];
      activeBatch = new Set();
      activeFull = false;
      activeAbort = undefined;
      running = false;
      if (!disposed && !failed && debounceTimer === undefined && (dirtyAll || dirty.size > 0)) {
        void pump(pendingReason);
      }
    }
  };

  const scheduleHint = () => {
    if (debounceTimer !== undefined || disposed) return;
    debounceTimer = input.clock.set(() => {
      debounceTimer = undefined;
      pendingReason = "hint";
      void pump("hint");
    }, 250);
  };

  return {
    request(reason, domains) {
      if (disposed) return Promise.reject(abortError());
      clearDebounce();
      const unique = new Set(domains);
      const waiter = {} as Waiter;
      const result = new Promise<void>((resolve, reject) => {
        Object.assign(waiter, { domains: unique, full: unique.size === 0, resolve, reject, settled: false });
      });

      if (running && isCovered(waiter, activeBatch, activeFull)) {
        activeWaiters.push(waiter);
        return result;
      }

      pendingWaiters.push(waiter);
      if (unique.size === 0) queueFullRefresh();
      else if (!dirtyAll) for (const domain of unique) dirty.add(domain);
      pendingReason = reason;

      if (reason === "manual") clearRetry();
      void pump(reason);
      return result;
    },

    hint(value) {
      if (disposed) return;
      let summary: ValidatedInvalidation;
      try {
        summary = input.validate(value);
      } catch {
        input.onError?.("invalid");
        queueFullRefresh();
        scheduleHint();
        return;
      }

      for (const domain of summary.domains) {
        let watermark: bigint;
        try {
          watermark = BigInt(domain.watermark);
        } catch {
          input.onError?.("invalid");
          queueFullRefresh();
          continue;
        }
        const previous = accepted.get(domain.domainId);
        if (previous && previous.epoch !== domain.authorizationEpoch) {
          input.onError?.("invalid");
          accepted.set(domain.domainId, { epoch: domain.authorizationEpoch, watermark });
          queueFullRefresh();
          continue;
        }
        if (domain.reason === "not-authorized") {
          if (!previous || watermark > previous.watermark) {
            accepted.set(domain.domainId, { epoch: domain.authorizationEpoch, watermark });
          }
          queueFullRefresh();
          continue;
        }
        if (domain.reason === "reset-required") {
          if (!previous || watermark > previous.watermark) {
            accepted.set(domain.domainId, { epoch: domain.authorizationEpoch, watermark });
          }
          if (!dirtyAll) dirty.add(domain.domainId);
          continue;
        }
        if (previous && watermark <= previous.watermark) continue;
        accepted.set(domain.domainId, { epoch: domain.authorizationEpoch, watermark });
        if (domain.reason !== "unchanged" && !dirtyAll) dirty.add(domain.domainId);
      }
      scheduleHint();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      clearDebounce();
      clearRetry();
      activeAbort?.abort();
      const error = abortError();
      settle(activeWaiters, error);
      settle(pendingWaiters, error);
      activeWaiters = [];
      pendingWaiters = [];
      dirty.clear();
      dirtyAll = false;
    },
  };
}
