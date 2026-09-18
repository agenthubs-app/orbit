import type { EventExperienceQuestionContract } from "../api/contract/event-experience";

export type ChoiceDraft = { mode: "unanswered" | "option" | "other"; option: string | null; customText: string };
export type Progress = { answeredCount: number; totalCount: number; coreAnsweredCount: number; coreTotalCount: number; canSuggestStop: boolean };

const fields = ["positioning", "industry", "targetAttendees", "valueOffered", "desiredOutcome", "energyStyle", "experienceHighlight", "followUpPreference"] as const satisfies readonly EventExperienceQuestionContract["participantProfileField"][];
const coreFields = ["targetAttendees", "valueOffered"] as const;
const reservedOtherLabels = new Set(["其他", "Other", "その他"]);

export function registrationQuestionOptions(options: readonly string[]): string[] {
  return options.filter(option => !reservedOtherLabels.has(option));
}

export function registrationQuestionDraft(options: readonly string[], answer: string): ChoiceDraft {
  if (registrationQuestionOptions(options).includes(answer)) return { mode: "option", option: answer, customText: "" };
  if (answer || options.length === 0) return { mode: "other", option: null, customText: answer };
  return { mode: "unanswered", option: null, customText: "" };
}

export function registrationQuestionAnswer(draft: ChoiceDraft): string {
  return (draft.mode === "option" ? draft.option ?? "" : draft.mode === "other" ? draft.customText : "").trim();
}

export function registrationQuestionnaireProgress(answers: readonly { field: string; answer: string }[]): Progress {
  const allowed = new Set<string>(fields);
  const covered = new Set(answers.filter(answer => allowed.has(answer.field) && answer.answer.trim()).map(answer => answer.field));
  const coreAnsweredCount = coreFields.filter(field => covered.has(field)).length;
  return { answeredCount: covered.size, totalCount: fields.length, coreAnsweredCount, coreTotalCount: coreFields.length, canSuggestStop: coreAnsweredCount === coreFields.length };
}
