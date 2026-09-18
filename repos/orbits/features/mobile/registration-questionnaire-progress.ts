import { EVENT_PARTICIPANT_PROFILE_FIELDS } from "../events/registration/contract";
import { EVENT_PROFILE_CORE_FIELDS } from "../events/registration/interview-response-contract";

export function registrationQuestionnaireProgress(answers: readonly { field: string; answer: string }[]) {
  const allowed = new Set<string>(EVENT_PARTICIPANT_PROFILE_FIELDS);
  const covered = new Set(answers.filter(answer => allowed.has(answer.field) && answer.answer.trim()).map(answer => answer.field));
  const coreAnsweredCount = EVENT_PROFILE_CORE_FIELDS.filter(field => covered.has(field)).length;
  return { answeredCount: covered.size, totalCount: EVENT_PARTICIPANT_PROFILE_FIELDS.length, coreAnsweredCount, coreTotalCount: EVENT_PROFILE_CORE_FIELDS.length, canSuggestStop: coreAnsweredCount === EVENT_PROFILE_CORE_FIELDS.length };
}
