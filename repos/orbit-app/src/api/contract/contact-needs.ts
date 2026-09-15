export type ContactNeedCriterionTypeCode = "location" | "industry" | "capability" | "keyword";
export type ContactNeedMatchStatusCode = "matched" | "no_match" | "insufficient_data";
export type ContactNeedsStateCode = "unconfigured" | "needs_clarification" | "ready";

export interface ContactNeedCriterionContract {
  id: string;
  label: string;
  type: ContactNeedCriterionTypeCode;
}

export interface ContactNeedCriterionMatchContract extends ContactNeedCriterionContract {
  matched: boolean;
  evidenceField: string | null;
  evidenceExcerpt: string | null;
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
}

export interface ContactNeedsMatchesPayloadContract {
  schemaVersion: 1;
  state: ContactNeedsStateCode;
  goal: string;
  goalVersion: string | null;
  dataVersion: string;
  scoringVersion: "needs-lexical-v1";
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
