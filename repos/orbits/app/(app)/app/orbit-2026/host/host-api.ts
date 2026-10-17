"use client";

// R17 主催：運営センター / イベント運営 の呼び出し。読み取りは契約 schema で寛容に解析し、失敗は理由で返す（throw しない）。
// 失敗分類は R26 events-api と同じ形に、主催側で要る forbidden（権限なし）と conflict（版の衝突・状態）を足す。
import type { ZodType } from "zod";

import { hostCheckInResultSchema, hostKioskHeartbeatResultSchema, hostKioskResponseSchema, hostKioskRosterResponseSchema, hostMatchingResponseSchema, hostOverviewResponseSchema, hostPeopleDecisionResultSchema, hostPeopleResponseSchema, hostReportResponseSchema, hostRosterMatchResponseSchema, hostSetupResponseSchema } from "../../../../../shared/api-schema/host-console";
import { hostCohostInviteResultSchema, hostCohostsResponseSchema } from "../../../../../shared/api-schema/host-cohosts";
import { hostCenterResponseSchema, hostEventViewSchema, hostEventWriteResultSchema } from "../../../../../shared/api-schema/host-events";
import { hostCohostAcceptResultSchema, hostCohostInvitePreviewSchema } from "../../../../../shared/api-schema/host-cohosts";
import { organizerProfileListResponseSchema, organizerProfileSchema, organizerPublicResponseSchema } from "../../../../../shared/api-schema/organizer-profile";
import type { HostCohostAcceptResult, HostCohostInvitePreview } from "../../../../../shared/contract/host-cohosts";
import type { HostEventInput, HostEventUpdateInput, HostEventView } from "../../../../../shared/contract/host-events";
import type { OrganizerProfile, OrganizerProfileInput, OrganizerProfileListResponse, OrganizerPublicResponse } from "../../../../../shared/contract/organizer-profile";
import { hostNoticePreviewSchema, hostNoticeSendResultSchema } from "../../../../../shared/api-schema/host-notices";
import type { HostCheckInResult, HostKioskHeartbeatResult, HostKioskResponse, HostKioskRosterResponse, HostReportResponse, HostRosterMatchResponse, HostSetupDraftInput, HostSetupResponse } from "../../../../../shared/contract/host-console";
import type { HostAdmissionDecision, HostMatchingConditions, HostMatchingMove, HostMatchingResponse, HostOverviewResponse, HostPeopleBucket, HostPeopleDecisionResult, HostPeopleResponse } from "../../../../../shared/contract/host-console";
import type { HostCohostInviteResult, HostCohostRole, HostCohostsResponse } from "../../../../../shared/contract/host-cohosts";
import type { HostCenterFilter, HostCenterResponse, HostEventWriteResult } from "../../../../../shared/contract/host-events";
import type { HostNoticePreview, HostNoticeSendResult, HostSendableNoticeKind } from "../../../../../shared/contract/host-notices";
import { newIdempotencyKey } from "../events/events-api";
import { organizerFollowResultSchema } from "../../../../../shared/api-schema/organizer-follow";
import type { OrganizerFollowResult } from "../../../../../shared/contract/organizer-follow";

export type HostApiFailure = "forbidden" | "not_found" | "conflict" | "rate_limited" | "sample" | "invalid" | "unavailable" | "network";
export type HostApiResult<T> = { ok: true; data: T } | { ok: false; reason: HostApiFailure; code?: string };

/** 失败原因（tsconfig 不开 strictNullChecks，判别联合不收窄，这里统一取）。 */
export const failureOf = (result: HostApiResult<unknown>): HostApiFailure => (result as { reason?: HostApiFailure }).reason ?? "unavailable";
/** 服务端 error.context.reason（CAPACITY_FULL / WAITLISTED / TOKEN_INVALID …）。 */
export const failureCode = (result: HostApiResult<unknown>): string | null => (result as { code?: string }).code ?? null;

