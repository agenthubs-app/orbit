import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  createMockDataResetService,
  mockResetFailureContext,
  mockResetFailureToAppError,
  type MockResetInput,
} from "../../../../shared/mock/reset";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBodyScenarioId(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as unknown;

    if (!isRecord(body) || typeof body.scenarioId !== "string") {
      return null;
    }

    return body.scenarioId;
  } catch {
    return null;
  }
}

async function readInput(request: Request): Promise<MockResetInput> {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenarioId:
      searchParams.get("scenario") ??
      searchParams.get("scenarioId") ??
      (await readBodyScenarioId(request)),
  };
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const resetService = createMockDataResetService();
  const result = resetService.resetMockData(await readInput(request));

  if (result.success === false) {
    const appError = mockResetFailureToAppError(result);

    return NextResponse.json(
      failure(appError, mockResetFailureContext(result, mode)),
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
