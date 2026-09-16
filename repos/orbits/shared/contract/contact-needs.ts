export type ContactNeedCriterionTypeCode = "location" | "industry" | "capability" | "keyword";
export type ContactNeedMatchStatusCode = "matched" | "no_match" | "insufficient_data";
export type ContactNeedsStateCode = "unconfigured" | "needs_clarification" | "ready";
export type ContactNeedDimensionCode = "scenario" | "capability" | "collaboration" | "location";

export interface ContactNeedScoreComponentContract {
  dimension: ContactNeedDimensionCode;
  baseWeight: number;
  weight: number;
  points: number;
  criterionIds: readonly string[];
}

export interface ContactNeedSummaryContract {
  code: "evidence" | "weak_ai" | "missing_data" | "no_match";
  criterionIds: readonly string[];
}

export interface ContactNeedCriterionContract {
  id: string;
  label: string;
  type: ContactNeedCriterionTypeCode;
  dimension?: ContactNeedDimensionCode | undefined;
}

export interface ContactNeedCriterionMatchContract extends ContactNeedCriterionContract {
  matched: boolean;
  evidenceField: string | null;
  evidenceExcerpt: string | null;
  strength?: "direct" | "weak" | "none" | undefined;
}

export interface ContactNeedMatchContract {
  contactId: string;
  displayName: string;
  role: string;
  organization: string;
  location: string;
  primaryIndustryId?: string;
  secondaryIndustryId?: string;
  score: number | null;
  status: ContactNeedMatchStatusCode;
  reason: string;
  criteria: readonly ContactNeedCriterionMatchContract[];
  missingFields: readonly string[];
  components?: readonly ContactNeedScoreComponentContract[] | undefined;
  summary?: ContactNeedSummaryContract | undefined;
}

export interface ContactNeedsMatchesPayloadContract {
  schemaVersion: 1;
  state: ContactNeedsStateCode;
  goal: string;
  goalVersion: string | null;
  dataVersion: string;
  scoringVersion: "needs-lexical-v1" | "needs-evidence-v2";
  generatedAt: string;
  criteria: readonly ContactNeedCriterionContract[];
  matches: readonly ContactNeedMatchContract[];
  provenance: {
    generationMethod: "rule-based-contact-needs-ranking";
    databaseQueryExecuted: boolean;
    aiProviderRequested: false;
    externalNetworkRequested: false;
    businessDataWritten: false;
  };
}
