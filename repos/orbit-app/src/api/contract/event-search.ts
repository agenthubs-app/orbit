// R27 — event search: events, organizers / communities, and people from my network who speak at or attend events.
// Owner: 甲 (R27). Used by: events (探す search), R30 global search (「イベント」 group uses the same service).

export interface EventSearchEventHit {
  eventId: string;
  title: string;
  startsAt: string;
  venue?: string | null;
  emoji: string;
  priceYen?: number | null;
  /** My relation to the event, when there is one. */
  myStatus?: "registered" | "pending_review" | "attended" | "planned" | null;
  badges?: readonly ("members_only" | "early_access")[];
  score?: number | null;
  href: string;
}

export interface EventSearchOrganizerHit {
  organizerId: string;
  name: string;
  emoji: string;
  eventCount: number;
  following: boolean;
}

/** A contact of mine who speaks at or registered for upcoming events (never someone outside my network). */
export interface EventSearchPersonHit {
  contactId: string;
  name: string;
  org?: string | null;
  role?: string | null;
  eventCount: number;
  initial: string;
}

/** `GET /api/events/search?q=&limit=` — each group capped at `limit` (default 5). */
export interface EventSearchResponse {
  query: string;
  events: readonly EventSearchEventHit[];
  eventsTotal: number;
  organizers: readonly EventSearchOrganizerHit[];
  people: readonly EventSearchPersonHit[];
  sample?: true;
}
