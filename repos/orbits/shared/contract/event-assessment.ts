// R08 contract 8 — 「行く価値はある？」 event assessment. Owner: 甲 (R26). Used by: events, home.
export type EventAssessmentSourceKind = "url" | "poster" | "orbit_event";
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
}

/** POST /api/events/assessments — one shape per source: a link, an uploaded poster, or an Orbit event. */
export type EventAssessmentCreateInput =
  | { sourceKind: "url"; url: string; idempotencyKey: string }
  | { sourceKind: "poster"; posterAssetId: string; idempotencyKey: string }
  | { sourceKind: "orbit_event"; eventId: string; idempotencyKey: string };

export interface EventAssessmentPatchInput {
  facts: EventAssessmentFacts;
}

/** POST /api/events/assessments/[id]/add-to-plan. */
export interface EventAssessmentAddToPlanResult {
  assessmentId: string;
  addedToPlan: true;
}
