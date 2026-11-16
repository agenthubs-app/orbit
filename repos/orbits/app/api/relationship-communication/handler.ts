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
import { RelationshipMessageStoreError } from "../../../features/relationship-communication/message-store";
import { RelationshipMeetingActiveError, RelationshipMeetingUnavailableError } from "../../../features/relationship-communication/meeting-proposals";
import { AppointmentError, type AppointmentProposalInput } from "../../../features/appointments/contract";
import { meetingProposalSchema } from "../../../shared/api-schema/appointment-initial-proposal";
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

/**
 * R39: errors with a stable reason for clients. `reason` (and, for an ongoing
 * meeting, `appointmentId`) is added to the error context:
 *   MEETING_ALREADY_ACTIVE  409  the pair already has an ongoing meeting (D2b)
 *   MEETING_NOT_AVAILABLE   403  no event exchange / live invite connection
 *   MEETING_INVALID_PROPOSAL 400 the proposal failed validation
 *   NOT_AVAILABLE/REVOKED/STALE/REQUEST_REUSED/BINDING_CONFLICT  message store codes
 */
function classified(error: Error): { code: AppErrorCode; message: string; reason?: string; appointmentId?: string } {
  if (error instanceof RelationshipMeetingActiveError) {
    return { code: "CONFLICT", message: error.message, reason: error.code, ...(error.appointmentId ? { appointmentId: error.appointmentId } : {}) };
  }
  if (error instanceof RelationshipMeetingUnavailableError) return { code: "FORBIDDEN", message: error.message, reason: error.code };
  if (error instanceof AppointmentError) {
    return error.code === "APPOINTMENT_INVALID_PROPOSAL"
      ? { code: "VALIDATION_ERROR", message: "The meeting proposal is invalid.", reason: "MEETING_INVALID_PROPOSAL" }
      : { code: "CONFLICT", message: "The meeting proposal could not be created.", reason: error.code };
  }
  if (error instanceof RelationshipMessageStoreError) return { code: errorCode(error), message: error.message, reason: error.code };
  return { code: errorCode(error), message: error.message };
}

function failureResponse(error: unknown): Response {
  const mode = resolveFeatureMode();
  const normalized = error instanceof Error ? error : new Error("Relationship communication failed.");
  const { code, message, reason, appointmentId } = classified(normalized);
  const appError = new AppError(code, message);
  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      mode,
      privacy: "participant-scoped-relationship-communication",
      provenance: "The request was validated by the relationship communication service.",
      service: "relationship-communication",
      ...(reason ? { reason } : {}),
      ...(appointmentId ? { appointmentId } : {}),
    }),
    { headers: runtimeBoundaryHeaders(mode), status: appError.code === "NOT_FOUND" ? 404 : appError.code === "CONFLICT" ? 409 : appError.code === "FORBIDDEN" ? 403 : appError.code === "SERVICE_UNAVAILABLE" ? 503 : 400 },
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

/** QA-C4: open (or return) the conversation with a person connected by invite code. */
export function createConversationStartPostHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request) => {
    const body = await readBody(request);
    return withService(request, dependencies, async (service) =>
      service.startConversation(stringField(body, "contactId")),
    );
  };
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

export function createConversationGetHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request, context: DynamicContext) => {
    const { id = "" } = await context.params;
    return withService(request, dependencies, async (service) => service.getConversation(id));
  };
}

/** R39: the optional `proposal` of a message, in the initial-proposal structure (medium normalized as there). */
function messageProposal(body: Record<string, unknown>): AppointmentProposalInput | undefined {
  if (!("proposal" in body) || body.proposal === undefined || body.proposal === null) return undefined;
  const parsed = meetingProposalSchema.safeParse(body.proposal);
  if (!parsed.success) throw new Error("The meeting proposal is invalid.");
  const { medium } = parsed.data;
  return { ...parsed.data, medium: medium.kind === "in_person" ? { kind: "in_person", location: medium.location }
    : medium.kind === "video" ? { kind: "video", provider: medium.provider, joinUrl: medium.joinUrl ?? null }
    : { kind: "phone", phoneHint: medium.phoneHint ?? null } };
}

export function createConversationMessagesPostHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request, context: DynamicContext) => {
    const body = await readBody(request);
    const { id = "" } = await context.params;
    const response = await withService(request, dependencies, async (service) => {
      const proposal = messageProposal(body);
      return service.sendMessage({
        body: stringField(body, "body"),
        conversationId: id,
        qualificationVersion: stringField(body, "qualificationVersion"),
        requestId: request.headers.get("idempotency-key") ?? stringField(body, "requestId"),
        ...("retireDraftThrough" in body ? { retireDraftThrough: body.retireDraftThrough } : {}),
        ...(proposal ? { proposal } : {}),
      });
    });
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

export function createConversationDraftGetHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request, context: DynamicContext) => {
    const { id = "" } = await context.params;
    return withService(request, dependencies, async (service) => service.getReplyDraft(id));
  };
}

export function createConversationDraftPutHandler(
  dependencies: RelationshipCommunicationHandlerDependencies = {},
) {
  return async (request: Request, context: DynamicContext) => {
    const body = await readBody(request);
    const { id = "" } = await context.params;
    return withService(request, dependencies, async (service) =>
      service.saveReplyDraft({ body: body.body, conversationId: id }),
    );
  };
}
