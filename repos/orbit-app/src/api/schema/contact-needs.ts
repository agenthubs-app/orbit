import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });
const criterionType = z.enum(["location", "industry", "capability", "keyword"]);
const dimension = z.enum(["scenario", "capability", "collaboration", "location"]);
const criterion = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: criterionType,
  dimension: dimension.optional(),
});
const criterionMatch = criterion.extend({
  matched: z.boolean(),
  evidenceField: z.string().nullable(),
  evidenceExcerpt: z.string().nullable(),
  strength: z.enum(["direct", "weak", "none"]).optional(),
});

export const contactNeedsMatchesPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  state: z.enum(["unconfigured", "needs_clarification", "ready"]),
  goal: z.string(),
  goalVersion: timestamp.nullable(),
  dataVersion: z.string().regex(/^[a-f0-9]{64}$/),
  scoringVersion: z.enum(["needs-lexical-v1", "needs-evidence-v2"]),
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
    components: z.array(z.object({
      dimension,
      baseWeight: z.number().positive(),
      weight: z.number().positive().max(100),
      points: z.number().min(0).max(100),
      criterionIds: z.array(z.string().min(1)),
    })).optional(),
    summary: z.object({
      code: z.enum(["evidence", "weak_ai", "missing_data", "no_match"]),
      criterionIds: z.array(z.string().min(1)).max(2),
    }).optional(),
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
    if (value.scoringVersion === "needs-evidence-v2") {
      const components = match.components;
      if (!components || !match.summary || match.criteria.some(item => !item.dimension || !item.strength)) {
        context.addIssue({ code: "custom", message: "Evidence ranking requires components, summary and evidence strengths." });
        continue;
      }
      const expectedWeights = { scenario: 35, capability: 35, collaboration: 20, location: 10 };
      const baseTotal = components.reduce((sum, item) => sum + item.baseWeight, 0);
      if (new Set(components.map(item => item.dimension)).size !== components.length
        || components.some(item => item.baseWeight !== expectedWeights[item.dimension]
          || Math.abs(item.weight - 100 * item.baseWeight / baseTotal) > 1e-8
          || item.points > item.weight
          || item.criterionIds.some(id => !match.criteria.some(criterion => criterion.id === id && criterion.dimension === item.dimension)))
        || (components.length > 0 && Math.abs(components.reduce((sum, item) => sum + item.weight, 0) - 100) > 1e-8)
        || (match.score !== null && match.score !== Math.round(components.reduce((sum, item) => sum + item.points, 0)))) {
        context.addIssue({ code: "custom", message: "Score must equal the normalized, evidenced component total." });
      }
      if (match.criteria.some(item => item.matched !== (item.strength !== "none")
        || (item.matched && (!item.evidenceField || !item.evidenceExcerpt))
        || (item.evidenceField === "tags" && item.strength !== "weak"))
        || match.summary.criterionIds.some(id => !match.criteria.some(item => item.id === id && item.matched && item.strength === "direct"))
        || (match.summary.code === "weak_ai" && match.score !== null && match.score > 15)) {
        context.addIssue({ code: "custom", message: "Summary and matched criteria require original evidence; tags are weak only." });
      }
    }
  }
});

export type ContactNeedsMatchesPayload = z.infer<typeof contactNeedsMatchesPayloadSchema>;
