import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import type { PermissionRequestInput } from "../../../../../features/permissions/contract";
import { createPermissionStateService } from "../../../../../features/permissions/service-factory";
import {
  permissionStateFailureContext,
  permissionStateFailureToAppError,
} from "../../../../../features/permissions/service";

export const dynamic = "force-dynamic";

// calendar permission request route 用于请求日历能力授权。
// route 固定 capability=calendar；授权状态机和安全边界由 permission service 负责。
async function readCalendarPermissionInput(
  request: Request,
): Promise<PermissionRequestInput> {
  const scenario = new URL(request.url).searchParams.get("scenario");

  // body 可选；默认 intent 表示连接活动日历。
  try {
    const body = (await request.json()) as Partial<PermissionRequestInput>;
    const safeBody = body && typeof body === "object" ? body : {};

    return {
      capability: "calendar",
      intent: safeBody.intent ?? "connect-event-calendar",
      scenario: scenario ?? safeBody.scenario,
    };
  } catch {
    return {
      capability: "calendar",
      intent: "connect-event-calendar",
      scenario,
    };
  }
}

export async function POST(request: Request): Promise<Response> {
  // requestPermission 只是进入授权请求流程，route 不直接访问真实日历。
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const permissionService = createPermissionStateService(mode);
  const result = await permissionService.requestPermission(
    await readCalendarPermissionInput(request),
  );

  if (result.success === false) {
    // permission failure 统一映射成 AppError/envelope。
    const appError = permissionStateFailureToAppError(result);

    return NextResponse.json(
      failure(appError, permissionStateFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
