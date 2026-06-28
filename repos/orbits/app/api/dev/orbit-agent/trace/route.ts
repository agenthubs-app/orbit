import { NextResponse } from "next/server";
import { success } from "../../../../../shared/api/envelope";
import {
  createGeminiOrbitAgentPlanner,
  type GeminiOrbitAgentPlannerInput,
  type GeminiOrbitAgentToolName,
} from "../../../../../features/orbit-ai/gemini-provider";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

const defaultMaxLoopSteps = 3;
const maxSupportedLoopSteps = 3;
const minSupportedLoopSteps = 1;

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

function toolFamilyForToolName(toolName: GeminiOrbitAgentToolName): string {
  return toolName.split(".")[0] ?? toolName;
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function inputFromSearchParams(request: Request): GeminiOrbitAgentPlannerInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    locale: searchParams.get("locale"),
    message: searchParams.get("message") ?? searchParams.get("prompt") ?? "",
  };
}

function maxLoopStepsFromSearchParams(request: Request): number {
  const searchParams = new URL(request.url).searchParams;

  return readMaxLoopSteps(
    searchParams.get("maxLoopSteps") ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
  );
}

async function inputFromBody(
  body: JsonRecord,
): Promise<GeminiOrbitAgentPlannerInput> {
  return {
    locale: readString(body.locale),
    message: readString(body.message) ?? readString(body.prompt) ?? "",
  };
}

function maxLoopStepsFromBody(body: JsonRecord): number {
  return readMaxLoopSteps(
    body.maxLoopSteps ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
  );
}

async function tracePlanner(input: {
  maxLoopSteps: number;
  plannerInput: GeminiOrbitAgentPlannerInput;
}): Promise<Response> {
  const plannerInput = input.plannerInput;
  const message = readString(plannerInput.message);

  if (!message) {
    return validationResponse("message or prompt is required.");
  }

  const planner = createGeminiOrbitAgentPlanner();
  const result = await planner.plan({
    locale: plannerInput.locale,
    message,
  });

  if (result.success === false) {
    return plannerFailureResponse(result.error);
  }

  const toolRequests = result.data.toolRequests.map((request) => ({
    arguments: request.arguments,
    requiresUserConfirmation: request.requiresUserConfirmation,
    toolFamily: toolFamilyForToolName(request.toolName),
    toolName: request.toolName,
  }));

  return NextResponse.json(
    success({
      input: {
        locale: plannerInput.locale ?? "zh",
        message,
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
        source: "provider:gemini-interactions-api",
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
  if (isProductionRuntime()) {
    return disabledResponse();
  }

  return tracePlanner({
    maxLoopSteps: maxLoopStepsFromSearchParams(request),
    plannerInput: inputFromSearchParams(request),
  });
}

export async function POST(request: Request): Promise<Response> {
  if (isProductionRuntime()) {
    return disabledResponse();
  }
  const body = await readJsonBody(request);

  return tracePlanner({
    maxLoopSteps: maxLoopStepsFromBody(body),
    plannerInput: await inputFromBody(body),
  });
}
