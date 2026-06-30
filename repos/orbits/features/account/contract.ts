import type { AppErrorCode } from "../../shared/errors/app-error";

// Account contract 描述账号会话在 mock-first 系统里的稳定形状。
// UI 和 API route 只依赖这些类型，不需要知道底层是真认证还是演示会话。
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

// 领域错误定义统一带 appCode 和 recovery，方便 route 生成一致的错误 envelope。
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

// provenance 说明账号数据只来自 demo account 边界，不代表真实认证 provider。
export interface AccountSessionProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-account-only";
}

// MockAccount 是 workspace 级别的账号信息。
export interface MockAccount {
  id: string;
  displayName: string;
  workspaceName: string;
  role: string;
  plan: "mock-pro";
}

// MockAccountUser 是当前操作者视角的用户资料。
export interface MockAccountUser {
  id: string;
  displayName: string;
  loginLabel: string;
  timezone: string;
}

// MockAccountProfile 是 onboarding/profile 页面需要展示的关系目标摘要。
export interface MockAccountProfile {
  headline: string;
  relationshipGoal: string;
  homeMarket: string;
  preferredFollowUpWindow: string;
}

// MockAccountSession 只表示演示登录态，不包含真实 token 或 cookie。
export interface MockAccountSession {
  status: MockSessionStatus;
  mockSessionId: string | null;
  signedInAt: string | null;
  signedOutAt: string | null;
  expiresAt: string | null;
}

// AccountSessionPayload 是成功响应的完整读模型。
// account/user/profile 允许为 null，用于 signed-out 或 pending 状态。
export interface AccountSessionPayload {
  state: AccountSessionViewState;
  session: MockAccountSession;
  account: MockAccount | null;
  user: MockAccountUser | null;
  profile: MockAccountProfile | null;
  provenance: AccountSessionProvenance;
  nextAction: string;
}

// 所有服务结果都使用 success discriminant，调用方先判断 success 再读 data/error。
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
