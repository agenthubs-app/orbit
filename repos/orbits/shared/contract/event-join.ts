// R27 — 参加登録 (5 questions → attendee profile → submit). Owner: 甲 (R27). Used by: events (参加登録, both clients).
// A thin facade over the existing registration routes (adaptive interview, persona, registration / admission application):
// questions are the existing AI interview (≤ 5), answers carry the signed question tokens, and the server keeps per-field
// visibility (参加目的 / 会いたい人 = organizer only; name / company / intro / topics = attendees).

export type EventJoinProfileItemKey = "company" | "purpose" | "topics" | "target" | "offer";

export interface EventJoinQuestion {
  field: string;
  prompt: string;
  /** Small line under the prompt (「席決めとおすすめにだけ使います（複数可）」). */
  help?: string | null;
  options: readonly string[];
  multi: boolean;
  /** Max choices when `multi` (「2つまで」). */
  max?: number | null;
  allowCustom: boolean;
  questionToken: string;
}

export interface EventJoinAnswer {
  field: string;
  prompt: string;
  /** Multi-select answers are joined with 「 · 」. */
  answer: string;
  questionToken: string;
}

/** `POST /api/events/[id]/join/next` */
export interface EventJoinStep {
  /** 1-based index of `question`. */
  index: number;
  total: number;
  remainingMinutes: number;
  done: boolean;
  question?: EventJoinQuestion | null;
}

/** `POST /api/events/[id]/join/profile` — rules only unless `draft` (then the AI persona writes the self-introduction draft). */
export interface EventJoinProfile {
  coverage: number;
  items: readonly { key: EventJoinProfileItemKey; done: boolean }[];
  topics: readonly string[];
  selfIntro?: { text: string; source: "ai_draft" | "profile" } | null;
  /** What the draft was written from (「回答（目的・テーマ・会いたい人）とプロフィール（…）から作成。」). */
  selfIntroBasis?: string | null;
  /** Profile edits allowed until (「申込後も 10/6 まで編集できます」). */
  editableUntil?: string | null;
  /** Organizer review deadline (「審査 〜10/3」), when the event is screened. */
  reviewUntil?: string | null;
  review: boolean;
}

/** `POST /api/events/[id]/join/submit` */
export interface EventJoinResult {
  eventId: string;
  status: "registered" | "pending_review";
  submittedAt: string;
  reviewUntil?: string | null;
  startsAt: string;
  endsAt?: string | null;
  /** 「カレンダーに仮で入れますか？」 suggestion; written only after the user confirms (`join/tentative`). */
  tentative?: { startsAt: string; endsAt: string; title: string } | null;
}

/** `POST /api/events/[id]/join/tentative` — the tentative calendar entry; renamed / removed when the review result arrives. */
export interface EventJoinTentativeResult {
  eventId: string;
  scheduleItemId: string;
  title: string;
}
