import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  referralRecommendationFailureContext,
  referralRecommendationFailureToAppError,
  type RecommendedContactConfirmInput,
} from "../../../../../../features/acquisition/referral-contract";
import { createReferralRecommendationService } from "../../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// recommended contact confirm route 用于确认一条推荐联系人草稿。
// route 只收集 recommendationId/actorLabel/scenario；确认后的状态变更由 referral service 负责。
interface ConfirmRecommendedContactRouteContext {
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

async function readConfirmInput(
  request: Request,
  recommendationId: string,
): Promise<RecommendedContactConfirmInput> {
  const url = new URL(request.url);
  // recommendationId 来自 path，actor/scenario 可从 query、form 或 JSON 读取。
  const queryInput: RecommendedContactConfirmInput = {
    recommendationId,
    actorLabel: url.searchParams.get("actorLabel"),
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单提交允许 actorLabel 覆盖 query，方便确认按钮携带操作者标签。
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

  // JSON body 只读取 actorLabel/scenario，不允许改 path 中的 recommendationId。
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
  context: ConfirmRecommendedContactRouteContext,
): Promise<Response> {
  // confirmRecommendedContact 返回确认后的草稿/联系人状态；route 不直接写联系人表。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const service = createReferralRecommendationService();
  const result = service.confirmRecommendedContact(
    await readConfirmInput(request, id),
  );

  if (result.success === false) {
    // 推荐确认失败仍使用 referral contract 的错误上下文。
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
    status: 200,
  });
}
