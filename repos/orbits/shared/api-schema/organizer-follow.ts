import { z } from "zod";
import type { OrganizerFollowResult } from "../contract/organizer-follow";

// R27 organizer follow (DESIGN §10 A2). Response tolerant; the routes take no body.
export const organizerFollowResultObject = z.object({ organizerId: z.string().min(1), following: z.boolean(), followedAt: z.string().nullable().optional() });
export const organizerFollowResultSchema = organizerFollowResultObject as z.ZodType<OrganizerFollowResult>;
