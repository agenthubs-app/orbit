import { NextResponse } from "next/server";

import type { MobileAuthFailure } from "../../../../features/auth/mobile-contract";
import {
  failure,
  runtimeBoundaryHeaders,
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
