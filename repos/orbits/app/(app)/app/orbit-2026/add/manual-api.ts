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

/**
 * R26-06: the person's own events (`GET /api/events/mine`: registered / planned / attended, past and upcoming — the chips still only
 * keep the ones that already started, R12 review M3). External assessments (`assessment:<id>`) and cancelled ones are left out:
 * the server only accepts an Orbit event that started as 会った場所. Fails quietly: no chips, the form still works.
 */
export async function readEvents(signal?: AbortSignal): Promise<{ id?: unknown; title?: unknown; startsAt?: unknown }[]> {
  const read = async (range: "past" | "upcoming") => {
    const response = await fetch(`/api/events/mine?range=${range}&limit=20`, { signal });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: { items?: unknown } } | null;
    return Array.isArray(body?.data?.items) ? (body.data.items as { eventId?: unknown; title?: unknown; startsAt?: unknown; status?: unknown }[]) : [];
  };
  try {
    const [past, upcoming] = await Promise.all([read("past"), read("upcoming")]);
    return [...past, ...upcoming]
      .filter((item) => typeof item.eventId === "string" && !item.eventId.startsWith("assessment:") && item.status !== "cancelled" && item.status !== "rejected")
      .map((item) => ({ id: item.eventId, startsAt: item.startsAt, title: item.title }));
  } catch {
    return [];
  }
}
