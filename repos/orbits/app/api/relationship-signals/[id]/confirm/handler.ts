import { NextResponse } from "next/server";

import {
  emailCalendarSignalFailureContext,
  emailCalendarSignalFailureToAppError,
  type EmailCalendarSignalConfirmInput,
} from "../../../../../features/acquisition/email-calendar-contract";
import { createEmailCalendarSignalServiceForActor } from "../../../../../features/acquisition/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

interface ConfirmRelationshipSignalRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFormText(
  formData: FormData,
  fieldName: string,
): string | undefined {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : undefined;
}

async function readConfirmInput(
  request: Request,
  signalId: string,
  actorLabel?: string,
): Promise<EmailCalendarSignalConfirmInput> {
  const url = new URL(request.url);
  const queryInput: EmailCalendarSignalConfirmInput = {
    signalId,
    actorLabel,
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      ...queryInput,
      scenario: readFormText(formData, "scenario") ?? queryInput.scenario,
    };
  }

  if (!contentType.includes("application/json")) {
    return queryInput;
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return queryInput;
  }

  const parsedBody: unknown = JSON.parse(rawBody);
  const body = isRecord(parsedBody) ? parsedBody : {};

  return {
    ...queryInput,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

function labelFor(actor: AuthenticatedApiActor): string {
  return actor.name?.trim() || actor.email?.trim() || actor.id;
}

export function createConfirmEmailCalendarSignalPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(
    request: Request,
    context: ConfirmRelationshipSignalRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const { id } = await context.params;
    const service = createEmailCalendarSignalServiceForActor(actor.id, mode);
    const result = await service.confirmEmailCalendarSignal(
      await readConfirmInput(
        request,
        id,
        mode === "live" ? labelFor(actor) : undefined,
      ),
    );

    if (result.success === false) {
      const appError = emailCalendarSignalFailureToAppError(result);

      return NextResponse.json(
        failure(appError, emailCalendarSignalFailureContext(result, mode)),
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
