import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import { createAiProviderService } from "../../../../../shared/ai/service-factory";
import {
  aiProviderFailureContext,
  aiProviderFailureToAppError,
  type AiProviderRunResult,
} from "../../../../../shared/ai/provider";

export const dynamic = "force-dynamic";

interface AiProviderRunRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function responseForResult(
  result: AiProviderRunResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = aiProviderFailureToAppError(result);

    return NextResponse.json(
      failure(appError, aiProviderFailureContext(result, mode)),
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

export async function GET(
  request: Request,
  context: AiProviderRunRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");
  const service = createAiProviderService();
  const result = service.getRun({
    runId: id,
    scenario,
  });

  return responseForResult(result, mode);
}
