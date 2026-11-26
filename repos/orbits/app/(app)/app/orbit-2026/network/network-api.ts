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
import type { ContactSyncPayload } from "../../../../../shared/contract/contact-local-directory";
import type { RelationshipEligibilityDTO, RelationshipMessageDTO, RelationshipMessageSendRequestDTO } from "../../../../../shared/contract/relationship-communication";
import type { ContactLogEventOption } from "./contact-log-model";

export type NetworkApiFailure = "unavailable" | "not_found" | "invalid" | "network" | "not_implemented";
export type NetworkApiResult<T> = { ok: true; data: T } | { ok: false; reason: NetworkApiFailure; status: number };

/** Lenient read of GET /api/contacts/memo-event-options: rows that are not three strings are dropped. */
const memoEventOptionsSchema = {
  safeParse: (value: unknown) => {
    const rows = typeof value === "object" && value !== null && Array.isArray((value as { options?: unknown }).options) ? (value as { options: unknown[] }).options : null;
    if (!rows) return { success: false as const };
    const options = rows.flatMap((row) => {
      const item = row as Record<string, unknown>;
      return typeof item?.eventId === "string" && typeof item.title === "string" && typeof item.startsAt === "string" ? [{ eventId: item.eventId, title: item.title, startsAt: item.startsAt }] : [];
    });
    return { success: true as const, data: { options } };
  },
} as unknown as ZodType<{ options: ContactLogEventOption[] }>;

const draftSchema = {
  safeParse: (value: unknown) => {
    const draft = (value as { draft?: { subject?: unknown; body?: unknown } } | null)?.draft;
    return typeof draft?.subject === "string" && typeof draft.body === "string" ? { success: true as const, data: { draft: { subject: draft.subject, body: draft.body } } } : { success: false as const };
  },
} as unknown as ZodType<{ draft: { subject: string; body: string } }>;

/** contact-reach R41: the eligibility fields 連絡する reads (R39 交接); unknown values read as "not allowed". */
export interface ReachEligibility {
  canSend: boolean; canStart: boolean; canProposeMeeting: boolean; activeAppointmentId: string | null;
  conversationId: string | null; qualificationVersion: string | null;
}
const eligibilitySchema = {
  safeParse: (value: unknown) => {
    const raw = value as Partial<RelationshipEligibilityDTO> | null;
    if (!raw || typeof raw !== "object" || typeof raw.contactId !== "string") return { success: false as const };
    const text = (item: unknown) => (typeof item === "string" && item ? item : null);
    return { success: true as const, data: {
      canSend: raw.canSend === true, canStart: raw.canStart === true, canProposeMeeting: raw.canProposeMeeting === true,
      activeAppointmentId: raw.canProposeMeeting === true ? text(raw.activeAppointmentId) : null,
      conversationId: text(raw.conversationId), qualificationVersion: text(raw.qualificationVersion),
    } satisfies ReachEligibility };
  },
} as unknown as ZodType<ReachEligibility>;

/** Why a message was not sent (R39 error codes). `active` carries the ongoing meeting when the server named it. */
export type ReachSendFailure =
  | { reason: "active"; appointmentId: string | null }
  | { reason: "meeting_unavailable" | "stale" | "invalid" | "reused" | "unavailable" | "network" };
export type ReachSendResult = { ok: true; message: RelationshipMessageDTO } | ({ ok: false } & ReachSendFailure);

