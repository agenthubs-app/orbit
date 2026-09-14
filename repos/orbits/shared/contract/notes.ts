export interface NoteContract {
  id: string;
  accountId: string;
  ownerUserId: string;
  body: string;
  contactIds: readonly string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotesCollectionContract {
  notes: readonly NoteContract[];
}

export interface NoteDetailContract {
  note: NoteContract;
}
