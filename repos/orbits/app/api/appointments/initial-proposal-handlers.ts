import { AppointmentError, type AppointmentMedium } from "../../../features/appointments/contract";
import { createAppointmentContactAuthorityReader } from "../../../features/appointments/contact-authority";
import { createPostgresAppointmentRepository, resolveAcceptedEventContactContext } from "../../../features/appointments/postgres-repository";
import { createAppointmentService, type AppointmentService } from "../../../features/appointments/service";
import { createConfiguredEventOperationsPostgresRuntime, type EventOperationsPostgresRuntime } from "../../../features/events/event-operations/storage/postgres-client";
import { meetingInitialProposalAvailabilityQuerySchema, meetingInitialProposalRequestSchema } from "../../../shared/api-schema/appointment-initial-proposal";
import { failure, success } from "../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type AuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../_shared/authenticated-actor";
import { appointmentMutationErrorResponse, publicAppointment } from "./handlers";

interface InitialProposalBoundary {
  service: Pick<AppointmentService, "createDraft">;
  contactAuthority: { read(actorId: string, contactId: string): Promise<{ eventId: string; authorityReference: string } | null> };
}
interface Dependencies {
  resolveActor: ResolveAuthenticatedApiActor;
  boundary: (workspaceId: string, contactId: string) => InitialProposalBoundary | null;
}

export function createAppointmentInitialProposalBoundary(runtime: EventOperationsPostgresRuntime, workspaceId: string, contactId: string): InitialProposalBoundary | null {
  if (runtime.workspaceId !== workspaceId) return null;
  return {
    contactAuthority: createAppointmentContactAuthorityReader({ client: runtime.client, workspaceId, verify: input => resolveAcceptedEventContactContext(input, runtime) }),
    service: createAppointmentService({ repository: createPostgresAppointmentRepository(runtime), authorityVerifier: {
      async resolveAcceptedBilateralContact(input) {
        if (!input.eventId) return null;
        const authority = await resolveAcceptedEventContactContext({ actorId: input.actorId, eventId: input.eventId, requestId: input.authorityReference }, runtime);
        // Recheck the requested contact at create time; a changed canonical side must not create for another contact.
        return authority?.contactIdsByActor[input.actorId] === contactId ? authority : null;
      },
    } }),
  };
}

const configured: Dependencies = {
  resolveActor: resolveAuthenticatedApiActor,
  boundary(workspaceId, contactId) {
    const runtime = createConfiguredEventOperationsPostgresRuntime();
    return runtime ? createAppointmentInitialProposalBoundary(runtime, workspaceId, contactId) : null;
  },
};
const headers = { "Cache-Control": "private, no-store" };
const invalid = () => new AppError("VALIDATION_ERROR", "Invalid meeting proposal request.");

export function createAppointmentInitialProposalHandlers(dependencies: Dependencies = configured) {
  function boundary(actor: AuthenticatedApiActor, contactId: string) {
    if (!actor.workspaceId?.trim() || !actor.id.trim()) throw new AppError("SERVICE_UNAVAILABLE", "Meeting proposal storage is unavailable.");
    const value = dependencies.boundary(actor.workspaceId, contactId);
    if (!value) throw new AppError("SERVICE_UNAVAILABLE", "Meeting proposal storage is unavailable.");
    return value;
  }
  async function guarded(run: () => Promise<Response>) {
    try { const response = await run(); response.headers.set("Cache-Control", headers["Cache-Control"]); return response; }
    catch (error) {
      if (error instanceof AppointmentError) {
        const response = appointmentMutationErrorResponse(new AppointmentError(error.code, "The meeting proposal could not be accepted."));
        response.headers.set("Cache-Control", headers["Cache-Control"]); return response;
      }
      const safe = error instanceof AppError ? error : new AppError("SERVICE_UNAVAILABLE", "Meeting proposals are temporarily unavailable.");
      return Response.json(failure(safe), { status: getHttpStatusForAppErrorCode(safe.code), headers });
    }
  }
  return {
    GET: (request: Request) => guarded(async () => {
      const actor = await dependencies.resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      const query = new URL(request.url).searchParams;
      if (query.size !== 1) throw invalid();
      const parsed = meetingInitialProposalAvailabilityQuerySchema.safeParse(Object.fromEntries(query));
      if (!parsed.success) throw invalid();
      const value = boundary(actor, parsed.data.contactId);
      const authority = await value.contactAuthority.read(actor.id, parsed.data.contactId);
      return Response.json(success({ contactId: parsed.data.contactId, available: authority !== null }), { headers });
    }),
    POST: (request: Request) => guarded(async () => {
      const actor = await dependencies.resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      if (new URL(request.url).search || Number(request.headers.get("content-length")) > 65_536) throw invalid();
      const key = request.headers.get("idempotency-key");
      if (!key || key.length > 96 || !/^[\x21-\x7e]+$/.test(key)) throw invalid();
      const text = await request.text();
      if (new TextEncoder().encode(text).byteLength > 65_536) throw invalid();
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { throw invalid(); }
      const parsed = meetingInitialProposalRequestSchema.safeParse(raw);
      if (!parsed.success) throw invalid();
      const medium = parsed.data.proposal.medium;
      if (!medium) throw invalid();
      const normalizedMedium: AppointmentMedium = medium.kind === "in_person" ? { kind: "in_person", location: medium.location }
        : medium.kind === "video" ? { kind: "video", provider: medium.provider, joinUrl: medium.joinUrl ?? null }
        : { kind: "phone", phoneHint: medium.phoneHint ?? null };
      const value = boundary(actor, parsed.data.contactId);
      const authority = await value.contactAuthority.read(actor.id, parsed.data.contactId);
      if (!authority) throw new AppError("FORBIDDEN", "A verified accepted bilateral contact is required.");
      const result = await value.service.createDraft({ actorId: actor.id, ...authority, idempotencyKey: key, initialProposal: { ...parsed.data.proposal, medium: normalizedMedium } });
      return Response.json(success({ ...publicAppointment(result.appointment, actor.id), replayed: result.replayed }), { status: result.replayed ? 200 : 201, headers });
    }),
  };
}
