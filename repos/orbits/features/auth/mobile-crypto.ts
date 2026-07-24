import { createHash } from "node:crypto";

import { EncryptJWT, SignJWT, jwtDecrypt, jwtVerify } from "jose";
import { encode } from "next-auth/jwt";

import {
  MOBILE_AUTH_CALLBACK_URI,
  MOBILE_AUTH_SESSION_MAX_AGE_SECONDS,
  type MobileAuthFailure,
  type MobileAuthResult,
  type MobileGoogleBrokerRequest,
  type MobileGoogleStartInput,
  type MobileSessionData,
  type MobileSessionUser,
} from "./mobile-contract";

const BROKER_ISSUER = "orbit-mobile-auth";
const BROKER_AUDIENCE = "orbit-ios-broker";
const SESSION_AUDIENCE = "orbit-ios-session-exchange";
const BROKER_TTL_SECONDS = 5 * 60;
const PKCE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;
const STATE_PATTERN = /^[A-Za-z0-9._~-]{16,256}$/u;

function secretKey(secret: string): Uint8Array {
  return createHash("sha256").update(secret).digest();
}

function invalidInput(
  code: MobileAuthFailure["error"]["code"] = "MOBILE_AUTH_INVALID_INPUT",
): MobileAuthFailure {
  return {
    success: false,
    error: {
      appCode: "VALIDATION_ERROR",
      code,
      message: "登录请求无效，请返回 Orbit 重试。",
    },
  };
}

function isSafeNextPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\0")
  );
}

export function validateMobileGoogleStart(
  input: MobileGoogleStartInput,
): MobileAuthResult<MobileGoogleBrokerRequest> {
  if (input.redirectUri !== MOBILE_AUTH_CALLBACK_URI) {
    return invalidInput("MOBILE_AUTH_INVALID_REDIRECT");
  }

  const next = input.next ?? "/profile";
  if (
    !PKCE_PATTERN.test(input.codeChallenge) ||
    !STATE_PATTERN.test(input.state) ||
    !isSafeNextPath(next)
  ) {
    return invalidInput();
  }

  return {
    success: true,
    data: {
      codeChallenge: input.codeChallenge,
      next,
      redirectUri: MOBILE_AUTH_CALLBACK_URI,
      state: input.state,
    },
  };
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function signMobileBrokerRequest(
  payload: MobileGoogleBrokerRequest,
  secret: string,
  now = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(BROKER_ISSUER)
    .setAudience(BROKER_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + BROKER_TTL_SECONDS)
    .sign(secretKey(secret));
}

export async function verifyMobileBrokerRequest(
  token: string,
  secret: string,
  now = new Date(),
): Promise<MobileAuthResult<MobileGoogleBrokerRequest>> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      algorithms: ["HS256"],
      audience: BROKER_AUDIENCE,
      currentDate: now,
      issuer: BROKER_ISSUER,
    });
    const result = validateMobileGoogleStart({
      codeChallenge:
        typeof payload.codeChallenge === "string" ? payload.codeChallenge : "",
      next: typeof payload.next === "string" ? payload.next : undefined,
      redirectUri:
        typeof payload.redirectUri === "string" ? payload.redirectUri : "",
      state: typeof payload.state === "string" ? payload.state : "",
    });

    return result.success
      ? result
      : invalidInput("MOBILE_AUTH_INVALID_BROKER_REQUEST");
  } catch {
    return invalidInput("MOBILE_AUTH_INVALID_BROKER_REQUEST");
  }
}

export async function encryptMobileSession(
  cookieHeader: string,
  secret: string,
  now = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);

  return new EncryptJWT({ cookieHeader })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(BROKER_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + BROKER_TTL_SECONDS)
    .encrypt(secretKey(secret));
}

export async function decryptMobileSession(
  value: string,
  secret: string,
  now = new Date(),
): Promise<string> {
  const { payload } = await jwtDecrypt(value, secretKey(secret), {
    audience: SESSION_AUDIENCE,
    contentEncryptionAlgorithms: ["A256GCM"],
    currentDate: now,
    issuer: BROKER_ISSUER,
    keyManagementAlgorithms: ["dir"],
  });

  if (typeof payload.cookieHeader !== "string") {
    throw new Error("Invalid encrypted mobile session");
  }

  return payload.cookieHeader;
}

export async function issueAuthJsCookie({
  now,
  origin,
  secret,
  user,
}: {
  now: Date;
  origin: string;
  secret: string;
  user: MobileSessionUser;
}): Promise<MobileSessionData> {
  const secure = new URL(origin).protocol === "https:";
  const cookieName = `${secure ? "__Secure-" : ""}authjs.session-token`;
  const token = await encode({
    maxAge: MOBILE_AUTH_SESSION_MAX_AGE_SECONDS,
    salt: cookieName,
    secret,
    token: {
      email: user.email,
      name: user.name,
      sub: user.id,
    },
  });

  return {
    cookieHeader: `${cookieName}=${token}`,
    expiresAt: new Date(
      now.getTime() + MOBILE_AUTH_SESSION_MAX_AGE_SECONDS * 1000,
    ).toISOString(),
    user,
  };
}
