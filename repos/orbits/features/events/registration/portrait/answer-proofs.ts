import { createHash } from "node:crypto";
import type { PortraitAnswerProof, PortraitSourceAnswer, SavedPortrait } from "../../../../shared/contract/event-registration-portrait";
import { portraitAnswerProofSchema, portraitSourceAnswerSchema } from "../../../../shared/api-schema/event-registration-portrait";
import { EVENT_PROFILE_FIELD_LABELS, legacyResponsesFromAnswers } from "../interview-response-contract";
import { InterviewQuestionTokenError, verifyInterviewResponseSubmissions } from "../interview-question-token.server";
import { PortraitTokenError, verifyPortraitRegistrationQuestion, type PortraitTokenScope } from "./generation-token.server";
import { PortraitError, type PortraitSnapshot } from "./contract";
import { verifyPortraitAdaptiveQuestion } from "./adaptive-question-token.server";

export function portraitFormalSourceVersion(snapshot: PortraitSnapshot): string {
  return createHash("sha256").update(JSON.stringify([snapshot.eventSourceVersion ?? null, snapshot.questionSetHash ?? null, snapshot.questionSetVersion ?? null, snapshot.sourceRegistrationVersion, snapshot.sourceRegistrationFingerprint ?? null])).digest("hex");
}

export function portraitSnapshotSources(snapshot: PortraitSnapshot, portrait: SavedPortrait | null, source: "registration" | "portrait"): readonly PortraitSourceAnswer[] {
  if (source === "portrait") return portrait?.sourceAnswers.map((answer) => ({ ...structuredClone(answer), source: "portrait", sourceVersion: String(portrait.version) })) ?? [];
  const profile = snapshot.registrationProfile;
  if (!profile) return [];
  if (!snapshot.sourceRegistrationFingerprint) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The canonical registration reference is unavailable.");
  const responses = profile.interviewResponses?.length ? profile.interviewResponses : legacyResponsesFromAnswers(profile.answers, profile.updatedAt);
  return responses.map((response) => {
    const parsed = portraitSourceAnswerSchema.safeParse({ responseId: response.responseId, field: response.field, label: EVENT_PROFILE_FIELD_LABELS[response.field], answer: response.answer.displayText, question: response.question, questionSource: response.questionSource, generation: response.generation, source: "registration", sourceVersion: snapshot.sourceRegistrationFingerprint });
    if (!parsed.success) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The stored response snapshot is invalid.");
    return parsed.data as PortraitSourceAnswer;
  });
}

