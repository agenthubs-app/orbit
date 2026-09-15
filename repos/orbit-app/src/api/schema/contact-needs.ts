import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });
const criterionType = z.enum(["location", "industry", "capability", "keyword"]);
const criterion = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: criterionType,
});
const criterionMatch = criterion.extend({
  matched: z.boolean(),
  evidenceField: z.string().nullable(),
  evidenceExcerpt: z.string().nullable(),
});

export const contactNeedsMatchesPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  state: z.enum(["unconfigured", "needs_clarification", "ready"]),
  goal: z.string(),
  goalVersion: timestamp.nullable(),
  dataVersion: z.string().regex(/^[a-f0-9]{64}$/),
  scoringVersion: z.literal("needs-lexical-v1"),
  generatedAt: timestamp,
  criteria: z.array(criterion),
  matches: z.array(z.object({
    contactId: z.string().min(1),
    displayName: z.string(),
    role: z.string(),
    organization: z.string(),
    location: z.string(),
    primaryIndustryId: z.string().optional(),
    secondaryIndustryId: z.string().optional(),
    score: z.number().int().min(0).max(100).nullable(),
    status: z.enum(["matched", "no_match", "insufficient_data"]),
    reason: z.string(),
    criteria: z.array(criterionMatch),
    missingFields: z.array(z.string()),
  })),
  provenance: z.object({
    generationMethod: z.literal("rule-based-contact-needs-ranking"),
    databaseQueryExecuted: z.boolean(),
    aiProviderRequested: z.literal(false),
    externalNetworkRequested: z.literal(false),
    businessDataWritten: z.literal(false),
  }),
}).superRefine((value, context) => {
  if (value.state === "unconfigured" && (value.goal !== "" || value.matches.length > 0)) {
    context.addIssue({ code: "custom", message: "Unconfigured needs cannot contain a goal or matches." });
  }
  for (const match of value.matches) {
    if ((match.status === "insufficient_data") !== (match.score === null)) {
      context.addIssue({ code: "custom", message: "Only insufficient data may have a null score." });
    }
  }
});

export type ContactNeedsMatchesPayload = z.infer<typeof contactNeedsMatchesPayloadSchema>;
