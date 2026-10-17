// R17 主催（App）：運営センター / イベント運営 / 受付 / 共同運営に参加 / 公開主催者ページ 的接口。
// 回答经同步来的 schema 宽松读取；失败变成一个小原因（不 throw），由画面映射成提示。与 Web host-api.ts 同一分类，
// 主催侧另有 forbidden（没有权限 → 受付要清本机名单）和 conflict（版本冲突 / 状态不对，带服务端 reason）。这里不调 AI。
import { useMemo } from "react";
import type { ZodType } from "zod";

import type { OrbitApiClient } from "../../api/client";
import type { ApiResult } from "../../api/types";
import type { HostCheckInEventsResponse, HostCohostAcceptResult, HostCohostInvitePreview } from "../../api/contract/host-cohosts";
import type { HostCheckInResult, HostKioskHeartbeatResult, HostKioskResponse, HostKioskRosterResponse, HostMatchingResponse, HostOverviewResponse, HostPeopleBucket, HostPeopleDecisionResult, HostPeopleResponse, HostReportResponse } from "../../api/contract/host-console";
import type { HostNoticePreview, HostNoticeSendResult } from "../../api/contract/host-notices";
import type { HostCenterFilter, HostCenterResponse, HostCenterSummary, HostDesktopLinkResult, HostEventView } from "../../api/contract/host-events";
import type { OrganizerFollowResult } from "../../api/contract/organizer-follow";
import type { OrganizerPublicResponse } from "../../api/contract/organizer-profile";
import { hostCheckInEventsResponseSchema, hostCohostAcceptResultSchema, hostCohostInvitePreviewSchema } from "../../api/schema/host-cohosts";
import { hostCheckInResultSchema, hostKioskHeartbeatResultSchema, hostKioskResponseSchema, hostKioskRosterResponseSchema, hostMatchingResponseSchema, hostOverviewResponseSchema, hostPeopleDecisionResultSchema, hostPeopleResponseSchema, hostReportResponseSchema } from "../../api/schema/host-console";
import { hostCenterResponseSchema, hostCenterSummarySchema, hostDesktopLinkResultSchema, hostEventViewSchema } from "../../api/schema/host-events";
import { hostNoticePreviewSchema, hostNoticeSendResultSchema } from "../../api/schema/host-notices";
import { organizerFollowResultSchema } from "../../api/schema/organizer-follow";
import { organizerPublicResponseSchema } from "../../api/schema/organizer-profile";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { newIdempotencyKey } from "../events/v2/events-api";

export type HostApiFailure = "forbidden" | "not_found" | "conflict" | "rate_limited" | "sample" | "invalid" | "unavailable" | "network";
export type HostApiResult<T> = { ok: true; data: T } | { ok: false; reason: HostApiFailure; code?: string | null };

export const failureOf = (result: HostApiResult<unknown>): HostApiFailure => (result.ok ? "invalid" : result.reason);
/** 服务端 error.context.reason（CAPACITY_FULL / WAITLISTED / TOKEN_INVALID …）。 */
export const failureCode = (result: HostApiResult<unknown>): string | null => (result.ok ? null : result.code ?? null);

export function hostFailure(result: ApiResult<unknown>): { reason: HostApiFailure; code: string | null } {
  if (result.success) return { code: null, reason: "invalid" };
  const code = result.error.context?.reason ?? null;
  if (result.status === 0) return { code, reason: "network" };
  if (result.status === 429 || code === "RATE_LIMITED") return { code, reason: "rate_limited" };
  if (code === "SAMPLE_READ_ONLY") return { code, reason: "sample" };
  if (result.status === 401 || result.status === 403) return { code, reason: "forbidden" };
  if (result.status === 404) return { code, reason: "not_found" };
  if (result.status === 409) return { code, reason: "conflict" };
  if (result.status === 400) return { code, reason: "invalid" };
  return { code, reason: "unavailable" };
}

export async function hostRead<T>(call: Promise<ApiResult<unknown>>, schema: ZodType<T>): Promise<HostApiResult<T>> {
  let result: ApiResult<unknown>;
  try { result = await call; } catch { return { code: null, ok: false, reason: "network" }; }
  if (!result.success) return { ok: false, ...hostFailure(result) };
  const parsed = schema.safeParse(result.data);
  return parsed.success ? { data: parsed.data, ok: true } : { code: null, ok: false, reason: "invalid" };
}

const id = (value: string) => encodeURIComponent(value);
const ops = (eventId: string) => `/api/events/${id(eventId)}/operations`;

