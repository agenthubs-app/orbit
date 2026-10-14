/**
 * R16: the browser side of `/api/contacts/import/**` (shapes from shared/contract/contact-import.ts).
 * Upload sends the file itself as the body with the import headers; a LinkedIn ZIP is opened here
 * (fflate) because the server only reads CSV / vCard text.
 */
import { unzipSync } from "fflate";

import type {
  ContactImportBatchResponse,
  ContactImportBatchResult,
  ContactImportBatchView,
  ContactImportDecisionsResult,
  ContactImportEventListResponse,
  ContactImportMapping,
  ContactImportMergeConfirmation,
  ContactImportRowView,
  ContactImportRowsPage,
} from "../../../../../../shared/contract/contact-import";

export const IMPORT_API = "/api/contacts/import";

export class ImportApiError extends Error {
  constructor(readonly status: number, readonly reason: string | null, message: string) {
    super(message);
  }
}

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json().catch(() => null)) as { success?: boolean; data?: T; error?: { message?: string; context?: Record<string, string> } } | null;
  if (!response.ok || !body?.success) throw new ImportApiError(response.status, body?.error?.context?.reason ?? null, body?.error?.message ?? `HTTP ${response.status}`);
  return body.data as T;
}

const batchUrl = (id: string, suffix = "") => `${IMPORT_API}/${encodeURIComponent(id)}${suffix}`;
const json = (method: string, payload: unknown): RequestInit => ({ method, body: JSON.stringify(payload), headers: { "content-type": "application/json" } });

export function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const importApi = {
  upload: (file: Blob, name: string, kind: "csv" | "vcard", key: string) => call<ContactImportBatchResult>(IMPORT_API, {
    method: "POST",
    body: file,
    headers: { "content-type": "application/octet-stream", "idempotency-key": key, "x-orbit-import-file-name": encodeURIComponent(name), "x-orbit-import-kind": kind },
  }),
  get: (id: string) => call<ContactImportBatchResponse>(batchUrl(id)),
  remap: (id: string, mapping: ContactImportMapping) => call<ContactImportBatchResponse>(batchUrl(id), json("PATCH", { mapping })),
  rows: (id: string, cursor: number) => call<ContactImportRowsPage>(batchUrl(id, `/rows?cursor=${cursor}&filter=all`)),
  decide: (id: string, decisions: readonly { seq: number; decision: "create" | "merge" | "skip" }[]) => call<ContactImportDecisionsResult>(batchUrl(id, "/rows"), json("PATCH", { decisions })),
  commit: (id: string, confirmationIntentId: string, mergeConfirmations: readonly ContactImportMergeConfirmation[]) => call<ContactImportBatchResult>(batchUrl(id, "/commit"), json("POST", { confirmationIntentId, mergeConfirmations })),
  events: () => call<ContactImportEventListResponse>(`${IMPORT_API}/events`),
  importEvent: (eventId: string, key: string) => call<ContactImportBatchResult>(`${IMPORT_API}/events`, json("POST", { eventId, idempotencyKey: key })),
};

/** Every row of a batch (≤ 2,000, 50 a page). */
export async function allRows(id: string): Promise<ContactImportRowView[]> {
  const rows: ContactImportRowView[] = [];
  let cursor: number | null = 0;
  while (cursor !== null) {
    const page: ContactImportRowsPage = await importApi.rows(id, cursor);
    rows.push(...page.rows);
    cursor = page.nextCursor;
  }
  return rows;
}

/** Decides, then commits with every merge confirmed (replaying the same intent gives the same result). */
export async function commitImport(id: string, intent: string, decisions: readonly { seq: number; decision: "create" | "merge" | "skip" }[], confirmations: readonly ContactImportMergeConfirmation[]): Promise<ContactImportBatchView> {
  for (let start = 0; start < decisions.length; start += 200) await importApi.decide(id, decisions.slice(start, start + 200));
  return (await importApi.commit(id, intent, confirmations)).batch;
}

export type PreparedFile = { ok: true; blob: Blob; name: string; kind: "csv" | "vcard"; size: number } | { ok: false; reason: "zipNoCsv" | "zipBroken" | "wrongType" };

/**
 * A dropped file as the server takes it: .csv / .vcf as they are; a .zip is opened and its
 * Connections.csv (LinkedIn) — or its only CSV — is sent instead.
 */
export async function prepareImportFile(file: File, accept: "csv" | "vcard"): Promise<PreparedFile> {
  const lower = file.name.toLowerCase();
  if (accept === "vcard") return lower.endsWith(".vcf") || lower.endsWith(".vcard") || file.type === "text/vcard" ? { ok: true, blob: file, name: file.name, kind: "vcard", size: file.size } : { ok: false, reason: "wrongType" };
  if (lower.endsWith(".csv") || file.type === "text/csv") return { ok: true, blob: file, name: file.name, kind: "csv", size: file.size };
  if (!lower.endsWith(".zip") && file.type !== "application/zip") return { ok: false, reason: "wrongType" };
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => entry.name.toLowerCase().endsWith(".csv") });
  } catch {
    return { ok: false, reason: "zipBroken" };
  }
  const names = Object.keys(entries).filter((name) => !name.startsWith("__MACOSX/"));
  const pick = names.find((name) => /(^|\/)connections\.csv$/i.test(name)) ?? (names.length === 1 ? names[0] : undefined);
  if (!pick) return { ok: false, reason: "zipNoCsv" };
  const bytes = entries[pick]!;
  const name = pick.split("/").pop() ?? pick;
  return { ok: true, blob: new Blob([bytes.slice().buffer], { type: "text/csv" }), name, kind: "csv", size: bytes.byteLength };
}
