import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import type { AgentActionDecisionInput } from "../../../../../../features/agent/service";
import {
  agentActionQueueFailureContext,
  agentActionQueueFailureToAppError,
} from "../../../../../../features/agent/service";
import { createAgentActionQueueService } from "../../../../../../features/agent/service-factory";

export const dynamic = "force-dynamic";

// accept action 是 Agent action queue 的确认入口。
// route 只收集 actionId、actorLabel 和 scenario；真正的动作状态变化由 service 决定。
interface AgentActionDecisionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type JsonRecord = Record<string, unknown>;

// action decision body 很小，非法或空 JSON 会被当成空对象交给 service 校验。
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

async function readInput(
  request: Request,
  actionId: string,
): Promise<AgentActionDecisionInput> {
  const searchParams = new URL(request.url).searchParams;
  const body = await readJsonBody(request);

  // query scenario 优先于 body，便于直接用 URL 复现队列状态。
  return {
    actionId,
    actorLabel: readString(body.actorLabel),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
  };
}

export async function POST(
  request: Request,
  context: AgentActionDecisionRouteContext,
): Promise<Response> {
  // 接受动作只调用 action queue service；route 不发送邮件、通知或外部请求。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const agentActionService = createAgentActionQueueService();
  const result = await agentActionService.acceptAction(
    await readInput(request, id),
  );

  if (result.success === false) {
    // 队列失败统一转成 AppError/envelope，保持前端错误处理稳定。
    const appError = agentActionQueueFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentActionQueueFailureContext(result, mode)),
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
