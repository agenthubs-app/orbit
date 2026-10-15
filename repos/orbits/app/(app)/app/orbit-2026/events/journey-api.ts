"use client";

// R27 イベント参加者の動線：探す / 検索 / 詳細 / 会う準備 / 会場 / 会後 / 興味なし / 主催フォロー の呼び出し。
// 読み取りは契約 schema で寛容に解析し、失敗は理由で返す（throw しない）。
import type { ZodType } from "zod";

import { eventAfterConfirmResultSchema, eventAfterResponseSchema } from "../../../../../shared/api-schema/event-after";
import { eventDiscoverResponseSchema } from "../../../../../shared/api-schema/event-discover";
import { eventOverviewResponseSchema } from "../../../../../shared/api-schema/event-overview";
import { eventPrepResponseSchema } from "../../../../../shared/api-schema/event-prep";
import { eventRecommendationDismissResultSchema } from "../../../../../shared/api-schema/event-recommendation-feedback";
import { eventSearchResponseSchema } from "../../../../../shared/api-schema/event-search";
import { eventVenueResponseSchema } from "../../../../../shared/api-schema/event-venue";
import { organizerFollowResultSchema } from "../../../../../shared/api-schema/organizer-follow";
import type { EventAfterConfirmInput, EventAfterConfirmResult, EventAfterResponse } from "../../../../../shared/contract/event-after";
import type { EventDiscoverQuery, EventDiscoverResponse } from "../../../../../shared/contract/event-discover";
import type { EventOverviewResponse } from "../../../../../shared/contract/event-overview";
import type { EventPrepChecklistItem, EventPrepResponse } from "../../../../../shared/contract/event-prep";
import type { EventRecommendationDismissReason, EventRecommendationDismissResult } from "../../../../../shared/contract/event-recommendation-feedback";
import type { EventSearchResponse } from "../../../../../shared/contract/event-search";
import type { EventVenueResponse } from "../../../../../shared/contract/event-venue";
import type { OrganizerFollowResult } from "../../../../../shared/contract/organizer-follow";
import { eventsCall as call, newIdempotencyKey } from "./events-api";

const id = (value: string) => encodeURIComponent(value);

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
  overview: (eventId: string) => call(`/api/events/${id(eventId)}/overview`, undefined, eventOverviewResponseSchema as ZodType<EventOverviewResponse>),
  prep: (eventId: string) => call(`/api/events/${id(eventId)}/prep`, undefined, eventPrepResponseSchema as ZodType<EventPrepResponse>),
  checklist: (eventId: string, items: readonly EventPrepChecklistItem[]) => call(`/api/events/${id(eventId)}/prep/checklist`, { body: JSON.stringify({ items }), method: "PATCH" }, eventPrepResponseSchema as ZodType<EventPrepResponse>),
  venue: (eventId: string) => call(`/api/events/${id(eventId)}/venue`, undefined, eventVenueResponseSchema as ZodType<EventVenueResponse>),
  after: (eventId: string) => call(`/api/events/${id(eventId)}/after`, undefined, eventAfterResponseSchema as ZodType<EventAfterResponse>),
  confirmAfter: (eventId: string, items: EventAfterConfirmInput["items"]) => call(`/api/events/${id(eventId)}/after/confirm`, { body: JSON.stringify({ idempotencyKey: newIdempotencyKey(), items }), method: "POST" }, eventAfterConfirmResultSchema as ZodType<EventAfterConfirmResult>),
  dismiss: (eventId: string, reason: EventRecommendationDismissReason) => call(`/api/recommendations/events/${id(eventId)}/dismiss`, { body: JSON.stringify({ idempotencyKey: newIdempotencyKey(), reason }), method: "POST" }, eventRecommendationDismissResultSchema as ZodType<EventRecommendationDismissResult>),
  follow: (organizerId: string, following: boolean) => call(`/api/organizers/${id(organizerId)}/follow`, { method: following ? "POST" : "DELETE" }, organizerFollowResultSchema as ZodType<OrganizerFollowResult>),
};
