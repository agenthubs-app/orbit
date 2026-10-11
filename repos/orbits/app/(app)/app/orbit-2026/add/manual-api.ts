"use client";

// R12 手入力: the four `/api/contacts/manual/**` calls (DESIGN §4.1) plus the events list
// for the 出会った場所 chips. Responses are read leniently through the contract schemas
// (an unknown outcome reads as duplicate_review, an unreadable candidate is dropped).
import type { ZodType } from "zod";

import {
  manualContactCreateResultSchema,
  manualContactDuplicateCheckResultSchema,
  manualContactOrganizationSuggestionsResultSchema,
  manualContactUndoResultSchema,
} from "../../../../../shared/api-schema/manual-contact";
import type {
  ManualContactCreateInput,
  ManualContactCreateResult,
  ManualContactDuplicateCheckInput,
  ManualContactDuplicateCheckResult,
  ManualContactOrganizationSuggestionsResult,
  ManualContactUndoResult,
} from "../../../../../shared/contract/manual-contact";

export type ManualApiResult<T> = { ok: true; data: T } | { ok: false; status: number; reason: string | null };

export const MANUAL_API = "/api/contacts/manual";

async function call<T>(url: string, init: RequestInit, schema: ZodType<T>, signal?: AbortSignal): Promise<ManualApiResult<T>> {
  try {
    const response = await fetch(url, { ...init, signal, headers: init.body ? { "Content-Type": "application/json" } : undefined });
    const body = (await response.json().catch(() => null)) as { success?: boolean; data?: unknown; error?: { context?: { reason?: string } } } | null;
    if (!response.ok || !body?.success) return { ok: false, status: response.status, reason: body?.error?.context?.reason ?? null };
    const parsed = schema.safeParse(body.data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, status: 500, reason: "UNREADABLE" };
  } catch {
    return { ok: false, status: 0, reason: signal?.aborted ? "ABORTED" : null };
  }
}

export function saveManualContact(input: ManualContactCreateInput): Promise<ManualApiResult<ManualContactCreateResult>> {
  return call(MANUAL_API, { method: "POST", body: JSON.stringify(input) }, manualContactCreateResultSchema);
}

export function checkManualDuplicates(input: ManualContactDuplicateCheckInput, signal?: AbortSignal): Promise<ManualApiResult<ManualContactDuplicateCheckResult>> {
  return call(`${MANUAL_API}/duplicates`, { method: "POST", body: JSON.stringify(input) }, manualContactDuplicateCheckResultSchema, signal);
}

export function suggestOrganizations(query: string, signal?: AbortSignal): Promise<ManualApiResult<ManualContactOrganizationSuggestionsResult>> {
  return call(`${MANUAL_API}/organizations?${new URLSearchParams({ q: query })}`, { method: "GET" }, manualContactOrganizationSuggestionsResultSchema, signal);
}

export function undoManualContact(contactId: string): Promise<ManualApiResult<ManualContactUndoResult>> {
  return call(`${MANUAL_API}/${encodeURIComponent(contactId)}/undo`, { method: "POST", body: "{}" }, manualContactUndoResultSchema);
}

/** GET /api/events (the person's events). Fails quietly: no chips, the form still works. */
export async function readEvents(signal?: AbortSignal): Promise<{ id?: unknown; title?: unknown; startsAt?: unknown }[]> {
  try {
    const response = await fetch("/api/events", { signal });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: { events?: unknown } } | null;
    return Array.isArray(body?.data?.events) ? (body.data.events as { id?: unknown; title?: unknown; startsAt?: unknown }[]) : [];
  } catch {
    return [];
  }
}
