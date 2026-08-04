import { NextResponse } from "next/server";

import { AppointmentError, type AppointmentAggregate, type AppointmentCommand, type AppointmentProposalInput } from "../../../features/appointments/contract";
import { createConfiguredAppointmentService } from "../../../features/appointments/runtime";
import { failure, success } from "../../../shared/api/envelope";
import { AppError } from "../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor } from "../_shared/authenticated-actor";

type Json = Record<string, unknown>;

async function bodyFor(request: Request): Promise<Json> {
  const value = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("VALIDATION_ERROR", "The request body must be a JSON object.");
  return value as Json;
}

function text(value: unknown, label: string, maxLength = 256): string {
  if (typeof value !== "string" || !value.trim()) throw new AppError("VALIDATION_ERROR", `${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new AppError("VALIDATION_ERROR", `${label} is too long.`);
  return normalized;
}

function idempotency(request: Request): string {
  const key = text(request.headers.get("idempotency-key"), "Idempotency-Key header", 96);
  if (!/^[\x21-\x7e]+$/.test(key)) throw new AppError("VALIDATION_ERROR", "Idempotency-Key must contain printable ASCII characters only.");
  return key;
}

function proposalFrom(value: unknown): AppointmentProposalInput | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("VALIDATION_ERROR", "proposal must be an object.");
  const proposal = value as Json;
  if (!Array.isArray(proposal.candidateTimes) || proposal.candidateTimes.length < 3 || proposal.candidateTimes.length > 5) throw new AppError("VALIDATION_ERROR", "proposal.candidateTimes must contain three to five values.");
  const candidateTimes = proposal.candidateTimes.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new AppError("VALIDATION_ERROR", `proposal.candidateTimes[${index}] must be an object.`);
    const item = candidate as Json;
    if (typeof item.startsAtUtc !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(item.startsAtUtc)) throw new AppError("VALIDATION_ERROR", `proposal.candidateTimes[${index}].startsAtUtc must be RFC3339 UTC ending in Z.`);
    if (item.candidateId !== undefined && item.candidateId !== null && (typeof item.candidateId !== "string" || item.candidateId.length > 128)) throw new AppError("VALIDATION_ERROR", `proposal.candidateTimes[${index}].candidateId is invalid.`);
    return { candidateId: typeof item.candidateId === "string" ? item.candidateId : null, startsAtUtc: item.startsAtUtc };
  });
  if (!Number.isSafeInteger(proposal.durationMinutes) || Number(proposal.durationMinutes) < 15 || Number(proposal.durationMinutes) > 480) throw new AppError("VALIDATION_ERROR", "proposal.durationMinutes must be an integer from 15 to 480.");
  if (typeof proposal.timezone !== "string" || !proposal.timezone.trim() || proposal.timezone.length > 128) throw new AppError("VALIDATION_ERROR", "proposal.timezone is invalid.");
  if (proposal.note !== undefined && proposal.note !== null && (typeof proposal.note !== "string" || proposal.note.length > 2_000)) throw new AppError("VALIDATION_ERROR", "proposal.note is invalid.");
  if (!proposal.medium || typeof proposal.medium !== "object" || Array.isArray(proposal.medium)) throw new AppError("VALIDATION_ERROR", "proposal.medium must be an object.");
  const medium = proposal.medium as Json;
  let parsedMedium: AppointmentProposalInput["medium"];
  if (medium.kind === "in_person") {
    if (typeof medium.location !== "string" || !medium.location.trim() || medium.location.length > 500) throw new AppError("VALIDATION_ERROR", "proposal.medium.location is invalid.");
    parsedMedium = { kind: "in_person", location: medium.location };
  } else if (medium.kind === "video") {
    if (medium.provider !== "google_meet" && medium.provider !== "other") throw new AppError("VALIDATION_ERROR", "proposal.medium.provider is invalid.");
    if (medium.joinUrl !== null && medium.joinUrl !== undefined && (typeof medium.joinUrl !== "string" || medium.joinUrl.length > 2_048)) throw new AppError("VALIDATION_ERROR", "proposal.medium.joinUrl is invalid.");
    if (typeof medium.joinUrl === "string") {
      let joinUrl: URL;
      try { joinUrl = new URL(medium.joinUrl); } catch { throw new AppError("VALIDATION_ERROR", "proposal.medium.joinUrl must be a valid HTTPS URL."); }
      if (joinUrl.protocol !== "https:") throw new AppError("VALIDATION_ERROR", "proposal.medium.joinUrl must use HTTPS.");
    }
    parsedMedium = { kind: "video", provider: medium.provider, joinUrl: typeof medium.joinUrl === "string" ? medium.joinUrl : null };
  } else if (medium.kind === "phone") {
    if (medium.phoneHint !== null && medium.phoneHint !== undefined && (typeof medium.phoneHint !== "string" || medium.phoneHint.length > 128)) throw new AppError("VALIDATION_ERROR", "proposal.medium.phoneHint is invalid.");
    parsedMedium = { kind: "phone", phoneHint: typeof medium.phoneHint === "string" ? medium.phoneHint : null };
  } else throw new AppError("VALIDATION_ERROR", "proposal.medium.kind is invalid.");
  return { candidateTimes, durationMinutes: Number(proposal.durationMinutes), medium: parsedMedium, note: typeof proposal.note === "string" ? proposal.note : null, timezone: proposal.timezone };
}

function publicAppointment(value: AppointmentAggregate, actorId: string) {
  const roleFor = (valueActorId: string) => valueActorId === actorId ? "you" : "other";
  return {
    appointmentId: value.appointmentId,
    authorityRequestId: value.authorityRequestId,
    confirmed: value.confirmed ? { ...value.confirmed, confirmedBy: roleFor(value.confirmed.confirmedByActorId), confirmedByActorId: undefined } : null,
    contactId: value.contactIdsByActor[actorId] ?? null,
    createdAt: value.createdAt,
    eventId: value.eventId,
    history: value.history.map(({ actorId: historyActorId, ...entry }) => ({ ...entry, actor: roleFor(historyActorId) })),
    pendingProposalRevision: value.pendingProposalRevision,
    projection: value.projection,
    relationshipPairId: value.relationshipPairId,
    proposals: value.proposals.map(({ proposedByActorId, ...proposal }) => ({ ...proposal, proposedBy: roleFor(proposedByActorId) })),
    status: value.status,
    updatedAt: value.updatedAt,
    version: value.version,
  };
}

export function appointmentErrorResponse(error: unknown): Response {
  if (error instanceof AppointmentError) {
    const code = error.code === "APPOINTMENT_NOT_FOUND" ? "NOT_FOUND" : error.code === "APPOINTMENT_FORBIDDEN" ? "FORBIDDEN" : error.code === "APPOINTMENT_CONFLICT" || error.code === "APPOINTMENT_INVALID_TRANSITION" || error.code === "APPOINTMENT_TIME_GATED" ? "CONFLICT" : "VALIDATION_ERROR";
    const status = code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : code === "CONFLICT" ? 409 : 400;
    return NextResponse.json(failure(new AppError(code, error.message), { featureCode: error.code }), { status });
  }
  if (error instanceof AppError) return NextResponse.json(failure(error), { status: 400 });
  return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Appointment service is temporarily unavailable.")), { status: 503 });
}

async function actorAndService() {
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) return null;
  const service = createConfiguredAppointmentService();
  if (!service) throw new AppError("SERVICE_UNAVAILABLE", "Appointment storage is not configured.");
  return { actor, service };
}

export async function getAppointments(): Promise<Response> {
  try {
    const context = await actorAndService();
    if (!context) return authenticatedApiActorRequiredResponse("live");
    const values = await context.service.list({ actorId: context.actor.id });
    return NextResponse.json(success(values.map((value) => publicAppointment(value, context.actor.id))));
  } catch (error) { return appointmentErrorResponse(error); }
}

export async function postAppointment(request: Request): Promise<Response> {
  try {
    const context = await actorAndService();
    if (!context) return authenticatedApiActorRequiredResponse("live");
    const body = await bodyFor(request);
    const eventId = text(body.eventId, "eventId");
    const eventContactRequestId = text(body.eventContactRequestId, "eventContactRequestId");
    const result = await context.service.createDraft({
      actorId: context.actor.id,
      authorityReference: eventContactRequestId,
      appointmentId: typeof body.appointmentId === "string" ? text(body.appointmentId, "appointmentId") : null,
      eventId,
      idempotencyKey: idempotency(request),
    });
    return NextResponse.json(success({ ...publicAppointment(result.appointment, context.actor.id), replayed: result.replayed }), { status: result.replayed ? 200 : 201 });
  } catch (error) { return appointmentErrorResponse(error); }
}

export async function getAppointment(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const boundary = await actorAndService();
    if (!boundary) return authenticatedApiActorRequiredResponse("live");
    const { id } = await context.params;
    return NextResponse.json(success(publicAppointment(await boundary.service.get({ actorId: boundary.actor.id, appointmentId: text(id, "appointmentId") }), boundary.actor.id)));
  } catch (error) { return appointmentErrorResponse(error); }
}

export async function postAppointmentCommand(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const boundary = await actorAndService();
    if (!boundary) return authenticatedApiActorRequiredResponse("live");
    const [{ id }, body] = await Promise.all([context.params, bodyFor(request)]);
    const commands: readonly AppointmentCommand[] = ["propose", "counter", "accept", "decline", "cancel", "complete"];
    const command = commands.find((value) => value === body.command);
    if (!command) throw new AppError("VALIDATION_ERROR", "command is invalid.");
    if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) throw new AppError("VALIDATION_ERROR", "expectedVersion must be a positive integer.");
    const result = await boundary.service.command({
      actorId: boundary.actor.id,
      appointmentId: text(id, "appointmentId"),
      candidateId: typeof body.candidateId === "string" ? text(body.candidateId, "candidateId", 128) : null,
      command,
      expectedVersion: Number(body.expectedVersion),
      idempotencyKey: idempotency(request),
      proposal: proposalFrom(body.proposal),
    });
    return NextResponse.json(success({ ...publicAppointment(result.appointment, boundary.actor.id), replayed: result.replayed }));
  } catch (error) { return appointmentErrorResponse(error); }
}
