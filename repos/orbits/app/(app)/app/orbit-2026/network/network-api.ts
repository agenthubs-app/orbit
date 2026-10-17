"use client";

// R11a 人脈（Web）: the calls the 人脈 page and the contact drawer make. Responses are read leniently through the
// contract schemas (unknown fields dropped, unknown enum values fall back). Failures come back as a reason, never thrown.
import type { ZodType } from "zod";

import { contactCardPageSchema, contactCardSummarySchema } from "../../../../../shared/api-schema/contact-card-page";
import { contactDeleteResultSchema, contactRestoreResultSchema } from "../../../../../shared/api-schema/contact-delete";
import { contactFieldsUpdateResultSchema } from "../../../../../shared/api-schema/contact-fields";
import { contactGoalRelatedIdsSchema } from "../../../../../shared/api-schema/contact-goal-related";
import { inviteConnectionViewSchema, inviteUnlinkResultSchema } from "../../../../../shared/api-schema/invite-codes";
import type { ContactCardPageDTO, ContactCardSummaryDTO } from "../../../../../shared/contract/contact-card-page";
import type { ContactDeleteResult, ContactRestoreResult } from "../../../../../shared/contract/contact-delete";
import type { ContactEditableField, ContactFieldsUpdateResult } from "../../../../../shared/contract/contact-fields";
import type { ContactGoalRelatedIdsDTO } from "../../../../../shared/contract/contact-goal-related";
import type { InviteConnectionView, InviteSharedFieldKey, InviteUnlinkResult } from "../../../../../shared/contract/invite-codes";
import type { PlanContactFit } from "../../../../../shared/contract/plan-v2";

export type NetworkApiFailure = "unavailable" | "not_found" | "invalid" | "network" | "not_implemented";
export type NetworkApiResult<T> = { ok: true; data: T } | { ok: false; reason: NetworkApiFailure; status: number };

const anything = { safeParse: (value: unknown) => ({ success: true as const, data: value }) } as unknown as ZodType<unknown>;

async function call<T>(url: string, init: RequestInit | undefined, schema: ZodType<T>): Promise<NetworkApiResult<T>> {
  try {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = (await response.json().catch(() => null)) as { data?: unknown; error?: { context?: { reason?: string } } } | null;
    if (!response.ok) {
      if (body?.error?.context?.reason === "NOT_IMPLEMENTED") return { ok: false, reason: "not_implemented", status: response.status };
      return { ok: false, reason: response.status === 404 ? "not_found" : response.status === 400 ? "invalid" : "unavailable", status: response.status };
    }
    const parsed = schema.safeParse(body?.data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "invalid", status: response.status };
  } catch {
    return { ok: false, reason: "network", status: 0 };
  }
}

const key = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const id = (value: string) => encodeURIComponent(value);

export const networkApi = {
  page: (query: string) => call<ContactCardPageDTO>(`/api/contacts/page?${query}`, undefined, contactCardPageSchema as unknown as ZodType<ContactCardPageDTO>),
  summary: (query = "") => call<ContactCardSummaryDTO>(`/api/contacts/summary${query ? `?${query}` : ""}`, undefined, contactCardSummarySchema as unknown as ZodType<ContactCardSummaryDTO>),
  goalRelated: () => call<ContactGoalRelatedIdsDTO>("/api/contacts/goal-related-ids", undefined, contactGoalRelatedIdsSchema as unknown as ZodType<ContactGoalRelatedIdsDTO>),
  detail: (contactId: string) => call<Record<string, unknown>>(`/api/contacts/${id(contactId)}`, undefined, anything as ZodType<Record<string, unknown>>),
  valueLine: (contactId: string, lang: string) => call<{ lines: { contactId: string; relation?: string | null; evidence?: string[] }[] }>(`/api/contacts/value-lines?ids=${id(contactId)}&lang=${lang}`, undefined, anything as ZodType<{ lines: { contactId: string; relation?: string | null; evidence?: string[] }[] }>),
  fit: (contactId: string) => call<PlanContactFit>(`/api/agent/plans/v2/contacts/${id(contactId)}/fit`, undefined, anything as ZodType<PlanContactFit>),
  decide: (planId: string, itemId: string, contactId: string, decision: "accept" | "dismiss") =>
    call(`/api/agent/plans/v2/${id(planId)}/types/${id(itemId)}/candidates/${id(contactId)}/decision`, { method: "POST", body: JSON.stringify({ decision, idempotencyKey: key() }) }, anything),
  connection: (contactId: string) => call<InviteConnectionView>(`/api/invite-codes/connections/${id(contactId)}`, undefined, inviteConnectionViewSchema as unknown as ZodType<InviteConnectionView>),
  updateShare: (contactId: string, sharedKeys: InviteSharedFieldKey[]) =>
    call<InviteConnectionView>(`/api/invite-codes/connections/${id(contactId)}/share`, { method: "PUT", body: JSON.stringify({ sharedKeys, idempotencyKey: key() }) }, inviteConnectionViewSchema as unknown as ZodType<InviteConnectionView>),
  unlink: (contactId: string, keepAsContact: boolean) =>
    call<InviteUnlinkResult>(`/api/invite-codes/connections/${id(contactId)}/unlink`, { method: "POST", body: JSON.stringify({ keepAsContact, idempotencyKey: key() }) }, inviteUnlinkResultSchema as unknown as ZodType<InviteUnlinkResult>),
  updateFields: (contactId: string, values: Partial<Record<ContactEditableField, string | null>>) =>
    call<ContactFieldsUpdateResult>(`/api/contacts/${id(contactId)}/fields`, { method: "PATCH", body: JSON.stringify({ values }) }, contactFieldsUpdateResultSchema as unknown as ZodType<ContactFieldsUpdateResult>),
  updateDetail: (contactId: string, patch: Record<string, unknown>) => call(`/api/contacts/${id(contactId)}`, { method: "PATCH", body: JSON.stringify(patch) }, anything),
  remove: (contactId: string) => call<ContactDeleteResult>(`/api/contacts/${id(contactId)}`, { method: "DELETE" }, contactDeleteResultSchema as unknown as ZodType<ContactDeleteResult>),
  restore: (contactId: string) => call<ContactRestoreResult>(`/api/contacts/${id(contactId)}/restore`, { method: "POST" }, contactRestoreResultSchema as unknown as ZodType<ContactRestoreResult>),
};
