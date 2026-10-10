import { z } from "zod";
import type { EventRecommendationDismissInput, EventRecommendationDismissResult } from "../contract/event-recommendation-feedback";

// R08 contract 9 (owner 甲 / R27). Responses tolerant, request bodies strict (see home-layout.ts).
const reason = z.enum(["schedule", "distance", "content", "known"]);
export const eventRecommendationDismissInputObject = z.object({ reason, idempotencyKey: z.string().min(1).max(200) }).strict();
export const eventRecommendationDismissInputSchema = eventRecommendationDismissInputObject as z.ZodType<EventRecommendationDismissInput>;
export const eventRecommendationDismissResultObject = z.object({ eventId: z.string().min(1), reason, dismissedAt: z.string().datetime({ offset: true }) });
export const eventRecommendationDismissResultSchema = eventRecommendationDismissResultObject as z.ZodType<EventRecommendationDismissResult>;