export function createHostApi(client: OrbitApiClient) {
  return {
    center: (filter: HostCenterFilter = "all") => hostRead(client.get<unknown>(`/api/host/center?filter=${filter}`), hostCenterResponseSchema as ZodType<HostCenterResponse>),
    /** マイページ「主催したイベント」行（R18）。 */
    centerSummary: () => hostRead(client.get<unknown>("/api/events/center?summary=1"), hostCenterSummarySchema as ZodType<HostCenterSummary>),
    /** 「PC で開くリンクを自分に送る」= 给自己的收件箱写一条（不发邮件）。 */
    desktopLink: (path?: string) => hostRead(client.post<unknown>("/api/host/desktop-link", { body: path ? { path } : {} }), hostDesktopLinkResultSchema as ZodType<HostDesktopLinkResult>),
    event: (eventId: string) => hostRead(client.get<unknown>(`/api/host/events/${id(eventId)}`), hostEventViewSchema as ZodType<HostEventView>),
    overview: (eventId: string) => hostRead(client.get<unknown>(`/api/host/events/${id(eventId)}/overview`), hostOverviewResponseSchema as ZodType<HostOverviewResponse>),
    matching: (eventId: string, round = 1) => hostRead(client.get<unknown>(`/api/host/events/${id(eventId)}/matching?round=${round}`), hostMatchingResponseSchema as ZodType<HostMatchingResponse>),
    publishMatching: (eventId: string, generationId: string, overridesVersion: number) => hostRead(client.post<unknown>(`/api/host/events/${id(eventId)}/matching/publish`, { body: { generationId, overridesVersion } }), hostMatchingResponseSchema as ZodType<HostMatchingResponse>),
    noticePreview: (eventId: string) => hostRead(client.post<unknown>(`/api/host/events/${id(eventId)}/notices/preview`, { body: { kind: "profile_incomplete" } }), hostNoticePreviewSchema as ZodType<HostNoticePreview>),
    noticeSend: (eventId: string) => hostRead(client.post<unknown>(`/api/host/events/${id(eventId)}/notices/send`, { body: { idempotencyKey: newIdempotencyKey(), kind: "profile_incomplete" } }), hostNoticeSendResultSchema as ZodType<HostNoticeSendResult>),
    people: (eventId: string, bucket: HostPeopleBucket) => hostRead(client.get<unknown>(`/api/host/events/${id(eventId)}/people?bucket=${bucket}`), hostPeopleResponseSchema as ZodType<HostPeopleResponse>),
    approve: (eventId: string, actorId: string, expectedVersion: number) => hostRead(client.post<unknown>(`/api/host/events/${id(eventId)}/people/${id(actorId)}/decision`, { body: { decision: "approve", expectedVersion } }), hostPeopleDecisionResultSchema as ZodType<HostPeopleDecisionResult>),
    report: (eventId: string) => hostRead(client.get<unknown>(`/api/host/events/${id(eventId)}/report?view=all`), hostReportResponseSchema as ZodType<HostReportResponse>),
    kiosk: (eventId: string, q = "") => hostRead(q.trim() ? client.get<unknown>(`/api/host/events/${id(eventId)}/kiosk?q=${encodeURIComponent(q.trim())}`) : client.get<unknown>(`/api/host/events/${id(eventId)}/kiosk`), hostKioskResponseSchema as ZodType<HostKioskResponse>),
    roster: (eventId: string) => hostRead(client.get<unknown>(`/api/host/events/${id(eventId)}/kiosk/roster`), hostKioskRosterResponseSchema as ZodType<HostKioskRosterResponse>),
    checkIn: (eventId: string, participantId: string, idempotencyKey: string) => hostRead(client.post<unknown>(`${ops(eventId)}/admin/check-ins/${id(participantId)}`, { body: { idempotencyKey } }), hostCheckInResultSchema as ZodType<HostCheckInResult>),
    scan: (eventId: string, payload: string) => hostRead(client.post<unknown>(`${ops(eventId)}/admin/check-ins/scan`, { body: { idempotencyKey: newIdempotencyKey(), payload } }), hostCheckInResultSchema as ZodType<HostCheckInResult>),
    undo: (eventId: string, participantId: string) => hostRead(client.post<unknown>(`${ops(eventId)}/admin/check-ins/${id(participantId)}/undo`, { body: { idempotencyKey: newIdempotencyKey() } }), hostCheckInResultSchema as ZodType<HostCheckInResult>),
    admitOnSite: (eventId: string, participantId: string, confirmOverCapacity: boolean) => hostRead(client.post<unknown>(`${ops(eventId)}/admin/check-ins/${id(participantId)}/admit-on-site`, { body: { idempotencyKey: newIdempotencyKey(), ...(confirmOverCapacity ? { confirmOverCapacity: true } : {}) } }), hostCheckInResultSchema as ZodType<HostCheckInResult>),
    heartbeat: (eventId: string, deviceId: string) => hostRead(client.post<unknown>(`${ops(eventId)}/kiosk-heartbeat`, { body: { deviceId } }), hostKioskHeartbeatResultSchema as ZodType<HostKioskHeartbeatResult>),
    invite: (code: string) => hostRead(client.get<unknown>(`/api/host/cohost-invites/${id(code)}`), hostCohostInvitePreviewSchema as ZodType<HostCohostInvitePreview>),
    acceptInvite: (code: string) => hostRead(client.post<unknown>(`/api/host/cohost-invites/${id(code)}/accept`, { body: {} }), hostCohostAcceptResultSchema as ZodType<HostCohostAcceptResult>),
    checkInEvents: () => hostRead(client.get<unknown>("/api/host/check-in-events"), hostCheckInEventsResponseSchema as ZodType<HostCheckInEventsResponse>),
    organizer: (slug: string) => hostRead(client.get<unknown>(`/api/organizers/by-slug/${id(slug)}`), organizerPublicResponseSchema as ZodType<OrganizerPublicResponse>),
    follow: (organizerKey: string, following: boolean) => hostRead(following ? client.post<unknown>(`/api/organizers/${id(organizerKey)}/follow`, { body: {} }) : client.delete<unknown>(`/api/organizers/${id(organizerKey)}/follow`), organizerFollowResultSchema as ZodType<OrganizerFollowResult>),
  };
}
export type HostApi = ReturnType<typeof createHostApi>;

export function useHostApi(): HostApi {
  const client = useOrbitApiClient();
  return useMemo(() => createHostApi(client), [client]);
}
