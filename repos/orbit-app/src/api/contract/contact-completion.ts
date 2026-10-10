// R08 contract 3 — one question a day that completes what Orbit knows about a
// person. Owner: 甲 (R16). Used by: To-do, 人脈.
export interface ContactCompletionQuestion {
  id: string;
  contactId: string;
  question: string;
  options: readonly string[];
  /** Day the question was asked (YYYY-MM-DD, the person's time zone). */
  askedOn: string;
  skipCount: number;
  sample?: true;
}

export interface ContactCompletionAnswerInput {
  answer: string;
  idempotencyKey: string;
}

export interface ContactCompletionResult {
  questionId: string;
  status: "answered" | "skipped";
  /** The next question, or null when there is nothing left to ask today. */
  next: ContactCompletionQuestion | null;
}
