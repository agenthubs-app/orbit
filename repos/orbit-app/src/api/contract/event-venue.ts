// R27 — 会場モード read model (attendee side, read-only). Owner: 甲 (R27). Used by: events (会場, both clients).
// Composes the organizer's published event-ops results (groups / seats / recommendations), my contacts and the agenda.
// Writes stay on the existing `/api/events/[id]/operations/*` routes. Not registered → `state: "not_registered"` and
// nothing else (the page never calls the operations routes, so there is no 403).

export type EventVenueState = "not_registered" | "before_check_in" | "checked_in" | "ended";
/** Contact-exchange state between me and the attendee. */
export type EventVenueExchangeState = "none" | "requested" | "incoming" | "exchanged";
/** Relation map buckets (§9 #17: only my own contacts are read). */
export type EventVenueRelation = "exchanged" | "known" | "wanted" | "other";

export interface EventVenuePerson {
  attendeeId: string;
  /** Participant id for the operations routes. */
  participantId: string;
  name: string;
  org?: string | null;
  role?: string | null;
  initial: string;
  table?: string | null;
  exchange: EventVenueExchangeState;
  /** When `exchange` is `incoming` / `requested`: the request id and revision the operations routes need. */
  requestId?: string | null;
  requestRevision?: number | null;
  requestedAt?: string | null;
  wanted: boolean;
  relation: EventVenueRelation;
  /** Short reason (「シリーズA・B2B SaaS に注力。今年 5社に出資」) and the 「?」 detail. */
  why?: string | null;
  whyDetail?: string | null;
  /** Contact id when they are (or became) my contact. */
  contactId?: string | null;
  isOrbitUser?: boolean;
  /** My private one-line memo about them (「メモ（自分だけ）」). */
  memo?: string | null;
}

/** `POST /api/events/[id]/venue/memo` — save (or clear with an empty text) my private memo about an attendee. */
export interface EventVenueMemoResult {
  attendeeId: string;
  memo: string | null;
}

export interface EventVenueResponse {
  state: EventVenueState;
  eventId: string;
  title: string;
  /** Server clock at read time; all time-dependent state below is already computed from it. */
  now: string;
  startsAt: string;
  endsAt?: string | null;
  checkIn?: { displayName: string; receptionNumber?: string | null; qrPayload?: string | null; available: boolean } | null;
  round?: { index: number; total: number; title: string; startsAt: string; endsAt: string; theme?: string | null; remainingMinutes: number } | null;
  seats?: readonly { round: number; table: string }[];
  mySeat?: { table: string; why?: string | null; whyDetail?: string | null; tablemates: readonly { attendeeId: string; name: string; initial: string; org?: string | null; role?: string | null }[] } | null;
  nextRound?: { at: string; round: number; table: string; names: string } | null;
  openers: readonly string[];
  stats: { exchanged: number; wantedMet: number; wantedTotal: number; incoming: number };
  recommendations: readonly EventVenuePerson[];
  /** 次に話すと良い順. */
  nextOrder: readonly EventVenuePerson[];
  attendees: readonly EventVenuePerson[];
  attendeeTotal: number;
  groups?: { round: number; others: readonly { table: string; theme?: string | null; count: number; initials: readonly string[] }[]; myTheme?: string | null } | null;
  mutualHint?: { name: string; via: string } | null;
  agenda: readonly { at: string; title: string; detail?: string | null; now?: boolean; myTable?: string | null }[];
  agendaTip?: { text: string; detail?: string | null } | null;
  /** 面談を提案: three default 30-minute slots (draft only, D46). */
  meetingSlots?: readonly string[];
  sample?: true;
}
