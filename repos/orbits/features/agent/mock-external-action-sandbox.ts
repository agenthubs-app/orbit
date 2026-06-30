/**
 * 外部动作沙盒的 mock 实现。
 *
 * 真实外部动作包括发消息、创建日历事件和投递通知；这些都可能产生不可逆副作用。
 * 这个 mock 服务只返回 no-op payload 和审计记录，用来证明“UI 可以展示动作结果”，
 * 但不会真的发送消息、写入日历或触发通知。
 */
import {
  EXTERNAL_ACTION_SANDBOX_ERROR_DEFINITIONS,
  mockCreateCalendarEventNoOpFixture,
  mockEmptyExternalActionAuditFixture,
  mockExternalActionSandboxFailureProvenance,
  mockExternalActionSandboxFixture,
  mockExternalActionSandboxActions,
  mockNotificationDeliveryNoOpFixture,
  mockPendingExternalActionSandboxFixture,
  mockSendMessageNoOpFixture,
  type ExternalActionAuditListInput,
  type ExternalActionAuditResult,
  type ExternalActionNoOpPayload,
  type ExternalActionNoOpResult,
  type ExternalActionSandboxAction,
  type ExternalActionSandboxActionType,
  type ExternalActionSandboxErrorCode,
  type ExternalActionSandboxFailure,
  type ExternalActionSandboxInput,
  type ExternalActionSandboxScenario,
  type ExternalActionSandboxService,
} from "./external-action-contract";

const supportedScenarios = new Set<ExternalActionSandboxScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // 每次返回独立对象，避免调用方修改 fixture 影响后续测试用例。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function auditSuccess(data = mockExternalActionSandboxFixture): ExternalActionAuditResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function noOpSuccess(data: ExternalActionNoOpPayload): ExternalActionNoOpResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: ExternalActionSandboxErrorCode,
): ExternalActionSandboxFailure {
  // mock 失败也沿用 contract 中的稳定错误定义，方便 API 层统一转换。
  const definition = EXTERNAL_ACTION_SANDBOX_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockExternalActionSandboxFailureProvenance,
      evidenceIds: mockExternalActionSandboxFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?:
    | ExternalActionSandboxInput["scenario"]
    | ExternalActionAuditListInput["scenario"],
): ExternalActionSandboxScenario {
  // scenario 是测试控制开关；未知值回落 success，避免任意字符串制造新状态。
  if (
    scenario &&
    supportedScenarios.has(scenario as ExternalActionSandboxScenario)
  ) {
    return scenario as ExternalActionSandboxScenario;
  }

  return "success";
}

function findAction(
  actionType: ExternalActionSandboxActionType,
): ExternalActionSandboxAction {
  // 每种动作都必须有对应 fixture；缺失说明测试数据和 contract 不一致。
  const action = mockExternalActionSandboxActions.find(
    (candidate) => candidate.actionType === actionType,
  );

  if (!action) {
    throw new Error(`Missing mock external action fixture for ${actionType}`);
  }

  return action;
}

function hasMismatchedActionId(
  expectedAction: ExternalActionSandboxAction,
  input: ExternalActionSandboxInput,
): boolean {
  return Boolean(input.actionId && input.actionId !== expectedAction.actionId);
}

function hasBlankActionId(input: ExternalActionSandboxInput): boolean {
  return typeof input.actionId === "string" && input.actionId.trim() === "";
}

function operationResult(
  actionType: ExternalActionSandboxActionType,
  fixture: ExternalActionNoOpPayload,
  input: ExternalActionSandboxInput = {},
  // 所有外部动作共用同一套校验：scenario、actionId、actor/target 覆盖。
  // 即使返回 success，也只是 no-op 审计结果，不代表外部系统被调用。
): ExternalActionNoOpResult {
  const scenario = normalizeScenario(input.scenario);

  if (scenario === "failure") {
    return failure("EXTERNAL_ACTION_SANDBOX_MOCK_FAILED");
  }

  if (scenario === "empty") {
    return failure("EXTERNAL_ACTION_SANDBOX_EMPTY");
  }

  if (scenario === "pending") {
    return failure("EXTERNAL_ACTION_SANDBOX_PENDING");
  }

  if (hasBlankActionId(input)) {
    return failure("EXTERNAL_ACTION_SANDBOX_ACTION_ID_REQUIRED");
  }

  const expectedAction = findAction(actionType);

  if (hasMismatchedActionId(expectedAction, input)) {
    return failure("EXTERNAL_ACTION_SANDBOX_ACTION_NOT_FOUND");
  }

  const payload = clonePayload(fixture);
  const actorLabel = input.actorLabel?.trim();

  if (actorLabel) {
    // 允许测试或 UI 注入当前操作者名称，同时同步到审计记录里。
    payload.actorLabel = actorLabel;
    payload.auditRecord.actorLabel = actorLabel;
  }

  if (input.targetLabel?.trim()) {
    payload.targetLabel = input.targetLabel.trim();
    payload.auditRecord.targetLabel = input.targetLabel.trim();
  }

  return noOpSuccess(payload);
}

function auditResult(input: ExternalActionAuditListInput = {}): ExternalActionAuditResult {
  // 审计列表同样支持固定 scenario，便于页面测试 empty/pending/failure 状态。
  const scenario = normalizeScenario(input.scenario);

  switch (scenario) {
    case "empty":
      return auditSuccess(mockEmptyExternalActionAuditFixture);
    case "pending":
      return auditSuccess(mockPendingExternalActionSandboxFixture);
    case "failure":
      return failure("EXTERNAL_ACTION_SANDBOX_MOCK_FAILED");
    case "success":
    default:
      return auditSuccess(mockExternalActionSandboxFixture);
  }
}

export function createMockExternalActionSandboxService(): ExternalActionSandboxService {
  // 对外暴露的 service 形状与 live sandbox 保持一致；调用方无需知道当前是 mock。
  return {
    sendMessage(input = {}): ExternalActionNoOpResult {
      return operationResult("send_message", mockSendMessageNoOpFixture, input);
    },

    createCalendarEvent(input = {}): ExternalActionNoOpResult {
      return operationResult(
        "create_calendar_event",
        mockCreateCalendarEventNoOpFixture,
        input,
      );
    },

    deliverNotification(input = {}): ExternalActionNoOpResult {
      return operationResult(
        "deliver_notification",
        mockNotificationDeliveryNoOpFixture,
        input,
      );
    },

    listAuditRecords(input = {}): ExternalActionAuditResult {
      return auditResult(input);
    },
  };
}

export type {
  ExternalActionAuditResult,
  ExternalActionNoOpResult,
  ExternalActionSandboxService,
};
