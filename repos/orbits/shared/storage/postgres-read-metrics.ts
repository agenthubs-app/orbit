import { createHash } from "node:crypto";

import { readReceiptsEnabled, recordReadReceiptMetric } from "../observability/read-receipts";

export const POSTGRES_READ_METRICS_ENV = "ORBIT_PG_READ_METRICS";

export type PostgresReadQueryKind =
  | "select"
  | "with"
  | "show"
  | "values"
  | "explain"
  | "table"
  | "insert" | "update" | "delete" | "merge";

export interface PostgresReadMetric {
  queryCount: 1;
  queryKind: PostgresReadQueryKind;
  returnedRows: number;
  approximateSerializedRowBytes: number;
  elapsedMs: number;
  failed: boolean;
  /** Hash of SQL text, never parameters, raw SQL, record IDs or result data. */
  queryFingerprint?: string;
}

export type PostgresReadMetricsObserver = (
  metric: PostgresReadMetric,
) => void | Promise<void>;

export interface PostgresReadMetricsOptions {
  observer?: PostgresReadMetricsObserver;
  now?: () => number;
}

export type PostgresReadMetricsConfig =
  | PostgresReadMetricsObserver
  | PostgresReadMetricsOptions;

export interface PostgresReadQueryResult<TRow = unknown> {
  rows: readonly TRow[];
}

export type PostgresReadMetricsRunner = <TRow>(
  text: string,
  run: () => Promise<PostgresReadQueryResult<TRow>>,
) => Promise<PostgresReadQueryResult<TRow>>;

export type PostgresReadMetricsEnv = Record<string, string | undefined>;

function now(): number {
  try {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  } catch {
    return 0;
  }
}

function safeNow(readNow: () => number): number {
  try {
    const value = readNow();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function readQueryKind(text: string): PostgresReadQueryKind | null {
  let remaining = text;

  for (;;) {
    remaining = remaining.replace(/^\s+/, "");

    if (remaining.startsWith("--")) {
      const newline = remaining.search(/[\r\n]/);
      if (newline < 0) return null;
      remaining = remaining.slice(newline + 1);
      continue;
    }

    if (remaining.startsWith("/*")) {
      const end = remaining.indexOf("*/", 2);
      if (end < 0) return null;
      remaining = remaining.slice(end + 2);
      continue;
    }

    break;
  }

  const keyword = remaining.match(/^[a-z]+/i)?.[0].toLowerCase();

  // Sprint 0118: a sync-collection write takes the commit-order lock in a
  // leading CTE (features/sync/commit-order-lock.ts). The statement is the
  // write that follows the CTE list, not a read.
  if (keyword === "with" && /\bsync_write_lock\b/.test(remaining)) {
    const write = /\b(insert)\s+into\b|\b(update)\s+[a-z_]+\s+set\b|\b(delete)\s+from\b/i.exec(remaining);
    if (write) return (write[1] ?? write[2] ?? write[3])!.toLowerCase() as "insert" | "update" | "delete";
  }

  switch (keyword) {
    case "select":
    case "with":
    case "show":
    case "values":
    case "explain":
    case "table":
    case "insert":
    case "update":
    case "delete":
    case "merge":
      return keyword;
    default:
      return null;
  }
}

function serializedBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return 0;

    if (typeof Buffer !== "undefined") {
      return Buffer.byteLength(serialized, "utf8");
    }

    return new TextEncoder().encode(serialized).byteLength;
  } catch {
    return 0;
  }
}

function approximateSerializedRowBytes(rows: readonly unknown[]): number {
  let total = 0;

  for (const row of rows) {
    const bytes = serializedBytes(row);
    const next = total + bytes;
    total = Number.isSafeInteger(next) ? next : Number.MAX_SAFE_INTEGER;
  }

  return total;
}

function enabledByEnv(env: PostgresReadMetricsEnv): boolean {
  const value = env[POSTGRES_READ_METRICS_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function safeConsoleObserver(metric: PostgresReadMetric): void {
  try {
    console.info(JSON.stringify({ event: "postgres_read_metric", ...metric }));
  } catch {
    // Metrics must never change database behavior.
  }
}

/** The env-driven console observer, exported so callers can compose it with their own instead of replacing it. */
export function createEnvReadMetricsObserver(
  env: PostgresReadMetricsEnv = process.env,
): PostgresReadMetricsObserver | undefined {
  return enabledByEnv(env) ? safeConsoleObserver : undefined;
}

function observeSafely(
  observer: PostgresReadMetricsObserver,
  metric: PostgresReadMetric,
): void {
  try {
    const result = observer(metric);
    if (result !== undefined) Promise.resolve(result).catch(() => undefined);
  } catch {
    // An observer is outside the database operation's failure boundary.
  }
}

function observerFor(
  config: PostgresReadMetricsConfig | undefined,
  env: PostgresReadMetricsEnv,
): PostgresReadMetricsObserver | undefined {
  const configured = typeof config === "function"
    ? config
    : config?.observer ?? (enabledByEnv(env) ? safeConsoleObserver : undefined);
  // Every metered client also feeds the request read receipt, so no pool can
  // be measured by one path and missed by the other.
  if (!readReceiptsEnabled(env)) return configured;
  if (!configured) return recordReadReceiptMetric;
  return (metric) => {
    recordReadReceiptMetric(metric);
    return configured(metric);
  };
}

export function createPostgresReadMetricsRunner(
  config?: PostgresReadMetricsConfig,
  env: PostgresReadMetricsEnv = process.env,
): PostgresReadMetricsRunner | undefined {
  const observer = observerFor(config, env);

  if (!observer) return undefined;

  const readNow = typeof config === "object" ? config.now ?? now : now;

  return async <TRow>(text: string, run: () => Promise<PostgresReadQueryResult<TRow>>) => {
    const queryKind = readQueryKind(text);
    if (!queryKind) return run();

    const startedAt = safeNow(readNow);
    let failed = false;
    let rows: readonly TRow[] = [];

    try {
      const result = await run();
      rows = result.rows;
      return result;
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      const metric: PostgresReadMetric = {
        queryCount: 1,
        queryKind,
        returnedRows: rows.length,
        approximateSerializedRowBytes: approximateSerializedRowBytes(rows),
        elapsedMs: Math.max(0, safeNow(readNow) - startedAt),
        failed,
        queryFingerprint: createHash("sha256").update(text.trim()).digest("hex").slice(0, 24),
      };

      // DML can return complete payloads through RETURNING. Empty successful
      // writes have no row egress; do not count them as reads. SQL text matching
      // cannot reliably identify RETURNING through strings/comments, so use rows.
      if (rows.length || failed || !["insert", "update", "delete", "merge"].includes(queryKind)) {
        observeSafely(observer, metric);
      }
    }
  };
}
