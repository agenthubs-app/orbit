import { NextResponse } from "next/server";

import {
  contactInvitationFailureContext,
  contactInvitationFailureToAppError,
  type ConfirmContactInvitationInput,
  type ContactInvitationResult,
  type ContactInvitationService,
  type PrepareContactInvitationInput,
} from "../../../features/followups/contact-invitation-contract";
import { createContactInvitationService } from "../../../features/followups/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
} from "../_shared/authenticated-actor";

export interface ContactInvitationHandlerDependencies {
  createService?: (
    mode: ReturnType<typeof resolveFeatureMode>,
    actor: AuthenticatedApiActor,
  ) => ContactInvitationService;
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  body: Record<string, unknown>,
  field: string,
): string {
  return typeof body[field] === "string" ? body[field] : "";
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function responseFor(
  result: ContactInvitationResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = contactInvitationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, contactInvitationFailureContext(result, mode)),
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

export function createContactInvitationPostHandler({
  createService = (mode, actor) =>
    createContactInvitationService(mode, {
      actorId: actor.id,
      workspaceId: actor.workspaceId ?? "workspace:mock-auth",
    }),
  resolveActor = resolveAuthenticatedApiActor,
}: ContactInvitationHandlerDependencies = {}) {
  return async function POST(request: Request): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    const body = await readBody(request);
    const input: PrepareContactInvitationInput = {
      contactId: stringField(body, "contactId"),
      recipientEmail: stringField(body, "recipientEmail"),
      recipientName: stringField(body, "recipientName"),
    };
    const result = await createService(mode, actor).prepareInvitation(input);

    return responseFor(result, mode);
  };
}

export function createContactInvitationPatchHandler({
  createService = (mode, actor) =>
    createContactInvitationService(mode, {
      actorId: actor.id,
      workspaceId: actor.workspaceId ?? "workspace:mock-auth",
    }),
  resolveActor = resolveAuthenticatedApiActor,
}: ContactInvitationHandlerDependencies = {}) {
  return async function PATCH(request: Request): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    const body = await readBody(request);
    const input: ConfirmContactInvitationInput = {
      body: stringField(body, "body"),
      confirmed: body.confirmed === true,
      invitationId: stringField(body, "invitationId"),
      subject: stringField(body, "subject"),
    };
    const result = await createService(mode, actor).confirmInvitation(input);

    return responseFor(result, mode);
  };
}

export function createContactInvitationGetHandler({
  createService = (mode, actor) =>
    createContactInvitationService(mode, {
      actorId: actor.id,
      workspaceId: actor.workspaceId ?? "workspace:mock-auth",
    }),
  resolveActor = resolveAuthenticatedApiActor,
}: ContactInvitationHandlerDependencies = {}) {
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    const invitationId =
      new URL(request.url).searchParams.get("invitationId") ?? "";
    const result = await createService(mode, actor).getInvitation(invitationId);

    return responseFor(result, mode);
  };
}
