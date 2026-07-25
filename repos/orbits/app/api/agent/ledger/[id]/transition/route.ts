import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  agentLedgerFailureContext,
  agentLedgerFailureToAppError,
  type AgentLedgerTransitionInput,
} from "../../../../../../features/agent/ledger/contract";
import {
  agentRequestUnauthorizedResponse,
  createAgentLedgerForRequest,
  resolveAgentRequestContext,
} from "../../../../_shared/agent-request-context";

export const dynamic = "force-dynamic";

// POST /api/agent/ledger/[id]/transition 应用 confirm/defer/undo/retry。
// route 只收集参数；状态变化和幂等控制都由 service 决定。
interface AgentLedgerRouteContext {
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

function readStringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
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
  entryId: string,
): Promise<AgentLedgerTransitionInput> {
  const searchParams = new URL(request.url).searchParams;
  const body = await readJsonBody(request);

  return {
    actorLabel: readString(body.actorLabel),
    entryId,
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    selectedOperationIds: readStringArray(body.selectedOperationIds),
    transition: readString(body.transition),
  };
}

export async function POST(
  request: Request,
  context: AgentLedgerRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const agentContext = await resolveAgentRequestContext(mode);
  if (!agentContext) return agentRequestUnauthorizedResponse();
  const service = createAgentLedgerForRequest(agentContext);
  const result = await service.applyTransition(await readInput(request, id));

  if (result.success === false) {
    const appError = agentLedgerFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentLedgerFailureContext(result, mode)),
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
