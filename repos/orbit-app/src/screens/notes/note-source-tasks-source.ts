import { useMirrorNoteSourceTasks, type NoteSourceTasks } from "./note-source-tasks-mirror";

export type { NoteSourceTasks } from "./note-source-tasks-mirror";

/**
 * Tasks created from a note, native (sprint 0108): always the device task
 * mirror. The browser build resolves note-source-tasks-source.web.ts.
 */
export function useNoteSourceTasks(input: { actorId: string; noteId: string; scopeKey: string }): NoteSourceTasks {
  return useMirrorNoteSourceTasks(input);
}
