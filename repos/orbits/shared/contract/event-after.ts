// R27 — 会後のふりかえり: who I met, the summary, per-person next steps, and confirming them.
// Owner: 甲 (R27). Used by: events (会後, both clients).
// Thanks letters are drafts only: nothing here sends anything (「送信はしません · 送信はあなたが行います」).

export interface EventAfterHighlight {
  emoji: string;
  title: string;
  detail: string;
  /** What it is based on (「交換記録 21:04 · あなたのメモ『11月にオフィスへ』」). */
  evidence: string;
}

export interface EventAfterNextStep {
  attendeeId: string;
  contactId?: string | null;
  name: string;
  org?: string | null;
  initial: string;
  /** YYYY-MM-DD. */
  followupDate: string;
  /** Plan person type to link (only keys from my plan); absent → 「—」. */
  planType?: { key: string; label: string } | null;
  thanksDraft?: { subject: string; body: string } | null;
  /** This person already counts for `planType` (same person × same type scores once): the row adds 0. */
  alreadyCounted?: boolean;
}

/** One plan person-type slot, so the client previews the score with the shared `nextAward` for the checked rows. */
export interface EventAfterScoreSlot {
  key: string;
  allocation: number;
  targetCount: number;
  earnedCount: number;
  earnedPoints: number;
  skipped: boolean;
}

export interface EventAfterResponse {
  eventId: string;
  title: string;
  /** Event date (YYYY-MM-DD, Tokyo). */
  date: string;
  met: { count: number; initials: readonly string[]; exchanged: number; wantedMet: number; wantedTotal: number; meetings: number };
  /** AI draft (E3) — three items; absent when the draft is not available (then `summary` may carry the older single paragraph). */
  highlights?: readonly EventAfterHighlight[];
  summary?: string | null;
  /** The texts above and the next steps come from the AI draft (labels 「AI 下書き」 / 「AI の提案」 only when true). */
  aiDraft: boolean;
  nextSteps: readonly EventAfterNextStep[];
  /** Plan score now and after confirming every proposed step (the client recomputes for the checked rows). */
  score?: { goal: string; before: number; after: number; detail: string } | null;
  scoreSlots?: readonly EventAfterScoreSlot[];
  /** Already confirmed for this event (the 「確定」 button turns into a done state). */
  confirmedAt?: string | null;
  sample?: true;
}

/** `POST /api/events/[id]/after/confirm` — only the listed (checked) rows take effect. */
export interface EventAfterConfirmInput {
  items: readonly { attendeeId: string; followupDate: string; planTypeKey?: string | null }[];
  idempotencyKey: string;
}

export interface EventAfterConfirmResult {
  eventId: string;
  confirmed: number;
  tasksCreated: number;
  contactsLinked: number;
  scoreAfter?: number | null;
  confirmedAt: string;
}
