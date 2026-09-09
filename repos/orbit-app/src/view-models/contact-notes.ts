import { contactNotesPayloadSchema, type ContactNoteResponse } from "../api/schema/contact-notes";

export type ContactNoteView = {
  id: string;
  body: string;
  createdAt: string;
  authorLabel?: string | undefined;
};

type ContactNotesView =
  | { state: "ready"; notes: ContactNoteView[] }
  | { state: "unavailable" };

function privateNotes(notes: ContactNoteResponse[]): ContactNoteView[] {
  return notes
    .filter((note) => note.privacy === "private")
    .map((note) => ({ id: note.noteId, body: note.body, createdAt: note.createdAt, authorLabel: note.authorLabel }))
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

export function contactNotesToView(data: unknown, contactId: string): ContactNotesView {
  const parsed = contactNotesPayloadSchema.safeParse(data);
  if (!parsed.success || parsed.data.contact.id !== contactId) return { state: "unavailable" };
  return { state: "ready", notes: privateNotes(parsed.data.contact.notes) };
}

export function confirmedContactNotes(data: unknown, contactId: string, body: string): ContactNoteView[] | null {
  const parsed = contactNotesPayloadSchema.safeParse(data);
  if (!parsed.success || parsed.data.contact.id !== contactId) return null;
  const acknowledged = parsed.data.contact.notes.some((note) =>
    note.privacy === "private" && note.body === body && note.authorLabel === "我"
  );
  return acknowledged ? privateNotes(parsed.data.contact.notes) : null;
}
