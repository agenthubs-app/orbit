// R26 — 「参加予定」: the events I registered for, am waiting on, added to my plan, attended or cancelled.
// Owner: 甲 (R26). Used by: events (参加予定 tab), home (R10 「次のイベント」), manual add (R26-06), daily question (R26-07).

/**
 * `registered` / `pending_review` / `waitlisted` / `rejected` come from the registration; `planned` = added to a plan
 * (Orbit event or my own external assessment) without registering; `attended` = checked in (self or staff);
 * `cancelled` = I withdrew or the event was cancelled (membership `withdrawn` reads as cancelled).
 */
export type MyEventStatus = "registered" | "pending_review" | "waitlisted" | "planned" | "attended" | "rejected" | "cancelled";

export type MyEventsRange = "upcoming" | "past";

export interface MyEventItem {
  /** Orbit event id, or `assessment:<id>` for an external event I assessed and added to my plan. */
  eventId: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  venue?: string | null;
  emoji: string;
  status: MyEventStatus;
  /** 会いたい人 N名 (plan person types expected there). */
  meetCount?: number | null;
  /** Up to four initials for the avatar stack. */
  meetInitials?: readonly string[];
  assessmentId?: string | null;
  /** Score of my assessment, when there is one. */
  score?: number | null;
  href: string;
  sample?: true;
}

/** `GET /api/events/mine?range=upcoming|past&limit=` — upcoming ascending by start, past descending. */
export interface MyEventsResponse {
  range: MyEventsRange;
  items: readonly MyEventItem[];
  /** Upcoming count (the 「参加予定 N件」 badge), independent of `limit`. */
  upcomingCount: number;
  /**
   * R26 App 像素返工（只加）：the server clock the response was computed at (ISO). Clients date relative labels
   * (今夜 / 今日 / 明日, 「10月」) from it so they agree with the upcoming / past split (design fixtures pin it).
   */
  asOf?: string;
}
