/**
 * extractInteractions() (设计稿 §3.5 从笔记到联系人往来, §3.8 提取复核; agent-design AG10-3, PLANNER 易错边界 4):
 * from one memo (by id, version and numbered sentences), the interactions that actually happened between the
 * author and one of the memo's contacts.
 *
 * Code, after the model's candidates (functions/extract.ts):
 *   - the person must be one of the memo's linked contacts (or the one the user named), matched by the exact name;
 *   - hearsay without the author in it, and an intention with no contact having taken place, are not interactions,
 *     whatever the model said (guardInteraction);
 *   - the day comes from the date words, with the memo's own date as "today", in Asia/Tokyo (functions/dates.ts);
 *   - each remaining "happened" one is asked `interaction.happened` (one judgment request for the whole memo).
 * Only a sure "yes" is writable. Someone only mentioned, a plan to contact later, a contact between other people, a
 * review that was not sure (below threshold, timed out, not enabled): listed read-only, with the reason.
 */
import type { JudgmentItem, JudgmentOutcome } from "../judgment/ask";
import type { Sentence } from "../text/sentences";
import { memoDateOf } from "./dates";
import { contactOfClue, guardInteraction, type InteractionCandidate, type InteractionKind, type LinkedContact, type MemoForExtraction } from "./extract";

export type NotAnInteraction = Exclude<InteractionKind, "happened"> | "unsure" | "review_no" | "not_linked" | "not_asked_about";

export interface InteractionResult {
  key: string;
  contact: LinkedContact | null;
  /** The person as the memo writes them. */
  clue: string;
  channel: InteractionCandidate["channel"];
  direction: InteractionCandidate["direction"];
  occurredOn: string | null;
  precision: "day" | "instant" | "unknown";
  sentenceIds: number[];
  /** True only when code and a sure review both say it happened between the author and this contact. */
  writable: boolean;
  /** Why it is not writable (null when it is). */
  reason: NotAnInteraction | null;
}

/** The text the review is judged on (calibration builds it the same way). */
export function extractJudgmentInput(language: "zh" | "ja" | "en", memo: { title: string; day: string }, sentences: readonly Sentence[]): string[] {
  const head = language === "zh" ? `作者（用户本人）写的笔记${memo.title ? `「${memo.title}」` : ""}，写于 ${memo.day}` : language === "ja" ? `筆者（ユーザー本人）が書いたメモ${memo.title ? `「${memo.title}」` : ""}、${memo.day} に作成` : `A memo the author (the user) wrote${memo.title ? `, "${memo.title}"` : ""}, on ${memo.day}`;
  return [head, sentences.map((sentence) => `[${sentence.id}] ${sentence.text}`).join("\n")];
}

const CHANNEL_SUBJECT: Record<"zh" | "ja" | "en", Record<string, string>> = {
  en: { email: "e-mail", meeting: "meeting", message: "message", other: "contact", phone: "phone call" },
  ja: { email: "メール", meeting: "面会", message: "メッセージ", other: "やり取り", phone: "電話" },
  zh: { email: "邮件", meeting: "见面", message: "消息", other: "联系", phone: "电话" },
};

/** The subject of one `interaction.happened` item: who, how, which sentences. */
export function interactionSubject(language: "zh" | "ja" | "en", name: string, channel: string, sentenceIds: readonly number[]): string {
  const how = CHANNEL_SUBJECT[language][channel] ?? CHANNEL_SUBJECT[language].other;
  if (language === "zh") return `${name}，${how}（第 ${sentenceIds.join("、")} 句）`;
  if (language === "ja") return `${name}、${how}（${sentenceIds.join("・")} 文目）`;
  return `${name}, ${how} (sentence ${sentenceIds.join(", ")})`;
}

export interface InteractionContext {
  memo: MemoForExtraction;
  sentences: readonly Sentence[];
  contacts: readonly LinkedContact[];
  /** The contacts the user asked about ("我和小林的往来"): only these may be written. Empty: any linked contact. */
  focus: readonly string[];
  timeZone: string;
  language: "zh" | "ja" | "en";
}

/**
 * extractInteractions — step 1 (code, before the review): the candidates checked, guarded and dated, and the judgment
 * items for the ones still standing. Step 2 is reviewInteractions() with the judgment's outcome.
 */
export function extractInteractions(candidates: readonly InteractionCandidate[], context: InteractionContext): { results: InteractionResult[]; items: JudgmentItem[] } {
  const results: InteractionResult[] = [];
  const items: JudgmentItem[] = [];
  candidates.forEach((candidate, index) => {
    const key = `i${index + 1}`;
    const text = candidate.sentenceIds.map((id) => context.sentences.find((sentence) => sentence.id === id)?.text ?? "").join(" ");
    const contact = contactOfClue(candidate.contactClue, context.contacts);
    const kind = guardInteraction(candidate, text);
    const date = memoDateOf(candidate.dateText, context.memo.createdAt, context.timeZone);
    const reason: NotAnInteraction | null = kind !== "happened" ? kind : !contact ? "not_linked" : context.focus.length && !context.focus.includes(contact.id) ? "not_asked_about" : null;
    results.push({ channel: candidate.channel, clue: candidate.contactClue, contact, direction: candidate.direction, key, occurredOn: date.day, precision: date.day ? date.precision : "unknown", reason, sentenceIds: candidate.sentenceIds, writable: false });
    if (!reason) items.push({ key, question: "interaction.happened", subject: interactionSubject(context.language, contact!.name, candidate.channel, candidate.sentenceIds) });
  });
  return { items, results };
}

/** extractInteractions — step 2: only a sure "yes" of the review makes an interaction writable; anything else is "unsure". */
export function reviewInteractions(results: readonly InteractionResult[], outcome: JudgmentOutcome | null): InteractionResult[] {
  return results.map((result) => {
    if (result.reason) return result;
    const verdict = outcome?.verdicts.get(result.key);
    const sure = Boolean(verdict && !verdict.fallback && verdict.answer === "yes");
    const said = verdict && !verdict.fallback && verdict.answer === "no";
    return { ...result, reason: sure ? null : said ? "review_no" : "unsure", writable: sure && Boolean(result.occurredOn) };
  });
}
