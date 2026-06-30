import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  createRelationshipValueScoringService,
  relationshipValueFailureContext,
  relationshipValueFailureToAppError,
} from "../../../../../features/analysis/service-factory";
import type {
  RelationshipValueRecomputeInput,
  RelationshipValueResult,
} from "../../../../../features/analysis/value-contract";

export const dynamic = "force-dynamic";

// recompute route 用于重新生成关系价值评分。
// route 只做 body 解析和基础类型归一；具体重算、校验和 provenance 由 service 负责。
function responseForResult(
  result: RelationshipValueResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // 所有重算失败都通过 analysis contract 映射为标准 API 错误。
  if (result.success === false) {
    const appError = relationshipValueFailureToAppError(result);

    return NextResponse.json(
      failure(appError, relationshipValueFailureContext(result, mode)),
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

function isObjectBody(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBody(
  body: Record<string, unknown>,
  scenario: string | null,
): RelationshipValueRecomputeInput {
  // evidenceIds 只接受字符串数组；缺失时传 null 表示由 service 使用默认 evidence。
  const evidenceIds = Array.isArray(body.evidenceIds)
    ? body.evidenceIds.filter((evidenceId): evidenceId is string => {
        return typeof evidenceId === "string";
      })
    : null;

  return {
    // demo-connection-1 是无 body 调用时的稳定默认对象，方便本地调试和 smoke flow。
    connectionId:
      typeof body.connectionId === "string"
        ? body.connectionId
        : "demo-connection-1",
    evidenceIds,
    scenario,
  };
}

function acceptsJsonBody(request: Request): boolean {
  // 该接口只解析 JSON；其他 content type 走默认重算输入。
  return (request.headers.get("content-type") ?? "")
    .toLowerCase()
    .includes("application/json");
}

export async function POST(request: Request): Promise<Response> {
  // scenario 仍从 query 读取，避免 body 中 mock 状态和目标 connection 混在一起。
  const mode = resolveFeatureMode();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const relationshipValueService =
    createRelationshipValueScoringService();

  if (request.body === null || !acceptsJsonBody(request)) {
    // 没有 JSON body 时使用稳定默认输入，而不是让 JSON parser 抛错。
    return responseForResult(
      relationshipValueService.recomputeRelationshipValue(
        normalizeBody({}, scenario),
      ),
      mode,
    );
  }

  try {
    const body = await request.json();

    // JSON 顶层必须是对象；数组或 primitive 会走 service 的 invalid body 分支。
    if (!isObjectBody(body)) {
      return responseForResult(
        relationshipValueService.invalidRecomputeBody(),
        mode,
      );
    }

    return responseForResult(
      relationshipValueService.recomputeRelationshipValue(
        normalizeBody(body, scenario),
      ),
      mode,
    );
  } catch {
    return responseForResult(
      relationshipValueService.invalidRecomputeBody(),
      mode,
    );
  }
}
