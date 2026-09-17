import type { PortraitAnswerProof, PortraitField, PortraitPreviewResult, PortraitRegistrationSource, SavedPortrait } from "../api/contract/event-registration-portrait";
import { portraitAnswerProofSchema, portraitPreviewInputSchema, portraitReadResultSchema, portraitSaveResultSchema } from "../api/schema/event-registration-portrait";
import type { EventRegistrationQuestionView } from "./event-registration";

export interface PortraitHistoryEntry { id: string; field: PortraitField; prompt: string | null; options: readonly string[]; answer: string; proof: PortraitAnswerProof }
export interface PortraitSession { scopeKey: string; view: "registration" | "interview" | "result" | "review"; history: readonly PortraitHistoryEntry[]; unverifiedDrafts?: readonly PortraitHistoryEntry[]; editRevision: number; preview: PortraitPreviewResult | null; savedPortrait: SavedPortrait | null; saveState: "idle" | "saving" | "pending-confirmation" | "rejected" | "saved" }

export function portraitSessionScope(baseUrl: string, actorId: string, eventId: string): string { return JSON.stringify([baseUrl, actorId, eventId]); }
export function createPortraitSession(scopeKey: string, history: readonly PortraitHistoryEntry[] = [], savedPortrait: SavedPortrait | null = null): PortraitSession { return { scopeKey, view: "registration", history, editRevision: 0, preview: null, savedPortrait, saveState: savedPortrait ? "saved" : "idle" }; }
export function editPortraitHistory(session: PortraitSession, index: number, answer: string): PortraitSession {
  const entry = session.history[index];
  if (!entry) throw new Error("The history answer does not exist.");
  const proof = portraitAnswerProofSchema.parse({ ...entry.proof, answer });
  if (proof.answer === entry.answer) return session;
  return { ...session, history: [...session.history.slice(0, index), { ...entry, answer: proof.answer, proof }], editRevision: session.editRevision + 1, preview: null, saveState: "idle" };
}
export function restartUnstoredPortraitQuestions(session: PortraitSession): PortraitSession {
  const first = session.history.findIndex(entry => entry.proof.kind === "signed_question");
  if (first < 0) return session;
  return { ...session, view: "interview", history: session.history.slice(0, first), unverifiedDrafts: session.history.slice(first), editRevision: session.editRevision + 1, preview: null, saveState: "idle" };
}
export function appendPortraitAnswer(session: PortraitSession, entry: PortraitHistoryEntry): PortraitSession {
  if (session.history.length >= 8 || session.history.some((item) => item.field === entry.field || item.id === entry.id)) throw new Error("Portrait answer fields cannot repeat.");
  const proof = portraitAnswerProofSchema.parse(entry.proof);
  if (proof.answer !== entry.answer.trim()) throw new Error("The answer and its proof must match.");
  return { ...session, history: [...session.history, { ...entry, answer: proof.answer, proof }], editRevision: session.editRevision + 1, preview: null, saveState: "idle" };
}
export function portraitPreviewBody(session: PortraitSession, language: "en" | "zh") {
  const fields = new Set(session.history.map((entry) => entry.field));
  if (fields.size !== session.history.length || !fields.has("targetAttendees") || !fields.has("valueOffered")) throw new Error("Both core portrait answers are required.");
  return portraitPreviewInputSchema.parse({ mode: "portrait-preview", language, responses: session.history.map((entry) => entry.proof) });
}
export function portraitReceiptMatches(data: unknown, readback: unknown, actorId: string, eventId: string, mutationId: string): boolean {
  const saved = portraitSaveResultSchema.safeParse(data);
  const read = portraitReadResultSchema.safeParse(readback);
  if (!saved.success || !read.success || !read.data.portrait) return false;
  const receipt = saved.data.receipt;
  const portrait = read.data.portrait;
  return receipt.actorId === actorId && receipt.eventId === eventId && receipt.mutationId === mutationId && portrait.actorId === actorId && portrait.eventId === eventId && portrait.id === receipt.portraitId && portrait.version === receipt.portraitVersion && portrait.answersVersion === receipt.answersVersion && portrait.updatedAt === receipt.updatedAt;
}
export function portraitToView(data: unknown): SavedPortrait | null { return portraitReadResultSchema.parse(data).portrait as SavedPortrait | null; }
export function seedPortraitHistory(input: { registrationData: unknown; questions: readonly EventRegistrationQuestionView[]; answers: Record<string, string>; savedPortrait?: SavedPortrait | null; registrationSource?: PortraitRegistrationSource | null }): readonly PortraitHistoryEntry[] {
  if (input.savedPortrait) return input.savedPortrait.sourceAnswers.map(entry => ({ id: entry.responseId, field: entry.field, prompt: entry.question?.prompt ?? null, options: entry.question?.options.map(option => option.label) ?? [], answer: entry.answer, proof: { kind: "stored_response", source: "portrait", responseId: entry.responseId, sourceVersion: String(input.savedPortrait!.version), answer: entry.answer } }));
  const data = input.registrationData as { registration?: { updatedAt?: string; participantProfile?: { answers?: Record<string, string>; interviewResponses?: readonly { responseId: string; field: PortraitField; answer: { displayText: string }; question: { prompt: string; options: readonly { label: string }[] } | null }[] } } } | null;
  const registration = data?.registration;
  const profile = registration?.participantProfile;
  const fields: readonly PortraitField[] = ["positioning", "industry", "targetAttendees", "valueOffered", "desiredOutcome", "energyStyle", "experienceHighlight", "followUpPreference"];
  const stored = new Map<PortraitField, PortraitHistoryEntry>();
  if (profile) {
    if (!input.registrationSource) throw new Error("The canonical registration reference is unavailable.");
    const responses = input.registrationSource.answers;
    for (const response of responses) {
      if (!fields.includes(response.field)) continue;
      const answer = (input.answers[response.field] ?? response.answer).trim();
      if (!answer) continue;
      stored.set(response.field, { id: response.responseId, field: response.field, prompt: response.question?.prompt ?? null, options: response.question?.options.map(option => option.label) ?? [], answer, proof: { kind: "stored_response", source: "registration", responseId: response.responseId, sourceVersion: input.registrationSource.sourceVersion, answer } });
    }
  }
  for (const question of input.questions) {
    const field = question.field as PortraitField;
    const answer = (input.answers[field] ?? question.answer).trim();
    if (!stored.has(field) && fields.includes(field) && answer && question.portraitQuestionToken) stored.set(field, { id: `formal:${question.id}`, field, prompt: question.prompt, options: question.options, answer, proof: { kind: "registration_question", portraitQuestionToken: question.portraitQuestionToken, answer } });
  }
  return [...stored.values()];
}
