import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  businessCardScanOcrFailureContext,
  businessCardScanOcrFailureToAppError,
} from "../../../../features/acquisition/business-card-contract";
import {
  businessCardReviewFailureContext,
  businessCardReviewFailureToAppError,
  type BusinessCardReviewedFields,
} from "../../../../features/acquisition/business-card-review-contract";
import { createBusinessCardReviewService } from "../../../../features/acquisition/service-factory";
import { createBusinessCardScanOcrService } from "../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// contact draft detail route 同时支持读取 OCR 草稿和更新名片复核字段。
// GET 走 scan service，PATCH 走 review service；route 负责按 HTTP 方法分发。
interface ContactDraftLookupRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type PatchBody = {
  reviewedFields?: Partial<BusinessCardReviewedFields>;
  reviewerLabel?: string;
  scenario?: string;
};

// PATCH body 只允许 reviewedFields/reviewerLabel/scenario 三组字段进入 review service。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReviewedFields(
  value: unknown,
): Partial<BusinessCardReviewedFields> | undefined {
  // reviewedFields 是人工复核后的白名单字段，非字符串字段会被丢弃。
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    displayName:
      typeof value.displayName === "string" ? value.displayName : undefined,
    role: typeof value.role === "string" ? value.role : undefined,
    organization:
      typeof value.organization === "string" ? value.organization : undefined,
    email: typeof value.email === "string" ? value.email : undefined,
    phone: typeof value.phone === "string" ? value.phone : undefined,
  };
}

async function readPatchBody(request: Request): Promise<PatchBody> {
  // 空 body 或非法 JSON 回落为空对象，由 review service 返回具体校验状态。
  try {
    const body = await request.json();

    if (!isRecord(body)) {
      return {};
    }

    return {
      reviewedFields: parseReviewedFields(body.reviewedFields),
      reviewerLabel:
        typeof body.reviewerLabel === "string" ? body.reviewerLabel : undefined,
      scenario: typeof body.scenario === "string" ? body.scenario : undefined,
    };
  } catch {
    return {};
  }
}

export async function GET(
  request: Request,
  context: ContactDraftLookupRouteContext,
): Promise<Response> {
  // 查询草稿时只需要 draftId/scenario；OCR 数据来源和状态由 scan service 管。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");
  const scanService = createBusinessCardScanOcrService();
  const result = scanService.getBusinessCardDraft({
    draftId: id,
    scenario,
  });

  if (result.success === false) {
    // scan failure 使用 OCR contract 的错误上下文。
    const appError = businessCardScanOcrFailureToAppError(result);

    return NextResponse.json(
      failure(appError, businessCardScanOcrFailureContext(result, mode)),
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

export async function PATCH(
  request: Request,
  context: ContactDraftLookupRouteContext,
): Promise<Response> {
  // 更新复核字段不会直接创建联系人，只更新待确认 draft 的 review 状态。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const body = await readPatchBody(request);
  const reviewService = createBusinessCardReviewService();
  const result = reviewService.updateReviewDraft({
    draftId: id,
    reviewedFields: body.reviewedFields,
    reviewerLabel: body.reviewerLabel,
    scenario: searchParams.get("scenario") ?? body.scenario,
  });

  if (result.success === false) {
    // review failure 使用名片复核 contract 的错误上下文。
    const appError = businessCardReviewFailureToAppError(result);

    return NextResponse.json(
      failure(appError, businessCardReviewFailureContext(result, mode)),
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
