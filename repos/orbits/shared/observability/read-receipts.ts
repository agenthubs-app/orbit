import { AsyncLocalStorage } from "node:async_hooks";

import type { PostgresReadMetric } from "../storage/postgres-read-metrics";

/**
 * Request read receipts (monitoring design O1).
 *
 * Every metered Postgres read adds its rows, bytes and time to the ledger of
 * the unit of work it ran in: a background task started with
 * `runWithReadReceiptSource`, else the current server request (resolved by the
 * Next adapter installed from `instrumentation.ts`), else a process-wide
 * `unattributed` ledger. Reads are never dropped for lack of an owner, so the
 * coverage gap stays visible. A ledger becomes one receipt when its unit ends.
 *
 * This module is framework-free. State lives on `globalThis` because Next
 * compiles instrumentation and route code into separate module graphs; a
 * module-local singleton would split the ledger between them.
 */

export const READ_RECEIPTS_ENV = "ORBIT_READ_RECEIPTS";
export const READ_RECEIPTS_SAMPLE_RATE_ENV = "ORBIT_READ_RECEIPTS_SAMPLE_RATE";
export const UNATTRIBUTED_READ_SOURCE = "unattributed";
const UNATTRIBUTED_FLUSH_MS = 60_000;
const UNATTRIBUTED_FLUSH_QUERIES = 1_000;

export interface ReadReceipt {
  occurredAt: string;
  /** Route template such as `GET /api/tasks/[id]`; never a concrete id. */
  route: string | null;
  /** `app`, `web`, `cron`, `queue`, `other`, `task:<name>` or `unattributed`. */
  source: string;
  /** Raw account id. Only the database row keeps it; logs carry a fingerprint. */
  accountId: string | null;
  queryCount: number;
  rowCount: number;
  byteCount: number;
  dbMs: number;
  failedQueryCount: number;
  responseBytes: number | null;
  statusCode: number | null;
  sampleRate: number;
}

export interface ReadLedger {
  readonly startedAt: Date;
  route: string | null;
  source: string;
  accountId: string | null;
  queryCount: number;
  rowCount: number;
  byteCount: number;
  dbMs: number;
  failedQueryCount: number;
  sampled: boolean;
  sampleRate: number;
  closed: boolean;
}

export interface ReadReceiptResponse {
  statusCode?: number | null;
  responseBytes?: number | null;
}

export type ReadReceiptSink = (receipt: ReadReceipt) => void | Promise<void>;
/** Returns the current request's ledger, creating it on first use, or null outside a request. */
export type RequestReadLedgerResolver = () => ReadLedger | null;

export type ReadReceiptsEnv = Record<string, string | undefined>;

