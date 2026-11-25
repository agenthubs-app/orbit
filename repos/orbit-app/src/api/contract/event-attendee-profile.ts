// 2026-11-20 — 参加者の詳細 (attendee profile), read-only. Owner: events (Web session). Used by: events (both clients):
// the detail page roster, every name on 会場 / 会場の記録, and 会後「今日会った人」.
// `GET /api/events/[id]/attendees/[attendeeId]`. Visible only to registered attendees of the event and only for a public
// registration profile; anything else is a plain 404 (never says whether the person exists). No email / phone here:
// contact details live on the contact page after an exchange.
// Exchange requests keep using `POST /api/events/[id]/operations/contact-requests` (+ `/respond`), with the
// `participantId` / `requestId` / `requestRevision` below (same meaning as `EventVenuePerson`). The server accepts new
// requests from the event's start until 30 days after its end (`canRequestExchange`), and rejects them outside that window.

import type { EventVenueExchangeState } from "./event-venue";

export interface EventAttendeeProfile {
  attendeeId: string;
  /** Participant id for the operations routes. */
  participantId: string;
  name: string;
  initial: string;
  org?: string | null;
  role?: string | null;
  /** 参加用プロフィールの自己紹介 (public part). */
  intro?: string | null;
  /** Public registration Q&A (question text + answer), at most 8. */
  answers: readonly { q: string; a: string }[];
  /** What I share with them at this event. */
  together: {
    /** Rounds where we sat at the same table. */
    sharedRounds: readonly { round: number; table: string }[];
    /** They were on my recommendation list. */
    recommended: boolean;
    /** Short recommendation reason and its 「?」 detail. */
    why?: string | null;
    whyDetail?: string | null;
  };
  exchange: EventVenueExchangeState;
  /** When `exchange` is `incoming` / `requested`: the request id and revision the operations routes need. */
  requestId?: string | null;
  requestRevision?: number | null;
  /** My contact id when they are (or became) my contact → 「人脈で開く」. */
  contactId?: string | null;
  /** My private memo about them (same memo as 会場モード). */
  memo?: string | null;
  /** A new exchange request is allowed now: from the event's start until 30 days after its end (and none exists yet). */
  canRequestExchange: boolean;
  /** Why a new request is not allowed now because of time: before the start / more than 30 days after the end. Null otherwise (allowed, a request already exists, or it is me). */
  exchangeClosedReason?: "not_started" | "ended" | null;
  /** Last day a request is allowed after the event (ISO), for 「終了後 30日まで申請できます（M/D まで）」; null before the event. */
  exchangeUntil?: string | null;
}
