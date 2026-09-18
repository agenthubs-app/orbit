import type { NoteView } from "./notes";

export function mergeNotePages(base: readonly NoteView[], extra: readonly NoteView[]): NoteView[] {
  const byId = new Map<string, NoteView>();
  for (const note of [...base, ...extra]) {
    const previous = byId.get(note.id);
    if (!previous || note.version > previous.version || (note.version === previous.version && Date.parse(note.updatedAt) > Date.parse(previous.updatedAt))) byId.set(note.id, note);
  }
  return [...byId.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.id.localeCompare(right.id));
}
