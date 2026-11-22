/**
 * extractFollowUps() (设计稿 §3.5 从同一篇笔记到 Todo, §3.8 提取复核; agent-design AG10-4, PLANNER 易错边界 5): from
 * one memo, who committed to do what, for whom, by when.
 *
 * Code, after the model's candidates (functions/extract.ts):
 *   - three owners are kept apart: the author's own commitment, the other person's, only a suggestion to consider;
 *     a "me" with only words of considering is a suggestion, with no word of a commitment or of the author it is
 *     doubtful (guardOwner);
 *   - a date stands next to a deadline word ("最迟", "までに", "by", "前") → a due date; a day to do it → a planned date;
 *     each keeps its own kind, and a missing date stays empty (functions/dates.ts, the memo's date as "today");
 *   - the person is one of the memo's linked contacts by exact name; with no clue and one linked contact, that one;
 *   - each is asked `followup.owner` (in the same judgment request as the interactions).
 * Only an own commitment the review confirms ("me", above threshold) may become a to-do, and only when the user asks.
 */
import type { JudgmentItem, JudgmentOutcome } from "../judgment/ask";
import type { Sentence } from "../text/sentences";
import { emitTrace } from "../observability/trace";
import { dateWordsIn, isDeadline, memoDateOf } from "./dates";
import { contactOfClue, guardOwner, type FollowUpCandidate, type LinkedContact, type MemoForExtraction, type Owner } from "./extract";

export interface FollowUpResult {
  key: string;
  owner: Owner | "doubtful";
  action: string;
  contact: LinkedContact | null;
  aboutClue: string | null;
  /** YYYY-MM-DD, or null. */
  plannedDate: string | null;
  /** YYYY-MM-DD (a day only) and an optional time, or null. */
  dueDate: string | null;
  dueTime: string | null;
  /** The date words as the memo writes them (shown as is when no day can be worked out, e.g. "by Friday"). */
  plannedText: string | null;
  dueText: string | null;
  sentenceIds: number[];
  /** The author's own commitment, confirmed by the review: may become a to-do when the user asks. */
  writable: boolean;
}

/** The subject of one `followup.owner` item. */
export function followUpSubject(language: "zh" | "ja" | "en", action: string, sentenceIds: readonly number[]): string {
  if (language === "zh") return `「${action}」（第 ${sentenceIds.join("、")} 句）`;
  if (language === "ja") return `「${action}」（${sentenceIds.join("・")} 文目）`;
  return `"${action}" (sentence ${sentenceIds.join(", ")})`;
}

export interface FollowUpContext {
  memo: MemoForExtraction;
  sentences: readonly Sentence[];
  contacts: readonly LinkedContact[];
  timeZone: string;
  language: "zh" | "ja" | "en";
  /** The user's own words this turn (a title may use them too). */
  message?: string;
}

// Han characters only: kana are grammar a title may phrase differently (「原稿を…送る」 from 「原稿は…送る」).
const CJK_CHAR = /\p{Script=Han}/gu;
const DEADLINE_WORDS = /\s*(?:最迟|最晚|之前|以前|までに|まで)?\s*\d{1,2}\s*月\s*\d{1,2}\s*[日号]?\s*(?:之前|以前|前|までに|まで)?\s*/gu;

/**
 * AG13 rerun of AG10 (AE-FN-013): the model titled a to-do 「补齐鲁发票」 from "发票最迟 11 月 25 日补齐" — 鲁 is in neither the
 * note nor the message. A title with CJK characters found in none of the note, the people linked to it and the user's
 * words is not used: the cited sentence's clause that shares the most characters with it is, without its date words.
 */
