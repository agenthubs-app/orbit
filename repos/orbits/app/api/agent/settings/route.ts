import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type {
  AgentAutonomySettingsInput,
  AgentAutonomySettingsUpdateInput,
} from "../../../../features/agent/service-factory";
import {
  createAgentAutonomySettingsService,
} from "../../../../features/agent/service-factory";
import {
  agentAutonomySettingsFailureContext,
  agentAutonomySettingsFailureToAppError,
} from "../../../../features/agent/settings-contract";

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

function readSettingsInput(request: Request): AgentAutonomySettingsInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

async function readUpdateInput(
  request: Request,
): Promise<AgentAutonomySettingsUpdateInput> {
  const searchParams = new URL(request.url).searchParams;
  const body = await readJsonBody(request);

  return {
    actorLabel: readString(body.actorLabel),
    requestedLevel: readString(body.requestedLevel),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
  };
}

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const settingsService = createAgentAutonomySettingsService();
  const result = settingsService.getSettings(readSettingsInput(request));

  if (result.success === false) {
    const appError = agentAutonomySettingsFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentAutonomySettingsFailureContext(result, mode)),
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

export async function PUT(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const settingsService = createAgentAutonomySettingsService();
  const result = settingsService.updateSettings(await readUpdateInput(request));

  if (result.success === false) {
    const appError = agentAutonomySettingsFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentAutonomySettingsFailureContext(result, mode)),
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
