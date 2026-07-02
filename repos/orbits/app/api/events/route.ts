import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import type {
  EventCrudImportErrorCode,
  EventCrudImportInput,
  ManualEventCreationInput,
} from "../../../features/events/event-crud-and-import/contract";
import {
  eventCrudImportErrorContext,
  eventCrudImportErrorToAppError,
  eventCrudImportFailureContext,
  eventCrudImportFailureToAppError,
} from "../../../features/events/event-crud-and-import/service";
import { createEventCrudAndImportService } from "../../../features/events/service-factory";

// Events route 提供活动列表读取和手动活动创建预览。
// 当前 mock 不写真实活动库；POST 只经过 event service 生成可复核结果。
export const dynamic = "force-dynamic";

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

function readEventListInput(request: Request): EventCrudImportInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
    sourceCaptureMethod: searchParams.get("sourceCaptureMethod"),
    statusFilter: searchParams.get("status"),
  };
}

type ManualEventCreationInputResult =
  | {
      success: true;
      input: ManualEventCreationInput;
    }
  | {
      success: false;
      errorCode: EventCrudImportErrorCode;
    };

async function readManualEventCreationInput(
  request: Request,
): Promise<ManualEventCreationInputResult> {
  // POST 同时支持表单和 JSON，便于页面 form action 与 API 测试共用一个端点。
  const searchParams = new URL(request.url).searchParams;
  const queryInput: ManualEventCreationInput = {
    scenario: searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      success: true,
      input: {
        ...queryInput,
        description: readFormText(formData, "description"),
        endsAt: readFormText(formData, "endsAt"),
        sourceNote: readFormText(formData, "sourceNote"),
        startsAt: readFormText(formData, "startsAt"),
        title: readFormText(formData, "title"),
        venue: readFormText(formData, "venue"),
      },
    };
  }

  if (!contentType.includes("application/json")) {
    return {
      success: true,
      input: queryInput,
    };
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return {
      success: true,
      input: queryInput,
    };
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return {
      success: false,
      errorCode: "EVENTS_REQUEST_BODY_INVALID",
    };
  }

  const body = isRecord(parsedBody) ? parsedBody : {};

  return {
    success: true,
    input: {
      ...queryInput,
      description:
        typeof body.description === "string" ? body.description : undefined,
      endsAt: typeof body.endsAt === "string" ? body.endsAt : undefined,
      sourceNote:
        typeof body.sourceNote === "string" ? body.sourceNote : undefined,
      startsAt: typeof body.startsAt === "string" ? body.startsAt : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      venue: typeof body.venue === "string" ? body.venue : undefined,
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  // GET 读取活动列表，不创建或导入活动。
  const mode = resolveFeatureMode();
  const eventService = createEventCrudAndImportService();
  const result = await eventService.listEvents(readEventListInput(request));

  if (result.success === false) {
    const appError = eventCrudImportFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventCrudImportFailureContext(result, mode)),
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

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const eventService = createEventCrudAndImportService();
  const inputResult = await readManualEventCreationInput(request);

  if (inputResult.success === false) {
    const appError = eventCrudImportErrorToAppError(inputResult.errorCode);

    return NextResponse.json(
      failure(
        appError,
        eventCrudImportErrorContext(inputResult.errorCode, mode),
      ),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  const result = await eventService.createEvent(inputResult.input);

  if (result.success === false) {
    const appError = eventCrudImportFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventCrudImportFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 201,
  });
}
