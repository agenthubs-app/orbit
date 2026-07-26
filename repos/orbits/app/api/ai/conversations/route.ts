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
import { createAgentMemoryService } from "../../../../features/agent/memory/service-factory";
import { createAgentNaturalLanguageActionProposalService } from "../../../../features/agent/natural-language-actions/service";
import type { AgentRuntimeService } from "../../../../features/agent/runtime/service";
import { latestConversationRuntimeLink } from "../../../../features/orbit-ai/conversation-runtime-links";
import {
  createChatKnownWorkflowOrchestrator,
  isChatKnownWorkflowInput,
} from "../../../../features/orbit-ai/chat-known-workflow";
import {
  agentRequestUnauthorizedResponse,
  resolveAgentRequestContext,
} from "../../_shared/agent-request-context";

// 这个 route 是 OrbitRealAgent 前端聊天框调用的服务端入口。
// 业务逻辑不写在 route 里：route 只负责读请求、调用 conversation service、
// 再把 service result 包成统一 API envelope。
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

interface RouteTiming {
  finish: (name: string, startedAt: number) => void;
  headerValue: (
    extraSpans?: readonly { durationMs: number; name: string }[],
  ) => string;
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

// history 是可选的最近对话轮次，用于 planner 消解追问里的指代。
// 只接受 user/assistant 两种角色，截断条数与单条长度，防止超长 payload 直达模型。
function readHistory(value: unknown): OrbitAgentSendMessageInput["history"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const turns = value
    .filter(isRecord)
    .map((turn) => ({
      content:
        typeof turn.content === "string"
          ? turn.content.trim().slice(0, 2000)
          : "",
      role: turn.role,
    }))
    .filter(
      (turn): turn is { content: string; role: "user" | "assistant" } =>
        Boolean(turn.content) &&
        (turn.role === "user" || turn.role === "assistant"),
    )
    .slice(-12);

  return turns.length > 0 ? turns : undefined;
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
    history: readHistory(body.history),
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

async function withRuntimeLinks(
  result: OrbitAgentConversationResult,
  runtime: AgentRuntimeService,
): Promise<OrbitAgentConversationResult> {
  if (result.success === false) return result;
  try {
    const link = latestConversationRuntimeLink(
      await runtime.listActions({}),
      result.data.activeConversationId,
    );
    if (!link) return result;
    return {
      success: true,
      data: {
        ...result.data,
        runId: link.runId,
        actionIds: link.actionIds,
      },
    };
  } catch {
    return result;
  }
}

async function persistNaturalLanguageActionProposals(
  result: OrbitAgentConversationResult,
  input: OrbitAgentSendMessageInput,
  runtime: AgentRuntimeService,
): Promise<OrbitAgentConversationResult> {
  if (result.success === false) return result;
  const {
    proposedActionRequests = [],
    ...publicData
  } = result.data;
  if (proposedActionRequests.length === 0) {
    return { success: true, data: publicData };
  }
  const conversationId = result.data.activeConversationId?.trim() ?? "";
  const message = input.message?.trim() ?? "";
  if (!conversationId || !message) {
    return {
      success: true,
      data: {
        ...publicData,
        assistantMessage:
          input.locale === "en"
            ? "I understood the write request, but no active conversation was available, so nothing was proposed or written."
            : "我理解了这项写操作，但当前没有可绑定的有效对话，因此没有创建操作，也没有写入数据。",
        nextAction:
          "Start an active Agent conversation before creating a reviewable action proposal.",
      },
    };
  }

  try {
    const proposed =
      await createAgentNaturalLanguageActionProposalService({
        runtime,
      }).propose({
        conversationId,
        message,
        requests: proposedActionRequests,
      });
    return {
      success: true,
      data: {
        ...publicData,
        actionIds: proposed.actions.map((action) => action.actionId),
        runId: proposed.runId ?? undefined,
      },
    };
  } catch {
    return {
      success: true,
      data: {
        ...publicData,
        actionIds: [],
        assistantMessage:
          input.locale === "en"
            ? "I understood the write request, but Orbit could not safely create a confirmable proposal. Nothing was written or executed."
            : "我理解了这项写操作，但 Orbit 暂时无法安全创建可确认的操作草稿；没有写入或执行任何内容。",
        nextAction:
          "Retry after checking Agent storage and permission status; do not execute the write outside the confirmation ledger.",
        runId: undefined,
      },
    };
  }
}

export async function GET(request: Request): Promise<Response> {
  // GET 只读取会话列表/状态，不触发模型 provider。
  const timing = createRouteTiming();
  const mode = resolveFeatureMode();
  const agentContext = await resolveAgentRequestContext(mode);
  if (!agentContext) return agentRequestUnauthorizedResponse();
  const serviceStartedAt = timing.now();
  const service = createOrbitAgentConversationService();
  const result = await withRuntimeLinks(
    await service.listConversations(readListInput(request)),
    agentContext.runtime,
  );
  timing.finish("orbit-service", serviceStartedAt);

  return responseForResult(result, mode, timing);
}

export async function POST(request: Request): Promise<Response> {
  // POST 是用户发消息入口；mock/live 的选择由 service factory 和环境变量决定。
  const timing = createRouteTiming();
  const mode = resolveFeatureMode();
  const agentContext = await resolveAgentRequestContext(mode);
  if (!agentContext) return agentRequestUnauthorizedResponse();
  const readBodyStartedAt = timing.now();
  const input = await readSendInput(request);
  const trustedInput =
    agentContext.actorId === null
      ? input
      : {
          ...input,
          memory: await createAgentMemoryService({
            actorId: agentContext.actorId,
            mode,
          }).context(),
        };
  timing.finish("orbit-read-body", readBodyStartedAt);
  const serviceStartedAt = timing.now();
  const service = createOrbitAgentConversationService();
  let result: OrbitAgentConversationResult;

  if (isChatKnownWorkflowInput(trustedInput)) {
    // 已知工作流必须在 bounded planner/provider 之前命中。listConversations
    // 只读取会话基态，用来保留 activeConversationId；它不会生成模型回复。
    const conversationResult = await service.listConversations({
      scenario: input.scenario,
    });
    const workflowResponse = await createChatKnownWorkflowOrchestrator({
      processOutboxAfterStart: mode === "mock",
      runtime: agentContext.runtime,
    }).handle({
      conversationInput: trustedInput,
      conversationResult,
    });
    result =
      workflowResponse.outcome === "clarification"
        ? workflowResponse.result
        : await withRuntimeLinks(workflowResponse.result, agentContext.runtime);
  } else {
    // 未命中已知工作流的普通请求保持原 bounded planner 路径，并且只调用一次。
    result = await withRuntimeLinks(
      await persistNaturalLanguageActionProposals(
        await service.sendMessage(trustedInput),
        trustedInput,
        agentContext.runtime,
      ),
      agentContext.runtime,
    );
  }
  timing.finish("orbit-service", serviceStartedAt);

  return responseForResult(result, mode, timing);
}
