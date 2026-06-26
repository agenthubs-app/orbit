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

interface AgentActionDecisionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type JsonRecord = Record<string, unknown>;

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
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const agentActionService = createAgentActionQueueService();
  const result = agentActionService.dismissAction(await readInput(request, id));

  if (result.success === false) {
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
