import type { AppErrorCode } from "../../shared/errors/app-error";

export const ACCOUNT_SESSION_ERROR_CODES = [
  "DEMO_SIGN_IN_PENDING",
  "SIGNED_OUT",
  "ACCOUNT_REQUIRED",
] as const;

export type AccountSessionErrorCode =
  (typeof ACCOUNT_SESSION_ERROR_CODES)[number];

export type AccountSessionScenario =
  | "demo-sign-in"
  | "signed-out"
  | "pending"
  | "require-account";

export type AccountSessionViewState = "success" | "empty" | "pending";

export type MockSessionStatus = "signed-in" | "signed-out" | "pending";

export interface AccountSessionErrorDefinition {
  code: AccountSessionErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const ACCOUNT_SESSION_ERROR_DEFINITIONS = {
  DEMO_SIGN_IN_PENDING: {
    code: "DEMO_SIGN_IN_PENDING",
    appCode: "SERVICE_UNAVAILABLE",
    message: "Demo account sign-in is pending in the mock session.",
    recovery: "Render the pending state and keep the user inside the mock boundary.",
  },
  SIGNED_OUT: {
    code: "SIGNED_OUT",
    appCode: "UNAUTHORIZED",
    message: "No mock account is signed in.",
    recovery: "Use the deterministic demo sign-in path before reading account data.",
  },
  ACCOUNT_REQUIRED: {
    code: "ACCOUNT_REQUIRED",
    appCode: "UNAUTHORIZED",
    message:
      "A mock account is required before this relationship action can run.",
    recovery: "Return a controlled failure envelope with provenance context.",
  },
} as const satisfies Record<AccountSessionErrorCode, AccountSessionErrorDefinition>;

export interface AccountSessionProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-account-only";
}

export interface MockAccount {
  id: string;
  displayName: string;
  workspaceName: string;
  role: string;
  plan: "mock-pro";
}

export interface MockAccountUser {
  id: string;
  displayName: string;
  loginLabel: string;
  timezone: string;
}

export interface MockAccountProfile {
  headline: string;
  relationshipGoal: string;
  homeMarket: string;
  preferredFollowUpWindow: string;
}

export interface MockAccountSession {
  status: MockSessionStatus;
  mockSessionId: string | null;
  signedInAt: string | null;
  signedOutAt: string | null;
  expiresAt: string | null;
}

export interface AccountSessionPayload {
  state: AccountSessionViewState;
  session: MockAccountSession;
  account: MockAccount | null;
  user: MockAccountUser | null;
  profile: MockAccountProfile | null;
  provenance: AccountSessionProvenance;
  nextAction: string;
}

export interface AccountSessionSuccess {
  success: true;
  data: AccountSessionPayload;
}

export interface AccountSessionFailure {
  success: false;
  error: AccountSessionErrorDefinition & {
    state: "failure";
    provenance: AccountSessionProvenance;
    evidenceIds: readonly string[];
  };
}

export type AccountSessionResult =
  | AccountSessionSuccess
  | AccountSessionFailure;
