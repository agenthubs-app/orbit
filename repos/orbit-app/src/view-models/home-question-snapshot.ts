import { todayHomeQuestions, type HomeQuestion } from "./today-tasks";

export interface HomeQuestionSnapshot {
  scope: string;
  questions: readonly HomeQuestion[] | null;
  refreshing: boolean;
  awaitingLoading: boolean;
}

interface HomeQuestionInput {
  scope: string;
  payload: unknown;
  ready: boolean;
  refreshing: boolean;
}

export function homeQuestionSnapshot(
  previous: HomeQuestionSnapshot | null,
  input: HomeQuestionInput,
): HomeQuestionSnapshot {
  if (previous && previous.scope !== input.scope) {
    // The resource hook may expose its old payload for one render after an
    // account/server switch. Wait for its loading/refreshing cycle before accepting it.
    return { scope: input.scope, questions: null, refreshing: false, awaitingLoading: input.ready };
  }
  if (previous?.awaitingLoading && input.ready && !input.refreshing) return previous;

  const questions = input.ready && !input.refreshing &&
    (!previous?.questions || previous.refreshing)
    ? todayHomeQuestions(input.payload)
    : previous?.questions ?? null;
  if (previous && previous.questions === questions &&
    previous.refreshing === input.refreshing && !previous.awaitingLoading) return previous;

  return { scope: input.scope, questions, refreshing: input.refreshing, awaitingLoading: false };
}
