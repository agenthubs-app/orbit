/**
 * Back to what is already recorded (设计稿 §3.5 "重复整理时可查回既有记录"; agent-design AG10-5, PLANNER 易错边界 6).
 *
 * Before a card, the source is looked up:
 *   - an interaction: the source memo's own `interaction` field — the same people, channel, direction and day →
 *     "recorded" (a link, no card); a different one → "conflict" (both said, nothing overwritten);
 *   - a to-do: this account's to-dos made from the same memo (`sourceNoteId`), matched by the memo's sentence the to-do
 *     keeps in its notes and by the action — the same → point at it and its status (no card); the same item with other
 *     dates → the differences only; only a similar title → "unsure" (the judgment or the user decides; never merged).
 * The key is the source memo plus its sentence (and the action within it), never the user's words: asking again in
 * other words finds the same record.
 */
import type { NoteInteractionContract } from "../../../shared/contract/notes";

export type InteractionLink = { kind: "recorded" } | { kind: "conflict"; existing: NoteInteractionContract } | { kind: "new" };

export function linkInteraction(existing: NoteInteractionContract | null | undefined, candidate: Pick<NoteInteractionContract, "actualContactIds" | "channel" | "direction" | "occurredOn">): InteractionLink {
  if (!existing) return { kind: "new" };
  const same = (left: readonly string[], right: readonly string[]) => left.length === right.length && [...left].sort().every((id, index) => id === [...right].sort()[index]);
  if (same(existing.actualContactIds, candidate.actualContactIds) && existing.channel === candidate.channel && existing.direction === candidate.direction && (existing.occurredOn ?? null) === (candidate.occurredOn ?? null)) return { kind: "recorded" };
  return { existing, kind: "conflict" };
}

export interface ExistingTodo {
  id: string;
  ref: string;
  title: string;
  status: string;
  plannedDate: string | null;
  dueAt: string | null;
  notes: string | null;
  sourceNoteId: string | null;
  /** AG20a R11: the person the to-do is about (its first linked contact), when known. */
  contactId?: string | null;
}

/** Characters that only join the words of an action ("把…发给…的"): not what the action is about. */
const JOINING = new Set([..."把给发的了和跟向对将要去再也在为与及并"]);

/**
 * AG20a R11 (TP-FN-004): how much of what an action is about (its own characters and words, without the joining ones)
 * a title holds — "把样稿发给明远" is all in 「给明远发样稿」, word order aside.
 */
export function contentOverlap(action: string, title: string): number {
  const own = (text: string) => new Set([...text.toLowerCase().replace(/[a-z0-9]+/gu, " ").replace(/[\s\p{P}\p{S}]/gu, "")].filter((char) => !JOINING.has(char)));
  const words = (text: string) => new Set((text.toLowerCase().match(/[a-z0-9]{3,}/gu) ?? []));
  const chars = own(action);
  const latin = words(action);
  const total = chars.size + latin.size;
  if (total < 3) return 0;
  const inTitle = own(title);
  const titleWords = words(title);
  const found = [...chars].filter((char) => inTitle.has(char)).length + [...latin].filter((word) => titleWords.has(word)).length;
  return found / total;
}
export const SAME_CONTENT = 0.8;

export type FollowUpLink =
  | { kind: "same"; todo: ExistingTodo }
  | { kind: "differs"; todo: ExistingTodo; differences: ("plannedDate" | "dueDate")[] }
  | { kind: "unsure"; todo: ExistingTodo }
  | { kind: "new" };

const normalized = (text: string) => text.toLowerCase().replace(/[\s\p{P}\p{S}「」『』（）()]/gu, "");

/** Dice similarity of two texts' character pairs (CJK and Latin alike). */
export function similarity(left: string, right: string): number {
  const pairs = (text: string) => {
    const clean = normalized(text);
    const out = new Map<string, number>();
    for (let index = 0; index + 2 <= clean.length; index += 1) out.set(clean.slice(index, index + 2), (out.get(clean.slice(index, index + 2)) ?? 0) + 1);
    return out;
  };
  const a = pairs(left);
  const b = pairs(right);
  let both = 0;
  for (const [pair, count] of a) both += Math.min(count, b.get(pair) ?? 0);
  const size = [...a.values()].reduce((sum, value) => sum + value, 0) + [...b.values()].reduce((sum, value) => sum + value, 0);
  return size ? (2 * both) / size : normalized(left) === normalized(right) ? 1 : 0;
}

export const SAME_TITLE = 0.6;
export const SIMILAR_TITLE = 0.35;

export function linkFollowUp(candidate: { action: string; sentence: string; plannedDate: string | null; dueDate: string | null; /** AG20a R11: the person the promise is to. */ contactId?: string | null }, existing: readonly ExistingTodo[], dayOf: (instant: string) => string): FollowUpLink {
  const sentence = normalized(candidate.sentence);
  // AG20a R11: a to-do about the same person that holds what the action is about is the same item, wherever it came from.
  const samePerson = (todo: ExistingTodo) => Boolean(candidate.contactId && todo.contactId && todo.contactId === candidate.contactId);
  const scored = existing.map((todo) => ({ contained: samePerson(todo) && contentOverlap(candidate.action, todo.title) >= SAME_CONTENT, fromSentence: Boolean(sentence) && Boolean(todo.notes) && normalized(todo.notes!).includes(sentence), score: similarity(candidate.action, todo.title), todo }))
    .sort((left, right) => Number(right.fromSentence) - Number(left.fromSentence) || Number(right.contained) - Number(left.contained) || right.score - left.score || (left.todo.id < right.todo.id ? -1 : 1));
  const best = scored[0];
  if (!best) return { kind: "new" };
  // The same sentence of the same memo: the same item when the action is the one it holds (a sentence may hold two).
  const sameItem = (best.fromSentence && (best.score >= SIMILAR_TITLE || scored.filter((item) => item.fromSentence).length === 1)) || best.score >= SAME_TITLE || best.contained;
  if (!sameItem) return best.score >= SIMILAR_TITLE ? { kind: "unsure", todo: best.todo } : { kind: "new" };
  const differences: ("plannedDate" | "dueDate")[] = [];
  if (candidate.plannedDate && best.todo.plannedDate && candidate.plannedDate !== best.todo.plannedDate) differences.push("plannedDate");
  if (candidate.dueDate && best.todo.dueAt && candidate.dueDate !== dayOf(best.todo.dueAt)) differences.push("dueDate");
  if ((candidate.plannedDate && !best.todo.plannedDate && best.todo.dueAt && !candidate.dueDate) || (candidate.dueDate && !best.todo.dueAt && best.todo.plannedDate && !candidate.plannedDate)) differences.push(candidate.dueDate ? "dueDate" : "plannedDate");
  return differences.length ? { differences, kind: "differs", todo: best.todo } : { kind: "same", todo: best.todo };
}
