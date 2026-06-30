import type {
  RelationshipProfilePayload,
  RelationshipProfileProvenance,
  RelationshipProfileRecord,
} from "./profile-contract";

export const RELATIONSHIP_PROFILE_FIXTURE_SOURCE =
  "fixture:features/connections/profile-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T20:00:00.000Z";
const fixtureGeneratedAt = "2026-06-25T20:05:00.000Z";
const relationshipEvidenceIds = [
  "evidence:connection-climate-dinner",
  "evidence:connection-storage-pilot",
  "evidence:connection-email-context",
  "evidence:relationship-profile-rule",
] as const;

export const mockRelationshipProfileProvenance: RelationshipProfileProvenance = {
  source: RELATIONSHIP_PROFILE_FIXTURE_SOURCE,
  sourceLabel: "Mock relationship stage and profile fixture",
  evidenceIds: relationshipEvidenceIds,
  collectedAt: fixtureCollectedAt,
  privacy: "demo-relationship-profile-only",
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

export const mockEmptyRelationshipProfileProvenance: RelationshipProfileProvenance =
  {
    ...mockRelationshipProfileProvenance,
    sourceLabel: "Mock empty relationship profile rule",
    evidenceIds: ["evidence:relationship-profile-empty"],
    generationMethod: "rule-based-relationship-profile",
  };

export const mockPendingRelationshipProfileProvenance: RelationshipProfileProvenance =
  {
    ...mockRelationshipProfileProvenance,
    sourceLabel: "Mock pending relationship profile rule",
    evidenceIds: ["evidence:relationship-profile-pending"],
    generationMethod: "rule-based-relationship-profile",
  };

export const mockRelationshipProfileFailureProvenance: RelationshipProfileProvenance =
  {
    ...mockRelationshipProfileProvenance,
    sourceLabel: "Mock relationship profile controlled failure rule",
    evidenceIds: ["evidence:relationship-profile-controlled-failure"],
    generationMethod: "rule-based-relationship-profile",
  };

export const mockRelationshipProfileRecord: RelationshipProfileRecord = {
  connectionId: "demo-connection-1",
  contactId: "contact:kenji-watanabe",
  displayName: "Kenji Watanabe",
  relationshipType: "event_peer",
  relationshipStage: "active",
  context:
    "Kenji asked for a storage pilot operator introduction after the climate founders dinner.",
  mutualValue: {
    contactReceives: "A warm operator introduction for storage pilot validation.",
    orbitUserReceives:
      "A qualified climate infrastructure founder conversation.",
    valueTypes: ["commercial_opportunity", "knowledge_exchange"],
  },
  latestSummary: {
    text:
      "Kenji is now active because the climate dinner context and follow-up evidence point to a concrete operator intro.",
    generatedAt: fixtureGeneratedAt,
    evidenceIds: relationshipEvidenceIds,
    generationMethod: "rule-based-relationship-profile",
    createdBy: "mock-relationship-stage-and-profile-service",
  },
  nextAction: {
    label: "Send storage pilot operator intro",
    rationale:
      "The intro is the highest-signal action from the latest source-backed context.",
    dueAt: "2026-06-26T09:00:00.000Z",
  },
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

export const mockRelationshipStageUpdateFixture: RelationshipProfilePayload = {
  state: "success",
  profile: mockRelationshipProfileRecord,
  summary:
    "Kenji Watanabe has a deterministic relationship stage and profile ready for review.",
  provenance: {
    ...mockRelationshipProfileProvenance,
    generationMethod: "rule-based-relationship-profile",
  },
  nextAction: "Send storage pilot operator intro",
  updateSummary:
    "Relationship stage active was calculated from local fixture evidence without provider calls.",
};

export const mockRelationshipProfileUpdateFixture: RelationshipProfilePayload = {
  ...mockRelationshipStageUpdateFixture,
  profile: {
    ...mockRelationshipProfileRecord,
    relationshipType: "customer_candidate",
  },
  updateSummary:
    "Relationship profile customer_candidate was calculated from local fixture evidence without provider calls.",
};

export const mockEmptyRelationshipProfileFixture: RelationshipProfilePayload = {
  state: "empty",
  profile: null,
  summary: "No mock connection is selected for relationship profiling.",
  provenance: mockEmptyRelationshipProfileProvenance,
  nextAction:
    "Select a mock connection before calculating relationship stage and profile fields.",
  updateSummary: "No relationship profile fields were calculated.",
};

export const mockPendingRelationshipProfileFixture: RelationshipProfilePayload = {
  state: "pending",
  profile: null,
  summary: "Relationship stage and profile calculation is pending fixture review.",
  provenance: mockPendingRelationshipProfileProvenance,
  nextAction:
    "Wait for mock fixture review before applying profile automation.",
  updateSummary: "Relationship stage and profile calculation is pending.",
};
