// 账号认证能力边界:邮箱密码注册/校验 + OAuth 用户落库。
// 会话签发与 cookie 由 NextAuth(根目录 auth.ts)负责,本模块只管用户记录
// 与凭证校验,遵循 live-record-store 存储模式。
import type { AppErrorCode } from "../../shared/errors/app-error";

export const AUTH_USER_ERROR_CODES = [
  "AUTH_EMAIL_TAKEN",
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_INVALID_INPUT",
  "AUTH_LIVE_STORE_UNCONFIGURED",
] as const;

export type AuthUserErrorCode = (typeof AUTH_USER_ERROR_CODES)[number];

export interface AuthUserErrorDefinition {
  code: AuthUserErrorCode;
  appCode: AppErrorCode;
  message: string;
}

export const AUTH_USER_ERROR_DEFINITIONS = {
  AUTH_EMAIL_TAKEN: {
    code: "AUTH_EMAIL_TAKEN",
    appCode: "CONFLICT",
    message: "An account with this email already exists.",
  },
  AUTH_INVALID_CREDENTIALS: {
    code: "AUTH_INVALID_CREDENTIALS",
    appCode: "UNAUTHORIZED",
    message: "Email or password is incorrect.",
  },
  AUTH_INVALID_INPUT: {
    code: "AUTH_INVALID_INPUT",
    appCode: "VALIDATION_ERROR",
    message: "Email and password are required; password needs at least 8 characters.",
  },
  AUTH_LIVE_STORE_UNCONFIGURED: {
    code: "AUTH_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "Configure ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before using live auth.",
  },
} as const satisfies Record<AuthUserErrorCode, AuthUserErrorDefinition>;

export type AuthUserProvider = "credentials" | "google";

// 对外的用户形状;passwordHash 永不出现在这里。
export interface AuthUserDTO {
  id: string;
  email: string;
  displayName: string;
  provider: AuthUserProvider;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface VerifyCredentialsInput {
  email: string;
  password: string;
}

export interface OAuthUserInput {
  email: string;
  displayName?: string;
  provider: Exclude<AuthUserProvider, "credentials">;
  providerAccountId: string;
}

export interface AuthUserSuccess {
  data: { user: AuthUserDTO };
  state: "success";
}

export interface AuthUserFailure {
  error: AuthUserErrorDefinition;
  state: "failure";
}

export type AuthUserResult = AuthUserSuccess | AuthUserFailure;

export function authUserFailure(code: AuthUserErrorCode): AuthUserFailure {
  return { error: AUTH_USER_ERROR_DEFINITIONS[code], state: "failure" };
}

export function normalizeAuthEmail(value: string): string {
  return value.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidAuthEmail(value: string): boolean {
  return EMAIL_PATTERN.test(normalizeAuthEmail(value));
}

export const AUTH_PASSWORD_MIN_LENGTH = 8;
