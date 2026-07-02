import {
  ACCOUNT_SESSION_ERROR_DEFINITIONS,
  type AccountSessionFailure,
  type AccountSessionPayload,
  type AccountSessionResult,
  type AccountSessionScenario,
  type AccountSessionSuccess,
} from "./contract";
import {
  mockAccountFailureProvenance,
  mockAccountSessionFixture,
  mockPendingDemoSignInFixture,
  mockSignedOutSessionFixture,
} from "./fixtures";
import type { AccountSessionService } from "./service";

export interface MockAccountSessionService extends AccountSessionService {
  demoSignIn: () => AccountSessionSuccess;
  getCurrentSession: (options?: {
    scenario?: AccountSessionScenario | string | null;
  }) => AccountSessionResult;
  getPendingDemoSignIn: () => AccountSessionSuccess;
  getSignedOutSession: () => AccountSessionSuccess;
  requireAccount: (
    scenario?: AccountSessionScenario | string | null,
  ) => AccountSessionResult;
  signOut: () => AccountSessionSuccess;
}

// Account session mock service 提供本地 demo 登录状态。
// 它不连接真实 auth provider，也不写 cookie/session storage；route 只用它模拟账号边界。
const supportedScenarios = new Set<AccountSessionScenario>([
  "demo-sign-in",
  "signed-out",
  "pending",
  "require-account",
]);

function clonePayload(payload: AccountSessionPayload): AccountSessionPayload {
  // session fixture 可能被 layout/view-model 读取后派生显示字段，返回 clone 保持只读。
  return JSON.parse(JSON.stringify(payload)) as AccountSessionPayload;
}

function success(payload: AccountSessionPayload): AccountSessionSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: AccountSessionFailure["error"]["code"]) {
  // ACCOUNT_REQUIRED 是本地 auth guard 失败，不暴露真实认证细节。
  const definition = ACCOUNT_SESSION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockAccountFailureProvenance,
      evidenceIds: mockAccountFailureProvenance.evidenceIds,
    },
  } satisfies AccountSessionFailure;
}

function normalizeScenario(
  scenario?: AccountSessionScenario | string | null,
): AccountSessionScenario {
  // 默认 demo-sign-in，让本地开发无需真实账号即可进入应用 shell。
  if (scenario && supportedScenarios.has(scenario as AccountSessionScenario)) {
    return scenario as AccountSessionScenario;
  }

  return "demo-sign-in";
}

export function createMockAccountSessionService(): MockAccountSessionService {
  // service 自引用用于保证 getCurrentSession/requireAccount/signOut 复用同一套状态 payload。
  const service: MockAccountSessionService = {
    demoSignIn() {
      return success(mockAccountSessionFixture);
    },

    getCurrentSession(options = {}) {
      switch (normalizeScenario(options.scenario)) {
        case "signed-out":
          return service.getSignedOutSession();
        case "pending":
          return service.getPendingDemoSignIn();
        case "require-account":
          return service.requireAccount("signed-out");
        case "demo-sign-in":
        default:
          return service.demoSignIn();
      }
    },

    getPendingDemoSignIn() {
      return success(mockPendingDemoSignInFixture);
    },

    getSignedOutSession() {
      return success(mockSignedOutSessionFixture);
    },

    requireAccount(scenario = "demo-sign-in"): AccountSessionResult {
      if (normalizeScenario(scenario) === "demo-sign-in") {
        return success(mockAccountSessionFixture);
      }

      return failure("ACCOUNT_REQUIRED");
    },

    signOut() {
      return service.getSignedOutSession();
    },
  };

  return service;
}
