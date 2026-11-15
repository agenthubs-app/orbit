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

export function emitTrace(event: AgentTraceEvent): void {
  try {
    const hook = evalHook();
    const payload = withoutSecrets({ origin: "product", ...event }) as Record<string, unknown>;
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
