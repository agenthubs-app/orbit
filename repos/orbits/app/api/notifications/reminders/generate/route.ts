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

async function readJsonBody(request: Request): Promise<JsonRecord> {
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

  return {
    dueWithinDays: readNumber(body.dueWithinDays),
    frequencies: readStringArray(body.frequencies),
    includeGroupedLowPriority: readBoolean(body.includeGroupedLowPriority),
    limit: readNumber(body.limit),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
  };
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const notificationService = createReminderScheduleNotificationService();
  const result = notificationService.generateReminders(await readInput(request));

  if (result.success === false) {
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
