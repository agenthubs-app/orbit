import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  emailCalendarSignalFailureContext,
  emailCalendarSignalFailureToAppError,
  type EmailCalendarSignalConfirmInput,
} from "../../../../../features/acquisition/email-calendar-contract";
import { createEmailCalendarSignalService } from "../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// confirm relationship signal route 用于确认一条邮件/日历关系信号。
// signalId 来自 path，actor/scenario 可从 query、form 或 JSON 读取。
interface ConfirmRelationshipSignalRouteContext {
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

async function readConfirmInput(
  request: Request,
  signalId: string,
): Promise<EmailCalendarSignalConfirmInput> {
  const url = new URL(request.url);
  // 固定使用 path signalId，避免 body 改写确认对象。
  const queryInput: EmailCalendarSignalConfirmInput = {
    signalId,
    actorLabel: url.searchParams.get("actorLabel"),
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径允许确认按钮带 actorLabel。
    const formData = await request.formData();

    return {
      ...queryInput,
      actorLabel:
        readFormText(formData, "actorLabel") ?? queryInput.actorLabel,
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

  const parsedBody: unknown = JSON.parse(rawBody);
  const body = isRecord(parsedBody) ? parsedBody : {};

  // JSON body 只补充 actor/scenario，不承载外部权限或真实邮件内容。
  return {
    ...queryInput,
    actorLabel:
      typeof body.actorLabel === "string"
        ? body.actorLabel
        : queryInput.actorLabel,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

export async function POST(
  request: Request,
  context: ConfirmRelationshipSignalRouteContext,
): Promise<Response> {
  // confirmEmailCalendarSignal 会进入可复核状态更新，route 不直接写关系资料。
  const runtimeMode = process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE;
  const mode = resolveFeatureMode(runtimeMode);
  const { id } = await context.params;
  const service = createEmailCalendarSignalService(mode);
  const result = await service.confirmEmailCalendarSignal(
    await readConfirmInput(request, id),
  );

  if (result.success === false) {
    // email/calendar signal failure 统一映射成 AppError/envelope。
    const appError = emailCalendarSignalFailureToAppError(result);

    return NextResponse.json(
      failure(appError, emailCalendarSignalFailureContext(result, mode)),
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
