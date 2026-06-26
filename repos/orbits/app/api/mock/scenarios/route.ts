import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  createMockScenarioService,
  mockScenarioFailureContext,
  mockScenarioFailureToAppError,
} from "../../../../shared/mock/scenarios";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const mode = resolveFeatureMode();
  const scenarioService = createMockScenarioService();
  const result = scenarioService.listScenarios();

  if (result.success === false) {
    const appError = mockScenarioFailureToAppError(result);

    return NextResponse.json(
      failure(appError, mockScenarioFailureContext(result, mode)),
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
