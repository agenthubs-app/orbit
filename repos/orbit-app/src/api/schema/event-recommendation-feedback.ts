import { z } from "zod";
import type { EventRecommendationDismissInput, EventRecommendationDismissResult } from "../contract/event-recommendation-feedback";

// R08 contract 9 (owner 甲 / R27).
const reason = z.enum(["schedule", "distance", "content", "known"]);
export const eventRecommendationDismissInputSchema = z.object({ reason, idempotencyKey: z.string().min(1).max(200) }).strict() as z.ZodType<EventRecommendationDismissInput>;
export const eventRecommendationDismissResultSchema = z.object({ eventId: z.string().min(1), reason, dismissedAt: z.string().datetime({ offset: true }) }).strict() as z.ZodType<EventRecommendationDismissResult>;
