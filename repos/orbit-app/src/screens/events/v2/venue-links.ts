// R27 会場モード的链接（App）：`/events/[id]/live?tab=now|recs|people|groups|agenda&view=map&person=<attendeeId>`。
// 旧地址（/events/[id]/attendees、/participants/[id]、/party*）都跳到这里。
type Param = string | string[] | undefined;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);

export type VenueTabLink = "now" | "recs" | "people" | "groups" | "agenda";

export function venueHref(eventId: string, options: { tab?: VenueTabLink; view?: "map"; person?: string } = {}): string {
  const params = new URLSearchParams();
  if (options.tab && options.tab !== "now") params.set("tab", options.tab);
  if (options.view) params.set("view", options.view);
  if (options.person) params.set("person", options.person);
  const query = params.toString();
  return `/events/${encodeURIComponent(eventId)}/live${query ? `?${query}` : ""}`;
}

/** 旧的 `/party*` 链接：带活动的跳到会場（graph → 関係マップ），没有活动的回活动一览。 */
export function partyRedirectHref(params: { eventId?: Param; code?: Param }, variant: "overview" | "checkin" | "graph"): string {
  const eventId = first(params.eventId)?.trim() || first(params.code)?.trim();
  if (!eventId) return "/events";
  return venueHref(eventId, variant === "graph" ? { tab: "people", view: "map" } : {});
}
