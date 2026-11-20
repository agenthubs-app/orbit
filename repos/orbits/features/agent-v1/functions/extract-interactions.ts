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
    const kind = guardInteraction(candidate, candidate.sentenceIds.map((id) => context.sentences.find((sentence) => sentence.id === id)?.text ?? ""));
    const date = memoDateOf(candidate.dateText, context.memo.createdAt, context.timeZone);
    const reason: NotAnInteraction | null = kind !== "happened" ? kind : !contact ? "not_linked" : context.focus.length && !context.focus.includes(contact.id) ? "not_asked_about" : null;
    results.push({ channel: candidate.channel, clue: candidate.contactClue, contact, direction: candidate.direction, key, occurredOn: date.day, precision: date.day ? date.precision : "unknown", reason, sentenceIds: candidate.sentenceIds, writable: false });
    if (!reason) items.push({ key, question: "interaction.happened", subject: interactionSubject(context.language, contact!.name, candidate.channel, candidate.sentenceIds) });
  });
  return { items, results };
}

/** AG21b (R31): one occasion — the interactions of one meeting, call or message, with every contact who was in it. */
export interface InteractionGroup {
  contacts: LinkedContact[];
  channel: InteractionResult["channel"];
  direction: InteractionResult["direction"];
  occurredOn: string;
  sentenceIds: number[];
}

/**
 * AG21b (R31): the extractor returns one interaction per person; a note holds one interaction that takes several people.
 * Writable interactions of the same day and channel that share a sentence are one occasion with all their contacts
 * ("周二在工地和石楠、季朗碰头" is one meeting with both). Different days, channels or sentences stay separate occasions.
 */
export function groupInteractions(results: readonly InteractionResult[]): InteractionGroup[] {
  const groups: InteractionGroup[] = [];
  for (const item of results) {
    if (!item.writable || !item.contact || !item.occurredOn) continue;
    const same = groups.find((group) => group.occurredOn === item.occurredOn && group.channel === item.channel && group.sentenceIds.some((id) => item.sentenceIds.includes(id)));
    if (same) {
      if (!same.contacts.some((contact) => contact.id === item.contact!.id)) same.contacts.push(item.contact);
      same.sentenceIds = [...new Set([...same.sentenceIds, ...item.sentenceIds])].sort((left, right) => left - right);
      if (same.direction !== item.direction) same.direction = "mutual";
      continue;
    }
    groups.push({ channel: item.channel, contacts: [item.contact], direction: item.direction, occurredOn: item.occurredOn, sentenceIds: [...item.sentenceIds].sort((left, right) => left - right) });
  }
  return groups;
}

/** AG21b (R31): an occasion offered in a question, as the option's id (codes and ids only), and read back from it. */
export function interactionOptionId(memoId: string, group: InteractionGroup): string {
  return ["interaction", memoId, group.occurredOn, group.channel, group.direction, group.contacts.map((contact) => contact.id).join(","), group.sentenceIds.join(",")].join("|");
}

export function interactionOfOption(id: string): { memoId: string; occurredOn: string; channel: InteractionResult["channel"]; direction: InteractionResult["direction"]; contactIds: string[]; sentenceIds: number[] } | null {
  const [tag, memoId, occurredOn, channel, direction, contacts, sentences] = id.split("|");
  if (tag !== "interaction" || !memoId || !/^\d{4}-\d{2}-\d{2}$/u.test(occurredOn ?? "") || !channel || !direction || !contacts) return null;
  return { channel: channel as InteractionResult["channel"], contactIds: contacts.split(",").filter(Boolean), direction: direction as InteractionResult["direction"], memoId, occurredOn, sentenceIds: (sentences ?? "").split(",").filter(Boolean).map(Number) };
}

const PICK_FILLER = /(那一次|这一次|那次|这次|那回|这回|那个|这个|那条|这条|那场|就是|就|是|选|要|记|吧|的|の方|のほう|の|方|\bthe\b|\bone\b|[。，,.!！、\s])/giu;
const PICK_ORDINAL: Record<string, number> = { 一: 0, 1: 0, first: 0, 二: 1, 两: 1, 2: 1, second: 1, 三: 2, 3: 2, third: 2 };

/**
 * AG21b (R31): the occasion a typed reply names among those offered ("工地那次", "打电话那个", "第二个", "the call"): by
 * an ordinal, or by the most two-character pieces of the reply found in one option's label. Null when none or a tie.
 */
export function interactionNamedIn(reply: string, options: readonly { id: string; label: string }[]): string | null {
  const ordinal = /第\s*([一二两三123])\s*(?:个|次|条|项)|\b(first|second|third)\b|^\s*([123])\s*$/iu.exec(reply);
  if (ordinal) {
    const index = PICK_ORDINAL[(ordinal[1] ?? ordinal[2] ?? ordinal[3]).toLowerCase()];
    return options[index]?.id ?? null;
  }
  const words = reply.toLowerCase().replace(PICK_FILLER, "");
  if (!words) return null;
  const pieces = words.length === 1 ? [words] : Array.from({ length: words.length - 1 }, (_, index) => words.slice(index, index + 2));
  const scores = options.map((option) => pieces.filter((piece) => option.label.toLowerCase().includes(piece)).length);
  const best = Math.max(...scores);
  if (best <= 0 || scores.filter((score) => score === best).length > 1) return null;
  return options[scores.indexOf(best)].id;
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
