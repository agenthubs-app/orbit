/**
 * R27 活动搜索的纯逻辑（规则；R30 全局搜索「イベント」组直接调 `searchEvents`）。Owner: 甲 (R27).
 * - events：公开目录里将来的活动（标题 / 主办 / 场所 / 说明命中）+ 我自己的活动（参加予定）。别人的外部评估永远不在这里（R26 S1）。
 * - organizers：命中的主办方，带开催回数与我是否关注。
 * - people：只在我的联系人里找（名字 / 公司 / 职位命中），且这个人是将来活动的登壇者或报名者——不读别人的人脉。
 */
import type { EventSearchEventHit, EventSearchOrganizerHit, EventSearchPersonHit, EventSearchResponse } from "../../../shared/contract/event-search";

export interface SearchEvent {
  eventId: string;
  title: string;
  startsAt: string;
  venue?: string | null;
  description?: string | null;
  emoji: string;
  priceYen?: number | null;
  organizerId?: string | null;
  organizerName?: string | null;
  organizerEmoji?: string | null;
  badges?: readonly ("members_only" | "early_access")[];
  score?: number | null;
  /** People who speak at / registered for the event (names as shown publicly). */
  people?: readonly string[];
}

export interface SearchInput {
  query: string;
  limit: number;
  now: Date;
  events: readonly SearchEvent[];
  /** Organizer edition counts (all events, past included). */
  organizerEditions: Readonly<Record<string, number>>;
  following: ReadonlySet<string>;
  myStatus: Readonly<Record<string, EventSearchEventHit["myStatus"]>>;
  myContacts: readonly { id: string; name: string; org?: string | null; role?: string | null }[];
  hrefFor?: (eventId: string) => string;
}

const normalize = (value: string | null | undefined) => (value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");

export function searchEvents(input: SearchInput): EventSearchResponse {
  const q = normalize(input.query);
  const href = input.hrefFor ?? ((eventId: string) => `/events/${eventId}`);
  const upcoming = input.events.filter((event) => Date.parse(event.startsAt) >= input.now.getTime() - 6 * 3_600_000);
  const hit = (event: SearchEvent) => [event.title, event.organizerName, event.venue, event.description].some((text) => normalize(text).includes(q));
  const eventsAll = upcoming.filter(hit).sort((a, b) => Number(Boolean(input.myStatus[b.eventId])) - Number(Boolean(input.myStatus[a.eventId])) || Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const events: EventSearchEventHit[] = eventsAll.slice(0, input.limit).map((event) => ({
    emoji: event.emoji,
    eventId: event.eventId,
    href: href(event.eventId),
    startsAt: event.startsAt,
    title: event.title,
    venue: event.venue ?? null,
    ...(event.priceYen !== undefined ? { priceYen: event.priceYen } : {}),
    ...(input.myStatus[event.eventId] ? { myStatus: input.myStatus[event.eventId] } : {}),
    ...(event.badges?.length ? { badges: event.badges } : {}),
    ...(typeof event.score === "number" ? { score: event.score } : {}),
  }));

  const organizerSeen = new Map<string, EventSearchOrganizerHit>();
  for (const event of input.events) {
    if (!event.organizerId || !event.organizerName || organizerSeen.has(event.organizerId)) continue;
    if (!normalize(event.organizerName).includes(q)) continue;
    organizerSeen.set(event.organizerId, { emoji: event.organizerEmoji ?? event.emoji, eventCount: input.organizerEditions[event.organizerId] ?? 0, following: input.following.has(event.organizerId), name: event.organizerName, organizerId: event.organizerId });
  }
  const organizers = [...organizerSeen.values()].sort((a, b) => Number(b.following) - Number(a.following) || b.eventCount - a.eventCount).slice(0, input.limit);

  const people: EventSearchPersonHit[] = [];
  for (const contact of input.myContacts) {
    if (![contact.name, contact.org, contact.role].some((text) => normalize(text).includes(q))) continue;
    const name = normalize(contact.name);
    const eventCount = upcoming.filter((event) => (event.people ?? []).some((person) => normalize(person) === name)).length;
    if (eventCount === 0) continue;
    people.push({ contactId: contact.id, eventCount, initial: contact.name.trim().charAt(0), name: contact.name, org: contact.org ?? null, role: contact.role ?? null });
  }
  people.sort((a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name, "ja"));
  return { events, eventsTotal: eventsAll.length, organizers, people: people.slice(0, input.limit), query: input.query };
}
