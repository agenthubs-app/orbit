import {
  PERMISSION_CAPABILITIES,
  PERMISSION_STATE_ERROR_DEFINITIONS,
  type PermissionCapability,
  type PermissionIntent,
  type PermissionRequestInput,
  type PermissionRequestPayload,
  type PermissionRequestResult,
  type PermissionRequestScenario,
  type PermissionRequestSuccess,
  type PermissionStateErrorCode,
  type PermissionStateFailure,
  type PermissionStateInput,
  type PermissionStatePayload,
  type PermissionStateResult,
  type PermissionStateScenario,
  type PermissionStateSuccess,
} from "./contract";
import {
  mockCalendarPermissionRequestFixture,
  mockEmptyPermissionStateFixture,
  mockPendingPermissionStateFixture,
  mockPermissionStateFailureProvenance,
  mockPermissionStateFixture,
  mockPermissionStates,
} from "./fixtures";
import type { PermissionStateService } from "./service";

// Permission mock service 模拟外部账号授权/设备权限前的 staged review。
// requestPermission 只创建本地可复核授权请求，不会打开 provider 授权页或读取外部账号。
const supportedStateScenarios = new Set<PermissionStateScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedRequestScenarios = new Set<PermissionRequestScenario>([
  "success",
  "empty",
  "pending",
  "failure",
  "blocked",
]);

const supportedCapabilities = new Set<PermissionCapability>(
  PERMISSION_CAPABILITIES,
);

const supportedIntents = new Set<PermissionIntent>([
  "sync-contacts",
  "connect-event-calendar",
  "review-email-context",
  "enable-notifications",
  "scan-business-card",
  "import-event-data",
  "analyze-chat-context",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // permissions 会被 UI 改状态展示，clone 后返回避免共享 fixture 被修改。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(payload: PermissionStatePayload): PermissionStateSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function requestSuccess(
  payload: PermissionRequestPayload,
): PermissionRequestSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: PermissionStateErrorCode): PermissionStateFailure {
  // 权限失败同样是本地受控失败，不代表真实账号授权 provider 返回错误。
  const definition = PERMISSION_STATE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockPermissionStateFailureProvenance,
      evidenceIds: mockPermissionStateFailureProvenance.evidenceIds,
    },
  };
}

function normalizeStateScenario(
  scenario?: PermissionStateInput["scenario"],
): PermissionStateScenario {
  if (scenario && supportedStateScenarios.has(scenario as PermissionStateScenario)) {
    return scenario as PermissionStateScenario;
  }

  return "success";
}

function normalizeRequestScenario(
  scenario?: PermissionRequestInput["scenario"],
): PermissionRequestScenario {
  // request 默认是 pending：权限请求天然需要用户复核，而不是立即成功授权。
  if (
    scenario &&
    supportedRequestScenarios.has(scenario as PermissionRequestScenario)
  ) {
    return scenario as PermissionRequestScenario;
  }

  return "pending";
}

function normalizeCapability(
  capability: PermissionRequestInput["capability"],
): PermissionCapability | null {
  // capability 是权限边界的核心，不支持的 capability 必须显式失败。
  if (supportedCapabilities.has(capability as PermissionCapability)) {
    return capability as PermissionCapability;
  }

  return null;
}

function normalizeIntent(intent?: PermissionRequestInput["intent"]): PermissionIntent {
  // intent 缺失时回落到 calendar 连接，用于保持旧调试入口稳定。
  if (intent && supportedIntents.has(intent as PermissionIntent)) {
    return intent as PermissionIntent;
  }

  return "connect-event-calendar";
}

function buildRequestPayload(
  capability: PermissionCapability,
  intent: PermissionIntent,
): PermissionRequestPayload {
  // calendar/connect-event-calendar 有专门 fixture；其它 capability 由 permission state 派生 request。
  if (capability === "calendar" && intent === "connect-event-calendar") {
    return mockCalendarPermissionRequestFixture;
  }

  const permission =
    mockPermissionStates.find((record) => record.capability === capability) ??
    mockPendingPermissionStateFixture.permissions[0];

  return {
    ...mockCalendarPermissionRequestFixture,
    request: {
      ...mockCalendarPermissionRequestFixture.request,
      id: `permission-request:${capability}:${intent}`,
      capability,
      intent,
      reviewLabel: `${permission.label} staged authorization review`,
      evidenceIds: permission.provenance.evidenceIds,
    },
    permission: {
      ...permission,
      status: "pending",
      authorizationStage: "staged-review",
      actionLabel: `Review ${permission.label.toLowerCase()} request`,
    },
    provenance: permission.provenance,
  };
}

export function createMockPermissionStateService(): PermissionStateService {
  // list 展示当前权限矩阵；request 创建 staged review，不改变真实授权状态。
  return {
    listPermissionStates(input = {}): PermissionStateResult {
      switch (normalizeStateScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyPermissionStateFixture);
        case "pending":
          return success(mockPendingPermissionStateFixture);
        case "failure":
          return failure("PERMISSION_STATE_MOCK_FAILED");
        case "success":
        default:
          return success(mockPermissionStateFixture);
      }
    },

    requestPermission(input): PermissionRequestResult {
      const scenario = normalizeRequestScenario(input.scenario);
      const capability = normalizeCapability(input.capability);

      if (!capability) {
        return failure("PERMISSION_CAPABILITY_NOT_FOUND");
      }

      if (scenario === "blocked") {
        return failure("PERMISSION_REQUEST_NOT_ALLOWED");
      }

      if (scenario === "failure") {
        return failure("PERMISSION_STATE_MOCK_FAILED");
      }

      return requestSuccess(
        buildRequestPayload(capability, normalizeIntent(input.intent)),
      );
    },
  };
}

export type { PermissionRequestResult, PermissionStateResult };