export function readPortraitAnswerProofs(input: PortraitTokenScope & { responses: readonly PortraitAnswerProof[]; snapshot: PortraitSnapshot; portrait: SavedPortrait | null; secret?: string; now?: () => number }): readonly PortraitSourceAnswer[] {
  if (!input.snapshot.eventExists) throw new PortraitError(404, "PORTRAIT_EVENT_NOT_FOUND", "A current event is required.");
  if (!Array.isArray(input.responses) || input.responses.length < 2 || input.responses.length > 8) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "Between two and eight trusted answers are required.");
  const fields = new Set<string>();
  const ids = new Set<string>();
  const results: PortraitSourceAnswer[] = [];
  for (const raw of input.responses) {
    const parsed = portraitAnswerProofSchema.safeParse(raw);
    if (!parsed.success) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "The answer proof is invalid.");
    const proof = parsed.data;
    let answer: PortraitSourceAnswer;
    try {
      if (proof.kind === "signed_question") {
        verifyPortraitAdaptiveQuestion({ workspaceId: input.workspaceId, actorId: input.actorId, eventId: input.eventId, questionToken: proof.questionToken, portraitAdaptiveToken: proof.portraitAdaptiveToken, secret: input.secret, now: input.now });
        const response = verifyInterviewResponseSubmissions({ actorId: input.actorId, eventId: input.eventId, responses: [{ answer: proof.answer, questionToken: proof.questionToken }], secret: input.secret, now: input.now })[0];
        answer = { responseId: response.responseId, field: response.field, label: EVENT_PROFILE_FIELD_LABELS[response.field], answer: proof.answer, question: response.question, questionSource: response.questionSource, generation: response.generation, source: "signed_question", sourceVersion: null };
      } else if (proof.kind === "registration_question") {
        const original = verifyPortraitRegistrationQuestion({ workspaceId: input.workspaceId, actorId: input.actorId, eventId: input.eventId, portraitQuestionToken: proof.portraitQuestionToken, secret: input.secret, now: input.now });
        if ((original.sourceRegistrationFingerprint ?? null) !== (input.snapshot.sourceRegistrationFingerprint ?? null) || original.sourceRegistrationVersion !== input.snapshot.sourceRegistrationVersion || original.eventSourceVersion !== input.snapshot.eventSourceVersion || original.questionSetHash !== (input.snapshot.questionSetHash ?? null) || original.questionSetVersion !== (input.snapshot.questionSetVersion ?? null)) throw new PortraitError(409, "PORTRAIT_SOURCE_CHANGED", "The formal question source changed. Fetch the current questions.");
        const field = original.question.participantProfileField;
        const label = EVENT_PROFILE_FIELD_LABELS[field];
        answer = {
          responseId: `formal:${original.question.id}`, field, label, answer: proof.answer,
          question: { fieldLabel: label, inputKind: "single_choice_with_custom", language: original.language, options: original.question.options.map((option, index) => ({ id: `option-${index + 1}`, label: option })), prompt: original.question.prompt },
          questionSource: "registration_question", generation: { method: original.provenance.generationMethod, model: original.provenance.model, provider: original.provenance.provider, promptVersion: 1 },
          source: "registration_question", sourceVersion: portraitFormalSourceVersion(input.snapshot),
        };
      } else if (proof.source === "portrait") {
        if (!input.portrait || proof.sourceVersion !== String(input.portrait.version) || input.portrait.actorId !== input.actorId || input.portrait.eventId !== input.eventId) throw new PortraitError(409, "PORTRAIT_SOURCE_CHANGED", "The saved portrait source changed. Read the current portrait.");
        const original = input.portrait.sourceAnswers.find((item) => item.responseId === proof.responseId);
        if (!original) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "The saved response does not exist.");
        answer = { ...structuredClone(original), answer: proof.answer, source: "portrait", sourceVersion: proof.sourceVersion };
      } else {
        const profile = input.snapshot.registrationProfile;
        if (!input.snapshot.sourceRegistrationFingerprint) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The canonical registration reference is unavailable.");
        if (!profile || profile.userId !== input.actorId || profile.eventId !== input.eventId || proof.sourceVersion !== input.snapshot.sourceRegistrationFingerprint) throw new PortraitError(409, "PORTRAIT_SOURCE_CHANGED", "The registration source changed. Read the current answers.");
        const responses = profile.interviewResponses?.length ? profile.interviewResponses : legacyResponsesFromAnswers(profile.answers, profile.updatedAt);
        const original = responses.find((item) => item.responseId === proof.responseId);
        if (!original) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "The stored registration response does not exist.");
        answer = { responseId: original.responseId, field: original.field, label: EVENT_PROFILE_FIELD_LABELS[original.field], answer: proof.answer, question: structuredClone(original.question), questionSource: original.questionSource, generation: structuredClone(original.generation), source: "registration", sourceVersion: proof.sourceVersion };
      }
    } catch (error) {
      if (error instanceof PortraitError) throw error;
      if (error instanceof PortraitTokenError || error instanceof InterviewQuestionTokenError) throw new PortraitError(422, error.code.includes("EXPIRED") ? "PORTRAIT_GENERATION_EXPIRED" : "PORTRAIT_INPUT_INVALID", "The answer proof is invalid or expired. Read a trusted stored answer or ask a new question.");
      throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The stored answer source is invalid.");
    }
    const trusted = portraitSourceAnswerSchema.safeParse(answer);
    if (!trusted.success) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The trusted answer snapshot is invalid.");
    if (fields.has(answer.field) || ids.has(answer.responseId)) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "Answer fields and response IDs must be unique.");
    fields.add(answer.field);
    ids.add(answer.responseId);
    results.push(trusted.data as PortraitSourceAnswer);
  }
  if (!fields.has("targetAttendees") || !fields.has("valueOffered")) throw new PortraitError(422, "PORTRAIT_CORE_REQUIRED", "Both core answers are required before generating a portrait.");
  return results;
}
