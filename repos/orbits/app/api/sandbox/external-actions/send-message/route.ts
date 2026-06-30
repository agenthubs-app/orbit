import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  externalActionSandboxFailureContext,
  externalActionSandboxFailureToAppError,
  type ExternalActionSandboxInput,
} from "../../../../../features/agent/external-action-contract";
import { createExternalActionSandboxService } from "../../../../../features/agent/service-factory";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

// sandbox send-message route 模拟外部消息发送动作。
// 它走 sandbox service 和审计记录，不会在 route 层直接发送真实消息。
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  // 非法 JSON 回落为空对象，由 sandbox service 返回明确校验/场景结果。
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

async function readInput(request: Request): Promise<ExternalActionSandboxInput> {
  const searchParams = new URL(request.url).searchParams;
  const body = await readJsonBody(request);

  // scenario query 优先；action/actor/target 只从白名单字段读取。
  return {
    actionId: readString(body.actionId),
    actorLabel: readString(body.actorLabel),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    targetLabel: readString(body.targetLabel),
  };
}

export async function POST(request: Request): Promise<Response> {
  // sendMessage 是沙箱动作，真实外部副作用由 service 的 sandbox 边界禁止。
  const mode = resolveFeatureMode();
  const service = createExternalActionSandboxService();
  const result = service.sendMessage(await readInput(request));

  if (result.success === false) {
    // sandbox failure 统一映射成 AppError/envelope。
    const appError = externalActionSandboxFailureToAppError(result);

    return NextResponse.json(
      failure(appError, externalActionSandboxFailureContext(result, mode)),
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
