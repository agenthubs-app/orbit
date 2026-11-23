import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";

/**
 * Agent trace events (agent-design CONVENTIONS §1, eval/README.md §4).
 *
 * `emitTrace` is a no-op unless the process runs under the agent eval: either the eval
 * preload is loaded (it owns sequencing and secret scrubbing) or `ORBIT_AGENT_TRACE_DIR`
 * is set. It never throws and never changes what the caller returns; a failed write is
 * counted in `traceWriteFailures()` and dropped.
 */
export type AgentTraceSource = "real" | "simulated" | "replay";

export interface AgentTraceEvent {
  /** `turn.*`, `node.enter`, `model.request`, `card.frozen`, `exec.call`, `db.write`, … */
  type: string;
  source?: AgentTraceSource;
  requestId?: string;
  partId?: string;
  [field: string]: unknown;
}

export interface AgentEvalFault {
  where: string;
  kind: string;
  quote?: string | null;
  appliedFlag?: boolean | null;
}

interface AgentEvalHook {
  emit(event: Record<string, unknown>): void;
  takeFault?(where: string): AgentEvalFault | null;
  /** AG03: a per-case deployment setting the eval set (e.g. model_calls_limit for model-budget-1). */
  setting?(name: string): unknown;
  /** AG05: record ids whose read permission the case withdrew (`revoke: { read }`). */
  deniedReads?(): readonly string[];
}

const SECRET_KEY = /^(authorization|cookie|set-cookie|password|secret|token|api[-_]?key|access[-_]?token)$/iu;
let failures = 0;

function evalHook(): AgentEvalHook | null {
  const hook = (globalThis as { __orbitAgentEval?: AgentEvalHook }).__orbitAgentEval;
  return hook && typeof hook.emit === "function" ? hook : null;
}

function withoutSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => withoutSecrets(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SECRET_KEY.test(key) ? "[redacted]" : withoutSecrets(item, depth + 1)]),
  );
}

export interface AgentTraceContext {
  requestId: string;
  /** AG03: the graph node running (understand, answer …); model events and eval faults read it. */
  node?: string;
}

/**
 * AG01: the request being processed, so that events emitted deeper down (and the eval
 * preload's model.* / db.* events, which read the same store through globalThis) carry
 * its requestId. One store per process, shared by every bundle that loads this module.
 */
function traceContextStore(): AsyncLocalStorage<AgentTraceContext> {
  const holder = globalThis as { __orbitAgentTraceContext?: AsyncLocalStorage<AgentTraceContext> };
  holder.__orbitAgentTraceContext ??= new AsyncLocalStorage<AgentTraceContext>();
  return holder.__orbitAgentTraceContext;
}

export function runWithTraceContext<T>(context: AgentTraceContext, operation: () => T): T {
  return traceContextStore().run(context, operation);
}

export function currentTraceContext(): AgentTraceContext | null {
  return traceContextStore().getStore() ?? null;
}

export function emitTrace(event: AgentTraceEvent): void {
  try {
    const hook = evalHook();
    const context = currentTraceContext();
    const payload = withoutSecrets({ origin: "product", ...(context && !event.requestId ? { requestId: context.requestId } : {}), ...(context?.node && !event.node ? { node: context.node } : {}), ...event }) as Record<string, unknown>;
    if (hook) {
      hook.emit(payload);
      return;
    }
    const dir = process.env.ORBIT_AGENT_TRACE_DIR?.trim();
    if (!dir) return;
    fs.appendFileSync(path.join(dir, "server.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, caseId: null, ...payload })}\n`);
  } catch {
    failures += 1;
  }
}

export function traceWriteFailures(): number {
  return failures;
}

/**
 * Eval-only fault injection (CONVENTIONS §2 "故障注入点"): returns the armed fault for `where`
 * when the eval preload is loaded, otherwise null. Production builds never load the preload.
 */
export function takeEvalFault(where: string): AgentEvalFault | null {
  try {
    return evalHook()?.takeFault?.(where) ?? null;
  } catch {
    return null;
  }
}

/**
 * Eval-only deployment setting for the current case (AG03: `model_calls_limit` of the
 * model-budget-1 patch). Null outside the eval; production builds never load the preload.
 */
export function evalSetting(name: string): unknown {
  try {
    return evalHook()?.setting?.(name) ?? null;
  } catch {
    return null;
  }
}

/**
 * Eval-only deny list (agent-design AG05, PLANNER 出入 4): the product has no per-record read permission
 * yet, so `revoke: { read }` is a list the eval keeps and every read checks. Empty outside the eval.
 */
export function evalDeniedReads(): ReadonlySet<string> {
  try {
    return new Set(evalHook()?.deniedReads?.() ?? []);
  } catch {
    return new Set();
  }
}
