import { NextResponse } from "next/server";
import { success } from "../../../../../shared/api/envelope";
import {
  createLiveOrbitAgentRuntime,
  readMaxLoopSteps,
  runLiveOrbitAgentRuntime,
  toolFamilyForToolName,
} from "../../../../../features/orbit-ai/live-agent-runtime";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;
type PlannerTraceInput = {
  locale?: string | null;
  message: string;
};

// dev Orbit Agent planner trace 只走共享 runtime 的 planner phase，不执行 Orbit domain tools。
// 该入口会显示 prompt/raw output，只允许 development runtime 使用。
const defaultMaxLoopSteps = 3;

// dev trace header 明确标记“开发调试、prompt 可见、禁止缓存”的边界。
const DEV_TRACE_HEADERS = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Orbit-Dev-Trace": "orbit-agent-planner",
  "X-Orbit-Privacy": "developer-debug-prompt-visible",
  "X-Orbit-Runtime-Boundary": "developer-admin",
} as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPlannerTraceMaxLoopSteps(value: unknown): number {
  // maxLoopSteps 用于展示后续阶段是否可运行，不会让此 endpoint 执行 domain tools。
  return readMaxLoopSteps(value, defaultMaxLoopSteps);
}

function isProductionRuntime() {
  // production 中直接隐藏该 endpoint，避免暴露 provider prompt 和 raw output。
  return process.env.NODE_ENV === "production";
}

function disabledResponse(): Response {
  // 返回 404 而不是 403，减少生产环境中对调试能力的暴露。
  return NextResponse.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Orbit Agent planner trace is only available in development.",
      },
      success: false,
    },
    {
      headers: DEV_TRACE_HEADERS,
      status: 404,
    },
  );
}

function validationResponse(message: string): Response {
  // 输入校验错误保持简单结构，不走业务 envelope。
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message,
      },
      success: false,
    },
    {
      headers: DEV_TRACE_HEADERS,
      status: 400,
    },
  );
}

function plannerFailureResponse(error: {
  code: string;
  message: string;
  rawOutputText?: string;
}): Response {
  // provider/planner 失败统一折叠为 503，并保留 raw output 方便本地调试 schema 问题。
  return NextResponse.json(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        context: {
          providerCode: error.code,
          ...(error.rawOutputText ? { rawOutputText: error.rawOutputText } : {}),
        },
        message: error.message,
      },
      success: false,
    },
    {
      headers: DEV_TRACE_HEADERS,
      status: 503,
    },
  );
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  // POST body 非对象或非法 JSON 时回落为空对象，由后续 validationResponse 报缺 message。
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function inputFromSearchParams(request: Request): PlannerTraceInput {
  const searchParams = new URL(request.url).searchParams;

  // GET 支持 message 和 prompt 两个别名，便于浏览器地址栏直接调试。
  return {
    locale: searchParams.get("locale"),
    message: searchParams.get("message") ?? searchParams.get("prompt") ?? "",
  };
}

function maxLoopStepsFromSearchParams(request: Request): number {
  const searchParams = new URL(request.url).searchParams;

  // query maxLoopSteps 优先，否则读取环境变量。
  return readPlannerTraceMaxLoopSteps(
    searchParams.get("maxLoopSteps") ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
  );
}

async function inputFromBody(
  body: JsonRecord,
): Promise<PlannerTraceInput> {
  // POST 使用 JSON body，字段别名与 GET 保持一致。
  return {
    locale: readString(body.locale),
    message: readString(body.message) ?? readString(body.prompt) ?? "",
  };
}

function maxLoopStepsFromBody(body: JsonRecord): number {
  // body maxLoopSteps 优先，否则读取环境变量。
  return readPlannerTraceMaxLoopSteps(
    body.maxLoopSteps ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
  );
}

