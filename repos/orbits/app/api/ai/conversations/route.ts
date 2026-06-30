import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  orbitAgentConversationFailureContext,
  orbitAgentConversationFailureToAppError,
  type OrbitAgentConversationInput,
  type OrbitAgentConversationResult,
  type OrbitAgentSendMessageInput,
} from "../../../../features/orbit-ai/conversation-contract";
import { createOrbitAgentConversationService } from "../../../../features/orbit-ai/service-factory";

// 这个 route 是 OrbitRealAgent 前端聊天框调用的服务端入口。
// 业务逻辑不写在 route 里：route 只负责读请求、调用 conversation service、
// 再把 service result 包成统一 API envelope。
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

interface RouteTiming {
  finish: (name: string, startedAt: number) => void;
  headerValue: (extraSpans?: readonly { durationMs: number; name: string }[]) => string;
  now: () => number;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createRouteTiming(): RouteTiming {
  const routeStartedAt = performance.now();
  const spans: { durationMs: number; name: string }[] = [];

  function formatDuration(value: number): string {
    return Math.max(0, value).toFixed(1);
  }

  return {
    finish(name, startedAt) {
      spans.push({
        durationMs: performance.now() - startedAt,
        name,
      });
    },
    headerValue(extraSpans = []) {
      const total = performance.now() - routeStartedAt;
      return [
        `orbit-total;dur=${formatDuration(total)}`,
        ...spans.map(
          (span) => `${span.name};dur=${formatDuration(span.durationMs)}`,
        ),
        ...extraSpans.map(
          (span) => `${span.name};dur=${formatDuration(span.durationMs)}`,
        ),
      ].join(", ");
    },
    now() {
      return performance.now();
    },
  };
}

function serverTimingNameForAgentPhase(phase: string): string {
  return `orbit-agent-${phase.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function agentTimingSpansForResult(
  result: OrbitAgentConversationResult,
): readonly { durationMs: number; name: string }[] {
  if (result.success === false) return [];

  return (result.data.diagnostics?.timings ?? [])
    .filter((span) => span.skipped !== true)
    .map((span) => ({
      durationMs: span.durationMs,
      name: serverTimingNameForAgentPhase(span.phase),
    }));
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readListInput(request: Request): OrbitAgentConversationInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

async function readSendInput(
  request: Request,
): Promise<OrbitAgentSendMessageInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  return {
    conversationId: readString(body.conversationId),
    locale: readString(body.locale),
    message: readString(body.message) ?? readString(body.prompt),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
  };
}

function responseForResult(
  result: OrbitAgentConversationResult,
  mode: ReturnType<typeof resolveFeatureMode>,
  timing?: RouteTiming,
): Response {
  const serializeStartedAt = timing?.now();
  // feature service 使用自己的错误结构；route 层统一映射到 shared AppError + HTTP status。
  let response: Response;

  if (result.success === false) {
    const appError = orbitAgentConversationFailureToAppError(result);

    response = NextResponse.json(
      failure(appError, orbitAgentConversationFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  } else {
    response = NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  }

  if (timing && serializeStartedAt !== undefined) {
    timing.finish("orbit-serialize", serializeStartedAt);
    response.headers.set(
      "Server-Timing",
      timing.headerValue(agentTimingSpansForResult(result)),
    );
  }

  return response;
}

export async function GET(request: Request): Promise<Response> {
  // GET 只读取会话列表/状态，不触发模型 provider。
  const timing = createRouteTiming();
  const mode = resolveFeatureMode();
  const serviceStartedAt = timing.now();
  const service = createOrbitAgentConversationService();
  const result = await service.listConversations(readListInput(request));
  timing.finish("orbit-service", serviceStartedAt);

  return responseForResult(result, mode, timing);
}

export async function POST(request: Request): Promise<Response> {
  // POST 是用户发消息入口；mock/live 的选择由 service factory 和环境变量决定。
  const timing = createRouteTiming();
  const mode = resolveFeatureMode();
  const readBodyStartedAt = timing.now();
  const input = await readSendInput(request);
  timing.finish("orbit-read-body", readBodyStartedAt);
  const serviceStartedAt = timing.now();
  const service = createOrbitAgentConversationService();
  const result = await service.sendMessage(input);
  timing.finish("orbit-service", serviceStartedAt);

  return responseForResult(result, mode, timing);
}
