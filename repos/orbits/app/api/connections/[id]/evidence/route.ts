import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import { createConnectionEvidenceService } from "../../../../../features/connections/service-factory";
import {
  connectionEvidenceFailureContext,
  connectionEvidenceFailureToAppError,
} from "../../../../../features/connections/service";
import type {
  ConnectionAddEvidenceInput,
  ConnectionEvidenceAddResult,
} from "../../../../../features/connections/contract";

export const dynamic = "force-dynamic";

interface ConnectionEvidenceRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type AddEvidenceBody = {
  contribution?: string;
  evidenceId?: string;
  excerpt?: string;
  occurredAt?: string;
  scenario?: string;
  sourceLabel?: string;
  sourceType?: string;
  title?: string;
};

type AddEvidenceBodyResult =
  | {
      success: true;
      body: AddEvidenceBody;
    }
  | {
      success: false;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function readAddEvidenceBody(
  request: Request,
): Promise<AddEvidenceBodyResult> {
  try {
    const body: unknown = await request.json();

    if (!isRecord(body)) {
      return {
        success: true,
        body: {},
      };
    }

    return {
      success: true,
      body: {
        contribution: readString(body.contribution),
        evidenceId: readString(body.evidenceId),
        excerpt: readString(body.excerpt),
        occurredAt: readString(body.occurredAt),
        scenario: readString(body.scenario),
        sourceLabel: readString(body.sourceLabel),
        sourceType: readString(body.sourceType),
        title: readString(body.title),
      },
    };
  } catch {
    return {
      success: false,
    };
  }
}

function responseForResult(
  result: ConnectionEvidenceAddResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = connectionEvidenceFailureToAppError(result);

    return NextResponse.json(
      failure(appError, connectionEvidenceFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 201,
  });
}

export async function POST(
  request: Request,
  context: ConnectionEvidenceRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const connectionService = createConnectionEvidenceService();
  const addEvidenceBody = await readAddEvidenceBody(request);

  if (!addEvidenceBody.success) {
    return responseForResult(connectionService.invalidAddEvidenceBody(), mode);
  }

  const { body } = addEvidenceBody;
  const input: ConnectionAddEvidenceInput = {
    connectionId: id,
    contribution: body.contribution,
    evidenceId: body.evidenceId,
    excerpt: body.excerpt,
    occurredAt: body.occurredAt,
    scenario: searchParams.get("scenario") ?? body.scenario,
    sourceLabel: body.sourceLabel,
    sourceType: body.sourceType,
    title: body.title,
  };
  const result = connectionService.addEvidence(input);

  return responseForResult(result, mode);
}
