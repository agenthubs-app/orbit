import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  duplicateMergeFailureContext,
  duplicateMergeFailureToAppError,
  type DuplicateMergeApplyInput,
} from "../../../../../../features/acquisition/merge-contract";
import { createDuplicateMergeService } from "../../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// apply merge route 确认执行一条重复联系人合并建议。
// route 只解析 suggestionId/actorLabel/scenario；实际合并规则和冲突处理在 merge service 中。
interface ApplyDuplicateMergeRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFormText(
  formData: FormData,
  fieldName: string,
): string | undefined {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : undefined;
}

async function readApplyInput(
  request: Request,
  suggestionId: string,
): Promise<DuplicateMergeApplyInput> {
  const url = new URL(request.url);
  // suggestionId 固定来自 path，避免 body 修改要应用的合并建议。
  const queryInput: DuplicateMergeApplyInput = {
    suggestionId,
    actorLabel: url.searchParams.get("actorLabel"),
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径允许确认按钮传 actorLabel，用于审计谁执行了合并。
    const formData = await request.formData();

    return {
      ...queryInput,
      actorLabel:
        readFormText(formData, "actorLabel") ?? queryInput.actorLabel,
      scenario: readFormText(formData, "scenario") ?? queryInput.scenario,
    };
  }

  if (!contentType.includes("application/json")) {
    return queryInput;
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return queryInput;
  }

  const parsedBody: unknown = JSON.parse(rawBody);
  const body = isRecord(parsedBody) ? parsedBody : {};

  // JSON body 只允许补充 actor/scenario，业务目标仍由 path 控制。
  return {
    ...queryInput,
    actorLabel:
      typeof body.actorLabel === "string"
        ? body.actorLabel
        : queryInput.actorLabel,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

export async function POST(
  request: Request,
  context: ApplyDuplicateMergeRouteContext,
): Promise<Response> {
  // applyMergeSuggestion 是有状态动作，但 route 不直接改数据，只调用 service contract。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const mergeService = createDuplicateMergeService();
  const result = mergeService.applyMergeSuggestion(
    await readApplyInput(request, id),
  );

  if (result.success === false) {
    // 合并失败统一映射成 AppError/envelope。
    const appError = duplicateMergeFailureToAppError(result);

    return NextResponse.json(
      failure(appError, duplicateMergeFailureContext(result, mode)),
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