export function groundedAction(action: string, cited: string, allowed: string): string {
  const foreign = [...action.matchAll(CJK_CHAR)].map((match) => match[0]).filter((char) => !allowed.includes(char));
  if (!foreign.length) return action;
  const clauses = cited.split(/[，,。；;！!？?\n]/u).map((clause) => clause.replace(/^\s*(?:\[\d+\]\s*)?/u, "").trim()).filter(Boolean);
  const own = [...new Set([...action.matchAll(CJK_CHAR)].map((match) => match[0]))];
  const overlap = (clause: string) => own.filter((char) => clause.includes(char)).length;
  const best = [...clauses].sort((left, right) => overlap(right) - overlap(left))[0];
  const phrase = best ? best.replace(DEADLINE_WORDS, "").trim() : "";
  return phrase || action;
}

/** extractFollowUps — step 1 (code): owners guarded, dates worked out and split, the person found; the review items. */
export function extractFollowUps(candidates: readonly FollowUpCandidate[], context: FollowUpContext): { results: FollowUpResult[]; items: JudgmentItem[] } {
  const results: FollowUpResult[] = [];
  const items: JudgmentItem[] = [];
  candidates.forEach((candidate, index) => {
    const key = `f${index + 1}`;
    const text = candidate.sentenceIds.map((id) => context.sentences.find((sentence) => sentence.id === id)?.text ?? "").join(" ");
    const owner = guardOwner(candidate, text);
    // The two dates the model copied, each checked against the sentence: next to a deadline word it is a due date.
    let planned: string | null = null;
    let due: string | null = null;
    for (const copy of [candidate.plannedDateText, candidate.dueDateText]) {
      if (!copy) continue;
      if (isDeadline(text, copy)) due ??= copy;
      else planned ??= copy;
    }
    const plannedDate = memoDateOf(planned ? dateWordsIn(planned) ?? planned : null, context.memo.createdAt, context.timeZone);
    const dueDate = memoDateOf(due ? dateWordsIn(due) ?? due : null, context.memo.createdAt, context.timeZone);
    const about = candidate.aboutClue ? contactOfClue(candidate.aboutClue, context.contacts) : null;
    const contact = about ?? (!candidate.aboutClue && context.contacts.length === 1 ? context.contacts[0] : null);
    const allowed = [context.memo.title, context.memo.body, context.message ?? "", ...context.contacts.map((item) => item.name)].join("\n");
    const action = groundedAction(candidate.action, text, allowed);
    if (action !== candidate.action) emitTrace({ from: candidate.action, key, to: action, type: "fn.followup_title_grounded" });
    results.push({
      aboutClue: candidate.aboutClue ?? null,
      action,
      contact,
      dueDate: dueDate.day,
      dueText: due,
      dueTime: dueDate.time ?? null,
      key,
      owner,
      plannedDate: plannedDate.day,
      plannedText: planned,
      sentenceIds: candidate.sentenceIds,
      writable: false,
    });
    items.push({ key, question: "followup.owner", subject: followUpSubject(context.language, action, candidate.sentenceIds) });
  });
  return { items, results };
}

/**
 * extractFollowUps — step 2: the review's owner stands when it is sure; an own commitment it does not confirm is
 * doubtful. Writable: the author's own commitment, confirmed.
 */
export function reviewFollowUps(results: readonly FollowUpResult[], outcome: JudgmentOutcome | null): FollowUpResult[] {
  return results.map((result) => {
    const verdict = outcome?.verdicts.get(result.key);
    const sure = verdict && !verdict.fallback && (verdict.answer === "me" || verdict.answer === "other" || verdict.answer === "suggestion") ? (verdict.answer as Owner) : null;
    // Code's guard read only words of considering ("should think about", "打算", "思う"): it stays a suggestion — the
    // review cannot make it a commitment (calibration v3 val: "I should think about…" was answered "me").
    if (result.owner === "suggestion" && sure === "me") return { ...result, writable: false };
    const owner: FollowUpResult["owner"] = sure ?? (result.owner === "me" || result.owner === "doubtful" ? "doubtful" : result.owner);
    return { ...result, owner, writable: owner === "me" && sure === "me" };
  });
}
