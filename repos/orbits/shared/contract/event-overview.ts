// R27 — イベント詳細 read model: event facts, my rule-based assessment strip, organizer stats, public attendees.
// Owner: 甲 (R27). Used by: events (詳細, both clients; signed-out visitors get the public part only, R26-08).
import type { EventAssessmentVerdict } from "./event-assessment";

/** My relation to the event (same vocabulary as 参加予定, plus `none`). */
export type EventOverviewRegistrationStatus = "none" | "registered" | "pending_review" | "waitlisted" | "rejected" | "cancelled" | "attended";

export interface EventOverviewAttendee {
  attendeeId: string;
  name: string;
  org?: string | null;
  role?: string | null;
  /** One line from their public registration profile. */
  note?: string | null;
  initial: string;
  /** Matches a person type in my current plan. */
  planFit: boolean;
  /** Already in my contacts. */
  known: boolean;
  /** Marked 会いたい by me (from my plan match). */
  wanted: boolean;
}

export interface EventOverviewResponse {
  eventId: string;
  title: string;
  emoji: string;
  startsAt: string;
  endsAt?: string | null;
  venue?: string | null;
  priceYen?: number | null;
  capacity?: number | null;
  remaining?: number | null;
  review: boolean;
  /** Registration closes within 72 hours. */
  deadlineSoon: boolean;
  description?: string | null;
  agenda: readonly { at: string; title: string; detail?: string | null }[];
  organizer: {
    organizerId?: string | null;
    name: string;
    emoji?: string | null;
    /** First edition date (「2023年から」). */
    since?: string | null;
    monthly?: boolean;
    editions?: number | null;
    averageAttendance?: number | null;
    /** Largest person-type share among past attendees (「CFO 比率 41%」). */
    typeShare?: { label: string; percent: number } | null;
    myAttendance?: number | null;
    following?: boolean;
  };
  /** Rule-based (no AI) assessment for my current plan; absent when signed out or without a plan. */
  assessment?: {
    score: number;
    verdict: EventAssessmentVerdict;
    display: { goalFit: number; people: number; timeCost: number };
    basis: string;
    assessmentId?: string | null;
  } | null;
  attendeeCounts: { all: number; planFit: number; known: number };
  /** Only people who made their registration profile public; capped (`attendeeCounts.all` is the real total). */
  attendees: readonly EventOverviewAttendee[];
  knownAttendees: readonly { name: string; initial: string; speaker?: boolean }[];
  registration: { status: EventOverviewRegistrationStatus; href: string };
  signedOut?: boolean;
  sample?: true;
}
