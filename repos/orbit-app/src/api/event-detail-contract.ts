import { z } from "zod";

// Consumer validation only; generated shared contracts stay untouched.
export const publicEventDetailSchema = z.object({
  event: z.object({
    id: z.string().trim().min(1), title: z.string().trim().min(1),
    startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
    status: z.enum(["draft", "confirmed", "imported", "pending_import", "cancelled"]),
    venue: z.string().optional(), location: z.string().optional(), locationLabel: z.string().optional(),
    organizer: z.string().optional(), host: z.string().optional(), address: z.string().optional(),
    description: z.string().optional(), recommendedPreparation: z.string().optional(),
    relationshipContext: z.string().optional(), nextAction: z.string().optional(),
    feeLabel: z.string().optional(), theme: z.string().optional(), industry: z.string().optional(),
    coverPath: z.string().optional(), coverUrl: z.string().optional(), imageUrl: z.string().optional(),
    tags: z.array(z.string()).optional(), participantCount: z.number().int().nonnegative().optional(),
    stats: z.object({
      count: z.number().int().nonnegative().optional(), youRsvped: z.boolean().optional(),
      attendees: z.array(z.object({ name: z.string().trim().min(1), initial: z.string().optional(), role: z.string().optional() }).passthrough()).optional()
    }).passthrough().optional(),
    agenda: z.array(z.object({ time: z.string(), label: z.string().optional(), title: z.string().optional(), description: z.string().optional() }).passthrough().refine(item => Boolean(item.label?.trim() || item.title?.trim()))).optional(),
    about: z.array(z.object({ label: z.string(), body: z.string(), icon: z.string().optional() }).passthrough()).optional(),
    evidence: z.array(z.object({ excerpt: z.string() }).passthrough()).optional(),
    sourceMetadata: z.object({ label: z.string().optional(), coverPath: z.string().optional(), coverUrl: z.string().optional() }).passthrough().optional()
  }).passthrough().refine(event => Date.parse(event.startsAt) < Date.parse(event.endsAt))
}).passthrough();

export type PublicEventDetail = z.infer<typeof publicEventDetailSchema>;

const detailText = z.string().trim().min(1);
const personalState = z.enum(["success", "pending", "empty"]);
const personalEvent = z.object({ id: detailText }).passthrough();
const unsent = { notificationDelivered: z.literal(false), emailProviderRequested: z.literal(false) };
const goalRecord = z.object({
  goalId: detailText, eventId: detailText, intent: detailText, selectedSuggestionId: detailText.nullable()
}).passthrough();
const readiness = z.object({
  state: personalState, event: personalEvent, goal: goalRecord.nullable(),
  suggestedGoals: z.array(z.object({ goalId: detailText, label: detailText, intent: detailText, rationale: z.string() }).passthrough()),
  readinessChecklist: z.array(z.object({ itemId: detailText, label: detailText, status: z.enum(["ready", "pending", "blocked"]), owner: z.enum(["operator", "orbit"]), rationale: z.string() }).passthrough()),
  preparationState: z.object({ readinessScore: z.number().min(0).max(100), nextPreparationStep: z.string() }).passthrough(),
  nextAction: z.string()
}).passthrough();

export function eventDetailReadinessSchema(eventId: string) {
  return readiness.refine(data => data.event.id === eventId && (!data.goal || data.goal.eventId === eventId)
    && new Set(data.suggestedGoals.map(goal => goal.goalId)).size === data.suggestedGoals.length
    && new Set(data.readinessChecklist.map(item => item.itemId)).size === data.readinessChecklist.length);
}

export function eventDetailGoalReceiptSchema(eventId: string, request: { goalText: string; selectedSuggestionId?: string }) {
  return readiness.extend({ state: z.literal("success"), goal: goalRecord, acceptedGoalText: detailText })
    .refine(data => data.event.id === eventId && data.goal.eventId === eventId
      && data.acceptedGoalText === request.goalText && data.goal.intent === request.goalText
      && data.goal.selectedSuggestionId === (request.selectedSuggestionId ?? null));
}

