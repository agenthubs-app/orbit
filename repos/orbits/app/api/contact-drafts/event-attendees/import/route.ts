import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  eventAttendeeImportFailureContext,
  eventAttendeeImportFailureToAppError,
  type EventAttendeeImportInput,
} from "../../../../../features/acquisition/event-attendee-contract";
import { createEventAttendeeImportService } from "../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// event-attendees import route 将活动参会者转成联系人草稿。
// route 兼容 query/form/json；活动读取、关系状态过滤和草稿生成都在 attendee import service 中。
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

async function readEventAttendeeImportInput(
  request: Request,
): Promise<EventAttendeeImportInput> {
  const url = new URL(request.url);
  // queryInput 是默认输入，body 可以覆盖 eventId 或 relationshipStatusFilter。
  const queryInput: EventAttendeeImportInput = {
    eventId: url.searchParams.get("eventId") ?? undefined,
    relationshipStatusFilter:
      url.searchParams.get("relationshipStatusFilter") ?? undefined,
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径服务活动页面的导入按钮。
    const formData = await request.formData();

    return {
      ...queryInput,
      eventId: readFormText(formData, "eventId") ?? queryInput.eventId,
      relationshipStatusFilter:
        readFormText(formData, "relationshipStatusFilter") ??
        queryInput.relationshipStatusFilter,
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

  // JSON 路径只读取白名单字段，不在 route 层查询或修改活动数据。
  return {
    ...queryInput,
    eventId:
      typeof body.eventId === "string" ? body.eventId : queryInput.eventId,
    relationshipStatusFilter:
      typeof body.relationshipStatusFilter === "string"
        ? body.relationshipStatusFilter
        : queryInput.relationshipStatusFilter,
  };
}

export async function POST(request: Request): Promise<Response> {
  // importEventAttendees 生成待确认草稿，不直接创建联系人。
  const mode = resolveFeatureMode();
  const importService = createEventAttendeeImportService();
  const result = importService.importEventAttendees(
    await readEventAttendeeImportInput(request),
  );

  if (result.success === false) {
    // attendee import failure 统一映射成 AppError/envelope。
    const appError = eventAttendeeImportFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventAttendeeImportFailureContext(result, mode)),
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
