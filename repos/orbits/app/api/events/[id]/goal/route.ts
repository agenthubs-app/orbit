import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  eventGoalReadinessFailureContext,
  eventGoalReadinessFailureToAppError,
  type EventGoalSetInput,
} from "../../../../../features/events/goal-readiness/contract";
import { createEventGoalAndReadinessService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

// event goal route 用于设置活动目标。
// route 只归一 goalText/selectedSuggestionId；目标建议、校验和 readiness 更新由 service 负责。
interface EventGoalRouteContext {
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

async function readGoalInput(
  request: Request,
  eventId: string,
): Promise<EventGoalSetInput> {
  const url = new URL(request.url);
  // eventId 来自 path，selectedSuggestionId 可以从 query 或 body 提供。
  const queryInput: EventGoalSetInput = {
    eventId,
    scenario: url.searchParams.get("scenario"),
    selectedSuggestionId: url.searchParams.get("selectedSuggestionId"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径服务活动准备页的目标选择/填写。
    const formData = await request.formData();

    return {
      ...queryInput,
      goalText: readFormText(formData, "goalText"),
      selectedSuggestionId:
        readFormText(formData, "selectedSuggestionId") ??
        queryInput.selectedSuggestionId,
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
    // malformed JSON 回落 query 输入，避免 route 层抛出非标准错误。
    return queryInput;
  }

  const body = isRecord(parsedBody) ? parsedBody : {};

  // JSON 路径只读取目标文本和建议 id，目标合法性由 service 判断。
  return {
    ...queryInput,
    goalText: typeof body.goalText === "string" ? body.goalText : undefined,
    selectedSuggestionId:
      typeof body.selectedSuggestionId === "string"
        ? body.selectedSuggestionId
        : queryInput.selectedSuggestionId,
  };
}

export async function PUT(
  request: Request,
  context: EventGoalRouteContext,
): Promise<Response> {
  // PUT 表示替换/设置当前活动目标，route 不直接改 readiness 明细。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const goalService = createEventGoalAndReadinessService();
  const result = await goalService.setGoal(await readGoalInput(request, id));

  if (result.success === false) {
    // goal/readiness failure 统一映射成 AppError/envelope。
    const appError = eventGoalReadinessFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventGoalReadinessFailureContext(result, mode)),
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
