// R08 contract 8 — 「行く価値はある？」 event assessment. Owner: 甲 (R26). Used by: events, home.
/** R26 added `text` (pasted page text) and `manual` (the three facts typed in). */
export type EventAssessmentSourceKind = "url" | "poster" | "orbit_event" | "text" | "manual";
export type EventAssessmentStatus = "reading" | "ready" | "needs_input" | "failed";
export type EventAssessmentVerdict = "recommend" | "conditional" | "skip";
/**
 * The five fixed criteria (rubric v2, R24 — the design's 45 / 15 / 20 / 10 / 10): ① who you can meet,
 * ② how sure the estimate is, ③ time and cost, ④ existing connections, ⑤ format. Scored by rule
 * (`shared/compute/event-score.ts`); AI only fills facts.
 */
export type EventAssessmentCriterion = "fit" | "confidence" | "timeCost" | "connections" | "format";

export interface EventAssessmentFacts {
  title?: string;
  startsAt?: string;
  venue?: string;
  organizer?: string;
  price?: string;
  url?: string;
  /** R26 (events DESIGN §4.1): read facts only — scores are always computed by rule. */
  endsAt?: string;
  /** Prefecture / city, e.g. 「東京都千代田区」 (for the travel-time estimate). */
  area?: string;
  speakers?: readonly EventAssessmentSpeaker[];
  exhibitorCount?: number;
  expectedAttendees?: number;
  format?: EventAssessmentFormat;
  agenda?: readonly EventAssessmentAgendaItem[];
}

export interface EventAssessmentSpeaker {
  name: string;
  org?: string;
  role?: string;
}

export interface EventAssessmentFormat {
  networking: boolean;
  tableTalk?: boolean;
  matching?: boolean;
}

export interface EventAssessmentAgendaItem {
  /** "10:00" or an ISO time. */
  at: string;
  title: string;
  /** Minutes, when the page says. */
  minutes?: number;
}

/** R26: where each fact came from — read from the page, guessed, typed by the user, or derived by rule. */
export type EventAssessmentFactBasis = "read" | "guessed" | "user" | "rule";

/** R26: why an assessment could not be finished (`status` failed / needs_input). */
export type EventAssessmentFailureReason =
  | "login_required"
  | "not_event_page"
  | "unreadable"
  | "fetch_failed"
  | "too_large"
  | "blocked_host"
  | "ai_unavailable"
  | "quota_exceeded"
  | "timeout";

/** R26: a 0–100 display value; `min` / `max` when a fact is missing and the score is a range. */
export interface EventAssessmentDisplayValue {
  value: number;
  min?: number;
  max?: number;
  /** One line under the bar (「シリーズA調達に直結…」). */
  reason?: string;
}

/** R26: the five criteria folded into the three dimensions the result shows (DESIGN §3.5). */
export interface EventAssessmentDisplay {
  goalFit: EventAssessmentDisplayValue;
  people: EventAssessmentDisplayValue;
  timeCost: EventAssessmentDisplayValue;
}

/** R26 会えそうな人: a plan person type (or 「既存のつながり」) and why we think they will be there. */
export interface EventAssessmentMeetCandidate {
  emoji: string;
  label: string;
  count?: number;
  basis: string;
  /** Where the estimate comes from (speakers / exhibitors / registrants / people you know); lets each client word it like its board. */
  source?: "speakers" | "exhibitors" | "registrants" | "known";
  /** Known people's short names (「高橋」「加藤」) for `source: "known"`. */
  names?: readonly string[];
}

export interface EventAssessmentCaution {
  kind: "fee" | "off_target_session" | "calendar" | "travel" | "other";
  text: string;
  detail?: string;
}

/** R26: an event found on a page that is not itself an event page (≤5). */
export interface EventAssessmentPageCandidate {
  title: string;
  url?: string;
  startsAt?: string;
  /** 「渋谷」「オンライン」. */
  venue?: string;
  /** Where on the page it was found (「記事末尾のリンク」). */
  note?: string;
}

export interface EventAssessmentScoreItem {
  criterion: EventAssessmentCriterion;
  /** 0–`max`; the five add up to `total`. */
  score: number;
  /** 45 / 15 / 20 / 10 / 10. */
  max: number;
  reason: string;
  /** The facts this score is based on (one line each). */
  facts: readonly string[];
  /** The facts were missing and the score is an estimate (shown as 「推定」). */
  estimated: boolean;
}

