export const MOBILE_AUTH_CALLBACK_URI = "orbit://account/oauth" as const;
export const MOBILE_AUTH_CODE_TTL_SECONDS = 120;
export const MOBILE_AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface MobileSessionUser {
  email: string;
  id: string;
  name: string;
}

export interface MobileSessionData {
  cookieHeader: string;
  expiresAt: string;
  user: MobileSessionUser;
}

export interface MobileGoogleStartInput {
  codeChallenge: string;
  next?: string;
  redirectUri: string;
  state: string;
}

export interface MobileGoogleBrokerRequest {
  codeChallenge: string;
  next: string;
  redirectUri: typeof MOBILE_AUTH_CALLBACK_URI;
  state: string;
}

export type MobileAuthErrorCode =
  | "MOBILE_AUTH_INVALID_INPUT"
  | "MOBILE_AUTH_INVALID_REDIRECT"
  | "MOBILE_AUTH_CONFIGURATION_UNAVAILABLE"
  | "MOBILE_AUTH_INVALID_BROKER_REQUEST"
  | "MOBILE_AUTH_CODE_EXPIRED"
  | "MOBILE_AUTH_CODE_USED"
  | "MOBILE_AUTH_STATE_MISMATCH"
  | "MOBILE_AUTH_PKCE_MISMATCH"
  | "MOBILE_AUTH_UNAUTHORIZED";

export interface MobileAuthFailure {
  error: {
    appCode:
      | "VALIDATION_ERROR"
      | "SERVICE_UNAVAILABLE"
      | "UNAUTHORIZED"
      | "CONFLICT";
    code: MobileAuthErrorCode;
    message: string;
  };
  success: false;
}

export type MobileAuthResult<TData> =
  | { data: TData; success: true }
  | MobileAuthFailure;
