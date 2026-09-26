import { createHash } from "node:crypto";

import type { ReadReceipt, ReadReceiptSink } from "./read-receipts";

/**
 * Where a finished read receipt goes: one database row (source of truth, raw
 * account id), one JSON log line and, when configured, a batched Axiom ingest.
 * Log and Axiom payloads carry only an irreversible account fingerprint and
 * no SQL, parameters or row data. Every destination fails independently and
 * only ever produces a warning.
 */

export const AXIOM_TOKEN_ENV = "AXIOM_TOKEN";
export const AXIOM_DATASET_ENV = "AXIOM_DATASET";
const AXIOM_INGEST_ORIGIN = "https://api.axiom.co";
const AXIOM_BATCH_LIMIT = 100;
const AXIOM_TIMEOUT_MS = 3_000;

export interface ReadReceiptLogPayload {
  event: "read_receipt";
  occurredAt: string;
  route: string | null;
  source: string;
  account: string | null;
  queries: number;
  rows: number;
  bytes: number;
  dbMs: number;
  failedQueries: number;
  responseBytes: number | null;
  status: number | null;
  sampleRate: number;
}

export interface ReadReceiptSqlClient {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
}

export type ReadReceiptWriter = (receipt: ReadReceipt) => Promise<void>;

export type AxiomFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number }>;

export interface AxiomReadReceiptConfig {
  token: string;
  dataset: string;
  fetch?: AxiomFetch;
}

/** Short irreversible code so log lines can group by account without exposing its id. */
export function accountFingerprint(accountId: string | null): string | null {
  if (!accountId) return null;
  return createHash("sha256").update(`orbit-read-receipt:v1:${accountId}`).digest("hex").slice(0, 16);
}

export function readReceiptLogPayload(receipt: ReadReceipt): ReadReceiptLogPayload {
  return {
    event: "read_receipt",
    occurredAt: receipt.occurredAt,
    route: receipt.route,
    source: receipt.source,
    account: accountFingerprint(receipt.accountId),
    queries: receipt.queryCount,
    rows: receipt.rowCount,
    bytes: receipt.byteCount,
    dbMs: receipt.dbMs,
    failedQueries: receipt.failedQueryCount,
    responseBytes: receipt.responseBytes,
    status: receipt.statusCode,
    sampleRate: receipt.sampleRate,
  };
}

export const INSERT_READ_RECEIPT_SQL = `
  insert into orbit_read_receipts (
    occurred_at, route, source, account_id, query_count, row_count, byte_count,
    db_ms, failed_query_count, response_bytes, status_code, sample_rate
  ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
`;

export function createPostgresReadReceiptWriter(client: () => ReadReceiptSqlClient | null): ReadReceiptWriter {
  return async (receipt) => {
    const sql = client();
    if (!sql) throw new Error("read receipt database is not configured");
    await sql.query(INSERT_READ_RECEIPT_SQL, [
      receipt.occurredAt,
      receipt.route,
      receipt.source,
      receipt.accountId,
      receipt.queryCount,
      receipt.rowCount,
      receipt.byteCount,
      receipt.dbMs,
      receipt.failedQueryCount,
      receipt.responseBytes,
      receipt.statusCode,
      receipt.sampleRate,
    ]);
  };
}

/** Axiom is used only when both variables are present; otherwise nothing leaves the process. */
export function axiomConfigFromEnv(env: Record<string, string | undefined> = process.env): AxiomReadReceiptConfig | null {
  const token = env[AXIOM_TOKEN_ENV]?.trim();
  const dataset = env[AXIOM_DATASET_ENV]?.trim();
  if (!token || !dataset) return null;
  return { token, dataset };
}

function errorName(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{1,16}$/.test(code)) return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string") return name.slice(0, 40);
  }
  return "Error";
}

export function createReadReceiptSink({
  write,
  axiom = null,
  log = (line) => console.info(line),
  warn = (line) => console.warn(line),
}: {
  write: ReadReceiptWriter | null;
  axiom?: AxiomReadReceiptConfig | null;
  log?: (line: string) => void;
  warn?: (line: string) => void;
}): ReadReceiptSink {
  const queue: ReadReceiptLogPayload[] = [];
  let inflight: Promise<void> | null = null;

  const safeWarn = (payload: Record<string, unknown>) => {
    try {
      warn(JSON.stringify(payload));
    } catch {
      // Nothing further to report to.
    }
  };

  async function sendBatch(config: AxiomReadReceiptConfig, batch: ReadReceiptLogPayload[]): Promise<void> {
    const send = config.fetch ?? (globalThis.fetch as unknown as AxiomFetch);
    try {
      const response = await send(
        `${AXIOM_INGEST_ORIGIN}/v1/datasets/${encodeURIComponent(config.dataset)}/ingest`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(AXIOM_TIMEOUT_MS),
        },
      );
      if (!response.ok) safeWarn({ event: "read_receipt_axiom_failed", status: response.status, receipts: batch.length });
    } catch (error) {
      safeWarn({ event: "read_receipt_axiom_failed", error: errorName(error), receipts: batch.length });
    }
  }

  async function flushAxiom(config: AxiomReadReceiptConfig): Promise<void> {
    while (inflight) await inflight;
    if (queue.length === 0) return;
    const batch = queue.splice(0, AXIOM_BATCH_LIMIT);
    inflight = sendBatch(config, batch).finally(() => {
      inflight = null;
    });
    await inflight;
  }

  return async (receipt) => {
    const payload = readReceiptLogPayload(receipt);
    try {
      log(JSON.stringify(payload));
    } catch {
      // A broken logger must not block the database row.
    }
    const pending: Promise<void>[] = [];
    if (write) {
      pending.push(write(receipt).catch((error: unknown) => {
        safeWarn({ event: "read_receipt_write_failed", error: errorName(error) });
      }));
    }
    if (axiom) {
      queue.push(payload);
      pending.push(flushAxiom(axiom));
    }
    await Promise.all(pending);
  };
}
