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

const supportedScenarios = new Set<AccountSessionScenario>([
  "demo-sign-in",
  "signed-out",
  "pending",
  "require-account",
]);

function clonePayload(payload: AccountSessionPayload): AccountSessionPayload {
  return JSON.parse(JSON.stringify(payload)) as AccountSessionPayload;
}

function success(payload: AccountSessionPayload): AccountSessionSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: AccountSessionFailure["error"]["code"]) {
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
  if (scenario && supportedScenarios.has(scenario as AccountSessionScenario)) {
    return scenario as AccountSessionScenario;
  }

  return "demo-sign-in";
}

export function createMockAccountSessionService(): AccountSessionService {
  const service: AccountSessionService = {
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
        return service.demoSignIn();
      }

      return failure("ACCOUNT_REQUIRED");
    },

    signOut() {
      return service.getSignedOutSession();
    },
  };

  return service;
}
