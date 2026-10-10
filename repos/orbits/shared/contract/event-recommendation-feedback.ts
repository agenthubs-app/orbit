// R08 contract 9 — why a recommended event is not for me. Owner: 甲 (R27). Used by: events, secretary.
export type EventRecommendationDismissReason = "schedule" | "distance" | "content" | "known";

export interface EventRecommendationDismissInput {
  reason: EventRecommendationDismissReason;
  idempotencyKey: string;
}

export interface EventRecommendationDismissResult {
  eventId: string;
  reason: EventRecommendationDismissReason;
  dismissedAt: string;
}
