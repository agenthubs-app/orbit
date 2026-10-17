// R08 contract 3 — one question a day that completes what Orbit knows about a
// person. Owner: 甲 (R16). Used by: To-do, 人脈.
// R16 (DESIGN add-and-invite §2.8, §4.3): live from R16; rule-based, no AI. Optional
// fields below were added in R16 (append-only).

/** R16: which question this is. Readers fall back to `met_where` for an unknown value. */
export type ContactCompletionQuestionKind = "met_where" | "organization";

export interface ContactCompletionQuestion {
  id: string;
  contactId: string;
  /**
   * The question in Japanese (R16 review m2). Cards build their own text from `kind` +
   * `contactName` in the UI language; this is the fallback when `kind` is missing.
   */
  question: string;
  /**
   * The choices; the answer sends one back exactly as given. Fixed choices are the stable
   * Japanese values 「紹介」「前職の同僚」「覚えていない」「自分で入力」 (shared/compute/
   * completion-question-rules.ts `COMPLETION_OPTION_LABELS`): cards show them through their
   * own three-language copy and send the value back. Other choices are event titles or company
   * names from the person's own data and are shown as they are.
   */
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
  /** R11a: `event` (イベント, event roster import) added 2026-10-18; readers fall back to `manual`. */
  sourceChip?: "meishi" | "linkedin" | "phone" | "manual" | "self" | "event";
  /** R16: 「どこで？」 or 「会社は？」 (unknown values read as `met_where`). */
  kind?: ContactCompletionQuestionKind;
  /**
   * R16（只加）：答了这一题之后按 D-10 会到的浓度（出题时算好；卡片据此写「答えると ●●○ に」，
   * 不会升档时写「情報が 1つ増えます」——不说「答了一定升档」）。旧服务端没有这个字段。
   */
  densityIfAnswered?: 1 | 2 | 3;
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
