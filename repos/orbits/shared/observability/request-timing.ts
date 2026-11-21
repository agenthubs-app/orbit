/**
 * P0 measurement (docs/2026-11-21-data-access-redesign.md §5 P0): per request, how many new database
 * connections were opened and how long they took, plus which instance served it (age, n-th request,
 * region). Attached to the existing read receipt and written to the log only — never to the database.
 *
 * The measurement window is fixed in code and switches itself off: no production setting to remember
 * to turn back (the lesson of the heartbeat that ran unnoticed).
 */
import type { ReadLedger } from "./read-receipts";

/** P0 runs for one week after it ships; afterwards receipts return to their normal sampling and writer. */
export const P0_MEASUREMENT_UNTIL = Date.parse("2026-12-06T00:00:00+09:00");

export function p0MeasurementActive(now: number = Date.now()): boolean {
  return now < P0_MEASUREMENT_UNTIL;
}

export interface RequestTiming {
  /** New physical connections opened while this request was the current unit of work. */
  connectCount: number;
  /** Wall time spent opening them (TCP + TLS + authentication). */
  connectMs: number;
  /** Milliseconds since this server process loaded the module, when the request's ledger was created. */
  instanceAgeMs: number;
  /** 1 for the first request this process measured, 2 for the next, ... */
  instanceSeq: number;
  region: string | null;
  /** Ledger start to receipt (set when the receipt is made). */
  wallMs?: number;
}

const STATE_KEY = Symbol.for("orbit.requestTiming.state");

interface TimingState {
  enabled: boolean;
  processStartedAt: number;
  seq: number;
  byLedger: WeakMap<ReadLedger, RequestTiming>;
}

function state(): TimingState {
  const holder = globalThis as unknown as Record<symbol, TimingState | undefined>;
  return (holder[STATE_KEY] ??= { enabled: false, processStartedAt: Date.now(), seq: 0, byLedger: new WeakMap() });
}

/** Turned on by the server start hook during the P0 week; receipts carry `timing` only then. */
export function enableRequestTiming(enabled = true): void {
  state().enabled = enabled;
}

export function requestTimingEnabled(): boolean {
  return state().enabled;
}

function timingFor(ledger: ReadLedger): RequestTiming {
  const current = state();
  let timing = current.byLedger.get(ledger);
  if (!timing) {
    current.seq += 1;
    timing = {
      connectCount: 0,
      connectMs: 0,
      instanceAgeMs: Math.max(0, ledger.startedAt.getTime() - current.processStartedAt),
      instanceSeq: current.seq,
      region: process.env.VERCEL_REGION ?? null,
    };
    current.byLedger.set(ledger, timing);
  }
  return timing;
}

/** Records one opened connection against the given ledger. Never throws. */
export function noteConnectOnLedger(ledger: ReadLedger | null, elapsedMs: number): void {
  if (!ledger || ledger.closed) return;
  try {
    const timing = timingFor(ledger);
    timing.connectCount += 1;
    timing.connectMs += Math.max(0, elapsedMs);
  } catch {
    // Measurement must never change database behaviour.
  }
}

/** The timing collected for a ledger (instance fields even when no connection was opened). */
export function requestTimingFor(ledger: ReadLedger): RequestTiming {
  return timingFor(ledger);
}

type ConnectCallback = (error: unknown, ...rest: unknown[]) => void;
interface PgClientPrototype {
  connect(callback?: ConnectCallback): unknown;
}

const PATCHED_KEY = Symbol.for("orbit.requestTiming.pgConnectPatched");

/**
 * Times every new physical connection opened by `pg` (pools call `Client#connect` only when they
 * have no idle client). Each one is added to the current request's receipt and logged as one
 * `db_connect` line, so cold connections show up even where no receipt is written (middleware).
 * Only active in the P0 window; the original method is called unchanged either way.
 */
export function installPgConnectTiming(
  clientClass: { prototype: PgClientPrototype } | null | undefined,
  currentLedger: () => ReadLedger | null,
  log: (line: string) => void = (line) => console.info(line),
): boolean {
  if (!clientClass?.prototype || typeof clientClass.prototype.connect !== "function") return false;
  const proto = clientClass.prototype as PgClientPrototype & { [PATCHED_KEY]?: true };
  if (proto[PATCHED_KEY]) return true;
  const original = proto.connect;
  proto[PATCHED_KEY] = true;
  proto.connect = function timedConnect(this: unknown, callback?: ConnectCallback): unknown {
    if (!requestTimingEnabled()) return original.call(this, callback);
    let ledger: ReadLedger | null = null;
    try {
      ledger = currentLedger();
    } catch {
      ledger = null;
    }
    const startedAt = performance.now();
    let reported = false;
    const report = (failed: boolean) => {
      if (reported) return;
      reported = true;
      try {
        const ms = Math.round(performance.now() - startedAt);
        noteConnectOnLedger(ledger, ms);
        log(
          JSON.stringify({
            event: "db_connect",
            ms,
            failed,
            attributed: Boolean(ledger),
            route: ledger?.route ?? null,
            region: process.env.VERCEL_REGION ?? null,
          }),
        );
      } catch {
        // Measurement must never change database behaviour.
      }
    };
    if (typeof callback === "function") {
      return original.call(this, (error: unknown, ...rest: unknown[]) => {
        report(Boolean(error));
        callback(error, ...rest);
      });
    }
    const result = original.call(this);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(
        () => report(false),
        () => report(true),
      );
    }
    return result;
  };
  return true;
}
