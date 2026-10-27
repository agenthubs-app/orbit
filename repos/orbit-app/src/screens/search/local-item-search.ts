// Simulator QA G1: the global search also finds the person's own notes, to-dos and schedule items. They live in the
// device's mirror (notes, tasks, personal schedule), so they are searched here, on the device, with the same text
// folding as the rest of the search (each term on its own, AND-ed; NFKC, case and spacing never decide a hit).
import type { PersonalScheduleContract, TaskItemContract } from "../../api/contract/tasks";
import { normalizeSearchText, splitSearchTerms } from "../../api/compute/search-normalize";
import type { NoteView } from "../../view-models/notes";

export type LocalItemFilter = "notes" | "todos" | "schedule";
export const LOCAL_ITEM_FILTERS: readonly LocalItemFilter[] = ["notes", "todos", "schedule"];

export interface LocalItemHit {
  id: string;
  href: string;
  title: string;
  /** ISO time the row's date comes from (a note's last edit, a to-do's due date, a schedule item's start). */
  at: string | null;
  /** A to-do already done. */
  done?: boolean;
  /** The body's first matching line (notes) or the place (schedule). */
  detail: string;
}

export interface LocalItemGroup { items: LocalItemHit[]; total: number }
export interface LocalItemResults { notes: LocalItemGroup; todos: LocalItemGroup; schedule: LocalItemGroup }

export interface LocalItemSearchInput {
  query: string;
  notes: readonly NoteView[];
  tasks: readonly Pick<TaskItemContract, "id" | "title" | "notes" | "location" | "status" | "dueAt" | "plannedDate" | "updatedAt" | "sample">[];
  schedule: readonly Pick<PersonalScheduleContract, "id" | "title" | "location" | "startsAt" | "state">[];
  now: number;
  /** Rows per group (the counts stay whole). */
  limit: number;
}

const EMPTY: LocalItemResults = { notes: { items: [], total: 0 }, todos: { items: [], total: 0 }, schedule: { items: [], total: 0 } };

function matches(terms: readonly string[], fields: readonly (string | null | undefined)[]): boolean {
  const text = fields.map((field) => normalizeSearchText(field)).join("\n");
  return terms.every((term) => text.includes(term));
}

/** The first line of the body that holds a term, else the first non-empty line. */
function snippet(body: string, terms: readonly string[]): string {
  const lines = body.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => terms.some((term) => normalizeSearchText(line).includes(term))) ?? lines[0] ?? "";
}

const group = (items: LocalItemHit[], limit: number): LocalItemGroup => ({ items: items.slice(0, limit), total: items.length });

export function searchLocalItems(input: LocalItemSearchInput): LocalItemResults {
  const terms = splitSearchTerms(input.query);
  if (!terms.length) return EMPTY;
  const notes = input.notes
    .filter((note) => matches(terms, [note.title, note.body, ...note.mentions.map((mention) => mention.displayText)]))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    .map((note): LocalItemHit => ({ id: note.id, href: `/notes/${encodeURIComponent(note.id)}`, title: note.title, at: note.updatedAt, detail: snippet(note.body, terms) }));
  // Open to-dos first (soonest due first), then the done ones (latest first); cancelled and sample rows are never shown.
  const due = (task: LocalItemSearchInput["tasks"][number]) => task.dueAt ?? task.plannedDate ?? "9999";
  const todos = input.tasks
    .filter((task) => task.status !== "cancelled" && !task.sample && matches(terms, [task.title, task.notes, task.location]))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1)
      || (a.status === "open" ? due(a).localeCompare(due(b)) : b.updatedAt.localeCompare(a.updatedAt)) || a.id.localeCompare(b.id))
    .map((task): LocalItemHit => ({ id: task.id, href: `/tasks/${encodeURIComponent(task.id)}`, title: task.title, at: task.dueAt ?? task.plannedDate ?? null, done: task.status === "completed", detail: task.location ?? "" }));
  // Coming items first (soonest first), then past ones (latest first).
  const schedule = input.schedule
    .filter((item) => item.state !== "cancelled" && matches(terms, [item.title, item.location]))
    .sort((a, b) => {
      const aStart = Date.parse(a.startsAt), bStart = Date.parse(b.startsAt);
      const aComing = aStart >= input.now, bComing = bStart >= input.now;
      if (aComing !== bComing) return aComing ? -1 : 1;
      return (aComing ? aStart - bStart : bStart - aStart) || a.id.localeCompare(b.id);
    })
    .map((item): LocalItemHit => ({ id: item.id, href: `/schedule/personal/${encodeURIComponent(item.id)}`, title: item.title, at: item.startsAt, detail: item.location ?? "" }));
  return { notes: group(notes, input.limit), todos: group(todos, input.limit), schedule: group(schedule, input.limit) };
}

export function localItemCount(results: LocalItemResults, filter: LocalItemFilter | "all"): number {
  if (filter === "all") return results.notes.total + results.todos.total + results.schedule.total;
  return results[filter].total;
}
