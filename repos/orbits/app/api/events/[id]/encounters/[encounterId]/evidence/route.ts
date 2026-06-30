import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../../shared/errors/app-error";
import {
  eventEncounterNoteFailureContext,
  eventEncounterNoteFailureToAppError,
  type EventEncounterEvidenceInput,
} from "../../../../../../../features/events/encounter-contract";
import { createEventEncounterNoteService } from "../../../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

// encounter evidence route 为一次活动相遇生成/追加证据。
// route 固定使用 eventId 和 encounterId 两个 path 参数，body 只允许覆盖 scenario。
interface EventEncounterEvidenceRouteContext {
  params: Promise<{
    id: string;
    encounterId: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readEncounterEvidenceInput(
  request: Request,
  eventId: string,
  encounterId: string,
): Promise<EventEncounterEvidenceInput> {
  const url = new URL(request.url);
  // eventId/encounterId 都来自 path，避免 body 改写目标资源。
  const queryInput: EventEncounterEvidenceInput = {
    encounterId,
    eventId,
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

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
    // malformed JSON 回落到 query 输入，由 service 维持稳定响应。
    return queryInput;
  }

  const body = isRecord(parsedBody) ? parsedBody : {};

  // 目前 evidence 创建只需要 scenario；证据内容由 service 从 encounter 上下文生成。
  return {
    ...queryInput,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

export async function POST(
  request: Request,
  context: EventEncounterEvidenceRouteContext,
): Promise<Response> {
  // 创建 evidence 是资源创建语义，成功返回 201。
  const mode = resolveFeatureMode();
  const { encounterId, id } = await context.params;
  const encounterNoteService = createEventEncounterNoteService();
  const result = encounterNoteService.createEncounterEvidence(
    await readEncounterEvidenceInput(request, id, encounterId),
  );

  if (result.success === false) {
    // evidence failure 复用 encounter note contract 的错误上下文。
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
    status: 201,
  });
}
