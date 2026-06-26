import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  createRelationshipStageAndProfileService,
  relationshipProfileFailureContext,
  relationshipProfileFailureToAppError,
} from "../../../../../features/connections/service-factory";
import type {
  RelationshipProfileResult,
  RelationshipStageUpdateInput,
} from "../../../../../features/connections/profile-contract";

export const dynamic = "force-dynamic";

interface RelationshipStageRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type StageBody = {
  relationshipStage?: string;
  scenario?: string;
};

type StageBodyResult =
  | {
      success: true;
      body: StageBody;
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

function requestHasBody(request: Request): boolean {
  return request.body !== null && request.headers.get("content-length") !== "0";
}

async function readStageBody(request: Request): Promise<StageBodyResult> {
  if (!requestHasBody(request)) {
    return {
      success: true,
      body: {},
    };
  }

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
        relationshipStage: readString(body.relationshipStage),
        scenario: readString(body.scenario),
      },
    };
  } catch {
    return {
      success: false,
    };
  }
}

function responseForResult(
  result: RelationshipProfileResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = relationshipProfileFailureToAppError(result);

    return NextResponse.json(
      failure(appError, relationshipProfileFailureContext(result, mode)),
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

export async function PATCH(
  request: Request,
  context: RelationshipStageRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const profileService = createRelationshipStageAndProfileService();
  const stageBody = await readStageBody(request);

  if (!stageBody.success) {
    return responseForResult(
      profileService.invalidRelationshipProfileBody(),
      mode,
    );
  }

  const input: RelationshipStageUpdateInput = {
    connectionId: id,
    relationshipStage: stageBody.body.relationshipStage,
    scenario: searchParams.get("scenario") ?? stageBody.body.scenario,
  };

  return responseForResult(profileService.updateStage(input), mode);
}
