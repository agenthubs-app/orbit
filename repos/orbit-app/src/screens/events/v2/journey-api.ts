// R27 イベント参加者の動線（App）：探す / 検索 / 詳細 / 参加登録 / 会う準備 / 会場 / 会後 的接口。回答经同步来的 schema 宽松读取；
// 失败变成一个小原因，由画面映射成提示。读接口带 `platform=app`（示例世界按端给各自画板的文字；live 忽略）。这里不调 AI。
import { useMemo } from "react";
import type { ZodType } from "zod";

import type { OrbitApiClient } from "../../../api/client";
import type { ApiResult } from "../../../api/types";
import type { EventCodeResolveResponse } from "../../../api/contract/event-code";
import type { EventAttendeeProfile } from "../../../api/contract/event-attendee-profile";
import type { EventAfterConfirmInput, EventAfterConfirmResult, EventAfterResponse } from "../../../api/contract/event-after";
import type { EventDiscoverQuery, EventDiscoverResponse } from "../../../api/contract/event-discover";
import type { EventJoinAnswer, EventJoinCancelResult, EventJoinProfile, EventJoinProfileItemKey, EventJoinResult, EventJoinStep, EventJoinTentativeResult } from "../../../api/contract/event-join";
import type { EventOverviewResponse } from "../../../api/contract/event-overview";
import type { EventPrepChecklistItem, EventPrepResponse } from "../../../api/contract/event-prep";
import type { EventRecommendationDismissReason } from "../../../api/contract/event-recommendation-feedback";
import type { EventSearchResponse } from "../../../api/contract/event-search";
import type { EventSummaryResponse } from "../../../api/contract/event-summary";
import type { EventVenueMemoResult, EventVenueResponse } from "../../../api/contract/event-venue";
import type { OrganizerFollowResult } from "../../../api/contract/organizer-follow";
import { eventAfterConfirmResultSchema, eventAfterResponseSchema } from "../../../api/schema/event-after";
import { eventAttendeeProfileSchema } from "../../../api/schema/event-attendee-profile";
import { eventCodeResolveResponseSchema } from "../../../api/schema/event-code";
import { eventDiscoverResponseSchema } from "../../../api/schema/event-discover";
import { eventJoinCancelResultSchema, eventJoinProfileSchema, eventJoinResultSchema, eventJoinStepSchema, eventJoinTentativeResultSchema } from "../../../api/schema/event-join";
import { eventOverviewResponseSchema } from "../../../api/schema/event-overview";
import { eventPrepResponseSchema } from "../../../api/schema/event-prep";
import { eventRecommendationDismissResultSchema } from "../../../api/schema/event-recommendation-feedback";
import { eventSearchResponseSchema } from "../../../api/schema/event-search";
import { eventSummaryResponseSchema } from "../../../api/schema/event-summary";
import { eventVenueMemoResultSchema, eventVenueResponseSchema } from "../../../api/schema/event-venue";
import { organizerFollowResultSchema } from "../../../api/schema/organizer-follow";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { newIdempotencyKey, read as readJourney, type EventsResult } from "./events-api";

type Read = <T>(call: Promise<ApiResult<unknown>>, schema: ZodType<T>) => Promise<EventsResult<T>>;

export function discoverQueryString(query: EventDiscoverQuery): string {
  const parts: string[] = [];
  const add = (key: string, value: string) => parts.push(`${key}=${encodeURIComponent(value)}`);
  if (query.period) add("period", query.period);
  if (query.from) add("from", query.from);
  if (query.to) add("to", query.to);
  if (query.areas?.length) add("areas", query.areas.join(","));
  if (query.themes?.length) add("themes", query.themes.join(","));
  if (query.formats?.length) add("formats", query.formats.join(","));
  if (query.freeOnly) add("freeOnly", "1");
  if (query.planFirst === false) add("planFirst", "0");
  if (query.sort) add("sort", query.sort);
  add("platform", "app");
  return parts.join("&");
}

