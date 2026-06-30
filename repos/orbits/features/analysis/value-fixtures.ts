import type {
  RelationshipValueAssessment,
  RelationshipValuePayload,
  RelationshipValueProvenance,
  RelationshipValueSourceEvidence,
} from "./value-contract";

export const RELATIONSHIP_VALUE_FIXTURE_SOURCE =
  "fixture:features/analysis/value-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T19:30:00.000Z";
const fixtureScoredAt = "2026-06-25T19:35:00.000Z";

export const mockRelationshipValueEvidence = [
  {
    evidenceId: "evidence:connection-climate-dinner",
    label: "Climate founders dinner",
    sourceType: "event_import",
    contribution: "met_at_event",
    capturedAt: "2026-06-25T19:05:00.000Z",
  },
  {
    evidenceId: "evidence:connection-storage-pilot",
    label: "Storage pilot note",
    sourceType: "manual",
    contribution: "business_context",
    capturedAt: "2026-06-25T19:05:00.000Z",
  },
  {
    evidenceId: "evidence:connection-email-context",
    label: "Partner review email context",
    sourceType: "email_signal",
    contribution: "decision_window",
    capturedAt: "2026-06-25T19:05:00.000Z",
  },
  {
    evidenceId: "evidence:connection-follow-up",
    label: "Follow-up path identified",
    sourceType: "manual",
    contribution: "follow_up_urgency",
    capturedAt: "2026-06-25T19:05:00.000Z",
  },
] as const satisfies readonly RelationshipValueSourceEvidence[];

export const mockRelationshipValueProvenance: RelationshipValueProvenance = {
  source: RELATIONSHIP_VALUE_FIXTURE_SOURCE,
  sourceLabel: "Mock relationship value scoring fixture",
  evidenceIds: mockRelationshipValueEvidence.map((evidence) => evidence.evidenceId),
  collectedAt: fixtureCollectedAt,
  privacy: "demo-relationship-value-only",
  generationMethod: "fixture",
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyRelationshipValueProvenance: RelationshipValueProvenance =
  {
    ...mockRelationshipValueProvenance,
    sourceLabel: "Mock empty relationship value rule",
    evidenceIds: ["evidence:relationship-value-empty"],
    generationMethod: "rule-based",
  };

export const mockPendingRelationshipValueProvenance: RelationshipValueProvenance =
  {
    ...mockRelationshipValueProvenance,
    sourceLabel: "Mock pending relationship value rule",
    evidenceIds: ["evidence:relationship-value-pending"],
    generationMethod: "rule-based",
  };

export const mockRelationshipValueFailureProvenance: RelationshipValueProvenance =
  {
    ...mockRelationshipValueProvenance,
    sourceLabel: "Mock relationship value controlled failure rule",
    evidenceIds: ["evidence:relationship-value-controlled-failure"],
    generationMethod: "rule-based",
  };

export const mockRelationshipValueAssessment: RelationshipValueAssessment = {
  id: "relationship-value:demo-connection-1",
  connectionId: "demo-connection-1",
  contactId: "contact:kenji-watanabe",
  contactDisplayName: "Kenji Watanabe",
  relationshipValueType: "strategic_intro",
  priorityScore: {
    value: 93,
    band: "critical",
    calculation:
      "deterministic fixture rule: base 74 + strategic context 11 + follow-up urgency 8",
    factors: [
      {
        label: "Clear operator-introduction fit",
        points: 11,
        evidenceIds: [
          "evidence:connection-storage-pilot",
          "evidence:connection-email-context",
        ],
      },
      {
        label: "Time-sensitive follow-up path",
        points: 8,
        evidenceIds: ["evidence:connection-follow-up"],
      },
    ],
  },
  rationale: {
    summary:
      "Kenji has high relationship value because the storage pilot operator intro is explicit, timely, and backed by event plus email context.",
    evidence: mockRelationshipValueEvidence,
    limitations: [
      "The mock score cannot observe live replies, calendar activity, or delivery outcomes.",
    ],
  },
  suggestedNextAction: {
    label: "Send the storage pilot operator introduction",
    dueWindow: "before Friday partner review",
    channel: "email",
    confidence: "high",
    reason:
      "The evidence says Kenji asked for an operator introduction and the follow-up window is still open.",
  },
  sourceEvidenceIds: mockRelationshipValueEvidence.map(
    (evidence) => evidence.evidenceId,
  ),
  scoredAt: fixtureScoredAt,
  createdBy: "mock-relationship-value-scoring-service",
};

export const mockRecomputedRelationshipValueAssessment: RelationshipValueAssessment =
  {
    ...mockRelationshipValueAssessment,
    id: "relationship-value:demo-connection-1:recomputed",
    priorityScore: {
      value: 88,
      band: "high",
      calculation:
        "deterministic fixture rule: base 72 + evidence 10 + action urgency 6",
      factors: [
        {
          label: "Selected evidence confirms business context",
          points: 10,
          evidenceIds: [
            "evidence:connection-storage-pilot",
            "evidence:connection-follow-up",
          ],
        },
        {
          label: "Suggested action remains time-sensitive",
          points: 6,
          evidenceIds: ["evidence:connection-follow-up"],
        },
      ],
    },
    rationale: {
      ...mockRelationshipValueAssessment.rationale,
      summary:
        "The recompute keeps Kenji high priority because selected evidence still supports a timely operator introduction.",
      evidence: mockRelationshipValueEvidence.filter((evidence) =>
        [
          "evidence:connection-storage-pilot",
          "evidence:connection-follow-up",
        ].includes(evidence.evidenceId),
      ),
    },
    sourceEvidenceIds: [
      "evidence:connection-storage-pilot",
      "evidence:connection-follow-up",
    ],
    scoredAt: "2026-06-25T19:40:00.000Z",
  };

export const mockRelationshipValueScoringFixture: RelationshipValuePayload = {
  state: "success",
  assessment: mockRelationshipValueAssessment,
  summary:
    "Kenji Watanabe is a critical relationship value candidate for a source-backed operator introduction.",
  provenance: mockRelationshipValueProvenance,
  nextAction: "Send the storage pilot operator introduction.",
};

export const mockRecomputedRelationshipValueFixture: RelationshipValuePayload = {
  state: "success",
  assessment: mockRecomputedRelationshipValueAssessment,
  summary:
    "The deterministic recompute keeps Kenji Watanabe in the high-priority band.",
  provenance: {
    ...mockRelationshipValueProvenance,
    sourceLabel: "Mock relationship value recompute rule",
    evidenceIds: mockRecomputedRelationshipValueAssessment.sourceEvidenceIds,
    generationMethod: "rule-based",
  },
  nextAction: "Use the selected evidence before sending the introduction.",
};

export const mockEmptyRelationshipValueScoringFixture: RelationshipValuePayload =
  {
    state: "empty",
    assessment: null,
    summary: "No mock relationship value can be scored without evidence.",
    provenance: mockEmptyRelationshipValueProvenance,
    nextAction:
      "Select a mock connection with evidence before scoring relationship value.",
  };

export const mockPendingRelationshipValueScoringFixture: RelationshipValuePayload =
  {
    state: "pending",
    assessment: null,
    summary:
      "Relationship value scoring is waiting for local fixture review before a priority score is exposed.",
    provenance: mockPendingRelationshipValueProvenance,
    nextAction:
      "Wait for mock evidence review before recomputing relationship value.",
  };
