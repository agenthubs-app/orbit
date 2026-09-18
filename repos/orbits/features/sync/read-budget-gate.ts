import { AppError } from "../../shared/errors/app-error";
import type {
  LiveRecordGetQuery,
  LiveRecordListQuery,
  LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";
import type { PostgresReadMetric } from "../../shared/storage/postgres-read-metrics";

/**
 * Process-local read budget. Every measured SQL read adds its rows and bytes
 * to a sliding window; once either limit is crossed, non-critical reads fail
 * closed with an explicit reason until the window drains. Writes and the
 * collections that authenticate or authorise a user are never gated — a cost
 * breaker must not lock people out of their own account.
 *
 * Like write-gate.ts, callers pass through the gate explicitly; the gate never
 * touches the database itself.
 */
export interface ReadBudgetGateOptions {
  windowMs: number;
  maxRows: number | null;
  maxBytes: number | null;
  now?: () => number;
  criticalCollections?: ReadonlySet<string>;
  onStateChange?: (event: ReadBudgetGateEvent) => void;
}

export interface ReadBudgetGateEvent {
  event: "read_budget_gate";
  state: "open" | "closed";
  rows: number;
  bytes: number;
  maxRows: number | null;
  maxBytes: number | null;
  windowMs: number;
}

export interface ReadBudgetGateSnapshot {
  rows: number;
  bytes: number;
  windowMs: number;
  maxRows: number | null;
  maxBytes: number | null;
  /** true while reads are being rejected. */
  open: boolean;
}

export interface ReadBudgetGate {
  observe(metric: PostgresReadMetric): void;
  assertAllowed(input: { collectionName?: string; critical?: boolean }): void;
  snapshot(): ReadBudgetGateSnapshot;
}

/** Collections a signed-in user needs before anything else can be decided. */
export const READ_BUDGET_CRITICAL_COLLECTIONS: ReadonlySet<string> = new Set(["accounts", "auth_users", "permissions", "profiles"]);

export class ReadBudgetExceededError extends AppError {
  constructor(
    readonly detail: { rows: number; bytes: number; maxRows: number | null; maxBytes: number | null; windowMs: number; collectionName?: string },
  ) {
    const parts: string[] = [];
    if (detail.maxRows !== null && detail.rows > detail.maxRows) parts.push(`rows ${detail.rows}/${detail.maxRows}`);
    if (detail.maxBytes !== null && detail.bytes > detail.maxBytes) parts.push(`bytes ${detail.bytes}/${detail.maxBytes}`);
    super(
      "SERVICE_UNAVAILABLE",
      `read budget exceeded: ${parts.join(", ")} in ${detail.windowMs}ms window${detail.collectionName ? ` (collection ${detail.collectionName})` : ""}`,
    );
    this.name = "ReadBudgetExceededError";
  }
}

const DEFAULT_WINDOW_MS = 60_000;

function positiveInteger(env: Record<string, string | undefined>, key: string): number | null {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${key} must be a positive integer, got "${raw}".`);
  return value;
}

/** null when no threshold is configured: the gate is opt-in and otherwise absent. */
export function resolveReadBudgetGateOptions(
  env: Record<string, string | undefined> = process.env,
): Pick<ReadBudgetGateOptions, "windowMs" | "maxRows" | "maxBytes"> | null {
  const maxRows = positiveInteger(env, "ORBIT_READ_BUDGET_ROWS_PER_MINUTE");
  const maxBytes = positiveInteger(env, "ORBIT_READ_BUDGET_BYTES_PER_MINUTE");
  if (maxRows === null && maxBytes === null) return null;
  return { windowMs: DEFAULT_WINDOW_MS, maxRows, maxBytes };
}

export function createReadBudgetGate({
  windowMs,
  maxRows,
  maxBytes,
  now = Date.now,
  criticalCollections = READ_BUDGET_CRITICAL_COLLECTIONS,
  onStateChange,
}: ReadBudgetGateOptions): ReadBudgetGate {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new RangeError("windowMs must be a positive integer");
  const samples: { at: number; rows: number; bytes: number }[] = [];
  let rows = 0;
  let bytes = 0;
  let open = false;

  function drain(): void {
    const cutoff = now() - windowMs;
    while (samples.length > 0 && samples[0]!.at <= cutoff) {
      const expired = samples.shift()!;
      rows -= expired.rows;
      bytes -= expired.bytes;
    }
  }

  function exceeded(): boolean {
    return (maxRows !== null && rows > maxRows) || (maxBytes !== null && bytes > maxBytes);
  }

  function transition(next: boolean): void {
    if (next === open) return;
    open = next;
    onStateChange?.({ event: "read_budget_gate", state: next ? "open" : "closed", rows, bytes, maxRows, maxBytes, windowMs });
  }

  return {
    observe(metric) {
      if (metric.failed) return;
      drain();
      samples.push({ at: now(), rows: metric.returnedRows, bytes: metric.approximateSerializedRowBytes });
      rows += metric.returnedRows;
      bytes += metric.approximateSerializedRowBytes;
    },
    assertAllowed(input) {
      drain();
      transition(exceeded());
      if (input.critical || (input.collectionName !== undefined && criticalCollections.has(input.collectionName))) return;
      if (open) throw new ReadBudgetExceededError({ rows, bytes, maxRows, maxBytes, windowMs, collectionName: input.collectionName });
    },
    snapshot() {
      drain();
      transition(exceeded());
      return { rows, bytes, windowMs, maxRows, maxBytes, open };
    },
  };
}

/** Reads pass through the gate; writes are untouched. Returns the store itself when there is no gate. */
export function createReadBudgetGatedLiveRecordStore<TPayload extends Record<string, unknown>>(
  store: LiveRecordStoreLike<TPayload>,
  gate: ReadBudgetGate | null,
): LiveRecordStoreLike<TPayload> {
  if (!gate) return store;
  return {
    ...store,
    getRecord(query: LiveRecordGetQuery) {
      gate.assertAllowed({ collectionName: query.collectionName });
      return store.getRecord(query);
    },
    listRecords(query: LiveRecordListQuery) {
      gate.assertAllowed({ collectionName: query.collectionName });
      return store.listRecords(query);
    },
  };
}

let sharedGate: { key: string; gate: ReadBudgetGate | null } | null = null;

/** One gate per process and configuration; logs state transitions once each. */
export function resolveSharedReadBudgetGate(env: Record<string, string | undefined> = process.env): ReadBudgetGate | null {
  const options = resolveReadBudgetGateOptions(env);
  const key = JSON.stringify(options);
  if (sharedGate?.key === key) return sharedGate.gate;
  const gate = options
    ? createReadBudgetGate({
        ...options,
        onStateChange: (event) => {
          try { console.warn(JSON.stringify(event)); } catch { /* observability must not break reads */ }
        },
      })
    : null;
  sharedGate = { key, gate };
  return gate;
}
