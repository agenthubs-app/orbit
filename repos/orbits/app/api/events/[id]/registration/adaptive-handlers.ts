import { NextResponse } from "next/server";

import {
  AdaptiveInterviewGenerationError,
  generateEventPersona,
  nextAdaptiveInterviewQuestion,
  readInterviewTranscript,
} from "../../../../../features/events/registration/adaptive-interview-service";
import { signAdaptiveInterviewQuestion } from "../../../../../features/events/registration/interview-question-token.server";
import { createEventRegistrationPortraitRuntime } from "../../../../../features/events/registration/portrait/runtime";
import { PortraitError } from "../../../../../features/events/registration/portrait/contract";
import { portraitPreviewInputSchema, portraitRenewInputSchema } from "../../../../../shared/api-schema/event-registration-portrait";
import type { PortraitAnswerProof } from "../../../../../shared/contract/event-registration-portrait";
import { portraitErrorResponse, type PortraitService } from "./portrait/route-handlers";
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
  getPortraitService: () => PortraitService | null = () => createEventRegistrationPortraitRuntime()?.service ?? null,
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
      mode?: unknown;
      language?: unknown;
      transcript?: unknown;
    };
    if (body.mode === "renew-stored-question") {
      try {
        const parsed = portraitRenewInputSchema.safeParse(body);
        if (!parsed.success) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "A trusted stored response reference is required.");
        const service = getPortraitService();
        if (!service) throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Durable portrait storage is unavailable.");
        return NextResponse.json(success(await service.renew({ actorId: actor.id, eventId: event.id, source: parsed.data.source, responseId: parsed.data.responseId, sourceVersion: parsed.data.sourceVersion })), { headers: runtimeBoundaryHeaders(mode) });
      } catch (error) { return portraitErrorResponse(error, mode); }
    }
    const language = body.language === "en" ? ("en" as const) : ("zh" as const);
    let portraitService: PortraitService | null = null;
    if (body.mode === "portrait-interview") {
      try {
        portraitService = getPortraitService();
        if (!portraitService) throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Durable portrait storage is unavailable.");
        await portraitService.prepareInterview({ actorId: actor.id, event });
      } catch (error) { return portraitErrorResponse(error, mode); }
    }
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

    let signedQuestion: { question: NonNullable<typeof step.question>; questionToken: string; portraitAdaptiveToken?: string } | null = step.question
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

    if (portraitService && signedQuestion) {
      try {
        signedQuestion = { ...signedQuestion, portraitAdaptiveToken: await portraitService.bindAdaptiveQuestion({ actorId: actor.id, event, questionToken: signedQuestion.questionToken }) };
      } catch (error) { return portraitErrorResponse(error, mode); }
    }

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
  getPortraitService: () => PortraitService | null = () => createEventRegistrationPortraitRuntime()?.service ?? null,
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
      mode?: unknown;
      language?: unknown;
      transcript?: unknown;
    };
    if (body.mode === "portrait-preview") {
      try {
        const parsed = portraitPreviewInputSchema.safeParse(body);
        if (!parsed.success) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "Trusted portrait answer proofs are required.");
        const service = getPortraitService();
        if (!service) throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Durable portrait storage is unavailable.");
        return NextResponse.json(success(await service.preview({ actorId: actor.id, event, language: parsed.data.language, responses: parsed.data.responses as readonly PortraitAnswerProof[] })), { headers: runtimeBoundaryHeaders(mode) });
      } catch (error) { return portraitErrorResponse(error, mode); }
    }
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
