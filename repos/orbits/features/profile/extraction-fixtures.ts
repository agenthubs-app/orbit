/**
 * 个人资料文档抽取 fixture。
 *
 * 这里模拟简历和名片抽取产生的 profile draft、provenance 与 empty/pending/failure 状态。
 * mock extraction service 依赖这些数据展示“待确认资料”，不会自动保存到 profile。
 */
import type {
  ProfileDocumentExtractionDraft,
  ProfileDocumentExtractionPayload,
  ProfileDocumentExtractionProvenance,
} from "./extraction-contract";

export const PROFILE_DOCUMENT_EXTRACTION_FIXTURE_SOURCE =
  "fixture:features/profile/extraction-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-24T12:00:00.000Z";
const fixtureExtractedAt = "2026-06-24T12:05:00.000Z";

export const mockResumeExtractionProvenance: ProfileDocumentExtractionProvenance =
  {
    source: PROFILE_DOCUMENT_EXTRACTION_FIXTURE_SOURCE,
    sourceLabel: "Mock resume extraction fixture",
    evidenceIds: [
      "evidence:resume-text-profile",
      "evidence:resume-founder-context",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-profile-document-only",
    extractionMethod: "fixture",
  };

export const mockBusinessCardExtractionProvenance: ProfileDocumentExtractionProvenance =
  {
    source: PROFILE_DOCUMENT_EXTRACTION_FIXTURE_SOURCE,
    sourceLabel: "Mock business-card extraction fixture",
    evidenceIds: [
      "evidence:business-card-front",
      "evidence:business-card-contact-lines",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-profile-document-only",
    extractionMethod: "fixture",
  };

export const mockResumeExtractionDraft: ProfileDocumentExtractionDraft = {
  id: "profile-document-draft_resume_ari_lane",
  kind: "resume",
  displayName: "Ari Lane",
  headline: "Founder building a relationship operating system",
  organization: "Orbit",
  role: "Founder",
  homeMarket: "Tokyo",
  relationshipGoal:
    "Turn event context into source-backed follow-up decisions.",
  targetRelationshipTypes: ["founders", "BD partners", "event hosts"],
  preferredFollowUpWindow: "48 hours",
  preferredIntroChannels: ["warm intro", "event follow-up"],
  confidence: "high",
  extractedAt: fixtureExtractedAt,
  evidence: [
    {
      field: "displayName",
      value: "Ari Lane",
      evidenceId: "evidence:resume-text-profile",
      excerpt: "Ari Lane - Founder, Orbit",
    },
    {
      field: "relationshipGoal",
      value: "Turn event context into source-backed follow-up decisions.",
      evidenceId: "evidence:resume-founder-context",
      excerpt: "relationship context, event readiness, and follow-up decisions",
    },
  ],
  suggestedProfileFields: {
    headline: "Founder building a relationship operating system",
    homeMarket: "Tokyo",
    relationshipGoal:
      "Turn event context into source-backed follow-up decisions.",
    targetRelationshipTypes: ["founders", "BD partners", "event hosts"],
    preferredFollowUpWindow: "48 hours",
    preferredIntroChannels: ["warm intro", "event follow-up"],
  },
};

export const mockBusinessCardExtractionDraft: ProfileDocumentExtractionDraft = {
  id: "profile-document-draft_business_card_mina_sato",
  kind: "business-card",
  displayName: "Mina Sato",
  headline: "Partnerships lead for event-backed founder communities",
  organization: "Northstar Events",
  role: "Partnerships Lead",
  email: "mina.sato@example.test",
  phone: "+81-3-5555-0184",
  website: "https://northstar.example.test",
  homeMarket: "Tokyo",
  relationshipGoal:
    "Follow up after events with clear source evidence and mutual context.",
  targetRelationshipTypes: ["event hosts", "community partners"],
  preferredFollowUpWindow: "24 hours",
  preferredIntroChannels: ["event follow-up", "email"],
  confidence: "medium",
  extractedAt: fixtureExtractedAt,
  evidence: [
    {
      field: "displayName",
      value: "Mina Sato",
      evidenceId: "evidence:business-card-front",
      excerpt: "Mina Sato, Partnerships Lead",
    },
    {
      field: "email",
      value: "mina.sato@example.test",
      evidenceId: "evidence:business-card-contact-lines",
      excerpt: "mina.sato@example.test",
    },
  ],
  suggestedProfileFields: {
    homeMarket: "Tokyo",
    preferredIntroChannels: ["event follow-up", "email"],
  },
};

export const mockResumeExtractionFixture: ProfileDocumentExtractionPayload = {
  state: "success",
  kind: "resume",
  draft: mockResumeExtractionDraft,
  confidenceSummary:
    "High confidence because the mock resume fixture includes a name, role, market, and relationship goal.",
  provenance: mockResumeExtractionProvenance,
  nextAction:
    "Review the extracted profile draft before using it to personalize relationship follow-up.",
};

export const mockBusinessCardExtractionFixture: ProfileDocumentExtractionPayload =
  {
    state: "success",
    kind: "business-card",
    draft: mockBusinessCardExtractionDraft,
    confidenceSummary:
      "Medium confidence because the mock business card fixture has clear identity fields but lighter relationship context.",
    provenance: mockBusinessCardExtractionProvenance,
    nextAction:
      "Confirm the card owner and add context from the event before creating follow-up tasks.",
  };

export const mockEmptyResumeExtractionFixture: ProfileDocumentExtractionPayload =
  {
    state: "empty",
    kind: "resume",
    draft: null,
    confidenceSummary:
      "No profile draft was produced because the mock resume fixture is empty.",
    provenance: {
      ...mockResumeExtractionProvenance,
      sourceLabel: "Mock empty resume extraction rule",
      evidenceIds: ["evidence:resume-empty-upload"],
      extractionMethod: "rule-based-text-match",
    },
    nextAction:
      "Add a resume document or paste profile text before extracting onboarding fields.",
  };

export const mockPendingBusinessCardExtractionFixture: ProfileDocumentExtractionPayload =
  {
    state: "pending",
    kind: "business-card",
    draft: null,
    confidenceSummary:
      "The mock business card is queued for manual review before an onboarding draft is available.",
    provenance: {
      ...mockBusinessCardExtractionProvenance,
      sourceLabel: "Mock pending business-card review rule",
      evidenceIds: ["evidence:business-card-review-pending"],
      extractionMethod: "rule-based-text-match",
    },
    nextAction:
      "Keep the card in review until the operator confirms which lines should become profile fields.",
  };

export const mockProfileDocumentExtractionFailureProvenance: ProfileDocumentExtractionProvenance =
  {
    ...mockResumeExtractionProvenance,
    sourceLabel: "Mock profile document extraction failure rule",
    evidenceIds: ["evidence:profile-document-controlled-failure"],
    extractionMethod: "rule-based-text-match",
  };
