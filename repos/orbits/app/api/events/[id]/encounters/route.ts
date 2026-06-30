import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  eventEncounterNoteFailureContext,
  eventEncounterNoteFailureToAppError,
  type EventEncounterNoteInput,
} from "../../../../../features/events/encounter-contract";
import { createEventEncounterNoteService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

// encounters route 用于在活动下记录一次与联系人的相遇笔记。
// route 兼容 query/form/json；笔记持久化、证据生成和状态判断由 encounter service 负责。
interface EventEncounterNoteRouteContext {
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

async function readEncounterNoteInput(
  request: Request,
  eventId: string,
): Promise<EventEncounterNoteInput> {
  const url = new URL(request.url);
  // 默认值服务 demo flow；真实调用可通过 query/form/json 覆盖 contactId/noteText。
  const queryInput: EventEncounterNoteInput = {
    contactId: url.searchParams.get("contactId") ?? "contact:priya-shah",
    eventId,
    noteText:
      url.searchParams.get("noteText") ??
      "Priya asked for a storage pilot introduction.",
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径服务活动现场快速记录。
    const formData = await request.formData();

    return {
      ...queryInput,
      contactId: readFormText(formData, "contactId") ?? queryInput.contactId,
      noteText: readFormText(formData, "noteText") ?? queryInput.noteText,
      scenario: readFormText(formData, "scenario") ?? queryInput.scenario,
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
    // malformed JSON 回落到 query/default 输入，保持 demo 入口可用。
    return queryInput;
  }

  const body = isRecord(parsedBody) ? parsedBody : {};

  // JSON 路径只读取 contactId/noteText/scenario 三个字段。
  return {
    ...queryInput,
    contactId:
      typeof body.contactId === "string"
        ? body.contactId
        : queryInput.contactId,
    noteText:
      typeof body.noteText === "string" ? body.noteText : queryInput.noteText,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

export async function POST(
  request: Request,
  context: EventEncounterNoteRouteContext,
): Promise<Response> {
  // 创建 encounter note 成功时是资源创建语义，返回 201。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const encounterNoteService = createEventEncounterNoteService();
  const result = encounterNoteService.createEncounterNote(
    await readEncounterNoteInput(request, id),
  );

  if (result.success === false) {
    // encounter failure 统一映射成 AppError/envelope。
    const appError = eventEncounterNoteFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventEncounterNoteFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: result.data.state === "success" ? 201 : 200,
  });
}
