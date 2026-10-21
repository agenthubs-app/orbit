import { z } from "zod";

import { knownValues, readableItems, tolerantEnum } from "./tolerant";

/**
 * R11b: GET /api/network/analysis, GET /api/network/analysis/people and GET /api/network/snapshot as the clients read
 * them (contract rule 10: unknown keys dropped; an opportunity / insight / block of an unknown kind is skipped, never
 * guessed; an unknown snapshot state reads as `unavailable`, an unknown job as `none`).
 */
const count = z.number().int().min(0);
const id = z.string().min(1).max(512);
const iso = z.string().datetime({ offset: true });

export const networkAnalysisBucketObject = z.object({ id: z.string().min(1).max(120), count });
export const networkAnalysisDistributionObject = z.object({
  dimension: z.enum(["industry", "seniority", "region", "met"]),
  total: count,
  buckets: readableItems(networkAnalysisBucketObject),
});
export const networkAnalysisGapObject = z.object({
  planId: id, needId: id, title: z.string().max(200), targetCount: count, linkedCount: count,
});
export const networkAnalysisPersonRefObject = z.object({ id, name: z.string().max(200) });
export const networkAnalysisOpportunityObject = z.object({
  kind: z.enum(["reconnect", "stalled"]),
  count,
  preview: readableItems(networkAnalysisPersonRefObject),
  averageDays: count.optional(),
});
const percent = z.number().min(0).max(100);
export const networkAnalysisInsightObject = z.object({
  kind: z.enum(["met_path", "growth"]),
  industryId: z.string().max(120).optional(),
  sample: count.optional(),
  eventShare: percent.optional(),
  eventRate: percent.optional(),
  referralRate: percent.optional(),
  months: readableItems(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), added: count })).optional(),
  added: count.optional(),
  planNeedTitle: z.string().max(200).optional(),
});
export const networkAnalysisNeedObject = z.object({
  planId: id, needId: id, title: z.string().max(200), primaryIndustryId: z.string().max(120).nullable(),
  targetCount: count, linkedCount: count, skipped: z.boolean(),
});
export const networkAnalysisLockObject = z.union([
  z.object({ state: z.literal("locked"), total: count, required: count, missing: count }),
  z.object({ state: z.literal("open"), total: count, required: count, reference: z.boolean() }),
]);
export const networkAnalysisViewObject = z.object({
  asOf: iso,
  lock: networkAnalysisLockObject,
  structure: z.object({
    industries: networkAnalysisDistributionObject,
    seniority: networkAnalysisDistributionObject,
    regions: networkAnalysisDistributionObject,
    mets: networkAnalysisDistributionObject,
    gaps: readableItems(networkAnalysisGapObject).nullable(),
    hasPlan: z.boolean(),
  }).optional(),
  opportunities: readableItems(networkAnalysisOpportunityObject).optional(),
  insights: readableItems(networkAnalysisInsightObject).optional(),
  needs: readableItems(networkAnalysisNeedObject).nullable().optional(),
});
export const networkAnalysisViewSchema = networkAnalysisViewObject;

export const NETWORK_ANALYSIS_PEOPLE_SORTS = ["goal", "recent", "name"] as const;
export const networkAnalysisPersonRowObject = z.object({
  id,
  name: z.string().max(200),
  organization: z.string().max(200),
  role: z.string().max(200),
  stage: tolerantEnum(["active", "nurture"], "active"),
  needsFollowUp: z.boolean(),
  goalRelated: z.boolean(),
  nextActionPreview: z.string().max(400),
  primaryIndustryId: z.string().max(120).optional(),
  lastInteractionAt: iso.optional(),
});
export const networkAnalysisPeopleObject = z.object({
  asOf: iso,
  dimension: z.enum(["industry", "seniority", "region", "met", "opportunity"]),
  bucketId: z.string().min(1).max(120),
  total: count,
  stages: z.object({ active: count, nurture: count }),
  sort: tolerantEnum(NETWORK_ANALYSIS_PEOPLE_SORTS, "name"),
  sorts: knownValues(NETWORK_ANALYSIS_PEOPLE_SORTS),
  items: readableItems(networkAnalysisPersonRowObject),
  nextCursor: z.string().max(4096).nullable(),
});
export const networkAnalysisPeopleSchema = networkAnalysisPeopleObject;

/** The query of GET /api/network/analysis/people (strict: a request). */
export const networkAnalysisPeopleQuerySchema = z.object({
  dimension: z.enum(["industry", "seniority", "region", "met", "opportunity"]),
  bucket: z.string().min(1).max(120),
  sort: z.enum(NETWORK_ANALYSIS_PEOPLE_SORTS).optional(),
  cursor: z.string().max(4096).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict();

/** GET /api/network/snapshot (W0048a NetworkSnapshotView) as the App reads it. */
export const networkSnapshotBlockObject = z.object({
  key: z.string().min(1).max(64),
  kind: z.enum(["diagnosis", "insight", "gap", "plan"]),
  text: z.string().max(1000),
  evidence: z.object({ contactIds: z.array(id).max(50), recordIds: z.array(z.string().max(512)).max(50) }),
  needId: z.string().max(512).optional(),
});
const quotaPool = z.object({ usedToday: count, limit: count });
export const networkSnapshotViewObject = z.object({
  state: tolerantEnum(["ready", "none", "insufficient", "unavailable"], "unavailable"),
  generatedAt: iso.nullable(),
  contactCount: count,
  blocks: readableItems(networkSnapshotBlockObject),
  freshness: z.object({
    stale: z.boolean(),
    newContactCount: count,
    job: tolerantEnum(["none", "queued", "running", "deferred"], "none"),
    retryOn: z.string().max(40).optional(),
    recovering: z.boolean().optional(),
  }),
  quota: z.object({ manual: quotaPool, user: quotaPool, background: quotaPool.extend({ retryOn: z.string().max(40).optional() }) }),
});
export const networkSnapshotViewSchema = networkSnapshotViewObject;
