import {
  AGENT_ACTION_QUEUE_ERROR_DEFINITIONS,
  type AgentActionDecision,
  type AgentActionDecisionInput,
  type AgentActionDecisionPayload,
  type AgentActionDecisionResult,
  type AgentActionQueueErrorCode,
  type AgentActionQueueFailure,
  type AgentActionQueueListInput,
  type AgentActionQueuePayload,
  type AgentActionQueueResult,
  type AgentActionQueueScenario,
  type AgentActionType,
} from "./contract";
import {
  mockAcceptedAgentActionFixture,
  mockAgentActionQueueFailureProvenance,
  mockAgentActionQueueFixture,
  mockAgentActions,
  mockDismissedAgentActionFixture,
  mockEmptyAgentActionQueueFixture,
  mockPendingAgentActionQueueFixture,
} from "./fixtures";
import type { AgentActionQueueService } from "./service";

// Agent action queue mock service 管理“建议动作”的展示和接受/忽略决策。
// 接受动作只返回本地决策 payload，不真正发送消息、创建日程或修改联系人。
const supportedScenarios = new Set<AgentActionQueueScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedActionTypes = new Set<AgentActionType>([
  "event_reminder",
  "post_event_followup",
  "dormant_activation",
  "message_draft_suggestion",
  "appointment_suggestion",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // action payload 含可展示状态，clone 后返回避免决策 UI 改动共享 fixture。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function queueSuccess(
  data: AgentActionQueuePayload,
): AgentActionQueueResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function decisionSuccess(
  data: AgentActionDecisionPayload,
): AgentActionDecisionResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(code: AgentActionQueueErrorCode): AgentActionQueueFailure {
  // 所有失败都保持在本地 mock 队列边界内。
  const definition = AGENT_ACTION_QUEUE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockAgentActionQueueFailureProvenance,
      evidenceIds: mockAgentActionQueueFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?:
    | AgentActionQueueListInput["scenario"]
    | AgentActionDecisionInput["scenario"],
): AgentActionQueueScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as AgentActionQueueScenario)
  ) {
    return scenario as AgentActionQueueScenario;
  }

  return "success";
}

function isActionType(value: unknown): value is AgentActionType {
  // actionType filter 只接受已定义类型；未知值表示不过滤。
  return (
    typeof value === "string" &&
    supportedActionTypes.has(value as AgentActionType)
  );
}

function filteredFixture(input: AgentActionQueueListInput): AgentActionQueuePayload {
  // 按 actionType 派生列表，不修改 mockAgentActions 原始 fixture。
  if (!isActionType(input.actionType)) {
    return mockAgentActionQueueFixture;
  }

  const actions = mockAgentActions.filter(
    (action) => action.actionType === input.actionType,
  );

  if (actions.length === 0) {
    return mockEmptyAgentActionQueueFixture;
  }

  return {
    ...mockAgentActionQueueFixture,
    actions,
    summary: `Local agent action rules returned ${input.actionType} suggestions without running autonomous jobs or live providers.`,
  };
}

function listScenarioResult(
  input: AgentActionQueueListInput,
): AgentActionQueueResult {
  const scenario = normalizeScenario(input.scenario);

  switch (scenario) {
    case "empty":
      return queueSuccess(mockEmptyAgentActionQueueFixture);
    case "pending":
      return queueSuccess(mockPendingAgentActionQueueFixture);
    case "failure":
      return failure("AGENT_ACTION_QUEUE_MOCK_FAILED");
    case "success":
    default:
      return queueSuccess(filteredFixture(input));
  }
}

function actionExists(actionId: string): boolean {
  return mockAgentActions.some((action) => action.actionId === actionId);
}

function decisionPayload(
  decision: AgentActionDecision,
  input: AgentActionDecisionInput,
): AgentActionDecisionPayload {
  // accepted/dismissed 共用 fixture，只允许 actorLabel 被输入覆盖。
  const base =
    decision === "accepted"
      ? mockAcceptedAgentActionFixture
      : mockDismissedAgentActionFixture;

  return {
    ...base,
    actorLabel: input.actorLabel?.trim() || base.actorLabel,
  };
}

function decisionResult(
  decision: AgentActionDecision,
  input: AgentActionDecisionInput,
): AgentActionDecisionResult {
  // 决策前先校验 scenario、actionId 是否存在；不存在则返回稳定错误码。
  const scenario = normalizeScenario(input.scenario);

  if (scenario === "failure") {
    return failure("AGENT_ACTION_QUEUE_MOCK_FAILED");
  }

  if (!input.actionId) {
    return failure("AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED");
  }

  if (!actionExists(input.actionId)) {
    return failure("AGENT_ACTION_QUEUE_ACTION_NOT_FOUND");
  }

  return decisionSuccess(decisionPayload(decision, input));
}

export function createMockAgentActionQueueService(): AgentActionQueueService {
  // public API 与 route 一一对应：列表、接受、忽略。
  return {
    listActions(input = {}): AgentActionQueueResult {
      return listScenarioResult(input);
    },

    acceptAction(input): AgentActionDecisionResult {
      return decisionResult("accepted", input);
    },

    dismissAction(input): AgentActionDecisionResult {
      return decisionResult("dismissed", input);
    },
  };
}

export type {
  AgentActionDecisionResult,
  AgentActionQueueResult,
  AgentActionQueueService,
};
