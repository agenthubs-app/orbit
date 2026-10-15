// R27 — 「会う準備」: countdown, place, people I want to meet (why / how to start / history), prep checklist.
// Owner: 甲 (R27). Used by: events (会う準備, both clients). Rules only, no AI: openers come from the opening-line rule.
// The business-card count I still have is entered and kept on the device only; it is never part of a request.

/** Relation to me: a contact I already work with, someone I met before, or nobody yet. */
export type EventPrepRelation = "working" | "met" | "none";

export interface EventPrepPerson {
  attendeeId: string;
  contactId?: string | null;
  name: string;
  org?: string | null;
  role?: string | null;
  relation: EventPrepRelation;
  /** なぜ — why this person matters for my plan. */
  why: string;
  /** 話しかけ方 — rule-based opening line. */
  opener: string;
  /** これまで — my history with them (「今日 打ち合わせ · 9/24 メール」), or shared ground (「同じテーブル B-4（R2）」). */
  history: string;
  initial: string;
}

/** Fixed five-item template; `materials` carries the user's own text. */
export type EventPrepChecklistKey = "cards" | "intro" | "materials" | "qr" | "return";

export interface EventPrepChecklistItem {
  key: EventPrepChecklistKey;
  /** User-entered text (only for `materials`). */
  label?: string | null;
  done: boolean;
}

export interface EventPrepAgendaItem {
  at: string;
  title: string;
  detail?: string | null;
}

export interface EventPrepResponse {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  venue?: string | null;
  /** Access line under the venue (「渋谷駅 C2 出口から徒歩2分」). */
  access?: string | null;
  mapUrl?: string | null;
  /** Server clock at read time (the countdown starts from this, never from the client clock during render). */
  now: string;
  /** People I want to meet, easiest to meet first (known > mutual contact > same table). */
  people: readonly EventPrepPerson[];
  /** Spare cards on top of one per person (「会いたい人 4名 + 予備で 15枚」 → spare 11). */
  cardsRecommended: number;
  checklist: readonly EventPrepChecklistItem[];
  /** 30-second self-introduction: my registration draft, or my profile intro; null → 「自己紹介を書く」. */
  selfIntro?: { text: string; source: "registration_draft" | "profile" } | null;
  /** 「明日のフォロー時間」 suggestion; written to the calendar only after I confirm. */
  followupSuggestion?: { startsAt: string; endsAt: string; title: string } | null;
  agenda?: readonly EventPrepAgendaItem[];
  /** 💡 seat hint from the organizer's published seating (「席は R2 で B-4（井上さん・森さんと同席）」). */
  seatHint?: string | null;
  sample?: true;
}

/** `PATCH /api/events/[id]/prep/checklist` */
export interface EventPrepChecklistPatch {
  items: readonly EventPrepChecklistItem[];
}
