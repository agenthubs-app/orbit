// R08 contract 3 — one question a day that completes what Orbit knows about a
// person. Owner: 甲 (R16). Used by: To-do, 人脈.
// R16 (DESIGN add-and-invite §2.8, §4.3): live from R16; rule-based, no AI. Optional
// fields below were added in R16 (append-only).

/** R16: which question this is. Readers fall back to `met_where` for an unknown value. */
export type ContactCompletionQuestionKind = "met_where" | "organization";

export interface ContactCompletionQuestion {
  id: string;
  contactId: string;
  question: string;
  options: readonly string[];
  /** Day the question was asked (YYYY-MM-DD, Tokyo day — Asia/Tokyo, UTC+9). */
  askedOn: string;
  skipCount: number;
  sample?: true;
  /** R16: the person's name as shown on the card. */
  contactName?: string;
  /** R16: company · role (what is known), for the card's second line. */
  contactSubtitle?: string;
  /** R16: where this person came from (same values as the 人脈 list chip). */
  sourceChip?: "meishi" | "linkedin" | "phone" | "manual" | "self";
  /** R16: 「どこで？」 or 「会社は？」 (unknown values read as `met_where`). */
  kind?: ContactCompletionQuestionKind;
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
  /**
   * R16: the person's D-10 density after this answer (1 ●○○, 2 ●●○, 3 ●●●), recomputed
   * from what is saved. An answer does not always raise it (no email or phone → stays 1).
   */
  densityAfter?: 1 | 2 | 3;
}
