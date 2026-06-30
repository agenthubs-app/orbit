import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  createMockScenarioService,
  mockScenarioFailureContext,
  mockScenarioFailureToAppError,
} from "../../../../../../shared/mock/scenarios";

export const dynamic = "force-dynamic";

// mock scenario activation route 切换当前 mock 场景。
// id 来自 path，route 不读取 body，避免调用方改写目标场景。
interface MockScenarioActivationRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  _request: Request,
  context: MockScenarioActivationRouteContext,
): Promise<Response> {
  // activateScenario 只影响 mock 场景状态，不触达真实业务数据。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenarioService = createMockScenarioService();
  const result = scenarioService.activateScenario(id);

  if (result.success === false) {
    // mock scenario failure 统一映射成 AppError/envelope。
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
