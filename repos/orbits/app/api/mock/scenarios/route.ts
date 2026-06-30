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

// mock scenarios route 返回可用的演示/测试场景列表。
// route 不修改状态，只读取 shared mock scenario registry。
export async function GET(): Promise<Response> {
  // mode header 仍会输出，方便调试当前 runtime boundary。
  const mode = resolveFeatureMode();
  const scenarioService = createMockScenarioService();
  const result = scenarioService.listScenarios();

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
