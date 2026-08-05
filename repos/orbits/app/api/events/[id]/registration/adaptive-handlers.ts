import { NextResponse } from "next/server";

import {
  AdaptiveInterviewGenerationError,
  generateEventPersona,
  nextAdaptiveInterviewQuestion,
  readInterviewTranscript,
} from "../../../../../features/events/registration/adaptive-interview-service";
import { signAdaptiveInterviewQuestion } from "../../../../../features/events/registration/interview-question-token.server";
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

type LoadEventForRegistration = typeof loadEventForRegistration;

export function createRegistrationInterviewPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  loadEvent: LoadEventForRegistration = loadEventForRegistration,
) {
  return async function POST(
    request: Request,
    context: AdaptiveRegistrationRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const { id } = await context.params;
    const event = await loadEvent(id, actor.id);

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
    let step;
    try {
      step = await nextAdaptiveInterviewQuestion({
        event: {
          ...event,
          title: localizedEventTitle(event, language),
          venue: bilingualSegment(event.venue, language),
        },
        language,
        transcript: readInterviewTranscript(body.transcript),
      });
    } catch (error) {
      if (error instanceof AdaptiveInterviewGenerationError) {
        return NextResponse.json(
          failure(
            new AppError(
              "SERVICE_UNAVAILABLE",
              "The AI interview question could not be generated. Your answers were kept; retry this step.",
            ),
          ),
          { headers: runtimeBoundaryHeaders(mode), status: 503 },
        );
      }
      throw error;
    }

    const signedQuestion = step.question
      ? {
          question: step.question,
          questionToken: signAdaptiveInterviewQuestion({
            actorId: actor.id,
            eventId: event.id,
            language,
            question: step.question,
          }),
        }
      : null;

    return NextResponse.json(
      success({ done: step.done, signedQuestion }),
      {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
      },
    );
  };
}

export function createRegistrationPersonaPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  loadEvent: LoadEventForRegistration = loadEventForRegistration,
) {
  return async function POST(
    request: Request,
    context: AdaptiveRegistrationRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const { id } = await context.params;
    const event = await loadEvent(id, actor.id);

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
    let persona;
    try {
      persona = await generateEventPersona({
        event: {
          ...event,
          title: localizedEventTitle(event, language),
          venue: bilingualSegment(event.venue, language),
        },
        language,
        transcript,
      });
    } catch (error) {
      if (error instanceof AdaptiveInterviewGenerationError) {
        return NextResponse.json(
          failure(
            new AppError(
              "SERVICE_UNAVAILABLE",
              "The AI event persona could not be generated. The registration remains saved and can be retried.",
            ),
          ),
          { headers: runtimeBoundaryHeaders(mode), status: 503 },
        );
      }
      throw error;
    }

    return NextResponse.json(success({ persona }), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}
