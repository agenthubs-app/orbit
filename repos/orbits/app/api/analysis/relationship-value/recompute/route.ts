import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  createRelationshipValueScoringService,
  relationshipValueFailureContext,
  relationshipValueFailureToAppError,
} from "../../../../../features/analysis/service-factory";
import type {
  RelationshipValueRecomputeInput,
  RelationshipValueResult,
} from "../../../../../features/analysis/value-contract";

export const dynamic = "force-dynamic";

function responseForResult(
  result: RelationshipValueResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = relationshipValueFailureToAppError(result);

    return NextResponse.json(
      failure(appError, relationshipValueFailureContext(result, mode)),
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

function isObjectBody(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBody(
  body: Record<string, unknown>,
  scenario: string | null,
): RelationshipValueRecomputeInput {
  const evidenceIds = Array.isArray(body.evidenceIds)
    ? body.evidenceIds.filter((evidenceId): evidenceId is string => {
        return typeof evidenceId === "string";
      })
    : null;

  return {
    connectionId:
      typeof body.connectionId === "string"
        ? body.connectionId
        : "demo-connection-1",
    evidenceIds,
    scenario,
  };
}

function acceptsJsonBody(request: Request): boolean {
  return (request.headers.get("content-type") ?? "")
    .toLowerCase()
    .includes("application/json");
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const relationshipValueService =
    createRelationshipValueScoringService();

  if (request.body === null || !acceptsJsonBody(request)) {
    return responseForResult(
      relationshipValueService.recomputeRelationshipValue(
        normalizeBody({}, scenario),
      ),
      mode,
    );
  }

  try {
    const body = await request.json();

    if (!isObjectBody(body)) {
      return responseForResult(
        relationshipValueService.invalidRecomputeBody(),
        mode,
      );
    }

    return responseForResult(
      relationshipValueService.recomputeRelationshipValue(
        normalizeBody(body, scenario),
      ),
      mode,
    );
  } catch {
    return responseForResult(
      relationshipValueService.invalidRecomputeBody(),
      mode,
    );
  }
}
