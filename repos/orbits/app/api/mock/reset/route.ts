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

// mock reset route 重置本地 mock 数据到指定场景。
// 这是开发/演示辅助入口，只作用于 mock state，不表示真实业务数据回滚。
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBodyScenarioId(request: Request): Promise<string | null> {
  // body 只读取 scenarioId；query 中的 scenario/scenarioId 优先级更高。
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

  // 支持 ?scenario=、?scenarioId= 和 JSON body.scenarioId 三种调用方式。
  return {
    scenarioId:
      searchParams.get("scenario") ??
      searchParams.get("scenarioId") ??
      (await readBodyScenarioId(request)),
  };
}

export async function POST(request: Request): Promise<Response> {
  // resetMockData 不触达 live 数据源，只重建 mock registry/state。
  const mode = resolveFeatureMode();
  const resetService = createMockDataResetService();
  const result = resetService.resetMockData(await readInput(request));

  if (result.success === false) {
    // mock reset failure 统一映射成 AppError/envelope。
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
