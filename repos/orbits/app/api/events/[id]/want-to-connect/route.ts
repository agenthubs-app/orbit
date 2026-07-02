import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  wantConnectFailureContext,
  wantConnectFailureToAppError,
  type WantConnectIntentInput,
} from "../../../../../features/events/want-connect/contract";
import { createWantConnectService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

// want-to-connect route 记录用户在活动中想认识某人的意图。
// route 只解析 actor/target contact id；匹配、冲突和状态更新由 want-connect service 决定。
interface WantConnectRouteContext {
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

async function readWantConnectInput(
  request: Request,
  eventId: string,
): Promise<WantConnectIntentInput> {
  const url = new URL(request.url);
  // targetContactId 带 demo 默认值，actorContactId 可由调用方显式提供。
  const queryInput: WantConnectIntentInput = {
    actorContactId: url.searchParams.get("actorContactId"),
    eventId,
    scenario: url.searchParams.get("scenario"),
    targetContactId:
      url.searchParams.get("targetContactId") ?? "contact:priya-shah",
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径服务活动页上的“想认识”按钮。
    const formData = await request.formData();

    return {
      ...queryInput,
      actorContactId:
        readFormText(formData, "actorContactId") ??
        queryInput.actorContactId,
      targetContactId:
        readFormText(formData, "targetContactId") ??
        queryInput.targetContactId,
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
    // malformed JSON 回落 query/default 输入，保持 response envelope 稳定。
    return queryInput;
  }

  const body = isRecord(parsedBody) ? parsedBody : {};

  // JSON 路径只允许修改 actor/target，不允许改 path 中的 eventId。
  return {
    ...queryInput,
    actorContactId:
      typeof body.actorContactId === "string"
        ? body.actorContactId
        : queryInput.actorContactId,
    targetContactId:
      typeof body.targetContactId === "string"
        ? body.targetContactId
        : queryInput.targetContactId,
  };
}

export async function POST(
  request: Request,
  context: WantConnectRouteContext,
): Promise<Response> {
  // createWantToConnectIntent 是有状态动作，但 route 不直接写活动匹配结果。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const wantConnectService = createWantConnectService();
  const result = await wantConnectService.createWantToConnectIntent(
    await readWantConnectInput(request, id),
  );

  if (result.success === false) {
    // want-connect failure 统一映射成 AppError/envelope。
    const appError = wantConnectFailureToAppError(result);

    return NextResponse.json(
      failure(appError, wantConnectFailureContext(result, mode)),
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
