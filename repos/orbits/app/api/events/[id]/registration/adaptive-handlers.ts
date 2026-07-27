import { NextResponse } from "next/server";

import {
  generateEventPersona,
  nextAdaptiveInterviewQuestion,
  readInterviewTranscript,
} from "../../../../../features/events/registration/adaptive-interview-service";
import {
  loadEventForRegistration,
  localizedEventTitle,
} from "../../../../../features/events/registration/event-loader";
import { bilingualSegment } from "../../../../../features/orbit-ai/event-recommendation-artifact-service";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

interface AdaptiveRegistrationRouteContext {
  params: Promise<{ id: string }>;
}

export function createRegistrationInterviewPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(
    request: Request,
    context: AdaptiveRegistrationRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const { id } = await context.params;
    const event = await loadEventForRegistration(id);

    if (!event) {
      return NextResponse.json(
        failure(new AppError("NOT_FOUND", "The event could not be found.")),
        { headers: runtimeBoundaryHeaders(mode), status: 404 },
      );
    }

    if (!["confirmed", "imported"].includes(event.status)) {
      return NextResponse.json(
        failure(
          new AppError("CONFLICT", "This event is not open for registration."),
        ),
        { headers: runtimeBoundaryHeaders(mode), status: 409 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      language?: unknown;
      transcript?: unknown;
    };
    const language = body.language === "en" ? ("en" as const) : ("zh" as const);
    const step = await nextAdaptiveInterviewQuestion({
      event: {
        ...event,
        title: localizedEventTitle(event, language),
        venue: bilingualSegment(event.venue, language),
      },
      language,
      transcript: readInterviewTranscript(body.transcript),
    });

    return NextResponse.json(success(step), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}

export function createRegistrationPersonaPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(
    request: Request,
    context: AdaptiveRegistrationRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const { id } = await context.params;
    const event = await loadEventForRegistration(id);

    if (!event) {
      return NextResponse.json(
        failure(new AppError("NOT_FOUND", "The event could not be found.")),
        { headers: runtimeBoundaryHeaders(mode), status: 404 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      language?: unknown;
      transcript?: unknown;
    };
    const transcript = readInterviewTranscript(body.transcript);

    if (transcript.length === 0) {
      return NextResponse.json(
        failure(
          new AppError(
            "VALIDATION_ERROR",
            "At least one answered interview turn is required to build a persona.",
          ),
        ),
        { headers: runtimeBoundaryHeaders(mode), status: 422 },
      );
    }

    const language = body.language === "en" ? ("en" as const) : ("zh" as const);
    const persona = await generateEventPersona({
      event: {
        ...event,
        title: localizedEventTitle(event, language),
        venue: bilingualSegment(event.venue, language),
      },
      language,
      transcript,
    });

    return NextResponse.json(success({ persona }), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}
