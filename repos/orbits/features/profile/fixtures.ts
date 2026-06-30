/**
 * 手动个人资料 fixture。
 *
 * 这里提供当前用户 profile、空状态、pending 状态、失败 provenance 和默认更新输入。
 * mock profile service 用这些数据验证资料页读取和编辑流程。
 */
import type {
  ManualProfile,
  ManualProfileUpdateInput,
  ProfilePayload,
  ProfileProvenance,
} from "./contract";

export const PROFILE_FIXTURE_SOURCE =
  "fixture:features/profile/fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-24T11:00:00.000Z";

export const mockProfileProvenance: ProfileProvenance = {
  source: PROFILE_FIXTURE_SOURCE,
  sourceLabel: "Mock manual profile onboarding fixture",
  evidenceIds: [
    "evidence:profile-manual-onboarding",
    "evidence:profile-editor-demo-save",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-profile-only",
};

export const mockManualProfile: ManualProfile = {
  id: "profile_ari_lane",
  displayName: "Ari Lane",
  headline: "Founder building a relationship operating system",
  organization: "Orbit",
  role: "Founder",
  homeMarket: "Tokyo",
  relationshipGoal:
    "Turn event context into source-backed follow-up decisions.",
  targetRelationshipTypes: ["founders", "BD partners", "event hosts"],
  preferredFollowUpWindow: "48 hours",
  preferredIntroChannels: [],
  updatedAt: "2026-06-24T11:05:00.000Z",
};

export const mockProfileFixture: ProfilePayload = {
  state: "success",
  profile: mockManualProfile,
  completeness: {
    score: 83,
    status: "action-needed",
    completedFields: [
      "displayName",
      "headline",
      "relationshipGoal",
      "homeMarket",
      "targetRelationshipTypes",
    ],
    missingFields: ["preferredIntroChannels"],
    nextBestField: "preferredIntroChannels",
  },
  editor: {
    canSave: true,
    lastSavedAt: "2026-06-24T11:05:00.000Z",
    dirtyFields: [],
    validationMessages: [],
  },
  provenance: mockProfileProvenance,
  nextAction:
    "Add preferred intro channels before Orbit ranks profile-informed follow-up actions.",
};

export const mockEmptyProfileFixture: ProfilePayload = {
  state: "empty",
  profile: null,
  completeness: {
    score: 0,
    status: "not-started",
    completedFields: [],
    missingFields: [
      "displayName",
      "headline",
      "relationshipGoal",
      "homeMarket",
      "targetRelationshipTypes",
      "preferredIntroChannels",
    ],
    nextBestField: "displayName",
  },
  editor: {
    canSave: false,
    lastSavedAt: null,
    dirtyFields: [],
    validationMessages: ["Add a display name to start profile onboarding."],
  },
  provenance: {
    ...mockProfileProvenance,
    sourceLabel: "Mock empty profile onboarding rule",
    evidenceIds: ["evidence:profile-empty-onboarding"],
  },
  nextAction:
    "Start with a name, market, and relationship goal before creating relationship actions.",
};

export const mockPendingProfileFixture: ProfilePayload = {
  state: "pending",
  profile: {
    ...mockManualProfile,
    updatedAt: "2026-06-24T11:10:00.000Z",
  },
  completeness: mockProfileFixture.completeness,
  editor: {
    canSave: false,
    lastSavedAt: "2026-06-24T11:05:00.000Z",
    dirtyFields: ["headline", "relationshipGoal"],
    validationMessages: ["Manual review is pending for this mock profile."],
  },
  provenance: {
    ...mockProfileProvenance,
    sourceLabel: "Mock pending manual profile review rule",
    evidenceIds: ["evidence:profile-update-pending"],
  },
  nextAction:
    "Keep the edited profile in review before using it for relationship scoring.",
};

export const mockProfileFailureProvenance: ProfileProvenance = {
  ...mockProfileProvenance,
  sourceLabel: "Mock profile validation rule",
  evidenceIds: ["evidence:profile-validation-failure"],
};

export const mockProfileUpdateInput: ManualProfileUpdateInput = {
  displayName: "Ari Lane",
  headline: "Founder building a relationship operating system",
  organization: "Orbit",
  role: "Founder",
  homeMarket: "Tokyo",
  relationshipGoal:
    "Use relationship context to decide which follow-up matters next.",
  targetRelationshipTypes: ["founders", "BD partners", "event hosts"],
  preferredFollowUpWindow: "48 hours",
  preferredIntroChannels: ["warm intro", "event follow-up"],
};