interface ReadReceiptsState {
  sink: ReadReceiptSink | null;
  resolver: RequestReadLedgerResolver | null;
  tasks: AsyncLocalStorage<ReadLedger>;
  unattributed: ReadLedger | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const STATE_KEY = Symbol.for("orbit.readReceipts.state");

function state(): ReadReceiptsState {
  const holder = globalThis as unknown as Record<symbol, ReadReceiptsState | undefined>;
  return (holder[STATE_KEY] ??= {
    sink: null,
    resolver: null,
    tasks: new AsyncLocalStorage<ReadLedger>(),
    unattributed: null,
    flushTimer: null,
  });
}

/**
 * Receipts are on inside the Next.js Node server (`NEXT_RUNTIME=nodejs`) and
 * off elsewhere (tests, CLI scripts) unless `ORBIT_READ_RECEIPTS=1`.
 * `ORBIT_READ_RECEIPTS=0` is the kill switch.
 */
export function readReceiptsEnabled(env: ReadReceiptsEnv = process.env): boolean {
  const value = env[READ_RECEIPTS_ENV]?.trim().toLowerCase();
  if (value === "0" || value === "false" || value === "off" || value === "no") return false;
  if (value === "1" || value === "true" || value === "on" || value === "yes") return true;
  return env.NEXT_RUNTIME === "nodejs";
}

/** Fraction of requests that produce a receipt, 0..1. Defaults to 1 (every request). */
export function readReceiptsSampleRate(env: ReadReceiptsEnv = process.env): number {
  const raw = env[READ_RECEIPTS_SAMPLE_RATE_ENV]?.trim();
  if (!raw) return 1;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function createReadLedger(init: {
  route?: string | null;
  source: string;
  accountId?: string | null;
  sampleRate?: number;
  random?: () => number;
}): ReadLedger {
  const sampleRate = init.sampleRate ?? 1;
  const draw = init.random ?? Math.random;
  return {
    startedAt: new Date(),
    route: init.route ?? null,
    source: init.source,
    accountId: init.accountId ?? null,
    queryCount: 0,
    rowCount: 0,
    byteCount: 0,
    dbMs: 0,
    failedQueryCount: 0,
    sampleRate,
    sampled: sampleRate >= 1 || (sampleRate > 0 && draw() < sampleRate),
    closed: false,
  };
}

export function addReadMetricToLedger(ledger: ReadLedger, metric: PostgresReadMetric): void {
  ledger.queryCount += metric.queryCount;
  ledger.rowCount += metric.returnedRows;
  ledger.byteCount += metric.approximateSerializedRowBytes;
  ledger.dbMs += metric.elapsedMs;
  if (metric.failed) ledger.failedQueryCount += 1;
}

export function readReceiptFromLedger(ledger: ReadLedger, response: ReadReceiptResponse = {}): ReadReceipt {
  return {
    occurredAt: ledger.startedAt.toISOString(),
    route: ledger.route,
    source: ledger.source,
    accountId: ledger.accountId,
    queryCount: ledger.queryCount,
    rowCount: ledger.rowCount,
    byteCount: ledger.byteCount,
    dbMs: Math.round(ledger.dbMs * 1000) / 1000,
    failedQueryCount: ledger.failedQueryCount,
    responseBytes: response.responseBytes ?? null,
    statusCode: response.statusCode ?? null,
    sampleRate: ledger.sampleRate,
  };
}

export function installReadReceiptSink(sink: ReadReceiptSink | null): void {
  state().sink = sink;
}

export function installRequestReadLedgerResolver(resolver: RequestReadLedgerResolver | null): void {
  state().resolver = resolver;
}

function currentLedger(): ReadLedger | null {
  const current = state();
  const task = current.tasks.getStore();
  if (task) return task;
  if (!current.resolver) return null;
  try {
    return current.resolver();
  } catch {
    return null;
  }
}

function unattributedLedger(): ReadLedger | null {
  const current = state();
  if (!current.sink) return null;
  if (!current.unattributed) {
    current.unattributed = createReadLedger({ source: UNATTRIBUTED_READ_SOURCE });
    current.flushTimer = setTimeout(() => {
      void flushUnattributedReadReceipts();
    }, UNATTRIBUTED_FLUSH_MS);
    current.flushTimer.unref?.();
  }
  return current.unattributed;
}

/** Metrics observer: attributes one completed read to the current unit of work. Never throws. */
export function recordReadReceiptMetric(metric: PostgresReadMetric): void {
  try {
    const ledger = currentLedger();
    if (ledger && !ledger.closed) {
      addReadMetricToLedger(ledger, metric);
      return;
    }
    const fallback = unattributedLedger();
    if (!fallback) return;
    addReadMetricToLedger(fallback, metric);
    if (fallback.queryCount >= UNATTRIBUTED_FLUSH_QUERIES) void flushUnattributedReadReceipts();
  } catch {
    // Accounting must never change database behavior.
  }
}

/** Records the account the current request or task acts for. The first account wins. */
export function noteReadReceiptAccount(accountId: string | null | undefined): void {
  if (!accountId) return;
  try {
    const ledger = currentLedger();
    if (ledger && !ledger.closed && !ledger.accountId) ledger.accountId = accountId;
  } catch {
    // Accounting must never change authentication behavior.
  }
}

/** Closes a ledger and hands its receipt to the sink. Resolves even when the sink fails. */
export async function finalizeReadLedger(ledger: ReadLedger, response?: ReadReceiptResponse): Promise<void> {
  if (ledger.closed) return;
  ledger.closed = true;
  const sink = state().sink;
  if (!sink || !ledger.sampled || ledger.queryCount === 0) return;
  try {
    await sink(readReceiptFromLedger(ledger, response));
  } catch {
    // The sink reports its own failures; a receipt never fails its unit of work.
  }
}

export async function flushUnattributedReadReceipts(): Promise<void> {
  const current = state();
  const ledger = current.unattributed;
  current.unattributed = null;
  if (current.flushTimer) clearTimeout(current.flushTimer);
  current.flushTimer = null;
  if (ledger) await finalizeReadLedger(ledger);
}

/**
 * Runs background work (maintenance, queue batches, workers) under a task
 * ledger so its reads are recorded as `task:<name>` instead of being mixed
 * into whichever request happens to be active.
 */
export async function runWithReadReceiptSource<T>(taskName: string, run: () => Promise<T>): Promise<T> {
  const ledger = createReadLedger({ source: `task:${taskName}` });
  try {
    return await state().tasks.run(ledger, run);
  } finally {
    await finalizeReadLedger(ledger);
  }
}
