import { NextResponse } from "next/server";

import { createConfiguredNotificationInteractionService, type NotificationInteractionService } from "../../../../../features/notifications/interaction-service";
import { failure, success } from "../../../../../shared/api/envelope";
import { AppError } from "../../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../_shared/authenticated-actor";

export function createNotificationStatePostHandler(input: {
  interactions?: NotificationInteractionService | null;
  resolveActor?: ResolveAuthenticatedApiActor;
} = {}) {
  return async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const actor = await (input.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const interactions = input.interactions === undefined ? createConfiguredNotificationInteractionService() : input.interactions;
    if (!interactions) return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Notification interaction storage is not configured.")), { status: 503 });
    try {
      const [{ id }, body] = await Promise.all([context.params, request.json().catch(() => null)]);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A JSON object is required.");
      const state = (body as Record<string, unknown>).state;
      if (state !== "read" && state !== "ignored") throw new Error("state must be read or ignored.");
      return NextResponse.json(success(await interactions.set({ actorId: actor.id, notificationId: id, state })));
    } catch (error) {
      return NextResponse.json(failure(new AppError("VALIDATION_ERROR", error instanceof Error ? error.message : "Notification state is invalid.")), { status: 400 });
    }
  };
}