async function tracePlanner(input: {
  maxLoopSteps: number;
  plannerInput: PlannerTraceInput;
}): Promise<Response> {
  const plannerInput = input.plannerInput;
  const runtime = createLiveOrbitAgentRuntime({
    defaultMaxLoopSteps: 1,
    maxLoopSteps: 1,
  });
  const runtimeResult = await runLiveOrbitAgentRuntime(runtime, {
    locale: plannerInput.locale,
    message: plannerInput.message,
  });

  if (runtimeResult.state === "message_required") {
    return validationResponse("message or prompt is required.");
  }

  if (runtimeResult.state === "planner_failure") {
    // planner 失败不伪装成业务 success。
    return plannerFailureResponse(runtimeResult.plannerResult.error);
  }

  if (runtimeResult.state === "local_boundary") {
    return NextResponse.json(
      success({
        input: {
          locale: plannerInput.locale ?? "zh",
          message: runtimeResult.message,
        },
        loop: {
          maxSteps: input.maxLoopSteps,
          phaseLimit: {
            domainToolsCanRun: input.maxLoopSteps >= 2,
            plannerCanRun: false,
            synthesisCanRun: input.maxLoopSteps >= 3,
          },
          phaseSemantics: [
            "1 = planner only",
            "2 = planner + Orbit tool/artifact mapping",
            "3 = planner + Orbit tool/artifact mapping + Gemini synthesis",
          ],
        },
        planner: {
          parsed: null,
          rawOutputText: "",
        },
        safety: {
          debugEndpoint: true,
          domainToolCallsExecuted: false,
          externalSideEffectsExecuted: false,
          localBoundary: runtimeResult.boundaryPayload.provenance.source,
          note:
            "Shared Orbit Agent runtime stopped this prompt before planner, tools, or synthesis.",
        },
        toolTrace: {
          domainToolCallsWouldExecute: false,
          toolRequests: [],
        },
      }),
      {
        headers: DEV_TRACE_HEADERS,
        status: 200,
      },
    );
  }

  const result = runtimeResult.plannerResult;
  // toolRequests 只展示“模型建议调用什么”，不是已经执行的工具调用。
  const toolRequests = runtimeResult.toolRequests.map((request) => ({
    arguments: request.arguments,
    requiresUserConfirmation: request.requiresUserConfirmation,
    toolFamily: toolFamilyForToolName(request.toolName),
    toolName: request.toolName,
  }));

  return NextResponse.json(
    success({
      input: {
        locale: plannerInput.locale ?? "zh",
        message: runtimeResult.message,
      },
      planner: {
        parsed: {
          assistantMessage: result.data.assistantMessage,
          intent: result.data.intent,
          toolRequests,
        },
        rawOutputText: result.data.rawOutputText,
      },
      provider: {
        model: result.data.model,
        name: result.data.provider,
        source: result.data.source,
      },
      loop: {
        maxSteps: input.maxLoopSteps,
        phaseLimit: {
          domainToolsCanRun: input.maxLoopSteps >= 2,
          plannerCanRun: input.maxLoopSteps >= 1,
          synthesisCanRun: input.maxLoopSteps >= 3,
        },
        phaseSemantics: [
          "1 = planner only",
          "2 = planner + Orbit tool/artifact mapping",
          "3 = planner + Orbit tool/artifact mapping + Gemini synthesis",
        ],
      },
      safety: {
        debugEndpoint: true,
        domainToolCallsExecuted: false,
        externalSideEffectsExecuted: false,
        note:
          "This development trace calls the Gemini planner only; use /api/ai/conversations to execute Orbit artifact mapping.",
      },
      toolTrace: {
        domainToolCallsWouldExecute: toolRequests.length > 0,
        toolRequests,
      },
    }),
    {
      headers: DEV_TRACE_HEADERS,
      status: 200,
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  // GET 方便快速调试，但 production 中始终禁用。
  if (isProductionRuntime()) {
    return disabledResponse();
  }

  return tracePlanner({
    maxLoopSteps: maxLoopStepsFromSearchParams(request),
    plannerInput: inputFromSearchParams(request),
  });
}

export async function POST(request: Request): Promise<Response> {
  // POST 适合传较长 prompt 或 locale/maxLoopSteps 配置。
  if (isProductionRuntime()) {
    return disabledResponse();
  }
  const body = await readJsonBody(request);

  return tracePlanner({
    maxLoopSteps: maxLoopStepsFromBody(body),
    plannerInput: await inputFromBody(body),
  });
}
