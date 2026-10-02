/**
 * W0053：导入页调用 `/api/contacts/import/**` 的薄客户端（浏览器端）。形状与 features/contacts/import/service.ts 的视图一致。
 */
import type { ContactImportBatchView, ContactImportRowView } from "../../../../../features/contacts/import/service";
import type { ImportableEventSummary } from "../../../../../features/contacts/import/events-source";
import type { ContactImportMapping } from "../../../../../features/contacts/import/types";

export type { ContactImportBatchView, ContactImportRowView, ImportableEventSummary };

export const CONTACT_IMPORT_API_BASE = "/api/contacts/import";

export class ImportApiError extends Error {
  constructor(readonly status: number, readonly reason: string | null, message: string, readonly context: Record<string, string> = {}) {
    super(message);
  }
}

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json().catch(() => null)) as { success?: boolean; data?: T; error?: { message?: string; context?: Record<string, string> } } | null;
  if (!response.ok || !body?.success) {
    const context = body?.error?.context ?? {};
    throw new ImportApiError(response.status, context.reason ?? null, body?.error?.message ?? `HTTP ${response.status}`, context);
  }
  return body.data as T;
}

const batchUrl = (batchId: string, suffix = "") => `${CONTACT_IMPORT_API_BASE}/${encodeURIComponent(batchId)}${suffix}`;
const json = (method: string, payload: unknown): RequestInit => ({ body: JSON.stringify(payload), headers: { "content-type": "application/json" }, method });

export const importApi = {
  list: () => call<{ batches: ContactImportBatchView[] }>(CONTACT_IMPORT_API_BASE),
  upload: (file: File, kind: "csv" | "vcard", idempotencyKey: string) =>
    call<{ batch: ContactImportBatchView; replayed: boolean }>(CONTACT_IMPORT_API_BASE, {
      body: file,
      headers: {
        "content-type": "application/octet-stream",
        "idempotency-key": idempotencyKey,
        "x-orbit-import-file-name": encodeURIComponent(file.name),
        "x-orbit-import-kind": kind,
      },
      method: "POST",
    }),
  get: (batchId: string) => call<{ batch: ContactImportBatchView }>(batchUrl(batchId)),
  remap: (batchId: string, mapping: ContactImportMapping) => call<{ batch: ContactImportBatchView }>(batchUrl(batchId), json("PATCH", { mapping })),
  rows: (batchId: string, cursor: number, filter: string) =>
    call<{ rows: ContactImportRowView[]; nextCursor: number | null }>(batchUrl(batchId, `/rows?cursor=${cursor}&filter=${encodeURIComponent(filter)}`)),
  decide: (batchId: string, decisions: { seq: number; decision: "create" | "merge" | "skip" }[]) =>
    call<{ batch: ContactImportBatchView; updated: number[] }>(batchUrl(batchId, "/rows"), json("PATCH", { decisions })),
  commit: (batchId: string, confirmationIntentId: string, mergeConfirmations: { seq: number; contactId: string }[]) =>
    call<{ batch: ContactImportBatchView; replayed: boolean }>(batchUrl(batchId, "/commit"), json("POST", { confirmationIntentId, mergeConfirmations })),
  cancel: (batchId: string) => call<{ batch: ContactImportBatchView }>(batchUrl(batchId, "/cancel"), { method: "POST" }),
  events: () => call<{ events: ImportableEventSummary[] }>(`${CONTACT_IMPORT_API_BASE}/events`),
  importEvent: (eventId: string, idempotencyKey: string) =>
    call<{ batch: ContactImportBatchView; replayed: boolean }>(`${CONTACT_IMPORT_API_BASE}/events`, json("POST", { eventId, idempotencyKey })),
};

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
