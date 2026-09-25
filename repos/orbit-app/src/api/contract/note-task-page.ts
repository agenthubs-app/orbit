export interface NoteTaskCardContract {
  id: string;
  titlePreview: string;
  status: "open" | "completed" | "cancelled";
  sourceNoteVersion: number;
}

export interface NoteTaskPageContract {
  actorId: string;
  noteId: string;
  items: NoteTaskCardContract[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  asOf: string;
}
