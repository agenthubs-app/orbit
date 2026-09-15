export interface NoteMentionContract {
  contactId: string;
  start: number;
  end: number;
  displayText: string;
}

export interface NoteContract {
  id: string;
  accountId: string;
  ownerUserId: string;
  title: string;
  body: string;
  manualContactIds: readonly string[];
  mentions: readonly NoteMentionContract[];
  contactIds: readonly string[];
  eventIds: readonly string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotesCollectionContract {
  notes: readonly NoteContract[];
  total: number;
  nextCursor?: string;
}

export interface NoteDetailContract {
  note: NoteContract;
}