const detailOpeningLine = z.object({
  lineId: detailText, eventId: detailText, attendeeId: detailText,
  style: z.enum(["warm_context", "context_question", "post_event_follow_up"]), text: detailText,
  ...unsent
}).passthrough();
const detailRecommendation = z.object({
  recommendationId: detailText, eventId: detailText,
  attendee: z.object({ attendeeId: detailText, displayName: detailText, role: z.string(), organization: z.string() }).passthrough(),
  rank: z.number().int().positive(), score: z.number().min(0).max(100), reasons: z.array(z.string()),
  openingLine: detailOpeningLine, recommendedAction: z.string()
}).passthrough().refine(data => data.openingLine.eventId === data.eventId && data.openingLine.attendeeId === data.attendee.attendeeId);

export function eventDetailRecommendationsSchema(eventId: string) {
  return z.object({ state: personalState, event: personalEvent, recommendations: z.array(detailRecommendation), nextAction: z.string() }).passthrough()
    .refine(data => data.event.id === eventId && data.recommendations.every(person => person.eventId === eventId)
      && new Set(data.recommendations.map(person => person.recommendationId)).size === data.recommendations.length
      && new Set(data.recommendations.map(person => person.attendee.attendeeId)).size === data.recommendations.length);
}

export function eventDetailOpeningLineReceiptSchema(eventId: string, person: { id: string; attendeeId: string }) {
  return z.object({ state: z.literal("success"), event: personalEvent, recommendation: detailRecommendation,
    openingLine: detailOpeningLine, provenance: z.object(unsent).passthrough() }).passthrough()
    .refine(data => data.event.id === eventId && data.recommendation.eventId === eventId
      && data.recommendation.recommendationId === person.id && data.recommendation.attendee.attendeeId === person.attendeeId
      && data.openingLine.eventId === eventId && data.openingLine.attendeeId === person.attendeeId
      && data.openingLine.style === "context_question");
}

const detailFollowUp = z.object({
  messageDraft: z.string(), urgency: z.enum(["today", "this_week"]), externalMessageSendRequested: z.literal(false), ...unsent
}).passthrough();
const detailReviewContact = z.object({
  contactDraftId: detailText, displayName: detailText, organization: z.string(), role: z.string(),
  summary: z.object({ headline: z.string(), whyNow: z.string() }).passthrough(),
  tags: z.array(z.object({ label: detailText }).passthrough()), followUpSuggestion: detailFollowUp
}).passthrough();

export function eventDetailReviewSchema(eventId: string) {
  return z.object({ state: personalState, event: personalEvent, reviewId: detailText,
    contacts: z.array(detailReviewContact), nextAction: z.string() }).passthrough()
    .refine(data => data.event.id === eventId && new Set(data.contacts.map(contact => contact.contactDraftId)).size === data.contacts.length);
}

export function eventDetailReviewReceiptSchema(eventId: string, reviewId: string, contactDraftIds: string[]) {
  return z.object({
    state: z.literal("confirmed"), event: personalEvent, eventId: detailText, reviewId: detailText,
    confirmedContacts: z.array(z.object({ contactId: detailText, contactDraftId: detailText, displayName: detailText,
      notificationDelivered: z.literal(false), externalMessageSendRequested: z.literal(false), followUpSuggestion: detailFollowUp }).passthrough()).min(1),
    nextAction: z.string(), provenance: z.object(unsent).passthrough()
  }).passthrough().refine(data => data.event.id === eventId && data.eventId === eventId && data.reviewId === reviewId
    && data.confirmedContacts.length === contactDraftIds.length
    && data.confirmedContacts.every(contact => contactDraftIds.includes(contact.contactDraftId))
    && new Set(data.confirmedContacts.map(contact => contact.contactDraftId)).size === contactDraftIds.length
    && new Set(data.confirmedContacts.map(contact => contact.contactId)).size === contactDraftIds.length);
}

export type DetailReadiness = z.infer<ReturnType<typeof eventDetailReadinessSchema>>;
export type DetailRecommendations = z.infer<ReturnType<typeof eventDetailRecommendationsSchema>>;
export type DetailReview = z.infer<ReturnType<typeof eventDetailReviewSchema>>;
