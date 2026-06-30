import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  eventAttendeeRosterFailureContext,
  eventAttendeeRosterFailureToAppError,
  type EventAttendeeRosterInput,
} from "../../../../../../features/events/attendee-contract";
import { createEventAttendeeRosterService } from "../../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

// attendee roster import route 用于把活动参会者名册导入到活动上下文。
// route 只解析筛选条件；名册导入、资格判断和来源说明由 attendee roster service 负责。
interface EventAttendeeRosterImportRouteContext {
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

async function readEventAttendeeRosterImportInput(
  request: Request,
  eventId: string,
): Promise<EventAttendeeRosterInput> {
  const url = new URL(request.url);
  // eventId 固定来自 path，query/body 只提供筛选和 scenario。
  const queryInput: EventAttendeeRosterInput = {
    eventId,
    eligibleOnly: url.searchParams.get("eligibleOnly"),
    knownContactOnly: url.searchParams.get("knownContactOnly"),
    scenario: url.searchParams.get("scenario"),
    tagFilter: url.searchParams.get("tagFilter"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径服务活动页面上的筛选导入动作。
    const formData = await request.formData();

    return {
      ...queryInput,
      eligibleOnly: readFormText(formData, "eligibleOnly") ?? queryInput.eligibleOnly,
      knownContactOnly:
        readFormText(formData, "knownContactOnly") ??
        queryInput.knownContactOnly,
      tagFilter: readFormText(formData, "tagFilter") ?? queryInput.tagFilter,
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
    // malformed JSON 退回 query 输入，具体缺字段由 service 判断。
    return queryInput;
  }

  const body = isRecord(parsedBody) ? parsedBody : {};

  // JSON 路径允许 boolean 或 string，后续规范化交给 service contract。
  return {
    ...queryInput,
    eligibleOnly:
      typeof body.eligibleOnly === "boolean" ||
      typeof body.eligibleOnly === "string"
        ? body.eligibleOnly
        : queryInput.eligibleOnly,
    knownContactOnly:
      typeof body.knownContactOnly === "boolean" ||
      typeof body.knownContactOnly === "string"
        ? body.knownContactOnly
        : queryInput.knownContactOnly,
    tagFilter:
      typeof body.tagFilter === "string" ? body.tagFilter : queryInput.tagFilter,
  };
}

export async function POST(
  request: Request,
  context: EventAttendeeRosterImportRouteContext,
): Promise<Response> {
  // importAttendeeRoster 不在 route 层创建联系人，只导入活动参会者视图。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const rosterService = createEventAttendeeRosterService();
  const result = rosterService.importAttendeeRoster(
    await readEventAttendeeRosterImportInput(request, id),
  );

  if (result.success === false) {
    // roster failure 统一映射成 AppError/envelope。
    const appError = eventAttendeeRosterFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventAttendeeRosterFailureContext(result, mode)),
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
