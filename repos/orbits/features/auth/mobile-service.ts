import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { AuthUserService } from "./service";
import {
  MOBILE_AUTH_CODE_TTL_SECONDS,
  MOBILE_AUTH_SESSION_MAX_AGE_SECONDS,
  type MobileAuthErrorCode,
  type MobileAuthFailure,
  type MobileAuthResult,
  type MobileGoogleStartInput,
  type MobileSessionData,
  type MobileSessionUser,
} from "./mobile-contract";
import {
  decryptMobileSession,
  encryptMobileSession,
  issueAuthJsCookie,
  pkceChallenge,
  signMobileBrokerRequest,
  validateMobileGoogleStart,
  verifyMobileBrokerRequest,
} from "./mobile-crypto";
import type { MobileAuthExchangeProvider } from "./storage/mobile-auth-exchange-provider";

export type MobileAuthProviderId = "credentials" | "google";

export interface MobileCredentialsInput {
  email: string;
  password: string;
}

export interface MobileGoogleCompletionInput {
  brokerRequest: string;
  cookieHeader: string;
  user: MobileSessionUser;
}

export interface MobileGoogleExchangeInput {
  code: string;
  codeVerifier: string;
  state: string;
}

export interface MobileAuthService {
  enabledProviders: () => readonly MobileAuthProviderId[];
  issueCredentialsSession: (
    input: MobileCredentialsInput,
  ) => Promise<MobileAuthResult<MobileSessionData>>;
  createBrokerRequest: (
    input: MobileGoogleStartInput,
  ) => Promise<MobileAuthResult<{ request: string }>>;
  completeGoogleSession: (
    input: MobileGoogleCompletionInput,
  ) => Promise<
    MobileAuthResult<{
      code: string;
      next: string;
      redirectUri: "orbit://account/oauth";
      state: string;
    }>
  >;
  exchangeGoogleCode: (
    input: MobileGoogleExchangeInput,
  ) => Promise<MobileAuthResult<MobileSessionData>>;
}

export interface CreateMobileAuthServiceOptions {
  authUsers: AuthUserService;
  brokerSecret: string | null;
  exchangeProvider: MobileAuthExchangeProvider | null;
  isProviderEnabled: (providerId: "google") => boolean;
  now?: () => Date;
  origin: string;
  randomCode?: () => string;
}

function authFailure(
  code: MobileAuthErrorCode,
  appCode: MobileAuthFailure["error"]["appCode"],
  message: string,
): MobileAuthFailure {
  return {
    success: false,
    error: { appCode, code, message },
  };
}

function configurationFailure(): MobileAuthFailure {
  return authFailure(
    "MOBILE_AUTH_CONFIGURATION_UNAVAILABLE",
    "SERVICE_UNAVAILABLE",
    "登录服务暂时不可用，请稍后再试。",
  );
}

