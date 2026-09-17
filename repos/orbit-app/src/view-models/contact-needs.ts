import type {
  ContactNeedMatchContract,
  ContactNeedScoreComponentContract,
  ContactNeedSummaryContract,
  ContactNeedsMatchesPayloadContract,
  ContactNeedsStateCode,
} from "../api/contract/contact-needs";

export interface ContactNeedMatchView {
  contactId: string;
  displayName: string;
  role: string;
  organization: string;
  location: string;
  score: number | null;
  status: ContactNeedMatchContract["status"];
  missingFields: readonly string[];
  matchedCriteria: readonly { id: string; label: string }[];
  unmatchedCriteria: readonly { id: string; label: string }[];
  evidence: readonly { id: string; label: string; excerpt: string; field?: string | null; strength?: "direct" | "weak" | "none" | undefined }[];
  components?: readonly ContactNeedScoreComponentContract[];
  summary?: ContactNeedSummaryContract | null;
}

export interface ContactNeedsView {
  state: ContactNeedsStateCode;
  goal: string;
  goalVersion: string | null;
  dataVersion: string;
  scoringVersion: string;
  criteria: readonly { id: string; label: string }[];
  scored: readonly ContactNeedMatchView[];
  insufficient: readonly ContactNeedMatchView[];
}

type ContactNeedMatchViewInput = Omit<ContactNeedMatchContract, "primaryIndustryId" | "secondaryIndustryId"> & {
  primaryIndustryId?: string | undefined;
  secondaryIndustryId?: string | undefined;
};

type ContactNeedsViewInput = Omit<ContactNeedsMatchesPayloadContract, "matches"> & {
  matches: readonly ContactNeedMatchViewInput[];
};

function matchToView(item: ContactNeedMatchViewInput, evidenceRanking: boolean): ContactNeedMatchView {
  return {
    contactId: item.contactId,
    displayName: item.displayName,
    role: item.role,
    organization: item.organization,
    location: item.location,
    score: item.score,
    status: item.status,
    missingFields: item.missingFields,
    components: evidenceRanking ? item.components ?? [] : [],
    summary: evidenceRanking ? item.summary ?? null : null,
    matchedCriteria: item.criteria
      .filter((criterion) => criterion.matched)
      .map((criterion) => ({ id: criterion.id, label: criterion.label })),
    unmatchedCriteria: item.criteria
      .filter((criterion) => !criterion.matched)
      .map((criterion) => ({ id: criterion.id, label: criterion.label })),
    evidence: item.criteria
      .filter((criterion) => criterion.matched && criterion.evidenceExcerpt)
      .map((criterion) => ({ id: criterion.id, label: criterion.label, excerpt: criterion.evidenceExcerpt ?? "",
        ...(evidenceRanking ? { field: criterion.evidenceField, strength: criterion.strength } : {}),
      })),
  };
}

export function contactNeedsToView(payload: ContactNeedsViewInput): ContactNeedsView {
  const items = payload.matches.map(item => matchToView(item, payload.scoringVersion === "needs-evidence-v2"));
  return {
    state: payload.state,
    goal: payload.goal,
    goalVersion: payload.goalVersion,
    dataVersion: payload.dataVersion,
    scoringVersion: payload.scoringVersion,
    criteria: payload.criteria.map((criterion) => ({ id: criterion.id, label: criterion.label })),
    scored: items.filter((item) => item.score !== null),
    insufficient: items.filter((item) => item.score === null),
  };
}
