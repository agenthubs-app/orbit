/**
 * 敏感动作确认守卫的 mock 服务。
 *
 * 所有可能写入关系图、发送消息、创建日历或修改个人资料的动作，都应该先变成
 * confirmation requirement，由用户明确 approve/reject。这个 mock 只记录本地决定，
 * 不会执行外部动作。
 */
import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import {
  CONFIRMATION_GUARD_ERROR_DEFINITIONS,
  type ConfirmationDecisionInput,
  type ConfirmationDecisionPayload,
  type ConfirmationDecisionResult,
  type ConfirmationDecisionScenario,
  type ConfirmationDecisionStatus,
  type ConfirmationDecisionSuccess,
  type ConfirmationGuardErrorCode,
  type ConfirmationGuardFailure,
  type ConfirmationGuardInput,
  type ConfirmationGuardScenario,
  type ConfirmationRequirement,
  type ConfirmationRequirementPayload,
  type ConfirmationRequirementResult,
  type ConfirmationRequirementSuccess,
  type SensitiveActionConfirmationService,
} from "./confirmation-contract";
import {
  CONFIRMATION_GUARD_FIXTURE_SOURCE,
  confirmationPolicyDecidedAt as fixtureDecidedAt,
  confirmationPolicyEmptyGuardFixture,
  confirmationPolicyEmptyGuardProvenance,
  confirmationPolicyFailureGuardProvenance,
  confirmationPolicyGuardFixture,
  confirmationPolicyGuardProvenance,
  confirmationPolicyPendingGuardFixture,
  confirmationPolicyPendingGuardProvenance,
  confirmationPolicyRequirements,
} from "./confirmation-policy";

export { CONFIRMATION_GUARD_FIXTURE_SOURCE };

export const mockConfirmationGuardProvenance =
  confirmationPolicyGuardProvenance;
export const mockEmptyConfirmationGuardProvenance =
  confirmationPolicyEmptyGuardProvenance;
export const mockPendingConfirmationGuardProvenance =
  confirmationPolicyPendingGuardProvenance;
export const mockConfirmationGuardFailureProvenance =
  confirmationPolicyFailureGuardProvenance;
export const mockConfirmationRequirements = confirmationPolicyRequirements;
export const mockConfirmationGuardFixture = confirmationPolicyGuardFixture;
export const mockEmptyConfirmationGuardFixture =
  confirmationPolicyEmptyGuardFixture;
export const mockPendingConfirmationGuardFixture =
  confirmationPolicyPendingGuardFixture;

export const mockConfirmationApprovedFixture: ConfirmationDecisionPayload = {
  state: "approved",
  requirement: {
    ...mockConfirmationRequirements[0],
    status: "approved",
  },
  decision: {
    id: "confirmation-decision:demo-confirmation-1:approved",
    confirmationId: "demo-confirmation-1",
    status: "approved",
    actorLabel: "Demo operator",
    decidedAt: fixtureDecidedAt,
    replacesOutboundAction: true,
    externalActionExecuted: false,
    outcomeSummary:
      "Approval recorded in the mock audit trail. No message is sent.",
  },
  provenance: mockPendingConfirmationGuardProvenance,
  nextAction: "Record the approval in the mock audit trail; do not send the message.",
};

export const mockConfirmationRejectedFixture: ConfirmationDecisionPayload = {
  state: "rejected",
  requirement: {
    ...mockConfirmationRequirements[0],
    status: "rejected",
  },
  decision: {
    id: "confirmation-decision:demo-confirmation-1:rejected",
    confirmationId: "demo-confirmation-1",
    status: "rejected",
    actorLabel: "Demo operator",
    decidedAt: fixtureDecidedAt,
    replacesOutboundAction: true,
    externalActionExecuted: false,
    outcomeSummary:
      "Rejection recorded in the mock audit trail. No message is sent.",
  },
  provenance: mockPendingConfirmationGuardProvenance,
  nextAction:
    "Keep the draft in review and record the rejection in the mock audit trail.",
};

const supportedGuardScenarios = new Set<ConfirmationGuardScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedDecisionScenarios = new Set<ConfirmationDecisionScenario>([
  "success",
  "failure",
  "blocked",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // 确认项会被 UI 局部修改状态，返回 clone 可以保护 fixture 原始值。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ConfirmationRequirementPayload,
): ConfirmationRequirementSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function decisionSuccess(
  payload: ConfirmationDecisionPayload,
): ConfirmationDecisionSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: ConfirmationGuardErrorCode): ConfirmationGuardFailure {
  // guard 和 decision 共用一组错误定义，便于 API route 统一转换。
  const definition = CONFIRMATION_GUARD_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockConfirmationGuardFailureProvenance,
      evidenceIds: mockConfirmationGuardFailureProvenance.evidenceIds,
    },
  };
}

