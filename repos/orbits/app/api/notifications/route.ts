import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import type { ReminderScheduleNotificationListInput } from "../../../features/notifications/contract";
import { createReminderScheduleNotificationService } from "../../../features/notifications/service-factory";
import {
  reminderScheduleNotificationFailureContext,
  reminderScheduleNotificationFailureToAppError,
} from "../../../features/notifications/service";

export const dynamic = "force-dynamic";

// notifications route 返回提醒/通知列表。
// route 只解析筛选参数；分组、优先级和提醒生成逻辑由 notification service 负责。
function readLimit(searchParams: URLSearchParams): number | null {
  const rawLimit = searchParams.get("limit");

  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number(rawLimit);

  // 非法 limit 回落为 null，由 service 使用默认数量。
  return Number.isFinite(parsedLimit) ? parsedLimit : null;
}

function readInput(request: Request): ReminderScheduleNotificationListInput {
  const searchParams = new URL(request.url).searchParams;

  // 这里是只读筛选输入，不触发 reminder 生成。
  return {
    frequency: searchParams.get("frequency"),
    limit: readLimit(searchParams),
    priority: searchParams.get("priority"),
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  // GET 是只读通知视图，不投递真实通知。
  const mode = resolveFeatureMode();
  const notificationService = createReminderScheduleNotificationService();
  const result = notificationService.listNotifications(readInput(request));

  if (result.success === false) {
    // notification failure 统一映射成 AppError/envelope。
    const appError = reminderScheduleNotificationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, reminderScheduleNotificationFailureContext(result, mode)),
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
