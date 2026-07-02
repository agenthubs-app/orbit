import type { ApiErrorContext } from "../../shared/api/envelope";
import {
  RUNTIME_BOUNDARY_HEADER_VALUES,
} from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  AccountSessionFailure,
  AccountSessionResult,
  AccountSessionScenario,
  AccountSessionSuccess,
} from "./contract";

export type AccountSessionServiceResult<TResult = AccountSessionResult> =
  | TResult
  | Promise<TResult>;

// AccountSessionService 定义账号会话能力边界。
// 当前 mock-first 实现服务登录页和权限守卫；真实认证接入时应保持同一 contract。
export interface AccountSessionService {
  // 创建演示登录态。
  demoSignIn: () => AccountSessionServiceResult<AccountSessionSuccess | AccountSessionResult>;
  // 读取当前会话，scenario 用于测试不同认证状态。
  getCurrentSession: (options?: {
    scenario?: AccountSessionScenario | string | null;
  }) => AccountSessionServiceResult;
  // 返回等待 demo 登录确认的会话状态。
  getPendingDemoSignIn: () => AccountSessionServiceResult<AccountSessionSuccess>;
  // 返回明确登出的会话状态。
  getSignedOutSession: () => AccountSessionServiceResult<AccountSessionSuccess>;
  // 页面守卫使用：未登录时返回领域失败，而不是让 UI 猜测。
  requireAccount: (
    scenario?: AccountSessionScenario | string | null,
  ) => AccountSessionServiceResult;
  // 执行登出语义；当前 mock 不触碰真实认证 provider。
  signOut: () => AccountSessionServiceResult<AccountSessionSuccess | AccountSessionResult>;
}

// 将账号领域失败转换成统一 AppError。
export function accountSessionFailureToAppError(
  failure: AccountSessionFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

// 账号错误上下文用于 API envelope，明确 mock 认证边界。
export function accountSessionFailureContext(
  failure: AccountSessionFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLiveFailure =
    failure.error.code === "ACCOUNT_LIVE_STORE_UNCONFIGURED";

  return {
    accountErrorCode: failure.error.code,
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: isLiveFailure
      ? "Live account session failure came from configured storage setup."
      : "Mock account session failure came from deterministic fixture rules.",
    service: isLiveFailure ? "account-session-live" : "mock-account-session",
  };
}
