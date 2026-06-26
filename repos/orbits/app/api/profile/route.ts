import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createProfileService } from "../../../features/profile/service-factory";
import type {
  ManualProfileUpdateInput,
  ProfileScenario,
} from "../../../features/profile/contract";
import {
  profileFailureContext,
  profileFailureToAppError,
} from "../../../features/profile/service";

export const dynamic = "force-dynamic";

function getScenario(request: Request): ProfileScenario | undefined {
  const scenario = new URL(request.url).searchParams.get("scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "complete") {
    return scenario;
  }

  return undefined;
}

async function readProfileUpdateInput(
  request: Request,
): Promise<ManualProfileUpdateInput> {
  try {
    const body = (await request.json()) as ManualProfileUpdateInput;

    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export function GET(request: Request): Response {
  const mode = resolveFeatureMode();
  const profileService = createProfileService();
  const result = profileService.getProfile({
    scenario: getScenario(request),
  });

  if (result.success === false) {
    const appError = profileFailureToAppError(result);

    return NextResponse.json(
      failure(appError, profileFailureContext(result, mode)),
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

export async function PUT(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const profileService = createProfileService();
  const result = profileService.updateProfile(
    await readProfileUpdateInput(request),
  );

  if (result.success === false) {
    const appError = profileFailureToAppError(result);

    return NextResponse.json(
      failure(appError, profileFailureContext(result, mode)),
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
