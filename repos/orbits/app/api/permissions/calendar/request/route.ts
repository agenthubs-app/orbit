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

async function readCalendarPermissionInput(
  request: Request,
): Promise<PermissionRequestInput> {
  const scenario = new URL(request.url).searchParams.get("scenario");

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
  const mode = resolveFeatureMode();
  const permissionService = createPermissionStateService();
  const result = permissionService.requestPermission(
    await readCalendarPermissionInput(request),
  );

  if (result.success === false) {
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
