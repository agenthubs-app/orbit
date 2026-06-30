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
  type ConfirmationEvidence,
  type ConfirmationGuardErrorCode,
  type ConfirmationGuardFailure,
  type ConfirmationGuardInput,
  type ConfirmationGuardProvenance,
  type ConfirmationGuardScenario,
  type ConfirmationRequirement,
  type ConfirmationRequirementPayload,
  type ConfirmationRequirementResult,
  type ConfirmationRequirementSuccess,
  type SensitiveActionConfirmationService,
} from "./confirmation-contract";

export const CONFIRMATION_GUARD_FIXTURE_SOURCE =
  "fixture:features/permissions/mock-confirmation-service.ts" as const;

// 固定时间戳让 UI snapshot 和 contract 测试稳定。
const fixtureCollectedAt = "2026-06-24T15:00:00.000Z";
const fixtureCreatedAt = "2026-06-24T15:05:00.000Z";
const fixtureDecidedAt = "2026-06-24T15:10:00.000Z";

export const mockConfirmationGuardProvenance: ConfirmationGuardProvenance = {
  source: CONFIRMATION_GUARD_FIXTURE_SOURCE,
  sourceLabel: "Mock sensitive action confirmation fixture",
  evidenceIds: [
    "evidence:message-draft-review",
    "evidence:card-import-review",
    "evidence:calendar-intent-review",
    "evidence:profile-change-review",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-confirmation-guard-only",
  generationMethod: "fixture",
};

export const mockEmptyConfirmationGuardProvenance: ConfirmationGuardProvenance = {
  ...mockConfirmationGuardProvenance,
  sourceLabel: "Mock empty confirmation guard rule",
  evidenceIds: ["evidence:no-sensitive-action-selected"],
  generationMethod: "rule-based-confirmation-guard",
};

export const mockPendingConfirmationGuardProvenance: ConfirmationGuardProvenance = {
  ...mockConfirmationGuardProvenance,
  sourceLabel: "Mock pending confirmation guard rule",
  evidenceIds: ["evidence:message-draft-review"],
  generationMethod: "rule-based-confirmation-guard",
};

export const mockConfirmationGuardFailureProvenance: ConfirmationGuardProvenance = {
  ...mockConfirmationGuardProvenance,
  sourceLabel: "Mock confirmation guard controlled failure rule",
  evidenceIds: ["evidence:confirmation-controlled-failure"],
  generationMethod: "rule-based-confirmation-guard",
};

const messageEvidence: ConfirmationEvidence = {
  evidenceId: "evidence:message-draft-review",
  sourceLabel: "Follow-up draft review",
  excerpt:
    "Draft message references the SaaS Summit conversation and waits for explicit approval.",
  collectedAt: fixtureCollectedAt,
};

const contactEvidence: ConfirmationEvidence = {
  evidenceId: "evidence:card-import-review",
  sourceLabel: "Business-card import review",
  excerpt:
    "New contact fields are staged from a sourced card import before any contact write.",
  collectedAt: fixtureCollectedAt,
};

const calendarEvidence: ConfirmationEvidence = {
  evidenceId: "evidence:calendar-intent-review",
  sourceLabel: "Calendar intent review",
  excerpt:
    "Meeting creation is represented as a confirmation request until the operator approves it.",
  collectedAt: fixtureCollectedAt,
};

const profileEvidence: ConfirmationEvidence = {
  evidenceId: "evidence:profile-change-review",
  sourceLabel: "Profile update review",
  excerpt:
    "Profile field changes remain staged until an explicit confirmation resolves them.",
  collectedAt: fixtureCollectedAt,
};

  // 这四条 requirement 覆盖 outbound message、contact write、calendar write、
  // profile write 四类敏感动作，帮助页面一次性展示多种确认风险。
export const mockConfirmationRequirements: readonly ConfirmationRequirement[] = [
  {
    id: "demo-confirmation-1",
    status: "pending_confirmation",
    action: {
      kind: "send-message",
      label: "Send message",
      summary: "Send the drafted follow-up to Emi Tanaka after SaaS Summit.",
      requestedBy: "Orbit operator",
      targetLabel: "Emi Tanaka",
      payloadPreview:
        "Great meeting you at SaaS Summit. I can introduce you to the API partnerships team next week.",
      replacesOutboundAction: true,
      externalActionExecuted: false,
      mockEffect: "No message is sent.",
    },
    confirmationQuestion: "Approve sending this follow-up message?",
    riskLabel: "Outbound communication",
    guardReason:
      "Relationship messages must be explicitly confirmed before delivery.",
    createdAt: fixtureCreatedAt,
    evidence: [messageEvidence],
    provenance: mockConfirmationGuardProvenance,
  },
  {
    id: "demo-confirmation-2",
    status: "pending_confirmation",
    action: {
      kind: "add-contact",
      label: "Add contact",
      summary: "Add Mateo Rivera from the Fintech Forum badge import.",
      requestedBy: "Orbit operator",
      targetLabel: "Mateo Rivera",
      payloadPreview:
        "Mateo Rivera, Partnerships Lead, ArcPay. Source: Fintech Forum badge.",
      replacesOutboundAction: true,
      externalActionExecuted: false,
      mockEffect: "No contact is written.",
    },
    confirmationQuestion: "Approve adding this contact record?",
    riskLabel: "Irreversible relationship write",
    guardReason:
      "New contacts need confirmation because they change the relationship graph.",
    createdAt: fixtureCreatedAt,
    evidence: [contactEvidence],
    provenance: mockConfirmationGuardProvenance,
  },
  {
    id: "demo-confirmation-3",
    status: "pending_confirmation",
    action: {
      kind: "create-calendar-event",
      label: "Create calendar event",
      summary: "Create a 30 minute investor intro hold with Priya Shah.",
      requestedBy: "Orbit operator",
      targetLabel: "Priya Shah",
      payloadPreview:
        "Investor intro hold, Tuesday 10:30, context: requested warm intro.",
      replacesOutboundAction: true,
      externalActionExecuted: false,
      mockEffect: "No calendar event is created.",
    },
    confirmationQuestion: "Approve creating this calendar event?",
    riskLabel: "Calendar mutation",
    guardReason:
      "Calendar writes must stay behind an explicit confirmation boundary.",
    createdAt: fixtureCreatedAt,
    evidence: [calendarEvidence],
    provenance: mockConfirmationGuardProvenance,
  },
  {
    id: "demo-confirmation-4",
    status: "pending_confirmation",
    action: {
      kind: "update-profile",
      label: "Update profile",
      summary: "Add Tokyo fintech expansion focus to the relationship profile.",
      requestedBy: "Orbit operator",
      targetLabel: "Orbit profile",
      payloadPreview: "relationshipGoal: Tokyo fintech expansion",
      replacesOutboundAction: true,
      externalActionExecuted: false,
      mockEffect: "No profile field is saved.",
    },
    confirmationQuestion: "Approve saving this profile update?",
    riskLabel: "Profile mutation",
    guardReason:
      "Profile updates need confirmation before changing stored relationship context.",
    createdAt: fixtureCreatedAt,
    evidence: [profileEvidence],
    provenance: mockConfirmationGuardProvenance,
  },
];

export const mockConfirmationGuardFixture: ConfirmationRequirementPayload = {
  state: "success",
  requirements: mockConfirmationRequirements,
  summary:
    "Four sensitive relationship actions are staged behind deterministic confirmation requirements.",
  provenance: mockConfirmationGuardProvenance,
  nextAction:
    "Approve or reject each action inside the mock guard before any live implementation can run.",
};

export const mockEmptyConfirmationGuardFixture: ConfirmationRequirementPayload = {
  state: "empty",
  requirements: [],
  summary: "No sensitive action is waiting for confirmation.",
  provenance: mockEmptyConfirmationGuardProvenance,
  nextAction:
    "Wait until a sensitive relationship action creates a sourced confirmation request.",
};

export const mockPendingConfirmationGuardFixture: ConfirmationRequirementPayload = {
  state: "pending",
  requirements: [mockConfirmationRequirements[0]],
  summary: "One outbound message is waiting for explicit confirmation.",
  provenance: mockPendingConfirmationGuardProvenance,
  nextAction:
    "Review the message draft before approving or rejecting the action.",
};

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
  // 失败上下文标记 mock guard 边界，方便调试 confirmation 相关 API。
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    confirmationGuardErrorCode: result.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock confirmation guard failure came from deterministic fixture rules.",
    service: "sensitive-action-confirmation-guard",
  };
}

export type {
  ConfirmationDecisionResult,
  ConfirmationRequirementResult,
};
