import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  referralRecommendationFailureContext,
  referralRecommendationFailureToAppError,
  type ReferralRecommendationInput,
} from "../../../../features/acquisition/referral-contract";
import { createReferralRecommendationService } from "../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// referral route 根据指定来源生成推荐联系人草稿。
// route 兼容 query/form/json；推荐逻辑、去重和草稿状态由 referral service 负责。
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

async function readReferralRecommendationInput(
  request: Request,
): Promise<ReferralRecommendationInput> {
  const url = new URL(request.url);
  // queryInput 是基础输入，form/json body 可以覆盖对应字段。
  const queryInput: ReferralRecommendationInput = {
    sourceKind: url.searchParams.get("sourceKind"),
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径服务页面提交；sourceKind 决定推荐来源类型。
    const formData = await request.formData();

    return {
      ...queryInput,
      sourceKind:
        readFormText(formData, "sourceKind") ?? queryInput.sourceKind,
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

  // JSON 路径服务 fetch 调用，仍只允许 sourceKind/scenario 进入 service。
  return {
    ...queryInput,
    sourceKind:
      typeof body.sourceKind === "string"
        ? body.sourceKind
        : queryInput.sourceKind,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

export async function POST(request: Request): Promise<Response> {
  // 创建推荐草稿是资源创建语义；success 返回 201，其余状态返回 200。
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const service = createReferralRecommendationService();
  const result = await service.createReferralContactDrafts(
    await readReferralRecommendationInput(request),
  );

  if (result.success === false) {
    // referral failure 使用 acquisition referral contract 的上下文。
    const appError = referralRecommendationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, referralRecommendationFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: result.data.state === "success" ? 201 : 200,
  });
}
