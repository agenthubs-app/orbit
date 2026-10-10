// R08 contract 8 — 「行く価値はある？」 event assessment. Owner: 甲 (R26). Used by: events, home.
export type EventAssessmentSourceKind = "url" | "poster" | "orbit_event";
export type EventAssessmentStatus = "reading" | "ready" | "needs_input" | "failed";
export type EventAssessmentVerdict = "recommend" | "conditional" | "skip";
/** The five fixed criteria (rubric v1). */
export type EventAssessmentCriterion = "goalFit" | "people" | "timing" | "cost" | "followUp";

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
  /** 0–20; the five add up to `total`. */
  score: number;
  reason: string;
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
