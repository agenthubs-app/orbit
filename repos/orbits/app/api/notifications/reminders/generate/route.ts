import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import type { ReminderScheduleNotificationGenerateInput } from "../../../../../features/notifications/contract";
import { createReminderScheduleNotificationService } from "../../../../../features/notifications/service-factory";
import {
  reminderScheduleNotificationFailureContext,
  reminderScheduleNotificationFailureToAppError,
} from "../../../../../features/notifications/service";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

// reminder generate route 根据输入生成提醒建议。
// route 只解析 JSON 参数；提醒选择、分组和是否可投递由 notification service 负责。
async function readJsonBody(request: Request): Promise<JsonRecord> {
  // 空 body 或非法 JSON 回落为空对象，让 service 使用默认生成策略或返回校验状态。
  try {
    const body = (await request.json()) as unknown;

    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as JsonRecord;
    }
  } catch {
    return {};
  }

  return {};
}

function readStringArray(value: unknown): readonly string[] | null {
  // frequencies 兼容数组和逗号字符串两种调用方式。
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return null;
}

function readNumber(value: unknown): number | null {
  // 数值参数兼容 JSON number 和表单风格字符串。
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readBoolean(value: unknown): boolean | null {
  // includeGroupedLowPriority 兼容 boolean 和 "true"/"false" 字符串。
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function readInput(
  request: Request,
): Promise<ReminderScheduleNotificationGenerateInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  // scenario query 优先于 body，便于 mock 场景调试。
  return {
    dueWithinDays: readNumber(body.dueWithinDays),
    frequencies: readStringArray(body.frequencies),
    includeGroupedLowPriority: readBoolean(body.includeGroupedLowPriority),
    limit: readNumber(body.limit),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
  };
}

export async function POST(request: Request): Promise<Response> {
  // generateReminders 生成的是提醒候选/计划，不在 route 层投递通知。
  const mode = resolveFeatureMode();
  const notificationService = createReminderScheduleNotificationService();
  const result = await notificationService.generateReminders(await readInput(request));

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
