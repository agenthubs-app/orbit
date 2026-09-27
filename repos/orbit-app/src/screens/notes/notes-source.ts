import {
  useMirrorNoteDetail,
  useMirrorNotesList,
  useMirrorNotesWriteStatus,
  type NoteDetailSource,
  type NotesListSource,
  type NotesListSourceInput,
  type NotesWriteStatus,
} from "./notes-source-mirror";

export { NOTES_PAGE_SIZE } from "./notes-source-mirror";
export type { NoteDetailSource, NotesListSource, NotesListSourceInput, NotesMirrorStatus, NotesWriteStatus } from "./notes-source-mirror";

/**
 * Native notes source (sprint 0108): the lease-fed device mirror, always. The
 * browser build resolves notes-source.web.ts, which uses the same mirror hooks
 * when the browser mirror is active (sprint 0125) and the network otherwise.
 */
export function useNotesListSource(input: NotesListSourceInput): NotesListSource {
  return useMirrorNotesList(input);
}

export function useNoteDetailSource(input: { actorId: string; noteId: string; scopeKey: string }): NoteDetailSource {
  return useMirrorNoteDetail(input);
}

export function useNotesWriteStatus(actorId: string): NotesWriteStatus {
  return useMirrorNotesWriteStatus(actorId);
}
