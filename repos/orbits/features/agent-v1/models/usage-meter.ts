/**
 * The round's model usage meter (iOrbit 对话计量，2026-11-27).
 *
 * The entry (entry/service.ts) opens one ledger operation per round and runs the round inside
 * `runWithModelUsageMeter`; every model HTTP of that round — the main model (models/main.ts) and the
 * judgment model (judgment/gemini-decision.ts) — goes through `meteredModelCall`, which records one
 * `ai_usage_calls` row before the request and its tokens after it. Outside a metered round (tests,
 * evals, other callers) nothing is recorded.
 *
 * The meter never stops a call: a meter that cannot record returns no call id and the request is
 * sent anyway (fail-open; the round's own budget in code still limits the calls).
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface ModelCallUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelUsageMeter {
  /** Before one HTTP: a call id, or null when the call is not recorded. Never throws. */
  begin(call: { provider: string; model: string }): Promise<string | null>;
  /** After it: the tokens, or null when no usage came back (recorded as no response). Never throws. */
  end(callId: string | null, usage: ModelCallUsage | null): Promise<void>;
}

function meterStore(): AsyncLocalStorage<ModelUsageMeter> {
  const holder = globalThis as { __orbitAgentModelUsageMeter?: AsyncLocalStorage<ModelUsageMeter> };
  holder.__orbitAgentModelUsageMeter ??= new AsyncLocalStorage<ModelUsageMeter>();
  return holder.__orbitAgentModelUsageMeter;
}

export function runWithModelUsageMeter<T>(meter: ModelUsageMeter | null, operation: () => T): T {
  return meter ? meterStore().run(meter, operation) : operation();
}

export function currentModelUsageMeter(): ModelUsageMeter | null {
  return meterStore().getStore() ?? null;
}

/** One model HTTP, recorded on the round's meter when there is one. */
export async function meteredModelCall<T>(
  call: { provider: string; model: string },
  send: () => Promise<T>,
  usageOf: (result: T) => ModelCallUsage | null,
): Promise<T> {
  const meter = currentModelUsageMeter();
  if (!meter) return send();
  const callId = await meter.begin(call);
  let result: T;
  try {
    result = await send();
  } catch (error) {
    await meter.end(callId, null);
    throw error;
  }
  await meter.end(callId, usageOf(result));
  return result;
}