function normalizeGuardScenario(
  scenario?: ConfirmationGuardInput["scenario"],
): ConfirmationGuardScenario {
  // listConfirmationRequirements 支持 success/empty/pending/failure 四种页面状态。
  if (
    scenario &&
    supportedGuardScenarios.has(scenario as ConfirmationGuardScenario)
  ) {
    return scenario as ConfirmationGuardScenario;
  }

  return "success";
}

function normalizeDecisionScenario(
  scenario?: ConfirmationDecisionInput["scenario"],
): ConfirmationDecisionScenario {
  // decision 额外支持 blocked，用来模拟当前动作不允许被批准/拒绝。
  if (
    scenario &&
    supportedDecisionScenarios.has(scenario as ConfirmationDecisionScenario)
  ) {
    return scenario as ConfirmationDecisionScenario;
  }

  return "success";
}

function findRequirement(id: string): ConfirmationRequirement | undefined {
  return mockConfirmationRequirements.find((requirement) => requirement.id === id);
}

function resolveActorLabel(actorLabel?: string | null): string {
  // 未传操作者时使用稳定默认值，保证审计文案可预测。
  const normalizedActor = actorLabel?.trim();

  return normalizedActor ? normalizedActor : "Demo operator";
}

function buildDecisionPayload(
  status: ConfirmationDecisionStatus,
  requirement: ConfirmationRequirement,
  actorLabel?: string | null,
): ConfirmationDecisionPayload {
  // 默认 demo-confirmation-1 复用标准 fixture；其它确认项按输入动态生成审计结果。
  if (
    requirement.id === mockConfirmationApprovedFixture.requirement.id &&
    resolveActorLabel(actorLabel) === "Demo operator"
  ) {
    return status === "approved"
      ? mockConfirmationApprovedFixture
      : mockConfirmationRejectedFixture;
  }

  const actionVerb = status === "approved" ? "approval" : "rejection";

  return {
    state: status,
    requirement: {
      ...requirement,
      status,
    },
    decision: {
      id: `confirmation-decision:${requirement.id}:${status}`,
      confirmationId: requirement.id,
      status,
      actorLabel: resolveActorLabel(actorLabel),
      decidedAt: fixtureDecidedAt,
      replacesOutboundAction: true,
      externalActionExecuted: false,
      outcomeSummary: `${actionVerb} recorded in the mock audit trail. ${requirement.action.mockEffect}`,
    },
    provenance: requirement.provenance,
    nextAction:
      status === "approved"
        ? `Record the approval in the mock audit trail; ${requirement.action.mockEffect.toLowerCase()}`
        : `Keep the action in review and record the rejection in the mock audit trail.`,
  };
}

function resolveDecision(
  input: ConfirmationDecisionInput,
  status: ConfirmationDecisionStatus,
): ConfirmationDecisionResult {
  // approve/reject 共用该流程：scenario 短路、确认项存在性校验、状态校验、生成决定。
  const scenario = normalizeDecisionScenario(input.scenario);

  if (scenario === "blocked") {
    return failure("CONFIRMATION_DECISION_NOT_ALLOWED");
  }

  if (scenario === "failure") {
    return failure("CONFIRMATION_GUARD_MOCK_FAILED");
  }

  const requirement = findRequirement(input.confirmationId);

  if (!requirement) {
    return failure("CONFIRMATION_REQUIREMENT_NOT_FOUND");
  }

  if (requirement.status !== "pending_confirmation") {
    return failure("CONFIRMATION_REQUIREMENT_ALREADY_RESOLVED");
  }

  return decisionSuccess(buildDecisionPayload(status, requirement, input.actorLabel));
}

export function createMockSensitiveActionConfirmationService(): SensitiveActionConfirmationService {
  // 对外 service 不执行敏感动作，只返回待确认列表或本地决策结果。
  return {
    listConfirmationRequirements(input = {}) {
      switch (normalizeGuardScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyConfirmationGuardFixture);
        case "pending":
          return success(mockPendingConfirmationGuardFixture);
        case "failure":
          return failure("CONFIRMATION_GUARD_MOCK_FAILED");
        case "success":
        default:
          return success(mockConfirmationGuardFixture);
      }
    },

    approveConfirmation(input) {
      return resolveDecision(input, "approved");
    },

    rejectConfirmation(input) {
      return resolveDecision(input, "rejected");
    },
  };
}

export function confirmationGuardFailureToAppError(
  result: ConfirmationGuardFailure,
): AppError {
  // API 层只需要 AppError，不需要知道 confirmation contract 的内部字段。
  return new AppError(result.error.appCode, result.error.message);
}

export function confirmationGuardFailureContext(
  result: ConfirmationGuardFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    confirmationGuardErrorCode: result.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      mode === "live"
        ? "Live confirmation guard failure came from deterministic live safety policy rules."
        : "Mock confirmation guard failure came from deterministic fixture rules.",
    service:
      mode === "live"
        ? "sensitive-action-confirmation-guard-live-policy"
        : "sensitive-action-confirmation-guard",
  };
}

export type {
  ConfirmationDecisionResult,
  ConfirmationRequirementResult,
};
