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
  RelationshipProfileUpdateInput,
} from "../../../../../features/connections/profile-contract";

export const dynamic = "force-dynamic";

interface RelationshipProfileRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type ProfileBody = {
  context?: string;
  mutualValue?: {
    contactReceives?: string;
    orbitUserReceives?: string;
    valueTypes?: string[];
  };
  nextAction?: {
    dueAt?: string;
    label?: string;
    rationale?: string;
  };
  relationshipType?: string;
  scenario?: string;
};

type ProfileBodyResult =
  | {
      success: true;
      body: ProfileBody;
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

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function requestHasBody(request: Request): boolean {
  return request.body !== null && request.headers.get("content-length") !== "0";
}

function readMutualValue(
  value: unknown,
): ProfileBody["mutualValue"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    contactReceives: readString(value.contactReceives),
    orbitUserReceives: readString(value.orbitUserReceives),
    valueTypes: readStringArray(value.valueTypes),
  };
}

function readNextAction(value: unknown): ProfileBody["nextAction"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    dueAt: readString(value.dueAt),
    label: readString(value.label),
    rationale: readString(value.rationale),
  };
}

async function readProfileBody(request: Request): Promise<ProfileBodyResult> {
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
        context: readString(body.context),
        mutualValue: readMutualValue(body.mutualValue),
        nextAction: readNextAction(body.nextAction),
        relationshipType: readString(body.relationshipType),
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
  context: RelationshipProfileRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const profileService = createRelationshipStageAndProfileService();
  const profileBody = await readProfileBody(request);

  if (!profileBody.success) {
    return responseForResult(
      profileService.invalidRelationshipProfileBody(),
      mode,
    );
  }

  const input: RelationshipProfileUpdateInput = {
    connectionId: id,
    context: profileBody.body.context,
    mutualValue: profileBody.body.mutualValue,
    nextAction: profileBody.body.nextAction,
    relationshipType: profileBody.body.relationshipType,
    scenario: searchParams.get("scenario") ?? profileBody.body.scenario,
  };

  return responseForResult(profileService.updateProfile(input), mode);
}
