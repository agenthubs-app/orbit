import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  orbitAiProactiveAgentFailureContext,
  orbitAiProactiveAgentFailureToAppError,
  type OrbitAiProactiveAgentInput,
  type OrbitAiProactiveAgentResult,
  type OrbitAiProactiveAgentSignal,
} from "../../../../features/orbit-ai/proactive-contract";
import { createOrbitAiProactiveAgentService } from "../../../../features/orbit-ai/proactive-service-factory";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function readSignal(value: unknown): OrbitAiProactiveAgentSignal | null {
  return isRecord(value) ? (value as OrbitAiProactiveAgentSignal) : null;
}

async function readInput(
  request: Request,
): Promise<OrbitAiProactiveAgentInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    signal: readSignal(body.signal),
  };
}

function responseForResult(
  result: OrbitAiProactiveAgentResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = orbitAiProactiveAgentFailureToAppError(result);

    return NextResponse.json(
      failure(appError, orbitAiProactiveAgentFailureContext(result, mode)),
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

export async function POST(request: Request): Promise<Response> {
  // Source modules submit structured signals; Orbit AI turns them into chat-window
  // assistant turns without writing storage or delivering notifications.
  const mode = resolveFeatureMode();
  const service = createOrbitAiProactiveAgentService();
  const result = service.createProactiveTurn(await readInput(request));

  return responseForResult(result, mode);
}
