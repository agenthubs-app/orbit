import { randomUUID } from "node:crypto";
import { subscribe } from "node:diagnostics_channel";
import type { IncomingMessage, ServerResponse } from "node:http";

import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { after } from "next/server";

import {
  createReadLedger,
  finalizeReadLedger,
  installReadReceiptSink,
  installRequestReadLedgerResolver,
  readReceiptsEnabled,
  readReceiptsSampleRate,
  type ReadLedger,
  type ReadReceiptResponse,
  type ReadReceiptSink,
} from "./read-receipts";

/**
 * Next.js adapter for request read receipts. Installed once from
 * `instrumentation.ts`; no route handler is edited.
 *
 * - Request scope: the first metered read inside a request looks up Next's
 *   per-request work store (read-only), creates the ledger and registers one
 *   `after()` callback that writes the receipt once the response is sent.
 *   Prerenders and cache fills are not request scopes and fall through to the
 *   `unattributed` ledger.
 * - Route: Next's route template (`/api/tasks/[id]`), prefixed with the HTTP
 *   method. Reads made by `proxy.ts` (session checks) join the same receipt;
 *   a request the proxy answers itself is recorded as `GET (proxy)`.
 * - Status and response bytes: Node's built-in `http.server.*` diagnostics
 *   channels. The request is tagged with `x-orbit-request-id` and
 *   `x-orbit-request-method` when it arrives (before the proxy runs);
 *   the receipt waits briefly for the matching response to finish. Where the
 *   channels do not fire, both fields stay null and the receipt is still written.
 *
 * The work stores are Next internals (`*.external` modules are the shared
 * singletons Next itself uses for `after()`/`headers()`); every access is
 * guarded so a Next upgrade degrades to `unattributed`, never to a failure.
 */

export const READ_RECEIPT_REQUEST_ID_HEADER = "x-orbit-request-id";
export const READ_RECEIPT_REQUEST_METHOD_HEADER = "x-orbit-request-method";
const RESPONSE_WAIT_MS = 1_000;
const RESPONSE_KEEP_MS = 5_000;
/** Next runs `proxy.ts` under a fake work store whose page is "/"; real routes end in /page or /route. */
const PROXY_WORK_PAGE = "/";

interface PendingResponse {
  response?: ReadReceiptResponse;
  waiters: Array<(response: ReadReceiptResponse | undefined) => void>;
}

interface RequestLedgerEntry {
  ledger: ReadLedger;
  /** Set once a route handler or page takes over a ledger the proxy started. */
  claimed: boolean;
}

interface NextAdapterState {
  installed: boolean;
  ledgers: WeakMap<object, ReadLedger>;
  byRequestId: Map<string, RequestLedgerEntry>;
  pending: Map<string, PendingResponse>;
  socketBaselines: WeakMap<IncomingMessage, number>;
}

const STATE_KEY = Symbol.for("orbit.readReceipts.next");

function adapterState(): NextAdapterState {
  const holder = globalThis as unknown as Record<symbol, NextAdapterState | undefined>;
  return (holder[STATE_KEY] ??= {
    installed: false,
    ledgers: new WeakMap(),
    byRequestId: new Map(),
    pending: new Map(),
    socketBaselines: new WeakMap(),
  });
}

