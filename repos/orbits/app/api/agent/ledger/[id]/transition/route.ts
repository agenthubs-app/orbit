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
  type AgentLedgerDraftUpdateInput,
  type AgentLedgerTransitionInput,
} from "../../../../../../features/agent/ledger/contract";
import {
  agentRequestUnauthorizedResponse,
  createAgentLedgerForRequest,
  resolveAgentRequestContext,
} from "../../../../_shared/agent-request-context";
import { shouldProcessAgentLedgerOutbox } from "./transition-execution-policy";

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

function readDraftUpdates(
  value: unknown,
): readonly AgentLedgerDraftUpdateInput[] | null {
  if (!Array.isArray(value)) return null;
  return value.slice(0, 20).map((item) =>
    isRecord(item)
      ? {
          operationId: readString(item.operationId),
          draftText: readString(item.draftText),
          field: readString(item.field),
        }
      : {},
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

async function readInput(
  request: Request,
  entryId: string,
): Promise<AgentLedgerTransitionInput> {
  const searchParams = new URL(request.url).searchParams;
  const body = await readJsonBody(request);

  return {
    actorLabel: readString(body.actorLabel),
    draftUpdates: readDraftUpdates(body.draftUpdates),
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
  const input = await readInput(request, id);
  let result = await service.applyTransition(input);

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

  // In live mode a confirmed or explicitly retried internal action must not
  // remain indefinitely in "approved" merely because no separately scheduled
  // worker happened to run. Process this action's durable outbox now, then
  // return the authoritative post-execution entry. The runtime still enforces
  // permission, idempotency, receipts, retries, and compensation.
  if (shouldProcessAgentLedgerOutbox(mode, input.transition)) {
    await agentContext.runtime.processOutbox({
      actionId: id,
      limit: 20,
      workerId: `ledger-confirm:${agentContext.actorId ?? "server"}`,
    });
    const refreshed = await service.listEntries();
    if (refreshed.success === true) {
      const entry = refreshed.data.entries.find(
        (candidate) => candidate.entryId === id,
      );
      if (entry) {
        result = {
          success: true,
          data: {
            ...result.data,
            entry,
            nextAction:
              entry.status === "completed"
                ? "The confirmed operations completed and are recorded in the Agent Ledger."
                : "The confirmed operations were processed; review the recorded result before retrying any failed operation.",
          },
        };
      }
    }
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