export function createJourneyApi(client: OrbitApiClient, read: Read) {
  const id = (value: string) => encodeURIComponent(value);
  return {
    discover: (query: EventDiscoverQuery) => read(client.get<unknown>(`/api/events/discover?${discoverQueryString(query)}`), eventDiscoverResponseSchema as ZodType<EventDiscoverResponse>),
    search: (q: string, limit = 5) => read(client.get<unknown>(`/api/events/search?q=${encodeURIComponent(q)}&limit=${limit}&platform=app`), eventSearchResponseSchema as ZodType<EventSearchResponse>),
    byCode: (code: string) => read(client.get<unknown>(`/api/events/by-code/${id(code)}`), eventCodeResolveResponseSchema as ZodType<EventCodeResolveResponse>),
    // allAttendees: the full roster for the 参加者 page (/events/[id]/people); the detail page reads the capped preview.
    overview: (eventId: string, allAttendees = false) => read(client.get<unknown>(`/api/events/${id(eventId)}/overview?platform=app${allAttendees ? "&attendees=all" : ""}`), eventOverviewResponseSchema as ZodType<EventOverviewResponse>),
    // 2026-11-23 探す 简介面板：列表行没有的几项（说明 / 名额 / 我的状态 / 参加者首字 / 见过的人 / 下一场）。
    summary: (eventId: string) => read(client.get<unknown>(`/api/events/${id(eventId)}/summary?platform=app`), eventSummaryResponseSchema as ZodType<EventSummaryResponse>),
    prep: (eventId: string) => read(client.get<unknown>(`/api/events/${id(eventId)}/prep?platform=app`), eventPrepResponseSchema as ZodType<EventPrepResponse>),
    checklist: (eventId: string, items: readonly EventPrepChecklistItem[]) => read(client.patch<unknown>(`/api/events/${id(eventId)}/prep/checklist`, { body: { items } }), eventPrepResponseSchema as ZodType<EventPrepResponse>),
    // view=record: after the event (read-only record) the server leaves out the live-only parts (seats, check-in, openers, memos,
    // whyDetail …); during the event it answers in full, so the page can always ask this way (events-web 7da63ae55).
    venue: (eventId: string) => read(client.get<unknown>(`/api/events/${id(eventId)}/venue?view=record&platform=app`), eventVenueResponseSchema as ZodType<EventVenueResponse>),
    venueMemo: (eventId: string, attendeeId: string, text: string) => read(client.post<unknown>(`/api/events/${id(eventId)}/venue/memo`, { body: { attendeeId, text } }), eventVenueMemoResultSchema as ZodType<EventVenueMemoResult>),
    // The attendee id goes in the query, not the path: imported ids carry a literal %3A, and a path segment is decoded twice on
    // the way to the route (platform + Next), so the path form 404s for them (2026-11-21, events-web).
    attendee: (eventId: string, attendeeId: string) => read(client.get<unknown>(`/api/events/${id(eventId)}/attendees/profile?attendeeId=${id(attendeeId)}&platform=app`), eventAttendeeProfileSchema as ZodType<EventAttendeeProfile>),
    after: (eventId: string) => read(client.get<unknown>(`/api/events/${id(eventId)}/after?platform=app`), eventAfterResponseSchema as ZodType<EventAfterResponse>),
    confirmAfter: (eventId: string, items: EventAfterConfirmInput["items"]) => read(client.post<unknown>(`/api/events/${id(eventId)}/after/confirm`, { body: { idempotencyKey: newIdempotencyKey(), items } }), eventAfterConfirmResultSchema as ZodType<EventAfterConfirmResult>),
    dismiss: (eventId: string, reason: EventRecommendationDismissReason) => read(client.post<unknown>(`/api/recommendations/events/${id(eventId)}/dismiss`, { body: { idempotencyKey: newIdempotencyKey(), reason } }), eventRecommendationDismissResultSchema as ZodType<unknown>),
    follow: (organizerId: string, following: boolean) => read(following ? client.post<unknown>(`/api/organizers/${id(organizerId)}/follow`, { body: {} }) : client.delete<unknown>(`/api/organizers/${id(organizerId)}/follow`), organizerFollowResultSchema as ZodType<OrganizerFollowResult>),
    joinNext: (eventId: string, answers: readonly EventJoinAnswer[], more = false, focus?: EventJoinProfileItemKey) => read(client.post<unknown>(`/api/events/${id(eventId)}/join/next`, { body: { answers, more, ...(focus ? { focus } : {}) } }), eventJoinStepSchema as ZodType<EventJoinStep>),
    joinProfile: (eventId: string, answers: readonly EventJoinAnswer[], draft: boolean) => read(client.post<unknown>(`/api/events/${id(eventId)}/join/profile`, { body: { answers, draft } }), eventJoinProfileSchema as ZodType<EventJoinProfile>),
    joinSubmit: (eventId: string, answers: readonly EventJoinAnswer[], selfIntro?: string) => read(client.post<unknown>(`/api/events/${id(eventId)}/join/submit`, { body: { answers, idempotencyKey: newIdempotencyKey(), ...(selfIntro ? { selfIntro } : {}) } }), eventJoinResultSchema as ZodType<EventJoinResult>),
    joinTentative: (eventId: string) => read(client.post<unknown>(`/api/events/${id(eventId)}/join/tentative`, { body: { idempotencyKey: newIdempotencyKey() } }), eventJoinTentativeResultSchema as ZodType<EventJoinTentativeResult>),
    joinCancel: (eventId: string) => read(client.post<unknown>(`/api/events/${id(eventId)}/join/cancel`, { body: { idempotencyKey: newIdempotencyKey() } }), eventJoinCancelResultSchema as ZodType<EventJoinCancelResult>),
  };
}
export type JourneyApi = ReturnType<typeof createJourneyApi>;

export function useJourneyApi(): JourneyApi {
  const client = useOrbitApiClient();
  return useMemo(() => createJourneyApi(client, readJourney), [client]);
}