async function call<T>(url: string, init: RequestInit | undefined, schema: ZodType<T>): Promise<HostApiResult<T>> {
  try {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = (await response.json().catch(() => null)) as { data?: unknown; error?: { context?: { reason?: string } } } | null;
    if (!response.ok) {
      const reason = body?.error?.context?.reason;
      if (response.status === 429 || reason === "RATE_LIMITED") return { ok: false, reason: "rate_limited" };
      if (reason === "SAMPLE_READ_ONLY") return { ok: false, reason: "sample" };
      if (response.status === 401 || response.status === 403) return { ok: false, reason: "forbidden" };
      if (response.status === 404) return { code: reason, ok: false, reason: "not_found" };
      if (response.status === 409) return { code: reason, ok: false, reason: "conflict" };
      if (response.status === 400) return { ok: false, reason: "invalid" };
      return { ok: false, reason: "unavailable" };
    }
    const parsed = schema.safeParse(body?.data);
    return parsed.success ? { data: parsed.data, ok: true } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

const id = (value: string) => encodeURIComponent(value);
const post = (body: unknown): RequestInit => ({ body: JSON.stringify(body), method: "POST" });
const send = (method: "PUT" | "PATCH" | "DELETE", body: unknown): RequestInit => ({ body: JSON.stringify(body), method });

export type HostPeopleQuery = { bucket: HostPeopleBucket; q: string; incomplete: boolean; cursor?: string | null };

export function peopleQueryString(query: HostPeopleQuery): string {
  const search = new URLSearchParams({ bucket: query.bucket });
  if (query.q.trim()) search.set("q", query.q.trim());
  if (query.incomplete) search.set("incomplete", "1");
  if (query.cursor) search.set("cursor", query.cursor);
  return search.toString();
}

export function centerQueryString(filter: HostCenterFilter, q: string): string {
  const search = new URLSearchParams();
  if (filter !== "all") search.set("filter", filter);
  if (q.trim()) search.set("q", q.trim());
  return search.toString();
}

export const hostApi = {
  center: (filter: HostCenterFilter, q: string) => call(`/api/host/center?${centerQueryString(filter, q)}`, undefined, hostCenterResponseSchema as ZodType<HostCenterResponse>),
  overview: (eventId: string) => call(`/api/host/events/${id(eventId)}/overview`, undefined, hostOverviewResponseSchema as ZodType<HostOverviewResponse>),
  publish: (eventId: string, expectedVersion: number) => call(`/api/host/events/${id(eventId)}/publish`, post({ expectedVersion }), hostEventWriteResultSchema as ZodType<HostEventWriteResult>),
  archive: (eventId: string, expectedVersion: number, archived: boolean) => call(`/api/host/events/${id(eventId)}/archive`, post({ archived, expectedVersion }), hostEventWriteResultSchema as ZodType<HostEventWriteResult>),
  matching: (eventId: string, round: number) => call(`/api/host/events/${id(eventId)}/matching?round=${round}`, undefined, hostMatchingResponseSchema as ZodType<HostMatchingResponse>),
  generate: (eventId: string, conditions: HostMatchingConditions) => call(`/api/host/events/${id(eventId)}/matching/generate`, post({ conditions, idempotencyKey: newIdempotencyKey() }), hostMatchingResponseSchema as ZodType<HostMatchingResponse>),
  overrides: (eventId: string, generationId: string, expectedVersion: number, moves: readonly HostMatchingMove[]) => call(`/api/host/events/${id(eventId)}/matching/overrides`, send("PUT", { expectedVersion, generationId, moves }), hostMatchingResponseSchema as ZodType<HostMatchingResponse>),
  publishMatching: (eventId: string, generationId: string, overridesVersion: number, notifyCohosts = false) => call(`/api/host/events/${id(eventId)}/matching/publish`, post({ generationId, notifyCohosts, overridesVersion }), hostMatchingResponseSchema as ZodType<HostMatchingResponse>),
  people: (eventId: string, query: HostPeopleQuery) => call(`/api/host/events/${id(eventId)}/people?${peopleQueryString(query)}`, undefined, hostPeopleResponseSchema as ZodType<HostPeopleResponse>),
  decide: (eventId: string, actorId: string, decision: HostAdmissionDecision, expectedVersion: number) => call(`/api/host/events/${id(eventId)}/people/${id(actorId)}/decision`, post({ decision, expectedVersion }), hostPeopleDecisionResultSchema as ZodType<HostPeopleDecisionResult>),
  cohosts: (eventId: string) => call(`/api/host/events/${id(eventId)}/cohosts`, undefined, hostCohostsResponseSchema as ZodType<HostCohostsResponse>),
  invite: (eventId: string, role: HostCohostRole, target: string) => call(`/api/host/events/${id(eventId)}/cohost-invites`, post({ idempotencyKey: newIdempotencyKey(), role, target: target.trim() || null }), hostCohostInviteResultSchema as ZodType<HostCohostInviteResult>),
  revokeInvite: (eventId: string, inviteId: string) => call(`/api/host/events/${id(eventId)}/cohost-invites/${id(inviteId)}`, { method: "DELETE" }, hostCohostsResponseSchema as ZodType<HostCohostsResponse>),
  changeRole: (eventId: string, actorId: string, role: HostCohostRole, reason: string, expectedRevision: number) => call(`/api/host/events/${id(eventId)}/cohosts/${id(actorId)}`, send("PATCH", { expectedRevision, reason, role }), hostCohostsResponseSchema as ZodType<HostCohostsResponse>),
  removeCohost: (eventId: string, actorId: string, reason: string, expectedRevision: number) => call(`/api/host/events/${id(eventId)}/cohosts/${id(actorId)}`, send("DELETE", { expectedRevision, reason }), hostCohostsResponseSchema as ZodType<HostCohostsResponse>),
  noticePreview: (eventId: string, kind: HostSendableNoticeKind) => call(`/api/host/events/${id(eventId)}/notices/preview`, post({ kind }), hostNoticePreviewSchema as ZodType<HostNoticePreview>),
  setup: (eventId: string) => call(`/api/host/events/${id(eventId)}/setup`, undefined, hostSetupResponseSchema as ZodType<HostSetupResponse>),
  saveSetup: (eventId: string, input: HostSetupDraftInput) => call(`/api/host/events/${id(eventId)}/setup`, send("PUT", input), hostSetupResponseSchema as ZodType<HostSetupResponse>),
  publishSetup: (eventId: string, expectedRevision: number) => call(`/api/host/events/${id(eventId)}/setup/publish`, post({ expectedRevision }), hostSetupResponseSchema as ZodType<HostSetupResponse>),
  saveHostNote: (eventId: string, hostNote: string | null) => call(`/api/host/events/${id(eventId)}/setup/host-note`, send("PUT", { hostNote }), hostSetupResponseSchema as ZodType<HostSetupResponse>),
  report: (eventId: string, view: "all" | "mine") => call(`/api/host/events/${id(eventId)}/report?view=${view}`, undefined, hostReportResponseSchema as ZodType<HostReportResponse>),
  rosterMatch: (eventId: string, emailHashes: readonly string[]) => call(`/api/host/events/${id(eventId)}/roster/match`, post({ emailHashes }), hostRosterMatchResponseSchema as ZodType<HostRosterMatchResponse>),
  kiosk: (eventId: string, q: string) => call(`/api/host/events/${id(eventId)}/kiosk${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, undefined, hostKioskResponseSchema as ZodType<HostKioskResponse>),
  kioskRoster: (eventId: string) => call(`/api/host/events/${id(eventId)}/kiosk/roster`, undefined, hostKioskRosterResponseSchema as ZodType<HostKioskRosterResponse>),
  checkIn: (eventId: string, participantId: string, idempotencyKey: string) => call(`/api/events/${id(eventId)}/operations/admin/check-ins/${id(participantId)}`, post({ idempotencyKey }), hostCheckInResultSchema as ZodType<HostCheckInResult>),
  scanCheckIn: (eventId: string, payload: string, idempotencyKey: string) => call(`/api/events/${id(eventId)}/operations/admin/check-ins/scan`, post({ idempotencyKey, payload }), hostCheckInResultSchema as ZodType<HostCheckInResult>),
  undoCheckIn: (eventId: string, participantId: string, idempotencyKey: string) => call(`/api/events/${id(eventId)}/operations/admin/check-ins/${id(participantId)}/undo`, post({ idempotencyKey }), hostCheckInResultSchema as ZodType<HostCheckInResult>),
  admitOnSite: (eventId: string, participantId: string, idempotencyKey: string, confirmOverCapacity: boolean) => call(`/api/events/${id(eventId)}/operations/admin/check-ins/${id(participantId)}/admit-on-site`, post({ confirmOverCapacity, idempotencyKey }), hostCheckInResultSchema as ZodType<HostCheckInResult>),
  heartbeat: (eventId: string, deviceId: string) => call(`/api/events/${id(eventId)}/operations/kiosk-heartbeat`, post({ deviceId }), hostKioskHeartbeatResultSchema as ZodType<HostKioskHeartbeatResult>),
  noticeSend: (eventId: string, kind: HostSendableNoticeKind) => call(`/api/host/events/${id(eventId)}/notices/send`, post({ idempotencyKey: newIdempotencyKey(), kind }), hostNoticeSendResultSchema as ZodType<HostNoticeSendResult>),
};

/** R27 actor 级关注（公開主催者ページ「フォローする」）：POST = 关注、DELETE = 解除，幂等。 */
export const followOrganizer = (organizerKey: string, following: boolean) => call(`/api/organizers/${id(organizerKey)}/follow`, { method: following ? "POST" : "DELETE" }, organizerFollowResultSchema as ZodType<OrganizerFollowResult>);

/** 第 4 段：建活动 / 编辑 / 中止 / 参加コード再発行、主催者ページ、共同運営に参加。 */
export const hostEventApi = {
  event: (eventId: string) => call(`/api/host/events/${id(eventId)}`, undefined, hostEventViewSchema as ZodType<HostEventView>),
  create: (input: HostEventInput) => call("/api/host/events", post(input), hostEventWriteResultSchema as ZodType<HostEventWriteResult>),
  update: (eventId: string, input: HostEventUpdateInput) => call(`/api/host/events/${id(eventId)}`, send("PATCH", input), hostEventWriteResultSchema as ZodType<HostEventWriteResult>),
  publish: (eventId: string, expectedVersion: number) => call(`/api/host/events/${id(eventId)}/publish`, post({ expectedVersion }), hostEventWriteResultSchema as ZodType<HostEventWriteResult>),
  cancel: (eventId: string, expectedVersion: number, hostNote: string | null) => call(`/api/host/events/${id(eventId)}/cancel`, post(hostNote ? { expectedVersion, hostNote } : { expectedVersion }), hostEventWriteResultSchema as ZodType<HostEventWriteResult>),
  archive: (eventId: string, expectedVersion: number, archived: boolean) => call(`/api/host/events/${id(eventId)}/archive`, post({ archived, expectedVersion }), hostEventWriteResultSchema as ZodType<HostEventWriteResult>),
  reissueCode: (eventId: string, expectedVersion: number) => call(`/api/host/events/${id(eventId)}/code/reissue`, post({ expectedVersion }), hostEventWriteResultSchema as ZodType<HostEventWriteResult>),
  profiles: () => call("/api/host/organizer-profiles", undefined, organizerProfileListResponseSchema as ZodType<OrganizerProfileListResponse>),
  createProfile: (input: OrganizerProfileInput) => call("/api/host/organizer-profiles", post(input), organizerProfileSchema as ZodType<OrganizerProfile>),
  updateProfile: (profileId: string, input: OrganizerProfileInput) => call(`/api/host/organizer-profiles/${id(profileId)}`, send("PUT", input), organizerProfileSchema as ZodType<OrganizerProfile>),
  organizerPublic: (slug: string) => call(`/api/organizers/by-slug/${id(slug)}`, undefined, organizerPublicResponseSchema as ZodType<OrganizerPublicResponse>),
  invitePreview: (code: string) => call(`/api/host/cohost-invites/${id(code)}`, undefined, hostCohostInvitePreviewSchema as ZodType<HostCohostInvitePreview>),
  acceptInvite: (code: string) => call(`/api/host/cohost-invites/${id(code)}/accept`, post({}), hostCohostAcceptResultSchema as ZodType<HostCohostAcceptResult>),
};
