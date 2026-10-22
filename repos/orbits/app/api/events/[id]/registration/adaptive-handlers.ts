import { NextResponse } from "next/server";

import {
  AdaptiveInterviewGenerationError,
  generateEventPersona,
  nextAdaptiveInterviewQuestion,
  readInterviewTranscript,
} from "../../../../../features/events/registration/adaptive-interview-service";
import { signAdaptiveInterviewQuestion } from "../../../../../features/events/registration/interview-question-token.server";
import { createEventRegistrationPortraitRuntime } from "../../../../../features/events/registration/portrait/runtime";
import type { AiQuotaGate } from "../../../../../features/ai-quota/gate";
import { createPostgresAiUsageLedger } from "../../../../../features/ai-quota/ledger";
import { createLedgeredRunner, type LedgeredRunner } from "../../../../../features/events/journey/ledgered-runner";
import { runOrbitAgentModelText } from "../../../../../features/orbit-ai/gemini-provider";
import { createConfiguredTransactionalPostgresRuntime } from "../../../../../shared/storage/transactional-postgres";
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

/** LF13: the AI usage ledger of the configured database (null without one: tests and the local mock mode run unledgered). */
function configuredLedger(): AiQuotaGate | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  return runtime ? createPostgresAiUsageLedger({ client: runtime.client, workspaceId: runtime.workspaceId }) : null;
}

/** LF13: the answer when the ledger kept the model call off — the quota is used up (409 AI_LIMIT, as the plan flow) or it is unavailable. */
function ledgerRefusalResponse(ledgered: LedgeredRunner, mode: ReturnType<typeof resolveFeatureMode>, kept: string): Response | null {
  const refusal = ledgered.refusal();
  if (refusal === "quota") return NextResponse.json(failure(new AppError("CONFLICT", `Today's AI limit for this step is used up. ${kept}`), { reason: "AI_LIMIT" }), { headers: runtimeBoundaryHeaders(mode), status: 409 });
  if (refusal === "unavailable") return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", `AI is temporarily unavailable. ${kept}`)), { headers: runtimeBoundaryHeaders(mode), status: 503 });
  return null;
}

export function createRegistrationInterviewPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  loadEvent: LoadEventForRegistration = loadEventForRegistration,
  getPortraitService: () => PortraitService | null = () => createEventRegistrationPortraitRuntime()?.service ?? null,
  getLedger: () => AiQuotaGate | null = configuredLedger,
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
    // R27：问题文字可以用日文（模型语言），签名 token / 活动名仍按中英两版。
    const questionLanguage = body.language === "ja" ? ("ja" as const) : language;
    let portraitService: PortraitService | null = null;
    if (body.mode === "portrait-interview") {
      try {
        portraitService = getPortraitService();
        if (!portraitService) throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Durable portrait storage is unavailable.");
        await portraitService.prepareInterview({ actorId: actor.id, event });
      } catch (error) { return portraitErrorResponse(error, mode); }
    }
    let step;
    // LF13: every question is one ledgered operation (event_registration_question, 40 a Tokyo day); a refused ledger sends nothing.
    const ledgered = createLedgeredRunner({ actorId: actor.id, gate: getLedger(), idempotencyKey: `event-question:${event.id}:${Date.now()}`, purpose: "event_registration_question", refuseWithoutLedger: true, runner: runOrbitAgentModelText });
    try {
      step = await nextAdaptiveInterviewQuestion({
        event: {
          ...event,
          title: localizedEventTitle(event, language),
          venue: bilingualSegment(event.venue, language),
        },
        language: questionLanguage,
        transcript: readInterviewTranscript(body.transcript),
        modelRunner: ledgered.run,
      });
      await ledgered.finish("succeeded");
    } catch (error) {
      await ledgered.finish("failed");
      const refused = ledgerRefusalResponse(ledgered, mode, "Your answers were kept.");
      if (refused) return refused;
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
  getLedger: () => AiQuotaGate | null = configuredLedger,
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
    // LF13: the older persona route counts as a self-introduction (event_registration_interview, 30 a Tokyo month).
    const ledgered = createLedgeredRunner({ actorId: actor.id, gate: getLedger(), idempotencyKey: `event-persona-legacy:${event.id}:${Date.now()}`, purpose: "event_registration_interview", refuseWithoutLedger: true, runner: runOrbitAgentModelText });
    try {
      persona = await generateEventPersona({
        event: {
          ...event,
          title: localizedEventTitle(event, language),
          venue: bilingualSegment(event.venue, language),
        },
        language,
        transcript,
        modelRunner: ledgered.run,
      });
      await ledgered.finish("succeeded");
    } catch (error) {
      await ledgered.finish("failed");
      const refused = ledgerRefusalResponse(ledgered, mode, "The registration remains saved.");
      if (refused) return refused;
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
