"use client";

// R27 イベント参加者の動線：探す / 検索 / 詳細 / 会う準備 / 会場 / 会後 / 興味なし / 主催フォロー の呼び出し。
// 読み取りは契約 schema で寛容に解析し、失敗は理由で返す（throw しない）。
import type { ZodType } from "zod";

import { z } from "zod";

import { eventAfterConfirmResultSchema, eventAfterResponseSchema } from "../../../../../shared/api-schema/event-after";
import { eventAttendeeProfileSchema } from "../../../../../shared/api-schema/event-attendee-profile";
import { eventDiscoverResponseSchema } from "../../../../../shared/api-schema/event-discover";
import { eventOverviewResponseSchema } from "../../../../../shared/api-schema/event-overview";
import { eventPrepResponseSchema } from "../../../../../shared/api-schema/event-prep";
import { eventRecommendationDismissResultSchema } from "../../../../../shared/api-schema/event-recommendation-feedback";
import { eventSearchResponseSchema } from "../../../../../shared/api-schema/event-search";
import { eventSummaryResponseSchema } from "../../../../../shared/api-schema/event-summary";
import { eventVenueMemoResultSchema, eventVenueResponseSchema } from "../../../../../shared/api-schema/event-venue";
import { organizerFollowResultSchema } from "../../../../../shared/api-schema/organizer-follow";
import type { EventAfterConfirmInput, EventAfterConfirmResult, EventAfterResponse } from "../../../../../shared/contract/event-after";
import type { EventAttendeeProfile } from "../../../../../shared/contract/event-attendee-profile";
import type { EventDiscoverQuery, EventDiscoverResponse } from "../../../../../shared/contract/event-discover";
import type { EventOverviewResponse } from "../../../../../shared/contract/event-overview";
import type { EventPrepChecklistItem, EventPrepResponse } from "../../../../../shared/contract/event-prep";
import type { EventRecommendationDismissReason, EventRecommendationDismissResult } from "../../../../../shared/contract/event-recommendation-feedback";
import type { EventSearchResponse } from "../../../../../shared/contract/event-search";
import type { EventSummaryResponse } from "../../../../../shared/contract/event-summary";
import type { EventVenueResponse } from "../../../../../shared/contract/event-venue";
import type { OrganizerFollowResult } from "../../../../../shared/contract/organizer-follow";
import { eventsCall as call, newIdempotencyKey } from "./events-api";

const id = (value: string) => encodeURIComponent(value);
const anyData = z.unknown();

export function discoverQueryString(query: EventDiscoverQuery): string {
  const search = new URLSearchParams();
  if (query.period) search.set("period", query.period);
  if (query.from) search.set("from", query.from);
  if (query.to) search.set("to", query.to);
  if (query.areas?.length) search.set("areas", query.areas.join(","));
  if (query.themes?.length) search.set("themes", query.themes.join(","));
  if (query.formats?.length) search.set("formats", query.formats.join(","));
  if (query.freeOnly) search.set("freeOnly", "1");
  if (query.planFirst === false) search.set("planFirst", "0");
  if (query.sort) search.set("sort", query.sort);
  return search.toString();
}

export const journeyApi = {
  discover: (query: EventDiscoverQuery) => call(`/api/events/discover?${discoverQueryString(query)}`, undefined, eventDiscoverResponseSchema as ZodType<EventDiscoverResponse>),
  search: (q: string, limit = 5) => call(`/api/events/search?q=${encodeURIComponent(q)}&limit=${limit}`, undefined, eventSearchResponseSchema as ZodType<EventSearchResponse>),
  summary: (eventId: string) => call(`/api/events/${id(eventId)}/summary`, undefined, eventSummaryResponseSchema as ZodType<EventSummaryResponse>),
  overview: (eventId: string, allAttendees = false) => call(`/api/events/${id(eventId)}/overview${allAttendees ? "?attendees=all" : ""}`, undefined, eventOverviewResponseSchema as ZodType<EventOverviewResponse>),
  prep: (eventId: string) => call(`/api/events/${id(eventId)}/prep`, undefined, eventPrepResponseSchema as ZodType<EventPrepResponse>),
  checklist: (eventId: string, items: readonly EventPrepChecklistItem[]) => call(`/api/events/${id(eventId)}/prep/checklist`, { body: JSON.stringify({ items }), method: "PATCH" }, eventPrepResponseSchema as ZodType<EventPrepResponse>),
  // view=record：结束后的只读回看只回回看用得上的字段；活动中服务端照常给完整内容。
  venue: (eventId: string) => call(`/api/events/${id(eventId)}/venue?view=record`, undefined, eventVenueResponseSchema as ZodType<EventVenueResponse>),
  after: (eventId: string) => call(`/api/events/${id(eventId)}/after`, undefined, eventAfterResponseSchema as ZodType<EventAfterResponse>),
  confirmAfter: (eventId: string, items: EventAfterConfirmInput["items"]) => call(`/api/events/${id(eventId)}/after/confirm`, { body: JSON.stringify({ idempotencyKey: newIdempotencyKey(), items }), method: "POST" }, eventAfterConfirmResultSchema as ZodType<EventAfterConfirmResult>),
  dismiss: (eventId: string, reason: EventRecommendationDismissReason) => call(`/api/recommendations/events/${id(eventId)}/dismiss`, { body: JSON.stringify({ idempotencyKey: newIdempotencyKey(), reason }), method: "POST" }, eventRecommendationDismissResultSchema as ZodType<EventRecommendationDismissResult>),
  /** 2026-11-20 参加者の詳細（报名者之间、对方公开了参加用プロフィール才有；其余一律 404）。 */
  // participant id 走查询参数（id 里可能有 `%`，放路径会被解码两次）。
  attendee: (eventId: string, attendeeId: string) => call(`/api/events/${id(eventId)}/attendees/profile?attendeeId=${id(attendeeId)}`, undefined, eventAttendeeProfileSchema as ZodType<EventAttendeeProfile>),
  /** メモ（自分だけ）：与会場モード同一条 `/venue/memo`（空文字 = 清除）。 */
  memo: (eventId: string, attendeeId: string, text: string) => call(`/api/events/${id(eventId)}/venue/memo`, { body: JSON.stringify({ attendeeId, text }), method: "POST" }, eventVenueMemoResultSchema),
  /** 交換を申請 / 承認・無視：与会場モード同一组运营路由。 */
  requestExchange: (eventId: string, participantId: string) => call(`/api/events/${id(eventId)}/operations/contact-requests`, { body: JSON.stringify({ expectedRevision: null, targetParticipantId: participantId }), method: "POST" }, anyData),
  respondExchange: (eventId: string, requestId: string, revision: number, accept: boolean) => call(`/api/events/${id(eventId)}/operations/contact-requests/${id(requestId)}/respond`, { body: JSON.stringify({ accept, expectedRevision: revision }), method: "POST" }, anyData),
  follow: (organizerId: string, following: boolean) => call(`/api/organizers/${id(organizerId)}/follow`, { method: following ? "POST" : "DELETE" }, organizerFollowResultSchema as ZodType<OrganizerFollowResult>),
};
