// AuthUserService:注册、凭证校验、OAuth 用户落库。
// live 与 mock 共用同一实现(auth-user-service.ts),差别只在注入的存储。
import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  AuthUserFailure,
  AuthUserResult,
  OAuthUserInput,
  RegisterUserInput,
  VerifyCredentialsInput,
} from "./contract";

export interface AuthUserService {
  // 注册邮箱密码用户;邮箱重复返回 AUTH_EMAIL_TAKEN。
  registerUser: (input: RegisterUserInput) => Promise<AuthUserResult>;
  // 校验邮箱密码;不区分"用户不存在"与"密码错误",统一 AUTH_INVALID_CREDENTIALS。
  verifyCredentials: (input: VerifyCredentialsInput) => Promise<AuthUserResult>;
  // OAuth 登录成功后按邮箱取或建用户(IdP 已验证邮箱所有权)。
  getOrCreateOAuthUser: (input: OAuthUserInput) => Promise<AuthUserResult>;
}

export function authUserFailureToAppError(failure: AuthUserFailure): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function authUserFailureContext(
  failure: AuthUserFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLiveFailure = failure.error.code === "AUTH_LIVE_STORE_UNCONFIGURED";

  return {
    authErrorCode: failure.error.code,
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: isLiveFailure
      ? "Live auth failure came from configured storage setup."
      : "Auth failure came from deterministic credential rules.",
    service: isLiveFailure ? "auth-user-live" : "auth-user",
  };
}
