import {
  PROFILE_ERROR_DEFINITIONS,
  type ManualProfile,
  type ManualProfileUpdateInput,
  type ProfileCompleteness,
  type ProfileCompletenessField,
  type ProfileFailure,
  type ProfilePayload,
  type ProfileResult,
  type ProfileScenario,
  type ProfileSuccess,
} from "./contract";
import {
  mockEmptyProfileFixture,
  mockManualProfile,
  mockPendingProfileFixture,
  mockProfileFailureProvenance,
  mockProfileFixture,
  mockProfileProvenance,
} from "./fixtures";
import type { ProfileService } from "./service";

const supportedScenarios = new Set<ProfileScenario>([
  "complete",
  "empty",
  "pending",
]);

const completenessFields: readonly ProfileCompletenessField[] = [
  "displayName",
  "headline",
  "relationshipGoal",
  "homeMarket",
  "targetRelationshipTypes",
  "preferredIntroChannels",
];

function clonePayload(payload: ProfilePayload): ProfilePayload {
  return JSON.parse(JSON.stringify(payload)) as ProfilePayload;
}

function success(payload: ProfilePayload): ProfileSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: ProfileFailure["error"]["code"]): ProfileFailure {
  const definition = PROFILE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockProfileFailureProvenance,
      evidenceIds: mockProfileFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ProfileScenario | string | null,
): ProfileScenario {
  if (scenario && supportedScenarios.has(scenario as ProfileScenario)) {
    return scenario as ProfileScenario;
  }

  return "complete";
}

function hasValue(
  profile: ManualProfile,
  field: ProfileCompletenessField,
): boolean {
  const value = profile[field];

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "string") {
    return Boolean(value.trim());
  }

  return false;
}

function scoreCompleteness(profile: ManualProfile | null): ProfileCompleteness {
  if (!profile) {
    return clonePayload(mockEmptyProfileFixture).completeness;
  }

  const completedFields = completenessFields.filter((field) =>
    hasValue(profile, field),
  );
  const missingFields = completenessFields.filter(
    (field) => !completedFields.includes(field),
  );
  const score = Math.round(
    (completedFields.length / completenessFields.length) * 100,
  );

  return {
    score,
    status:
      score === 0 ? "not-started" : missingFields.length === 0 ? "ready" : "action-needed",
    completedFields,
    missingFields,
    nextBestField: missingFields[0] ?? null,
  };
}

function buildUpdatedProfile(input: ManualProfileUpdateInput): ManualProfile {
  return {
    ...mockManualProfile,
    ...input,
    displayName: input.displayName?.trim() ?? mockManualProfile.displayName,
    headline: input.headline?.trim() ?? mockManualProfile.headline,
    organization: input.organization?.trim() ?? mockManualProfile.organization,
    role: input.role?.trim() ?? mockManualProfile.role,
    homeMarket: input.homeMarket?.trim() ?? mockManualProfile.homeMarket,
    relationshipGoal:
      input.relationshipGoal?.trim() ?? mockManualProfile.relationshipGoal,
    targetRelationshipTypes:
      input.targetRelationshipTypes ?? mockManualProfile.targetRelationshipTypes,
    preferredFollowUpWindow:
      input.preferredFollowUpWindow?.trim() ??
      mockManualProfile.preferredFollowUpWindow,
    preferredIntroChannels:
      input.preferredIntroChannels ?? mockManualProfile.preferredIntroChannels,
    updatedAt: "2026-06-24T11:15:00.000Z",
  };
}

export function createMockProfileService(): ProfileService {
  const service: ProfileService = {
    getProfile(options = {}) {
      switch (normalizeScenario(options.scenario)) {
        case "empty":
          return success(mockEmptyProfileFixture);
        case "pending":
          return service.getPendingManualReview();
        case "complete":
        default:
          return success(mockProfileFixture);
      }
    },

    getPendingManualReview() {
      return success(mockPendingProfileFixture);
    },

    scoreCompleteness(profile) {
      return scoreCompleteness(profile);
    },

    updateProfile(input): ProfileResult {
      if (!input.displayName?.trim()) {
        return failure("PROFILE_VALIDATION_FAILED");
      }

      const profile = buildUpdatedProfile(input);
      const completeness = scoreCompleteness(profile);

      return success({
        state: "success",
        profile,
        completeness,
        editor: {
          canSave: true,
          lastSavedAt: profile.updatedAt,
          dirtyFields: [],
          validationMessages: [],
        },
        provenance: {
          ...mockProfileProvenance,
          sourceLabel: "Mock manual profile editor update rule",
          evidenceIds: ["evidence:profile-editor-put-request"],
        },
        nextAction:
          completeness.status === "ready"
            ? "Use the completed profile to personalize relationship follow-up."
            : "Complete the next profile field before scoring relationship actions.",
      });
    },
  };

  return service;
}