export interface EventAssessmentContract {
  id: string;
  sourceKind: EventAssessmentSourceKind;
  status: EventAssessmentStatus;
  facts: EventAssessmentFacts;
  scoreBreakdown: readonly EventAssessmentScoreItem[];
  /** 0–100. */
  total: number;
  verdict: EventAssessmentVerdict;
  missingFields: readonly (keyof EventAssessmentFacts)[];
  rubricVersion: string;
  createdAt: string;
  sample?: true;
  /** R26 additions (all optional; events DESIGN §4.1). */
  factBasis?: Partial<Record<keyof EventAssessmentFacts, EventAssessmentFactBasis>>;
  display?: EventAssessmentDisplay;
  scoreRange?: { min: number; max: number };
  meetCandidates?: readonly EventAssessmentMeetCandidate[];
  knownAttendees?: readonly { contactId: string; name: string }[];
  cautions?: readonly EventAssessmentCaution[];
  /** 「午前だけの参加なら時間対効果は 64 → 78」. */
  partialAttendanceHint?: { window: string; timeCostAfter: number };
  failureReason?: EventAssessmentFailureReason;
  pageCandidates?: readonly EventAssessmentPageCandidate[];
  userFilledFields?: readonly (keyof EventAssessmentFacts)[];
  userDecision?: "added" | "dismissed";
  /** Set for an Orbit event (`sourceKind` orbit_event). */
  eventId?: string;
  /** When the facts were last read / recomputed (「10月7日時点」). */
  assessedAt?: string;
  /** The goal this was judged against (「シリーズA 資金調達 で判定」). */
  goalLabel?: string;
  /** The page host or source shown in the header (「saas-summit.jp/2026」). */
  sourceLabel?: string;
  /** Seconds the read took (「URL から判定 · 12秒」). */
  readSeconds?: number;
  /** 「根拠：…」 one line per item (plan, page facts, your network, calendar). */
  basisLines?: readonly string[];
  /** The plan item this was added to, once added. */
  planItemId?: string;
  /** Recompute will run when the attendee list is published (Orbit events only). */
  recomputeOnAttendeeList?: boolean;
  /** Poster / screenshot uploads shown on the result (`GET /api/events/assessments/posters/[id]`). */
  posterAssetIds?: readonly string[];
  /** 「ブレを検出」: the poster read found blur. */
  readIssue?: "blurry";
}

/** POST /api/events/assessments — one shape per source: a link, an uploaded poster, or an Orbit event. */
export type EventAssessmentCreateInput =
  | { sourceKind: "url"; url: string; idempotencyKey: string }
  /** R26: `posterAssetIds` (≤3 screenshots, read in one request) may replace `posterAssetId`. */
  | { sourceKind: "poster"; posterAssetId: string; posterAssetIds?: readonly string[]; idempotencyKey: string }
  | { sourceKind: "orbit_event"; eventId: string; idempotencyKey: string }
  | { sourceKind: "text"; text: string; url?: string; idempotencyKey: string }
  | { sourceKind: "manual"; facts: EventAssessmentFacts; idempotencyKey: string };

export interface EventAssessmentPatchInput {
  facts: EventAssessmentFacts;
  /** R26: fields the user marked 「不明」 in 判定に必要な3項目 (the score then shows a range). */
  unknownFields?: readonly ("startsAt" | "venue" | "price")[];
}

/** POST /api/events/assessments/[id]/add-to-plan. */
export interface EventAssessmentAddToPlanResult {
  assessmentId: string;
  addedToPlan: true;
  /** R26: the plan and item it was added to (null when there is no current plan). */
  planId?: string | null;
  planItemId?: string | null;
}

/** R26: POST /api/events/assessments/[id]/dismiss (見送る — only marks this assessment). */
export interface EventAssessmentDismissResult {
  assessmentId: string;
  userDecision: "dismissed";
}

/**
 * R26: GET /api/events/assessments/availability — whether the URL / poster entries are offered and how many
 * AI reads are left this month. (The list itself stays `GET /api/events/assessments` → array, mine, highest score first.)
 */
export interface EventAssessmentAvailability {
  /** This month's AI reads left (Tokyo month; null when unlimited). */
  monthlyLeft?: number | null;
  monthlyLimit?: number | null;
  /** Today's reads left (the separate daily cap). */
  dailyLeft?: number | null;
  /** URL / poster entries are available (paid AI on and verified); otherwise only manual and Orbit events. */
  aiReadAvailable: boolean;
}
