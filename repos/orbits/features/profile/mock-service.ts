import {
  PROFILE_ERROR_DEFINITIONS,
  type ManualProfile,
  type ManualProfileUpdateInput,
  type ProfileCompleteness,
  type ProfileFailure,
  type ProfilePayload,
  type ProfileResult,
  type ProfileScenario,
  type ProfileSuccess,
} from "./contract";
import { scoreProfileCompleteness } from "./completeness";
import {
  mockEmptyProfileFixture,
  mockManualProfile,
  mockPendingProfileFixture,
  mockProfileFailureProvenance,
  mockProfileFixture,
  mockProfileProvenance,
} from "./fixtures";
import type { ProfileService } from "./service";
import { mergeIndustrySelection, validateIndustrySelection } from "../../shared/domain/industries";
import { calculateProfileOnboarding, isValidProfileBirthDate } from "./onboarding";

// Profile mock service 负责 operator 手动资料和 completeness 评分。
// 它模拟本地编辑器保存结果，但不写真实用户资料库或触发外部画像服务。
const supportedScenarios = new Set<ProfileScenario>([
  "complete",
  "empty",
  "pending",
]);

function clonePayload(payload: ProfilePayload): ProfilePayload {
  // profile payload 被编辑器消费后可能被局部修改，返回 clone 避免污染 fixture。
  return JSON.parse(JSON.stringify(payload)) as ProfilePayload;
}

function success(payload: ProfilePayload): ProfileSuccess {
  return {
    success: true,
    data: clonePayload({ ...payload, onboarding: calculateProfileOnboarding(payload.profile) }),
  };
}

function failure(code: ProfileFailure["error"]["code"]): ProfileFailure {
  // profile failure 固定走 mock provenance，便于 API route 映射成安全错误 envelope。
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
  // profile 的默认场景是 complete，保证页面在无参数时展示完整资料。
  if (scenario && supportedScenarios.has(scenario as ProfileScenario)) {
    return scenario as ProfileScenario;
  }

  return "complete";
}

function scoreCompleteness(profile: ManualProfile | null): ProfileCompleteness {
  // completeness score 是 deterministic UI 指标，不代表真实画像质量。
  return scoreProfileCompleteness(
    profile,
    () => clonePayload(mockEmptyProfileFixture).completeness,
  );
}

function buildUpdatedProfile(input: ManualProfileUpdateInput): ManualProfile {
  // update 以 fixture 为基线，传入字段覆盖并 trim；未传字段保留默认资料。
  return {
    ...mockManualProfile,
    ...input,
    ...mergeIndustrySelection(mockManualProfile, input),
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
    preferredLanguage:
      input.preferredLanguage ?? mockManualProfile.preferredLanguage,
    preferredIntroChannels:
      input.preferredIntroChannels ?? mockManualProfile.preferredIntroChannels,
    updatedAt: "2026-06-24T11:15:00.000Z",
  };
}

export function createMockProfileService(): ProfileService {
  // service 内部复用自身方法，确保 pending/empty/complete 的返回形状一致。
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
      // Fixtures do not persist revisions or receipts across requests.
      if (input.expectedUpdatedAt !== undefined || input.mutationId !== undefined) {
        return failure("PROFILE_SAVE_UNAVAILABLE");
      }
      if (input.birthDate !== undefined && input.birthDate !== null && !isValidProfileBirthDate(input.birthDate)) {
        return failure("PROFILE_BIRTH_DATE_INVALID");
      }
      if (!(input.displayName?.trim() ?? mockManualProfile.displayName)) {
        return failure("PROFILE_VALIDATION_FAILED");
      }

      const profile = buildUpdatedProfile(input);
      if (!validateIndustrySelection(profile).valid) {
        return failure("PROFILE_VALIDATION_FAILED");
      }
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
