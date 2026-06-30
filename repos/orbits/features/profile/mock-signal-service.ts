/**
 * 个人资料信号复核队列的 mock 服务。
 *
 * 信号队列会把邮件、日历、名片等来源推导出的个人资料更新建议展示给用户。
 * 这个 mock 只返回待复核建议和“已接受”的本地 patch，不会直接保存 profile。
 */
import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import {
  PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS,
  type ProfileSignalReviewQueueErrorCode,
  type ProfileSignalReviewQueueFailure,
  type ProfileSignalReviewQueueInput,
  type ProfileSignalReviewQueuePayload,
  type ProfileSignalReviewQueueResult,
  type ProfileSignalReviewQueueScenario,
  type ProfileSignalReviewQueueService,
  type ProfileSignalReviewQueueSuccess,
  type ProfileSignalSuggestionAcceptedPayload,
  type ProfileSignalSuggestionAcceptedSuccess,
  type ProfileSignalSuggestionAcceptResult,
  type ProfileUpdateSuggestion,
} from "./signal-contract";
import {
  mockEmptyProfileSignalReviewQueueFixture,
  mockPendingProfileSignalReviewQueueFixture,
  mockProfileSignalReviewQueueFailureProvenance,
  mockProfileSignalReviewQueueFixture,
  mockProfileSignalReviewSuggestions,
  mockProfileSignalSuggestionAcceptedFixture,
} from "./signal-fixtures";

const supportedScenarios = new Set<ProfileSignalReviewQueueScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // 队列数据会在 UI 中被标记状态，clone 避免污染共享 fixture。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ProfileSignalReviewQueuePayload,
): ProfileSignalReviewQueueSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function accepted(
  payload: ProfileSignalSuggestionAcceptedPayload,
): ProfileSignalSuggestionAcceptedSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: ProfileSignalReviewQueueErrorCode,
): ProfileSignalReviewQueueFailure {
  // 错误对象统一来自 signal contract，便于 route 和测试断言。
  const definition = PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockProfileSignalReviewQueueFailureProvenance,
      evidenceIds: mockProfileSignalReviewQueueFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ProfileSignalReviewQueueInput["scenario"],
): ProfileSignalReviewQueueScenario {
  // 只接受 contract 中定义过的 scenario；未传或未知时走 success。
  if (scenario && supportedScenarios.has(scenario as ProfileSignalReviewQueueScenario)) {
    return scenario as ProfileSignalReviewQueueScenario;
  }

  return "success";
}

function findSuggestion(id: string): ProfileUpdateSuggestion | undefined {
  // 接受建议前必须能在当前 mock 队列中找到对应 suggestion。
  return mockProfileSignalReviewSuggestions.find(
    (suggestion) => suggestion.id === id,
  );
}

export function createMockProfileSignalReviewQueueService(): ProfileSignalReviewQueueService {
  // list 负责展示复核队列；accept 只生成 patch，真正保存仍需后续确认流程。
  return {
    listUpdateSuggestions(input = {}) {
      switch (normalizeScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyProfileSignalReviewQueueFixture);
        case "pending":
          return success(mockPendingProfileSignalReviewQueueFixture);
        case "failure":
          return failure("PROFILE_SIGNAL_REVIEW_QUEUE_FAILED");
        case "success":
        default:
          return success(mockProfileSignalReviewQueueFixture);
      }
    },

    acceptUpdateSuggestion(id) {
      const suggestion = findSuggestion(id);

      if (!suggestion) {
        return failure("PROFILE_SIGNAL_SUGGESTION_NOT_FOUND");
      }

      if (suggestion.status !== "pending") {
        return failure("PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED");
      }

      if (id === mockProfileSignalSuggestionAcceptedFixture.acceptedSuggestion.id) {
        return accepted(mockProfileSignalSuggestionAcceptedFixture);
      }

      return accepted({
        state: "accepted",
        acceptedSuggestion: {
          ...suggestion,
          status: "accepted",
        },
        profilePatch: {
          [suggestion.targetProfileField]: suggestion.suggestedValue,
        },
        appliedFields: [suggestion.targetProfileField],
        acceptedAt: mockProfileSignalSuggestionAcceptedFixture.acceptedAt,
        provenance: suggestion.provenance,
        nextAction:
          "Apply this patch only after the operator confirms the profile save.",
      });
    },
  };
}

export function profileSignalReviewQueueFailureToAppError(
  result: ProfileSignalReviewQueueFailure,
): AppError {
  // 统一转换成 AppError，避免 API 层重复理解 feature contract。
  return new AppError(result.error.appCode, result.error.message);
}

export function profileSignalReviewQueueFailureContext(
  result: ProfileSignalReviewQueueFailure,
  mode: FeatureMode,
): ApiErrorContext {
  // envelope 使用这些字段说明失败来自 mock signal review 边界。
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    profileSignalReviewQueueErrorCode: result.error.code,
    provenance:
      "Mock profile signal review failure came from deterministic fixture rules.",
    service: "profile-signal-review-queue-mock",
  };
}

export type {
  ProfileSignalReviewQueueResult,
  ProfileSignalSuggestionAcceptResult,
};
