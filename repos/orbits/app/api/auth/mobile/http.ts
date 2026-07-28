import { NextResponse } from "next/server";

import type {
  MobileAuthFailure,
  MobileSessionData,
} from "../../../../features/auth/mobile-contract";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import type { FeatureMode } from "../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../shared/errors/app-error";

export function mobileAuthFailureResponse(
  result: MobileAuthFailure,
  mode: FeatureMode,
): Response {
  const error = new AppError(result.error.appCode, result.error.message);

  return NextResponse.json(
    failure(error, {
      mobileAuthErrorCode: result.error.code,
      mode,
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(error.code),
    },
  );
}

export function mobileAuthUnauthorizedResponse(mode: FeatureMode): Response {
  return mobileAuthFailureResponse(
    {
      success: false,
      error: {
        appCode: "UNAUTHORIZED",
        code: "MOBILE_AUTH_UNAUTHORIZED",
        message: "Google 登录未完成，请返回 Orbit 重试。",
      },
    },
    mode,
  );
}

export function mobileAuthSessionResponse(
  data: MobileSessionData,
  mode: FeatureMode,
): Response {
  const response = NextResponse.json(success(data), {
    headers: runtimeBoundaryHeaders(mode),
  });
  const separatorIndex = data.cookieHeader.indexOf("=");
  const name = data.cookieHeader.slice(0, separatorIndex);
  const value = data.cookieHeader.slice(separatorIndex + 1);

  response.cookies.set({
    expires: new Date(data.expiresAt),
    httpOnly: true,
    name,
    path: "/",
    sameSite: "lax",
    secure: name.startsWith("__Secure-"),
    value,
  });

  return response;
}
