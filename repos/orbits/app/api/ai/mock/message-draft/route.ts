import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  aiProviderFailureContext,
  aiProviderFailureToAppError,
  type AiProviderMessageDraftInput,
  type AiProviderResult,
} from "../../../../../shared/ai/provider";
import { createAiProviderService } from "../../../../../shared/ai/service-factory";

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

function readStringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : null;
}

async function readInput(
  request: Request,
): Promise<AiProviderMessageDraftInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  return {
    desiredOutcome: readString(body.desiredOutcome),
    promptTemplateId: readString(body.promptTemplateId),
    recipientName: readString(body.recipientName),
    relationshipContext:
      readString(body.relationshipContext) ?? readString(body.context),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    sourceEvidenceIds: readStringArray(body.sourceEvidenceIds),
  };
}

function responseForResult(
  result: AiProviderResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = aiProviderFailureToAppError(result);

    return NextResponse.json(
      failure(appError, aiProviderFailureContext(result, mode)),
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
  const mode = resolveFeatureMode();
  const service = createAiProviderService();
  const result = service.draftMessage(await readInput(request));

  return responseForResult(result, mode);
}
