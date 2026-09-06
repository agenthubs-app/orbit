import { abortableWait } from "./abortable-wait";

/** Drain every started task before retrying or shutting down. */
export async function settleAgentWorkerBatch<T extends readonly unknown[]>(
  tasks: { [K in keyof T]: Promise<T[K]> },
): Promise<T> {
  const results = await Promise.allSettled(tasks);
  if (results.some((result) => result.status === "rejected")) {
    // Do not propagate provider payloads into worker logs.
    throw new Error("Agent worker batch failed.");
  }
  return results.map((result) =>
    result.status === "fulfilled" ? result.value : undefined,
  ) as unknown as T;
}

export async function runAgentWorkerLoop(input: {
  signal: AbortSignal;
  pollIntervalMs: number;
  runIteration: () => Promise<void>;
  onFailure: (backoffMs: number) => void;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  let failures = 0;
  const wait = input.wait ?? abortableWait;
  while (!input.signal.aborted) {
    let delay = input.pollIntervalMs;
    try {
      await input.runIteration();
      failures = 0;
    } catch {
      failures += 1;
      delay = Math.min(30_000, input.pollIntervalMs * 2 ** Math.min(5, failures - 1));
      input.onFailure(delay);
    }
    if (!input.signal.aborted) await wait(delay, input.signal);
  }
}
