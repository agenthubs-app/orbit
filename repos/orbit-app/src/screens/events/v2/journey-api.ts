// R27 イベント参加者の動線（App）：探す / 検索 / 詳細 / 参加登録 / 会う準備 / 会場 / 会後 的接口。回答经同步来的 schema 宽松读取；
// 失败变成一个小原因，由画面映射成提示。读接口带 `platform=app`（示例世界按端给各自画板的文字；live 忽略）。这里不调 AI。
import { useMemo } from "react";
import type { ZodType } from "zod";

import type { OrbitApiClient } from "../../../api/client";
import type { ApiResult } from "../../../api/types";
import type { EventAfterConfirmInput, EventAfterConfirmResult, EventAfterResponse } from "../../../api/contract/event-after";
import type { EventDiscoverQuery, EventDiscoverResponse } from "../../../api/contract/event-discover";
import type { EventJoinAnswer, EventJoinCancelResult, EventJoinProfile, EventJoinResult, EventJoinStep, EventJoinTentativeResult } from "../../../api/contract/event-join";
import type { EventOverviewResponse } from "../../../api/contract/event-overview";
import type { EventPrepChecklistItem, EventPrepResponse } from "../../../api/contract/event-prep";
import type { EventRecommendationDismissReason } from "../../../api/contract/event-recommendation-feedback";
import type { EventSearchResponse } from "../../../api/contract/event-search";
import type { EventVenueMemoResult, EventVenueResponse } from "../../../api/contract/event-venue";
import type { OrganizerFollowResult } from "../../../api/contract/organizer-follow";
import { eventAfterConfirmResultSchema, eventAfterResponseSchema } from "../../../api/schema/event-after";
import { eventDiscoverResponseSchema } from "../../../api/schema/event-discover";
import { eventJoinCancelResultSchema, eventJoinProfileSchema, eventJoinResultSchema, eventJoinStepSchema, eventJoinTentativeResultSchema } from "../../../api/schema/event-join";
import { eventOverviewResponseSchema } from "../../../api/schema/event-overview";
import { eventPrepResponseSchema } from "../../../api/schema/event-prep";
import { eventRecommendationDismissResultSchema } from "../../../api/schema/event-recommendation-feedback";
import { eventSearchResponseSchema } from "../../../api/schema/event-search";
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
  const post = <T>(path: string, body: unknown, schema: ZodType<T>) => read(client.post<unknown>(path, { body }), schema);
  return {
    discover: (query: EventDiscoverQuery) => read(client.get<unknown>(`/api/events/discover?${discoverQueryString(query)}`), eventDiscoverResponseSchema as ZodType<EventDiscoverResponse>),
    search: (q: string, limit = 5) => read(client.get<unknown>(`/api/events/search?q=${encodeURIComponent(q)}&limit=${limit}&platform=app`), eventSearchResponseSchema as ZodType<EventSearchResponse>),
    overview: (eventId: string) => read(client.get<unknown>(`/api/events/${id(eventId)}/overview?platform=app`), eventOverviewResponseSchema as ZodType<EventOverviewResponse>),
    prep: (eventId: string) => read(client.get<unknown>(`/api/events/${id(eventId)}/prep?platform=app`), eventPrepResponseSchema as ZodType<EventPrepResponse>),
    checklist: (eventId: string, items: readonly EventPrepChecklistItem[]) => read(client.patch<unknown>(`/api/events/${id(eventId)}/prep/checklist`, { body: { items } }), eventPrepResponseSchema as ZodType<EventPrepResponse>),
    venue: (eventId: string) => read(client.get<unknown>(`/api/events/${id(eventId)}/venue?platform=app`), eventVenueResponseSchema as ZodType<EventVenueResponse>),
    venueMemo: (eventId: string, attendeeId: string, text: string) => post(`/api/events/${id(eventId)}/venue/memo`, { attendeeId, text }, eventVenueMemoResultSchema as ZodType<EventVenueMemoResult>),
    after: (eventId: string) => read(client.get<unknown>(`/api/events/${id(eventId)}/after?platform=app`), eventAfterResponseSchema as ZodType<EventAfterResponse>),
    confirmAfter: (eventId: string, items: EventAfterConfirmInput["items"]) => post(`/api/events/${id(eventId)}/after/confirm`, { idempotencyKey: newIdempotencyKey(), items }, eventAfterConfirmResultSchema as ZodType<EventAfterConfirmResult>),
    dismiss: (eventId: string, reason: EventRecommendationDismissReason) => post(`/api/recommendations/events/${id(eventId)}/dismiss`, { idempotencyKey: newIdempotencyKey(), reason }, eventRecommendationDismissResultSchema as ZodType<unknown>),
    follow: (organizerId: string, following: boolean) => read(following ? client.post<unknown>(`/api/organizers/${id(organizerId)}/follow`, { body: {} }) : client.delete<unknown>(`/api/organizers/${id(organizerId)}/follow`), organizerFollowResultSchema as ZodType<OrganizerFollowResult>),
    joinNext: (eventId: string, answers: readonly EventJoinAnswer[], more = false) => post(`/api/events/${id(eventId)}/join/next`, { answers, more }, eventJoinStepSchema as ZodType<EventJoinStep>),
    joinProfile: (eventId: string, answers: readonly EventJoinAnswer[], draft: boolean) => post(`/api/events/${id(eventId)}/join/profile`, { answers, draft }, eventJoinProfileSchema as ZodType<EventJoinProfile>),
    joinSubmit: (eventId: string, answers: readonly EventJoinAnswer[], selfIntro?: string) => post(`/api/events/${id(eventId)}/join/submit`, { answers, idempotencyKey: newIdempotencyKey(), ...(selfIntro ? { selfIntro } : {}) }, eventJoinResultSchema as ZodType<EventJoinResult>),
    joinTentative: (eventId: string) => post(`/api/events/${id(eventId)}/join/tentative`, { idempotencyKey: newIdempotencyKey() }, eventJoinTentativeResultSchema as ZodType<EventJoinTentativeResult>),
    joinCancel: (eventId: string) => post(`/api/events/${id(eventId)}/join/cancel`, { idempotencyKey: newIdempotencyKey() }, eventJoinCancelResultSchema as ZodType<EventJoinCancelResult>),
  };
}
export type JourneyApi = ReturnType<typeof createJourneyApi>;

export function useJourneyApi(): JourneyApi {
  const client = useOrbitApiClient();
  return useMemo(() => createJourneyApi(client, readJourney), [client]);
}
