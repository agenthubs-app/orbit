import type { OrbitLanguage } from "../api/contract/language";
import { notesFromPayload, type NoteView } from "./notes";

/**
 * Sprint 0108: the notes page reads the device mirror. The server already
 * filtered every row to the signed-in owner; this layer re-checks ownership
 * (notesFromPayload refuses another account's row) and does locally what
 * GET /api/notes used to do per request: association filter, contact scope,
 * text search and newest-first order.
 */
export type NoteAssociationFilter = "all" | "contacts" | "events" | "unlinked";

export interface NotesMirrorQuery {
  association: NoteAssociationFilter;
  contactId?: string | undefined;
  q: string;
}

/** Null when any mirrored note is malformed: the page reports it rather than hiding rows. */
export function notesFromMirror(records: readonly { payload: unknown }[], actorId: string, language: OrbitLanguage): NoteView[] | null {
  return notesFromPayload({ notes: records.map((record) => record.payload) }, actorId, language);
}

/**
 * Same rules as the server's note search, except that a contact's name is only
 * matched through the note's own @-mentions: offline there is no contact index
 * to search.
 */
export function selectMirrorNotes(notes: readonly NoteView[], query: NotesMirrorQuery): NoteView[] {
  const search = query.q.trim().toLocaleLowerCase();
  return notes
    .filter((note) => !query.contactId || note.contactIds.includes(query.contactId))
    .filter((note) => {
      if (query.association === "contacts") return note.contactIds.length > 0;
      if (query.association === "events") return note.eventIds.length > 0;
      if (query.association === "unlinked") return note.contactIds.length === 0 && note.eventIds.length === 0;
      return true;
    })
    .filter((note) => !search
      || `${note.title}\n${note.body}`.toLocaleLowerCase().includes(search)
      || note.mentions.some((mention) => mention.displayText.toLocaleLowerCase().includes(search)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
}

export function mirrorNote(notes: readonly NoteView[] | null, noteId: string): NoteView | null {
  return notes?.find((note) => note.id === noteId) ?? null;
}