export function readReceiptSourceFor(route: string, userAgent: string | null): string {
  if (route.startsWith("/api/queues/")) return "queue";
  const agent = userAgent ?? "";
  if (/vercel-cron/i.test(agent)) return "cron";
  if (/Mozilla\//.test(agent)) return "web";
  if (/CFNetwork|okhttp|Expo|Dalvik|ReactNative/i.test(agent)) return "app";
  return "other";
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function waitForResponse(requestId: string | null): Promise<ReadReceiptResponse | undefined> {
  const entry = requestId ? adapterState().pending.get(requestId) : undefined;
  if (!entry) return Promise.resolve(undefined);
  if (entry.response) return Promise.resolve(entry.response);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), RESPONSE_WAIT_MS);
    timer.unref?.();
    entry.waiters.push((response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function registerFinalizer(ledger: ReadLedger, requestId: string | null, skipIfClaimed?: RequestLedgerEntry): void {
  after(async () => {
    const response = await waitForResponse(requestId);
    // The proxy's own after() fires as soon as the proxy returns; a route that
    // claimed its ledger writes the combined receipt instead.
    if (skipIfClaimed?.claimed) return;
    if (requestId && adapterState().byRequestId.get(requestId)?.ledger === ledger) {
      adapterState().byRequestId.delete(requestId);
    }
    await finalizeReadLedger(ledger, response);
  });
}

/**
 * One ledger per HTTP request: reads made by `proxy.ts` (session checks) and
 * by the route handler or page that follows share the request id, so they
 * land on one receipt labelled with the route template.
 */
export function resolveNextRequestReadLedger(sampleRate: number): ReadLedger | null {
  const state = adapterState();
  const work = workAsyncStorage.getStore();
  if (!work) return null;
  const existing = state.ledgers.get(work);
  if (existing) return existing;
  const unit = workUnitAsyncStorage.getStore();
  if (!unit || unit.type !== "request") return null;

  const method = unit.headers.get(READ_RECEIPT_REQUEST_METHOD_HEADER)?.toUpperCase() || null;
  const requestId = unit.headers.get(READ_RECEIPT_REQUEST_ID_HEADER);
  const source = readReceiptSourceFor(work.route, unit.headers.get("user-agent"));
  const isProxy = work.page === PROXY_WORK_PAGE;
  const route = isProxy
    ? `${method ?? "?"} (proxy)`
    : method ? `${method} ${work.route}` : work.route;
  const shared = requestId ? state.byRequestId.get(requestId) : undefined;

  try {
    if (shared && !shared.ledger.closed && !isProxy && !shared.claimed) {
      shared.claimed = true;
      shared.ledger.route = route;
      shared.ledger.source = source;
      registerFinalizer(shared.ledger, requestId);
      state.ledgers.set(work, shared.ledger);
      return shared.ledger;
    }
    const ledger = createReadLedger({ route, source, sampleRate });
    const entry: RequestLedgerEntry = { ledger, claimed: !isProxy };
    registerFinalizer(ledger, requestId, isProxy ? entry : undefined);
    if (requestId && !shared) state.byRequestId.set(requestId, entry);
    state.ledgers.set(work, ledger);
    return ledger;
  } catch {
    return null;
  }
}

function forget(requestId: string, afterMs: number): void {
  const timer = setTimeout(() => adapterState().pending.delete(requestId), afterMs);
  timer.unref?.();
}

function responseBytes(request: IncomingMessage, response: ServerResponse, baseline: number | undefined): number | null {
  const written = request.socket?.bytesWritten;
  if (baseline !== undefined && typeof written === "number") return Math.max(0, written - baseline);
  const length = Number(response.getHeader("content-length"));
  return Number.isFinite(length) ? length : null;
}

function subscribeToHttpDiagnostics(): void {
  const state = adapterState();
  subscribe("http.server.request.start", (message) => {
    try {
      const { request } = message as { request: IncomingMessage };
      const requestId = randomUUID();
      request.headers[READ_RECEIPT_REQUEST_ID_HEADER] = requestId;
      request.headers[READ_RECEIPT_REQUEST_METHOD_HEADER] = request.method ?? "";
      state.socketBaselines.set(request, request.socket?.bytesWritten ?? 0);
      state.pending.set(requestId, { waiters: [] });
      // Aborted requests never finish; do not keep their entry forever.
      forget(requestId, 10 * 60_000);
    } catch {
      // Diagnostics must never change request handling.
    }
  });
  subscribe("http.server.response.finish", (message) => {
    try {
      const { request, response } = message as { request: IncomingMessage; response: ServerResponse };
      const requestId = headerValue(request.headers[READ_RECEIPT_REQUEST_ID_HEADER]);
      const entry = requestId ? state.pending.get(requestId) : undefined;
      if (!requestId || !entry) return;
      entry.response = {
        statusCode: response.statusCode,
        responseBytes: responseBytes(request, response, state.socketBaselines.get(request)),
      };
      for (const waiter of entry.waiters.splice(0)) waiter(entry.response);
      forget(requestId, RESPONSE_KEEP_MS);
    } catch {
      // Diagnostics must never change request handling.
    }
  });
}

export function installNextReadReceipts({
  sink,
  env = process.env,
}: {
  sink: ReadReceiptSink;
  env?: Record<string, string | undefined>;
}): boolean {
  if (!readReceiptsEnabled(env)) return false;
  const state = adapterState();
  installReadReceiptSink(sink);
  const sampleRate = readReceiptsSampleRate(env);
  installRequestReadLedgerResolver(() => resolveNextRequestReadLedger(sampleRate));
  if (!state.installed) {
    state.installed = true;
    try {
      subscribeToHttpDiagnostics();
    } catch {
      // Older runtimes without these channels keep status/bytes null.
    }
  }
  return true;
}
