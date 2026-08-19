import { NextResponse } from "next/server";

import {
  createConfiguredEventRegistrationOpeningReminderService,
  type EventRegistrationOpeningReminderService,
} from "../../../../../features/events/registration/opening-reminder-service";
import { readRuntimeEventRegistrationAvailability } from "../../../../../features/events/registration/runtime";
import { failure, success } from "../../../../../shared/api/envelope";
import { AppError } from "../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

interface HandlerDependencies {
  readAvailability?: typeof readRuntimeEventRegistrationAvailability;
  reminders?: EventRegistrationOpeningReminderService | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

type EventContext = { params: Promise<{ id: string }> };

async function requestInput(
  request: Request,
  context: EventContext,
): Promise<{ eventId: string; eventTitle: string | null }> {
  const { id } = await context.params;
  const eventId = id.trim();
  if (!eventId || eventId.length > 256) throw new Error("Event is invalid.");
  const body = await request.json().catch(() => null);
  const eventTitle =
    body && typeof body === "object" && !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).eventTitle === "string"
      ? (body as Record<string, unknown>).eventTitle as string
      : null;
  return { eventId, eventTitle };
}

function unavailable(): Response {
  return NextResponse.json(
    failure(
      new AppError(
        "SERVICE_UNAVAILABLE",
        "Event registration opening reminder storage is not configured.",
      ),
    ),
    { status: 503 },
  );
}

export function createEventRegistrationOpeningReminderHandlers(
  dependencies: HandlerDependencies = {},
) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;

  return {
    GET: async (request: Request, context: EventContext): Promise<Response> => {
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      const reminders = dependencies.reminders === undefined
        ? createConfiguredEventRegistrationOpeningReminderService()
        : dependencies.reminders;
      if (!reminders) return unavailable();

      try {
        const { eventId, eventTitle } = await requestInput(request, context);
        const availability = await (
          dependencies.readAvailability ?? readRuntimeEventRegistrationAvailability
        )(eventId);
        return NextResponse.json(success(await reminders.get({
          actorId: actor.id,
          availability,
          eventId,
          eventTitle,
        })));
      } catch (error) {
        return NextResponse.json(
          failure(new AppError(
            "VALIDATION_ERROR",
            error instanceof Error ? error.message : "Reminder request is invalid.",
          )),
          { status: 400 },
        );
      }
    },

    POST: async (request: Request, context: EventContext): Promise<Response> => {
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      const reminders = dependencies.reminders === undefined
        ? createConfiguredEventRegistrationOpeningReminderService()
        : dependencies.reminders;
      if (!reminders) return unavailable();

      try {
        const { eventId, eventTitle } = await requestInput(request, context);
        const availability = await (
          dependencies.readAvailability ?? readRuntimeEventRegistrationAvailability
        )(eventId);
        if (availability !== "unavailable") {
          return NextResponse.json(
            failure(new AppError(
              "CONFLICT",
              availability === "open"
                ? "Registration is already open."
                : "This registration window will not reopen.",
            )),
            { status: 409 },
          );
        }
        return NextResponse.json(success(await reminders.subscribe({
          actorId: actor.id,
          eventId,
          eventTitle,
        })));
      } catch (error) {
        return NextResponse.json(
          failure(new AppError(
            "VALIDATION_ERROR",
            error instanceof Error ? error.message : "Reminder request is invalid.",
          )),
          { status: 400 },
        );
      }
    },

    DELETE: async (request: Request, context: EventContext): Promise<Response> => {
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      const reminders = dependencies.reminders === undefined
        ? createConfiguredEventRegistrationOpeningReminderService()
        : dependencies.reminders;
      if (!reminders) return unavailable();

      try {
        const { eventId } = await requestInput(request, context);
        return NextResponse.json(success(await reminders.unsubscribe({
          actorId: actor.id,
          eventId,
        })));
      } catch (error) {
        return NextResponse.json(
          failure(new AppError(
            "VALIDATION_ERROR",
            error instanceof Error ? error.message : "Reminder request is invalid.",
          )),
          { status: 400 },
        );
      }
    },
  };
}
