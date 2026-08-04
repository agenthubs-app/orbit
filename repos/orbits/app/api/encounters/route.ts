import { NextResponse } from "next/server";

import { createConfiguredHumanEncounterService } from "../../../features/encounters/runtime";
import { failure, success } from "../../../shared/api/envelope";
import { AppError } from "../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor } from "../_shared/authenticated-actor";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) return authenticatedApiActorRequiredResponse("live");
  const service = createConfiguredHumanEncounterService();
  if (!service) return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Human encounter storage is not configured.")), { status: 503 });
  const eventId = new URL(request.url).searchParams.get("eventId");
  const values = await service.list({ actorId: actor.id, eventId });
  return NextResponse.json(success(values.map(({ actorId: _actorId, ...value }) => value)));
}

export async function POST(request: Request): Promise<Response> {
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) return authenticatedApiActorRequiredResponse("live");
  const service = createConfiguredHumanEncounterService();
  if (!service) return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Human encounter storage is not configured.")), { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const talked = body.talked === "yes" || body.talked === "no" || body.talked === "uncertain" ? body.talked : null;
    const privacy = body.privacy === "private" || body.privacy === "relationship_shared" ? body.privacy : null;
    if (!talked || !privacy || typeof body.contactId !== "string" || typeof body.observedAt !== "string") throw new Error("talked, privacy, contactId, and observedAt are required.");
    const value = await service.capture({
      actorId: actor.id,
      commitments: Array.isArray(body.commitments) ? body.commitments.filter((item): item is string => typeof item === "string") : [],
      connectionId: typeof body.connectionId === "string" ? body.connectionId : null,
      contactId: body.contactId,
      eventId: typeof body.eventId === "string" ? body.eventId : null,
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
      nextStep: typeof body.nextStep === "string" ? body.nextStep : null,
      noteText: typeof body.noteText === "string" ? body.noteText : null,
      observedAt: body.observedAt,
      privacy,
      talked,
      tags: Array.isArray(body.tags) ? body.tags.filter((item): item is string => typeof item === "string") : [],
      voiceMemoReference: typeof body.voiceMemoReference === "string" ? body.voiceMemoReference : null,
    });
    return NextResponse.json(success({ ...value, actorId: undefined }), { status: 201 });
  } catch (error) {
    return NextResponse.json(failure(new AppError("VALIDATION_ERROR", error instanceof Error ? error.message : "Encounter capture failed.")), { status: 400 });
  }
}
