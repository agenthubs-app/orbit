import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type {
  AgentAutonomySettingsInput,
  AgentAutonomySettingsUpdateInput,
} from "../../../../features/agent/service-factory";
import {
  createAgentAutonomySettingsService,
} from "../../../../features/agent/service-factory";
import {
  agentAutonomySettingsFailureContext,
  agentAutonomySettingsFailureToAppError,
} from "../../../../features/agent/settings-contract";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

// Agent 设置 route 接收来自设置页的读写请求。
// 这里是 HTTP/body 解析层；权限、状态机和失败语义都留给 settings service。
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  // 设置更新允许空 body 或非法 JSON 回落为空对象，由 service 返回明确校验失败。
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function readSettingsInput(request: Request): AgentAutonomySettingsInput {
  const searchParams = new URL(request.url).searchParams;

  // GET 目前只需要 scenario，用于演示不同设置状态。
  return {
    scenario: searchParams.get("scenario"),
  };
}

async function readUpdateInput(
  request: Request,
): Promise<AgentAutonomySettingsUpdateInput> {
  const searchParams = new URL(request.url).searchParams;
  const body = await readJsonBody(request);

  // PUT 同时接受 query scenario 和 JSON body，方便表单页与测试共用同一入口。
  return {
    actorLabel: readString(body.actorLabel),
    requestedLevel: readString(body.requestedLevel),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
  };
}

export async function GET(request: Request): Promise<Response> {
  // 读取当前 autonomy settings；route 不判断业务规则，只做 envelope 转换。
  const mode = resolveFeatureMode();
  const settingsService = createAgentAutonomySettingsService();
  const result = settingsService.getSettings(readSettingsInput(request));

  if (result.success === false) {
    const appError = agentAutonomySettingsFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentAutonomySettingsFailureContext(result, mode)),
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

export async function PUT(request: Request): Promise<Response> {
  // 更新 autonomy level 仍走 service 的确认/校验逻辑，route 不直接写状态。
  const mode = resolveFeatureMode();
  const settingsService = createAgentAutonomySettingsService();
  const result = settingsService.updateSettings(await readUpdateInput(request));

  if (result.success === false) {
    const appError = agentAutonomySettingsFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentAutonomySettingsFailureContext(result, mode)),
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
