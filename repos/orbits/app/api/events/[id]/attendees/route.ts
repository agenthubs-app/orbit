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
} from "../../../../../features/acquisition/event-attendee-contract";
import { createEventAttendeeImportService } from "../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// attendees route 返回某个活动的参会者列表。
// route 只读取 relationshipStatusFilter/scenario；参会者来源和过滤逻辑在 acquisition service 中。
interface EventAttendeeRosterRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  context: EventAttendeeRosterRouteContext,
): Promise<Response> {
  // GET 是只读列表，不导入或创建联系人草稿。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const attendeeService = createEventAttendeeImportService();
  const result = await attendeeService.listEventAttendees({
    eventId: id,
    relationshipStatusFilter: searchParams.get("relationshipStatusFilter"),
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    // attendee import/list failure 使用 acquisition attendee contract 的上下文。
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
