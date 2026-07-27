import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  businessCardContactWriteFailureContext,
  businessCardContactWriteFailureToAppError,
  type ConfirmBusinessCardContactInput,
} from "../../../../../features/contacts/contact-write-contract";
import { createBusinessCardContactWriteService } from "../../../../../features/contacts/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

type BusinessCardConfirmationRequestInput = Omit<
  ConfirmBusinessCardContactInput,
  "actorId" | "actorLabel"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  body: Record<string, unknown>,
  field: string,
): string {
  return typeof body[field] === "string" ? body[field] : "";
}

function actorLabel(actor: AuthenticatedApiActor): string {
  return actor.name?.trim() || actor.email?.trim() || actor.id;
}

async function readConfirmationInput(
  request: Request,
): Promise<BusinessCardConfirmationRequestInput> {
  let parsedBody: unknown = {};

  try {
    parsedBody = await request.json();
  } catch {
    parsedBody = {};
  }

  const body = isRecord(parsedBody) ? parsedBody : {};
  const evidenceIds = Array.isArray(body.evidenceIds)
    ? body.evidenceIds.filter(
        (evidenceId): evidenceId is string => typeof evidenceId === "string",
      )
    : [];

  return {
    confirmed: body.confirmed === true,
    displayName: stringField(body, "displayName"),
    draftId: stringField(body, "draftId"),
    email: stringField(body, "email"),
    evidenceIds,
    imageDigest: stringField(body, "imageDigest"),
    organization: stringField(body, "organization"),
    phone: stringField(body, "phone"),
    relationshipContext: stringField(body, "relationshipContext"),
    role: stringField(body, "role"),
  };
}

export function createBusinessCardContactConfirmHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(request: Request): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const service = createBusinessCardContactWriteService(mode);
    const result = await service.confirmBusinessCardContact({
      ...(await readConfirmationInput(request)),
      actorId: actor.id,
      actorLabel: actorLabel(actor),
    });

    if (result.success === false) {
      const appError = businessCardContactWriteFailureToAppError(result);

      return NextResponse.json(
        failure(
          appError,
          businessCardContactWriteFailureContext(result, mode),
        ),
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
  };
}
