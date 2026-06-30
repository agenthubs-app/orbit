import { NextResponse } from "next/server";
import { createLiveOrbitAgentTrace } from "../../../../../features/orbit-ai/live-conversation-trace";
import { success } from "../../../../../shared/api/envelope";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

// dev Orbit AI trace 暴露完整 live conversation chain 的调试信息。
// 该入口会显示 prompt/trace 信息，只允许 development runtime 使用。
const defaultMaxLoopSteps = 3;
const maxSupportedLoopSteps = 3;
const minSupportedLoopSteps = 1;

// dev trace header 明确标记“开发调试、prompt 可见、禁止缓存”的边界。
const DEV_TRACE_HEADERS = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Orbit-Dev-Trace": "orbit-ai-full-chain",
  "X-Orbit-Privacy": "developer-debug-prompt-visible",
  "X-Orbit-Runtime-Boundary": "developer-admin",
} as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMaxLoopSteps(value: unknown): number {
  // maxLoopSteps 是调试预算，限制 trace 展示到 planner/artifact/synthesis 哪个阶段。
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : defaultMaxLoopSteps;

  if (!Number.isFinite(parsed)) {
    return defaultMaxLoopSteps;
  }

  return Math.min(
    maxSupportedLoopSteps,
    Math.max(minSupportedLoopSteps, Math.floor(parsed)),
  );
}

function isProductionRuntime() {
  // production 中直接隐藏该 endpoint，避免暴露 provider prompt 和 trace。
  return process.env.NODE_ENV === "production";
}

function disabledResponse(): Response {
  // 返回 404 而不是 403，减少生产环境中对调试能力的暴露。
  return NextResponse.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Orbit AI full-chain trace is only available in development.",
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

function traceFailureResponse(error: {
  code: string;
  context?: Record<string, unknown>;
  message: string;
}): Response {
  // provider/trace 失败统一折叠为 503，同时保留 providerCode 方便本地调试。
  return NextResponse.json(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        context: error.context,
        message: error.message,
        providerCode: error.code,
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

function inputFromSearchParams(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  // GET 支持 message 和 prompt 两个别名，便于浏览器地址栏直接调试。
  return {
    locale: searchParams.get("locale"),
    maxLoopSteps: readMaxLoopSteps(
      searchParams.get("maxLoopSteps") ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
    ),
    message: searchParams.get("message") ?? searchParams.get("prompt") ?? "",
  };
}

function inputFromBody(body: JsonRecord) {
  // POST 使用 JSON body，字段别名与 GET 保持一致。
  return {
    locale: readString(body.locale),
    maxLoopSteps: readMaxLoopSteps(
      body.maxLoopSteps ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
    ),
    message: readString(body.message) ?? readString(body.prompt) ?? "",
  };
}

async function traceOrbitAi(input: {
  locale: string | null;
  maxLoopSteps: number;
  message: string;
}): Promise<Response> {
  const message = readString(input.message);

  // trace 必须有用户 prompt；空 prompt 不调用 provider。
  if (!message) {
    return validationResponse("message or prompt is required.");
  }

  // createLiveOrbitAgentTrace 会按 maxLoopSteps 展开 planner、artifact、synthesis 链路。
  const trace = createLiveOrbitAgentTrace({
    maxLoopSteps: input.maxLoopSteps,
  });
  const result = await trace.traceMessage({
    locale: input.locale,
    message,
  });

  if (result.success === false) {
    // trace 内部失败不伪装成业务 success。
    return traceFailureResponse(result.error);
  }

  return NextResponse.json(success(result.data), {
    headers: DEV_TRACE_HEADERS,
    status: 200,
  });
}

export async function GET(request: Request): Promise<Response> {
  // GET 方便快速调试，但 production 中始终禁用。
  if (isProductionRuntime()) {
    return disabledResponse();
  }

  return traceOrbitAi(inputFromSearchParams(request));
}

export async function POST(request: Request): Promise<Response> {
  // POST 适合传较长 prompt 或 locale/maxLoopSteps 配置。
  if (isProductionRuntime()) {
    return disabledResponse();
  }

  return traceOrbitAi(inputFromBody(await readJsonBody(request)));
}