function unauthorizedFailure(): MobileAuthFailure {
  return authFailure(
    "MOBILE_AUTH_UNAUTHORIZED",
    "UNAUTHORIZED",
    "邮箱或密码不正确。",
  );
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function equalSecret(left: string, right: string): boolean {
  const leftValue = Buffer.from(left);
  const rightValue = Buffer.from(right);

  return (
    leftValue.length === rightValue.length &&
    timingSafeEqual(leftValue, rightValue)
  );
}

function isSessionCookie(value: string): boolean {
  return /^(?:__Secure-)?authjs\.session-token=[^;\s]+$/u.test(value);
}

function isSessionUser(value: MobileSessionUser): boolean {
  return Boolean(
    value &&
      value.id?.trim() &&
      value.email?.trim() &&
      value.name?.trim(),
  );
}

export function createMobileAuthService({
  authUsers,
  brokerSecret,
  exchangeProvider,
  isProviderEnabled,
  now = () => new Date(),
  origin,
  randomCode = () => randomBytes(32).toString("base64url"),
}: CreateMobileAuthServiceOptions): MobileAuthService {
  const consumedCodes = new Set<string>();

  function hasGoogleConfiguration(): boolean {
    return Boolean(
      brokerSecret && exchangeProvider && isProviderEnabled("google"),
    );
  }

  return {
    enabledProviders() {
      return [
        "credentials",
        ...(hasGoogleConfiguration() ? (["google"] as const) : []),
      ];
    },

    async issueCredentialsSession(input) {
      if (!brokerSecret) {
        return configurationFailure();
      }

      const result = await authUsers.verifyCredentials(input);

      if (result.state !== "success") {
        return result.error.code === "AUTH_LIVE_STORE_UNCONFIGURED"
          ? configurationFailure()
          : unauthorizedFailure();
      }

      return {
        success: true,
        data: await issueAuthJsCookie({
          now: now(),
          origin,
          secret: brokerSecret,
          user: {
            email: result.data.user.email,
            id: result.data.user.id,
            name: result.data.user.displayName,
          },
        }),
      };
    },

    async createBrokerRequest(input) {
      if (!hasGoogleConfiguration() || !brokerSecret) {
        return configurationFailure();
      }

      const validation = validateMobileGoogleStart(input);
      if (validation.success === false) {
        return validation;
      }

      return {
        success: true,
        data: {
          request: await signMobileBrokerRequest(
            validation.data,
            brokerSecret,
            now(),
          ),
        },
      };
    },

    async completeGoogleSession(input) {
      if (
        !hasGoogleConfiguration() ||
        !brokerSecret ||
        !exchangeProvider
      ) {
        return configurationFailure();
      }
      if (
        !isSessionCookie(input.cookieHeader) ||
        !isSessionUser(input.user)
      ) {
        return authFailure(
          "MOBILE_AUTH_UNAUTHORIZED",
          "UNAUTHORIZED",
          "Google 登录未完成，请返回 Orbit 重试。",
        );
      }

      const broker = await verifyMobileBrokerRequest(
        input.brokerRequest,
        brokerSecret,
        now(),
      );
      if (broker.success === false) {
        return broker;
      }

      const code = randomCode();
      if (!code) {
        return configurationFailure();
      }
      const timestamp = now();
      await exchangeProvider.save({
        codeChallenge: broker.data.codeChallenge,
        codeHash: hashValue(code),
        encryptedCookieHeader: await encryptMobileSession(
          input.cookieHeader,
          brokerSecret,
          timestamp,
        ),
        expiresAt: new Date(
          timestamp.getTime() + MOBILE_AUTH_CODE_TTL_SECONDS * 1000,
        ).toISOString(),
        issuedAt: timestamp.toISOString(),
        redirectUri: broker.data.redirectUri,
        state: broker.data.state,
        user: { ...input.user },
      });

      return {
        success: true,
        data: {
          code,
          next: broker.data.next,
          redirectUri: broker.data.redirectUri,
          state: broker.data.state,
        },
      };
    },

    async exchangeGoogleCode(input) {
      if (!brokerSecret || !exchangeProvider) {
        return configurationFailure();
      }
      if (!input.code || !input.codeVerifier || !input.state) {
        return authFailure(
          "MOBILE_AUTH_INVALID_INPUT",
          "VALIDATION_ERROR",
          "登录请求无效，请返回 Orbit 重试。",
        );
      }

      const codeHash = hashValue(input.code);
      const record = await exchangeProvider.consume(codeHash, now());

      if (!record) {
        return consumedCodes.has(codeHash)
          ? authFailure(
              "MOBILE_AUTH_CODE_USED",
              "CONFLICT",
              "这次登录已经完成，请直接返回 Orbit。",
            )
          : authFailure(
              "MOBILE_AUTH_CODE_EXPIRED",
              "UNAUTHORIZED",
              "这次登录已过期，请重新登录。",
            );
      }
      consumedCodes.add(codeHash);

      if (!equalSecret(record.state, input.state)) {
        return authFailure(
          "MOBILE_AUTH_STATE_MISMATCH",
          "UNAUTHORIZED",
          "登录校验失败，请返回 Orbit 重试。",
        );
      }
      if (!equalSecret(record.codeChallenge, pkceChallenge(input.codeVerifier))) {
        return authFailure(
          "MOBILE_AUTH_PKCE_MISMATCH",
          "UNAUTHORIZED",
          "登录校验失败，请返回 Orbit 重试。",
        );
      }

      try {
        const timestamp = now();

        return {
          success: true,
          data: {
            cookieHeader: await decryptMobileSession(
              record.encryptedCookieHeader,
              brokerSecret,
              timestamp,
            ),
            expiresAt: new Date(
              timestamp.getTime() +
                MOBILE_AUTH_SESSION_MAX_AGE_SECONDS * 1000,
            ).toISOString(),
            user: { ...record.user },
          },
        };
      } catch {
        return authFailure(
          "MOBILE_AUTH_INVALID_BROKER_REQUEST",
          "UNAUTHORIZED",
          "登录校验失败，请返回 Orbit 重试。",
        );
      }
    },
  };
}
