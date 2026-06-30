import { NextResponse } from "next/server";
import {
  failure,
  RUNTIME_BOUNDARY_HEADER_VALUES,
  runtimeBoundaryHeaders,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../shared/errors/app-error";

// Deterministic error probe：用于验证失败 envelope、HTTP status 和 runtime boundary headers。
// 这里故意返回固定错误，不代表真实 provider 或业务能力失败。
export const dynamic = "force-dynamic";

const healthError = new AppError(
  "INTERNAL_ERROR",
  "A deterministic health failure was requested.",
);

export function GET(): Response {
  const mode = resolveFeatureMode();
  const errorContext = {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "mode is resolved by resolveFeatureMode() from ORBIT_FEATURE_MODE with mock as the fallback.",
    remediation:
      "Check ORBIT_FEATURE_MODE, confirm capability providers use the shared envelope, and verify no provider payload or relationship data was serialized.",
    service: "orbit-runtime",
  };

  return NextResponse.json(failure(healthError, errorContext), {
    headers: runtimeBoundaryHeaders(mode),
    status: getHttpStatusForAppErrorCode(healthError.code),
  });
}
