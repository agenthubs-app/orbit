import { createHash } from "node:crypto";
import type { PortraitAnswerProof, PortraitPreviewResult, PortraitReadResult, PortraitSaveBody } from "../../../../shared/contract/event-registration-portrait";
import { portraitPersonaSchema, portraitSaveInputSchema } from "../../../../shared/api-schema/event-registration-portrait";
import { generateEventPersona, type AdaptiveInterviewModelRunner } from "../adaptive-interview-service";
import type { EventRecord } from "../../event-crud-and-import/contract";
import { localizedEventTitle } from "../event-loader";
import { bilingualSegment } from "../../../orbit-ai/event-recommendation-artifact-service";
import { PortraitError, type PortraitRepository } from "./contract";
import { portraitSnapshotSources, readPortraitAnswerProofs } from "./answer-proofs";
import { PortraitTokenError, signPortraitGeneration, verifyPortraitGeneration } from "./generation-token.server";
import { signPortraitAdaptiveQuestion } from "./adaptive-question-token.server";

export function portraitAnswersVersion(answers: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(answers)).digest("hex");
}

export function createEventRegistrationPortraitService(input: { repository: PortraitRepository; workspaceId: string; secret?: string; now?: () => number; modelRunner?: AdaptiveInterviewModelRunner }) {
  return {
    async prepareInterview(request: { actorId: string; event: EventRecord }) {
      const { snapshot } = await input.repository.readSources({ actorId: request.actorId, eventId: request.event.id });
      if (!snapshot.eventExists) throw new PortraitError(404, "PORTRAIT_EVENT_NOT_FOUND", "A current event is required.");
      if (!snapshot.eventVersion || request.event.sourceMetadata.id !== `event-core-postgres:${request.event.id}:v${snapshot.eventVersion}`) throw new PortraitError(409, "PORTRAIT_SOURCE_CHANGED", "The event context changed. Read the current event before asking a question.");
    },
    async bindAdaptiveQuestion(request: { actorId: string; event: EventRecord; questionToken: string }) {
      const { snapshot } = await input.repository.readSources({ actorId: request.actorId, eventId: request.event.id });
      if (!snapshot.eventExists || request.event.sourceMetadata.id !== `event-core-postgres:${request.event.id}:v${snapshot.eventVersion}`) throw new PortraitError(409, "PORTRAIT_SOURCE_CHANGED", "The event context changed while asking the question.");
      return signPortraitAdaptiveQuestion({ workspaceId: input.workspaceId, actorId: request.actorId, eventId: request.event.id, questionToken: request.questionToken, secret: input.secret, now: input.now });
    },
    async renew(request: { actorId: string; eventId: string; source: "registration" | "portrait"; responseId: string; sourceVersion: string }) {
      const { snapshot, portrait } = await input.repository.readSources({ actorId: request.actorId, eventId: request.eventId });
      if (request.source === "registration" && !snapshot.sourceRegistrationFingerprint) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The canonical registration reference is unavailable.");
      const version = request.source === "registration" ? snapshot.sourceRegistrationFingerprint : portrait ? String(portrait.version) : null;
      if (version !== request.sourceVersion) throw new PortraitError(409, "PORTRAIT_SOURCE_CHANGED", "The saved answer source changed. Read the current answers.");
      const response = portraitSnapshotSources(snapshot, portrait, request.source).find((answer) => answer.responseId === request.responseId);
      if (!response) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "The stored response does not exist.");
      return { source: request.source, sourceVersion: request.sourceVersion, responseId: response.responseId, field: response.field, answer: response.answer, question: response.question, generation: response.generation };
    },
    async preview(request: { actorId: string; event: EventRecord; language: "en" | "zh"; responses: readonly PortraitAnswerProof[] }): Promise<PortraitPreviewResult> {
      const { snapshot, portrait } = await input.repository.readSources({ actorId: request.actorId, eventId: request.event.id });
      if (!snapshot.eventVersion || request.event.sourceMetadata.id !== `event-core-postgres:${request.event.id}:v${snapshot.eventVersion}`) throw new PortraitError(409, "PORTRAIT_SOURCE_CHANGED", "The event context changed. Read the current event before generating.");
      const sourceAnswers = readPortraitAnswerProofs({ workspaceId: input.workspaceId, actorId: request.actorId, eventId: request.event.id, responses: request.responses, snapshot, portrait, secret: input.secret, now: input.now });
      // The source transaction has ended before any provider work begins.
      const persona = await generateEventPersona({ event: { ...request.event, title: localizedEventTitle(request.event, request.language), venue: bilingualSegment(request.event.venue, request.language) }, language: request.language, transcript: sourceAnswers.map((answer) => ({ field: answer.field, answer: answer.answer, prompt: answer.question?.prompt ?? answer.label[request.language] })), modelRunner: input.modelRunner });
      const validated = portraitPersonaSchema.safeParse(persona);
      if (!validated.success) throw new PortraitError(503, "PORTRAIT_GENERATION_INVALID", "The model did not return a validated portrait.");
      const generation = { persona: validated.data, sourceAnswers, answersVersion: portraitAnswersVersion(sourceAnswers), sourceEventVersion: request.event.sourceMetadata.id, sourceQuestionSetHash: snapshot.questionSetHash ?? null, sourceQuestionSetVersion: snapshot.questionSetVersion ?? null, sourceRegistrationVersion: snapshot.sourceRegistrationVersion, sourceRegistrationFingerprint: snapshot.sourceRegistrationFingerprint ?? null, generatedAt: new Date((input.now ?? Date.now)()).toISOString() };
      const generationToken = signPortraitGeneration({ workspaceId: input.workspaceId, actorId: request.actorId, eventId: request.event.id, generation: generation as Parameters<typeof signPortraitGeneration>[0]["generation"], secret: input.secret, now: input.now });
      return { persona: generation.persona, generationToken, answersVersion: generation.answersVersion, sourceRegistrationVersion: generation.sourceRegistrationVersion } as PortraitPreviewResult;
    },
    async save(request: { actorId: string; eventId: string; mutation: PortraitSaveBody }) {
      const mutation = portraitSaveInputSchema.safeParse(request.mutation);
      if (!mutation.success) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "The portrait save request is invalid.");
      try {
        const generation = verifyPortraitGeneration({ workspaceId: input.workspaceId, actorId: request.actorId, eventId: request.eventId, generationToken: mutation.data.generationToken, secret: input.secret, now: input.now });
        if (portraitAnswersVersion(generation.sourceAnswers) !== generation.answersVersion) throw new PortraitError(422, "PORTRAIT_GENERATION_INVALID", "The portrait answers version is invalid.");
        return await input.repository.save({ actorId: request.actorId, eventId: request.eventId, mutation: mutation.data as PortraitSaveBody, generation, updatedAt: new Date((input.now ?? Date.now)()).toISOString() });
      } catch (error) {
        if (error instanceof PortraitTokenError) throw new PortraitError(422, error.code, error.message);
        throw error;
      }
    },
    async read(request: { actorId: string; eventId: string; subjectId?: string }): Promise<PortraitReadResult> {
      if (request.subjectId && request.subjectId !== request.actorId) return { portrait: await input.repository.read(request) };
      const { snapshot, portrait } = await input.repository.readSources(request);
      if (snapshot.registrationProfile && !snapshot.sourceRegistrationFingerprint) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The canonical registration reference is unavailable.");
      return { portrait, registrationSource: snapshot.registrationProfile ? { actorId: request.actorId, eventId: request.eventId, sourceVersion: snapshot.sourceRegistrationFingerprint!, answers: portraitSnapshotSources(snapshot, portrait, "registration") } : null };
    },
  };
}
