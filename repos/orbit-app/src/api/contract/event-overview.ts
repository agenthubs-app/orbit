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
  /** Attendees not public yet: the assessment's 「会える人」 shows 「—」 and its `basis` explains why. */
  assessmentPeopleUnknown?: boolean;
  /** Attendees not public yet: people I can likely meet, estimated from the speakers. */
  speakerCandidates?: readonly { emoji: string; name: string; label: string; note: string }[];
  /** One line about a known person (「伊藤さんがキーノートに登壇 · 9/24 にメールでやりとり」). */
  knownNote?: { text: string; detail?: string | null } | null;
  /** When attendees become public (「申込者の公開は 9/25 から」); only while none are public yet. */
  attendeesPublicAt?: string | null;
  /** When registration closes (the invite-code card shows 「10/3 まで有効」). */
  registrationClosesAt?: string | null;
  attendeeCounts: { all: number; planFit: number; known: number };
  /** Names are hidden from me (not registered yet, or signed out): show the counts and 「参加登録すると参加者が見られます」 (R27 roster policy A). */
  rosterLocked?: boolean;
  /** Only people who made their registration profile public; capped (`attendeeCounts.all` is the real total). */
  attendees: readonly EventOverviewAttendee[];
  knownAttendees: readonly { name: string; initial: string; speaker?: boolean }[];
  registration: { status: EventOverviewRegistrationStatus; href: string };
  signedOut?: boolean;
  sample?: true;
}
