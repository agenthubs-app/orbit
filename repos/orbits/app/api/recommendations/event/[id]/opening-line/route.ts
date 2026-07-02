import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import { createEventRecommendationService } from "../../../../../../features/recommendations/service-factory";
import {
  eventRecommendationFailureContext,
  eventRecommendationFailureToAppError,
} from "../../../../../../features/recommendations/service";
import type { EventOpeningLineInput } from "../../../../../../features/recommendations/contract";

export const dynamic = "force-dynamic";

// opening-line route 为活动中的某位参会者生成开场白建议。
// route 兼容 query/form/json；文案生成和证据选择由 event recommendation service 负责。
interface EventOpeningLineRouteContext {
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

async function readOpeningLineInput(
  request: Request,
  eventId: string,
): Promise<EventOpeningLineInput> {
  const url = new URL(request.url);
  // eventId 固定来自 path，attendeeId/style 可以由 query 或 body 提供。
  const queryInput: EventOpeningLineInput = {
    attendeeId: url.searchParams.get("attendeeId"),
    eventId,
    scenario: url.searchParams.get("scenario"),
    style: url.searchParams.get("style"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径服务活动页的一键生成开场白按钮。
    const formData = await request.formData();

    return {
      ...queryInput,
      attendeeId:
        readFormText(formData, "attendeeId") ?? queryInput.attendeeId,
      style: readFormText(formData, "style") ?? queryInput.style,
    };
  }

  if (!contentType.includes("application/json")) {
    return queryInput;
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return queryInput;
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    // malformed JSON 回落 query 输入，保持标准 envelope 响应。
    return queryInput;
  }

  const body = isRecord(parsedBody) ? parsedBody : {};

  // JSON body 只允许 attendeeId/style，不允许改写 path eventId。
  return {
    ...queryInput,
    attendeeId:
      typeof body.attendeeId === "string"
        ? body.attendeeId
        : queryInput.attendeeId,
    style: typeof body.style === "string" ? body.style : queryInput.style,
  };
}

export async function POST(
  request: Request,
  context: EventOpeningLineRouteContext,
): Promise<Response> {
  // composeOpeningLine 返回建议文案，不直接发送消息或创建 follow-up。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const recommendationService = createEventRecommendationService();
  const result = await recommendationService.composeOpeningLine(
    await readOpeningLineInput(request, id),
  );

  if (result.success === false) {
    // event recommendation failure 统一映射成 AppError/envelope。
    const appError = eventRecommendationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventRecommendationFailureContext(result, mode)),
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
