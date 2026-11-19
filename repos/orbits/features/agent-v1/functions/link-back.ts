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
}

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

export function linkFollowUp(candidate: { action: string; sentence: string; plannedDate: string | null; dueDate: string | null }, existing: readonly ExistingTodo[], dayOf: (instant: string) => string): FollowUpLink {
  const sentence = normalized(candidate.sentence);
  const scored = existing.map((todo) => ({ fromSentence: Boolean(sentence) && Boolean(todo.notes) && normalized(todo.notes!).includes(sentence), score: similarity(candidate.action, todo.title), todo }))
    .sort((left, right) => Number(right.fromSentence) - Number(left.fromSentence) || right.score - left.score || (left.todo.id < right.todo.id ? -1 : 1));
  const best = scored[0];
  if (!best) return { kind: "new" };
  // The same sentence of the same memo: the same item when the action is the one it holds (a sentence may hold two).
  const sameItem = (best.fromSentence && (best.score >= SIMILAR_TITLE || scored.filter((item) => item.fromSentence).length === 1)) || best.score >= SAME_TITLE;
  if (!sameItem) return best.score >= SIMILAR_TITLE ? { kind: "unsure", todo: best.todo } : { kind: "new" };
  const differences: ("plannedDate" | "dueDate")[] = [];
  if (candidate.plannedDate && best.todo.plannedDate && candidate.plannedDate !== best.todo.plannedDate) differences.push("plannedDate");
  if (candidate.dueDate && best.todo.dueAt && candidate.dueDate !== dayOf(best.todo.dueAt)) differences.push("dueDate");
  if ((candidate.plannedDate && !best.todo.plannedDate && best.todo.dueAt && !candidate.dueDate) || (candidate.dueDate && !best.todo.dueAt && best.todo.plannedDate && !candidate.plannedDate)) differences.push(candidate.dueDate ? "dueDate" : "plannedDate");
  return differences.length ? { differences, kind: "differs", todo: best.todo } : { kind: "same", todo: best.todo };
}
