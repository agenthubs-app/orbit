import fs from "node:fs";
import path from "node:path";

export interface TraceEvent {
  seq?: number;
  type: string;
  at?: string;
  realAt?: string;
  caseId?: string | null;
  origin?: string;
  source?: "real" | "simulated" | "replay";
  [field: string]: unknown;
}

const SECRET_HEADER = /^(authorization|cookie|set-cookie|x-api-key)$/iu;

export function scrubSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) if (secret && secret.length >= 8) out = out.split(secret).join("[redacted]");
  return out.replace(/authjs\.session-token=[^;"\s]+/gu, "authjs.session-token=[redacted]").replace(/Bearer\s+[A-Za-z0-9._~+/-]{12,}=*/gu, "Bearer [redacted]");
}

export function safeHeaders(headers: Record<string, string> | Headers | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const entries = headers instanceof Headers ? [...headers.entries()] : Object.entries(headers);
  for (const [key, value] of entries) out[key] = SECRET_HEADER.test(key) ? "[redacted]" : value;
  return out;
}

/** Runner-side events (turn.*, http.*, client observations); times are real time plus the case clock. */
export class CaseLog {
  readonly events: TraceEvent[] = [];
  constructor(readonly caseId: string, private readonly clockNow: () => string) {}
  push(event: TraceEvent): TraceEvent {
    const full = { at: this.clockNow(), caseId: this.caseId, origin: "runner", realAt: new Date().toISOString(), ...event };
    this.events.push(full);
    return full;
  }
}

export function serverTraceFile(traceDir: string): string {
  return path.join(traceDir, "server.jsonl");
}

export function traceFileSize(traceDir: string): number {
  try {
    return fs.statSync(serverTraceFile(traceDir)).size;
  } catch {
    return 0;
  }
}

/** Server events appended since `offset` for this case. */
export function readServerEvents(traceDir: string, offset: number, caseId: string): TraceEvent[] {
  const file = serverTraceFile(traceDir);
  if (!fs.existsSync(file)) return [];
  const size = fs.statSync(file).size;
  if (size <= offset) return [];
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(size - offset);
    fs.readSync(fd, buffer, 0, buffer.length, offset);
    return buffer
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as TraceEvent;
        } catch {
          return { type: "error", error: "unparseable server trace line", raw: line.slice(0, 200) } as TraceEvent;
        }
      })
      .filter((event) => event.caseId === caseId || event.caseId === undefined || event.caseId === null)
      .map((event) => ({ origin: event.origin ?? "server-preload", ...event }));
  } finally {
    fs.closeSync(fd);
  }
}

/** One ordered trace: by real time, runner before server on ties; seq from 1. */
export function mergeTrace(runner: readonly TraceEvent[], server: readonly TraceEvent[]): TraceEvent[] {
  const all = [...runner.map((event, index) => ({ event, index, side: 0 })), ...server.map((event, index) => ({ event, index, side: 1 }))];
  all.sort((a, b) => {
    const ta = Date.parse(String(a.event.realAt ?? a.event.at ?? 0));
    const tb = Date.parse(String(b.event.realAt ?? b.event.at ?? 0));
    if (ta !== tb) return ta - tb;
    if (a.side !== b.side) return a.side - b.side;
    return a.index - b.index;
  });
  return all.map(({ event }, index) => ({ seq: index + 1, ...event }));
}
