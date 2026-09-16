import type { Clock, InvalidationTransport } from "./invalidation-transport";

export function createPollingTransport(input: {
  clock: Clock;
  intervalMs: 5000 | 15000;
  read: (signal: AbortSignal) => Promise<unknown>;
}): InvalidationTransport {
  return {
    async start(listener) {
      if (listener.signal.aborted) return () => undefined;

      const controller = new AbortController();
      let stopped = false;
      let timer: unknown;

      const stop = () => {
        if (stopped) return;
        stopped = true;
        listener.signal.removeEventListener("abort", stop);
        if (timer !== undefined) input.clock.clear(timer);
        controller.abort();
      };

      const poll = async () => {
        if (stopped) return;
        try {
          const value = await input.read(controller.signal);
          if (!stopped) listener.onHint(value);
        } catch {
          if (!stopped) listener.onError("network");
        } finally {
          if (!stopped) timer = input.clock.set(() => void poll(), input.intervalMs);
        }
      };

      listener.signal.addEventListener("abort", stop, { once: true });
      void poll();
      return stop;
    },
  };
}
