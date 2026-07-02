import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  eventCrudImportFailureContext,
  eventCrudImportFailureToAppError,
} from "../../../../features/events/event-crud-and-import/service";
import { createEventCrudAndImportService } from "../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

// 单个 event 的详情入口。
// path param 提供 eventId，query scenario 用于 mock 场景切换；
// route 不直接组装活动详情，统一交给 event CRUD/import service。
interface EventDetailRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  context: EventDetailRouteContext,
): Promise<Response> {
  // 动态路由参数和 query 参数在这里收敛成 service input。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const eventService = createEventCrudAndImportService();
  const result = await eventService.getEvent({
    eventId: id,
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    // 事件不存在、场景失败等都按 service contract 映射到标准错误响应。
    const appError = eventCrudImportFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventCrudImportFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  // 成功时直接返回 service payload，保证页面和 API contract 共用同一数据结构。
  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
