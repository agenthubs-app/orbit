import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../../shared/errors/app-error";
import {
  createConfiguredRelationshipCommunicationService,
} from "../../../features/relationship-communication/service-factory";
import type { RelationshipCommunicationService } from "../../../features/relationship-communication/service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
} from "../_shared/authenticated-actor";

export interface RelationshipCommunicationHandlerDependencies {
  createService?: (
    actor: AuthenticatedApiActor,
    invitationBaseUrl: string,
  ) => RelationshipCommunicationService;
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
}

interface DynamicContext {
  params: Promise<Record<string, string>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function stringField(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === "string" ? value[key] : "";
}

function errorCode(error: Error): AppErrorCode {
  const message = error.message.toLowerCase();
  if (message.includes("unavailable") || message.includes("incomplete")) {
    return "SERVICE_UNAVAILABLE";
  }
  if (message.includes("not available") || message.includes("no confirmed")) {
    return "NOT_FOUND";
  }
  if (
    message.includes("revoked") ||
    message.includes("expired") ||
    message.includes("stale") ||
    message.includes("conflict") ||
    message.includes("already")
  ) {
    return "CONFLICT";
  }
  return "VALIDATION_ERROR";
}

function failureResponse(error: unknown): Response {
  const mode = resolveFeatureMode();
  const normalized = error instanceof Error ? error : new Error("Relationship communication failed.");
  const appError = new AppError(errorCode(normalized), normalized.message);
  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      mode,
      privacy: "participant-scoped-relationship-communication",
      provenance: "The request was validated by the relationship communication service.",
      service: "relationship-communication",
    }),
    { headers: runtimeBoundaryHeaders(mode), status: appError.code === "NOT_FOUND" ? 404 : appError.code === "CONFLICT" ? 409 : appError.code === "SERVICE_UNAVAILABLE" ? 503 : 400 },
  );
}

function ok(data: unknown, status = 200): Response {
  const mode = resolveFeatureMode();
  return NextResponse.json(success(data), {
    headers: runtimeBoundaryHeaders(mode),
    status,
  });
}

async function withService<T>(
  request: Request,
  dependencies: RelationshipCommunicationHandlerDependencies,
  operation: (service: RelationshipCommunicationService, actor: AuthenticatedApiActor) => Promise<T>,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const actor = await resolveActor();
  if (!actor) return authenticatedApiActorRequiredResponse(mode);
  const baseUrl = `${new URL(request.url).origin}/app/invitations`;
  const createService =
    dependencies.createService ?? createConfiguredRelationshipCommunicationService;
  try {
    return ok(await operation(createService(actor, baseUrl), actor));
  } catch (error) {
    return failureResponse(error);
  }
}

export function createEligibilityGetHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return (request: Request) =>
    withService(request, dependencies, async (service) =>
      service.getEligibility(new URL(request.url).searchParams.get("contactId") ?? ""),
    );
}

export function createInvitationsPostHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request) => {
    const body = await readBody(request);
    const response = await withService(request, dependencies, async (service) =>
      service.createInvitation({
        contactId: stringField(body, "contactId"),
        recipientEmail: stringField(body, "recipientEmail"),
        recipientName: stringField(body, "recipientName"),
      }),
    );
    if (response.status !== 200) return response;
    return new Response(response.body, { headers: response.headers, status: 201 });
  };
}

export function createInvitationAcceptPostHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request, context: DynamicContext) => {
    const body = await readBody(request);
    const { token = "" } = await context.params;
    return withService(request, dependencies, async (service) =>
      service.acceptInvitation({ confirmed: body.confirmed === true, token }),
    );
  };
}

export function createInvitationGetHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request, context: DynamicContext) => {
    const { token = "" } = await context.params;
    return withService(request, dependencies, async (service) =>
      service.getInvitationPreview(token),
    );
  };
}

export function createContactBindingDeleteHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request, context: DynamicContext) => {
    const { contactId = "" } = await context.params;
    return withService(request, dependencies, async (service) =>
      service.revokeContactBinding(contactId),
    );
  };
}

export function createConversationsGetHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return (request: Request) =>
    withService(request, dependencies, async (service) => {
      const query = new URL(request.url).searchParams;
      return service.listConversations({
        ...(query.has("limit") ? { limit: Number(query.get("limit")) } : {}),
        ...(query.has("cursor") ? { cursor: query.get("cursor")! } : {}),
      });
    });
}

export function createConversationGetHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request, context: DynamicContext) => {
    const { id = "" } = await context.params;
    return withService(request, dependencies, async (service) => service.getConversation(id));
  };
}

export function createConversationMessagesPostHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request, context: DynamicContext) => {
    const body = await readBody(request);
    const { id = "" } = await context.params;
    const response = await withService(request, dependencies, async (service) =>
      service.sendMessage({
        body: stringField(body, "body"),
        conversationId: id,
        qualificationVersion: stringField(body, "qualificationVersion"),
        requestId: request.headers.get("idempotency-key") ?? stringField(body, "requestId"),
      }),
    );
    if (response.status !== 200) return response;
    return new Response(response.body, { headers: response.headers, status: 201 });
  };
}

export function createConversationReadPostHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request, context: DynamicContext) => {
    const body = await readBody(request);
    const { id = "" } = await context.params;
    return withService(request, dependencies, async (service) =>
      service.markConversationRead({
        conversationId: id,
        lastReadMessageId: stringField(body, "lastReadMessageId"),
      }),
    );
  };
}
