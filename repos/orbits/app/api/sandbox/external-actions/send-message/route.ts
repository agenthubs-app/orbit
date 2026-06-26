import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  externalActionSandboxFailureContext,
  externalActionSandboxFailureToAppError,
  type ExternalActionSandboxInput,
} from "../../../../../features/agent/external-action-contract";
import { createExternalActionSandboxService } from "../../../../../features/agent/service-factory";

export const dynamic = "force-dynamic";

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

async function readInput(request: Request): Promise<ExternalActionSandboxInput> {
  const searchParams = new URL(request.url).searchParams;
  const body = await readJsonBody(request);

  return {
    actionId: readString(body.actionId),
    actorLabel: readString(body.actorLabel),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    targetLabel: readString(body.targetLabel),
  };
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const service = createExternalActionSandboxService();
  const result = service.sendMessage(await readInput(request));

  if (result.success === false) {
    const appError = externalActionSandboxFailureToAppError(result);

    return NextResponse.json(
      failure(appError, externalActionSandboxFailureContext(result, mode)),
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
