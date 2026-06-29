import { NextResponse } from "next/server";
import { createLiveOrbitAgentTrace } from "../../../../../features/orbit-ai/live-conversation-trace";
import { success } from "../../../../../shared/api/envelope";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

const defaultMaxLoopSteps = 3;
const maxSupportedLoopSteps = 3;
const minSupportedLoopSteps = 1;

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
  return process.env.NODE_ENV === "production";
}

function disabledResponse(): Response {
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
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function inputFromSearchParams(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  return {
    locale: searchParams.get("locale"),
    maxLoopSteps: readMaxLoopSteps(
      searchParams.get("maxLoopSteps") ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
    ),
    message: searchParams.get("message") ?? searchParams.get("prompt") ?? "",
  };
}

function inputFromBody(body: JsonRecord) {
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

  if (!message) {
    return validationResponse("message or prompt is required.");
  }

  const trace = createLiveOrbitAgentTrace({
    maxLoopSteps: input.maxLoopSteps,
  });
  const result = await trace.traceMessage({
    locale: input.locale,
    message,
  });

  if (result.success === false) {
    return traceFailureResponse(result.error);
  }

  return NextResponse.json(success(result.data), {
    headers: DEV_TRACE_HEADERS,
    status: 200,
  });
}

export async function GET(request: Request): Promise<Response> {
  if (isProductionRuntime()) {
    return disabledResponse();
  }

  return traceOrbitAi(inputFromSearchParams(request));
}

export async function POST(request: Request): Promise<Response> {
  if (isProductionRuntime()) {
    return disabledResponse();
  }

  return traceOrbitAi(inputFromBody(await readJsonBody(request)));
}
