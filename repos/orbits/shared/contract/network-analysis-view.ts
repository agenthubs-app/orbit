/**
 * Owner: 乙 (R11b 人脈分析). Used by: Web 人脈分析 (/app/contacts/dashboard, /app/contacts/analysis/[dimension]/[bucketId]),
 * App 人脈分析 (/contacts/dashboard, /contacts/analysis/[dimension]/[bucketId]) via GET /api/network/analysis and
 * GET /api/network/analysis/people.
 *
 * Every number here is counted at read time from the R11a contact rows (same de-duplication / deletion rules as the
 * 人脈 list) and the active plan needs, at one `asOf`. Nothing comes from AI text: the snapshot narrative is a separate
 * read (GET /api/network/snapshot). Below NETWORK_ANALYSIS_UNLOCK_CONTACTS people the view is `locked` and carries no
 * analysis at all (no rows read, no snapshot read or queued).
 */

/** The drill-down dimensions (the `[dimension]` path segment). `opportunity` buckets are NetworkAnalysisOpportunityKind. */
export type NetworkAnalysisDimension = "industry" | "seniority" | "region" | "met" | "opportunity";

/**
 * One bucket of a distribution. `id`: industry → primary industry id, `rest` (the rest, unset included);
 * seniority → `decision` | `manager` | `staff` | `unset`; region → canonical city, `rest` (the rest, unset included);
 * met → `event` | `referral` | `visit` | `other`. Buckets of one dimension add up to `total`.
 */
export interface NetworkAnalysisBucket {
  id: string;
  count: number;
}

export interface NetworkAnalysisDistribution {
  dimension: Exclude<NetworkAnalysisDimension, "opportunity">;
  total: number;
  buckets: NetworkAnalysisBucket[];
}

/** A plan need the network does not cover yet (plan v2 person type: target vs linked people). */
export interface NetworkAnalysisGap {
  planId: string;
  needId: string;
  title: string;
  targetCount: number;
  linkedCount: number;
}

export type NetworkAnalysisOpportunityKind = "reconnect" | "stalled";

/** A person shown as an avatar / name (the first ones of a list). */
export interface NetworkAnalysisPersonRef {
  id: string;
  name: string;
}

export interface NetworkAnalysisOpportunity {
  kind: NetworkAnalysisOpportunityKind;
  /** De-duplicated people in this card — the same count its drill-down list shows. */
  count: number;
  preview: NetworkAnalysisPersonRef[];
  /** stalled: the average days since the last touch of these people. */
  averageDays?: number;
}

export type NetworkAnalysisInsightKind = "met_path" | "growth";

export interface NetworkAnalysisInsight {
  kind: NetworkAnalysisInsightKind;
  /**
   * met_path: in `industryId` (the biggest industry, `sample` people), the share met at events (`eventShare`, %) and
   * how many of those met through events / referrals reached 関係構築 (`eventRate` / `referralRate`, %; each group ≥ 5).
   * growth: people added per Tokyo month, oldest first (`months`, 6 entries `YYYY-MM`), and the industry that grew most
   * this month (`industryId`, `added`); `planNeedTitle` when an active plan need asks for that industry.
   */
  industryId?: string;
  sample?: number;
  eventShare?: number;
  eventRate?: number;
  referralRate?: number;
  months?: { month: string; added: number }[];
  added?: number;
  planNeedTitle?: string;
}

export type NetworkAnalysisLock =
  | { state: "locked"; total: number; required: number; missing: number }
  | { state: "open"; total: number; required: number; reference: boolean };

export interface NetworkAnalysisViewDTO {
  asOf: string;
  lock: NetworkAnalysisLock;
  /** Absent while locked. */
  structure?: {
    industries: NetworkAnalysisDistribution;
    seniority: NetworkAnalysisDistribution;
    regions: NetworkAnalysisDistribution;
    mets: NetworkAnalysisDistribution;
    /** null = the plan could not be read (the gap card says so); [] = no plan or nothing missing. */
    gaps: NetworkAnalysisGap[] | null;
    hasPlan: boolean;
  };
  /** Only the kinds with people in them. */
  opportunities?: NetworkAnalysisOpportunity[];
  /** Only the trends with enough samples (none below NETWORK_ANALYSIS_STABLE_CONTACTS people). */
  insights?: NetworkAnalysisInsight[];
  /**
   * LF3 (additive): the plan needs this view was built with, so a device can recompute the view from its own
   * contacts (shared/compute/network-analysis-model.ts). Absent while locked; null = the plan could not be read.
   */
  needs?: NetworkAnalysisNeedDTO[] | null;
}

/** One active plan need as the analysis reads it (planGaps / insights input). */
export interface NetworkAnalysisNeedDTO {
  planId: string;
  needId: string;
  title: string;
  primaryIndustryId: string | null;
  targetCount: number;
  linkedCount: number;
  skipped: boolean;
}

/** Drill-down list order: plan-related first / latest touch / name. Only the ones the data supports are offered. */
export type NetworkAnalysisPeopleSort = "goal" | "recent" | "name";

export interface NetworkAnalysisPersonRow {
  id: string;
  name: string;
  organization: string;
  role: string;
  /** R11a 段階 (§B-2): 知り合い = active, 関係構築 = nurture. */
  stage: "active" | "nurture";
  needsFollowUp: boolean;
  goalRelated: boolean;
  nextActionPreview: string;
  primaryIndustryId?: string;
  lastInteractionAt?: string;
}

export interface NetworkAnalysisPeopleDTO {
  asOf: string;
  dimension: NetworkAnalysisDimension;
  bucketId: string;
  /** Everyone in the bucket (the list is paged; this is not). */
  total: number;
  /** 段階の内訳 over the whole bucket. */
  stages: { active: number; nurture: number };
  sort: NetworkAnalysisPeopleSort;
  sorts: NetworkAnalysisPeopleSort[];
  items: NetworkAnalysisPersonRow[];
  nextCursor: string | null;
}