async function sendReachMessage(conversationId: string, request: Omit<RelationshipMessageSendRequestDTO, "requestId">, idempotencyKey: string): Promise<ReachSendResult> {
  let response: Response;
  try {
    response = await fetch(`/api/relationship-communication/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey }, body: JSON.stringify(request),
    });
  } catch { return { ok: false, reason: "network" }; }
  const body = (await response.json().catch(() => null)) as { success?: boolean; data?: { message?: RelationshipMessageDTO }; error?: { context?: { reason?: unknown; appointmentId?: unknown } } } | null;
  if (response.ok && body?.success === true && body.data?.message && typeof body.data.message.messageId === "string") return { ok: true, message: body.data.message };
  const reason = body?.error?.context?.reason;
  if (reason === "MEETING_ALREADY_ACTIVE") return { ok: false, reason: "active", appointmentId: typeof body?.error?.context?.appointmentId === "string" ? body.error.context.appointmentId : null };
  if (reason === "MEETING_NOT_AVAILABLE") return { ok: false, reason: "meeting_unavailable" };
  if (reason === "REQUEST_REUSED") return { ok: false, reason: "reused" };
  if (reason === "STALE" || reason === "REVOKED" || reason === "NOT_AVAILABLE" || response.status === 404 || response.status === 403) return { ok: false, reason: "stale" };
  if (response.status === 400) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "unavailable" };
}

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
const designId = (value: string) => /^design-person-[0-9]{3}$/u.test(value);
type DesignContacts = { rows: ContactSyncPayload[]; goalRelatedIds: string[]; followUpContactIds: string[]; links: ContactGoalRelatedIdsDTO["links"]; asOf?: string;
  fits: Record<string, PlanContactFit>; connections: Record<string, InviteConnectionView>;
  valueLines: Record<string, { relation: string; evidence: string[] }>; sharedContactMethods?: Record<string, unknown> };
const designContacts = () => call<DesignContacts>("/api/dev/network-design-fixture?contacts=1", undefined, anything as ZodType<DesignContacts>);
const designMissing = (): NetworkApiResult<never> => ({ ok: false, reason: "not_found", status: 404 });

export const networkApi = {
  page: (query: string) => call<ContactCardPageDTO>(`/api/contacts/page?${query}`, undefined, contactCardPageSchema as unknown as ZodType<ContactCardPageDTO>),
  summary: (query = "") => call<ContactCardSummaryDTO>(`/api/contacts/summary${query ? `?${query}` : ""}`, undefined, contactCardSummarySchema as unknown as ZodType<ContactCardSummaryDTO>),
  goalRelated: () => call<ContactGoalRelatedIdsDTO>("/api/contacts/goal-related-ids", undefined, contactGoalRelatedIdsSchema as unknown as ZodType<ContactGoalRelatedIdsDTO>),
  designContacts,
  detail: async (contactId: string): Promise<NetworkApiResult<Record<string, unknown>>> => {
    if (designId(contactId)) {
      const result = await designContacts();
      if ("reason" in result) return result;
      const detail = result.data.rows.find((row) => row.id === contactId)?.detail;
      return detail ? { ok: true, data: detail } : { ok: false, reason: "not_found", status: 404 };
    }
    return call<Record<string, unknown>>(`/api/contacts/${id(contactId)}`, undefined, anything as ZodType<Record<string, unknown>>);
  },
  valueLine: async (contactId: string, lang: string) => {
    if (designId(contactId)) {
      const result = await designContacts();
      if ("reason" in result) return result;
      const line = result.data.valueLines?.[contactId];
      return { ok: true as const, data: { lines: line ? [{ contactId, ...line }] : [] } };
    }
    return call<{ lines: { contactId: string; relation?: string | null; evidence?: string[] }[] }>(`/api/contacts/value-lines?ids=${id(contactId)}&lang=${lang}`, undefined, anything as ZodType<{ lines: { contactId: string; relation?: string | null; evidence?: string[] }[] }>);
  },
  fit: async (contactId: string) => {
    if (designId(contactId)) {
      const result = await designContacts();
      if ("reason" in result) return result;
      return { ok: true as const, data: result.data.fits?.[contactId] ?? { contactId, fits: [] } };
    }
    return call<PlanContactFit>(`/api/agent/plans/v2/contacts/${id(contactId)}/fit`, undefined, anything as ZodType<PlanContactFit>);
  },
  decide: (planId: string, itemId: string, contactId: string, decision: "accept" | "dismiss") =>
    designId(contactId) ? Promise.resolve(designMissing()) : call(`/api/agent/plans/v2/${id(planId)}/types/${id(itemId)}/candidates/${id(contactId)}/decision`, { method: "POST", body: JSON.stringify({ decision, idempotencyKey: key() }) }, anything),
  connection: async (contactId: string) => {
    if (designId(contactId)) {
      const result = await designContacts();
      if ("reason" in result) return result;
      return result.data.connections?.[contactId] ? { ok: true as const, data: result.data.connections[contactId]! } : designMissing();
    }
    return call<InviteConnectionView>(`/api/invite-codes/connections/${id(contactId)}`, undefined, inviteConnectionViewSchema as unknown as ZodType<InviteConnectionView>);
  },
  updateShare: (contactId: string, sharedKeys: InviteSharedFieldKey[]) =>
    call<InviteConnectionView>(`/api/invite-codes/connections/${id(contactId)}/share`, { method: "PUT", body: JSON.stringify({ sharedKeys, idempotencyKey: key() }) }, inviteConnectionViewSchema as unknown as ZodType<InviteConnectionView>),
  unlink: (contactId: string, keepAsContact: boolean) =>
    call<InviteUnlinkResult>(`/api/invite-codes/connections/${id(contactId)}/unlink`, { method: "POST", body: JSON.stringify({ keepAsContact, idempotencyKey: key() }) }, inviteUnlinkResultSchema as unknown as ZodType<InviteUnlinkResult>),
  updateFields: (contactId: string, values: Partial<Record<ContactEditableField, string | null>>) =>
    call<ContactFieldsUpdateResult>(`/api/contacts/${id(contactId)}/fields`, { method: "PATCH", body: JSON.stringify({ values }) }, contactFieldsUpdateResultSchema as unknown as ZodType<ContactFieldsUpdateResult>),
  /** 「起草」：模板草稿（不保存、不发送、0 次模型调用）。 */
  reconnectDraft: (contactId: string, language: string) =>
    designId(contactId) ? Promise.resolve(designMissing()) : call<{ draft: { subject: string; body: string } }>(`/api/contacts/${id(contactId)}/reconnect-draft`, { method: "POST", body: JSON.stringify({ language }) }, draftSchema),
  /** contact-reach R41: which way 連絡する goes (canSend / canStart → message, otherwise e-mail draft). */
  eligibility: (contactId: string) =>
    designId(contactId) ? Promise.resolve(designMissing()) : call<ReachEligibility>(`/api/relationship-communication/eligibility?${new URLSearchParams({ contactId })}`, undefined, eligibilitySchema),
  /** Opens (or returns) the conversation when eligibility only said canStart. */
  startConversation: (contactId: string) =>
    call<ReachEligibility>("/api/relationship-communication/conversations/start", { method: "POST", body: JSON.stringify({ contactId }) }, eligibilitySchema),
  /** One request: the message, with the proposal when times were inserted (R39 atomic command). */
  sendMessage: sendReachMessage,
  /** 「记一笔交流」：近期报名的活动（选「活动上遇到」时读一次；浏览器按日期筛当天）。 */
  memoEventOptions: () => call<{ options: ContactLogEventOption[] }>("/api/contacts/memo-event-options", undefined, memoEventOptionsSchema),
  updateDetail: (contactId: string, patch: Record<string, unknown>) => call(`/api/contacts/${id(contactId)}`, { method: "PATCH", body: JSON.stringify(patch) }, anything),
  remove: (contactId: string) => call<ContactDeleteResult>(`/api/contacts/${id(contactId)}`, { method: "DELETE" }, contactDeleteResultSchema as unknown as ZodType<ContactDeleteResult>),
  /** UR-S：交换完成后对方共享的联系方式；不是交换来的联系人回 null（不显示这张卡）。只有交换来的联系人（contact:event-consent:…）才问服务器；设计 fixture 联系人从 fixture 取。 */
  sharedMethods: async (contactId: string): Promise<NetworkApiResult<unknown>> => {
    if (designId(contactId)) {
      const result = await designContacts();
      if ("reason" in result) return result;
      return { ok: true, data: result.data.sharedContactMethods?.[contactId] ?? null };
    }
    if (!contactId.startsWith("contact:event-consent:")) return { ok: true, data: null };
    return call<unknown>(`/api/contacts/${id(contactId)}/shared-contact-methods`, { cache: "no-store" }, anything as ZodType<unknown>);
  },
  restore: (contactId: string) => call<ContactRestoreResult>(`/api/contacts/${id(contactId)}/restore`, { method: "POST" }, contactRestoreResultSchema as unknown as ZodType<ContactRestoreResult>),
};
