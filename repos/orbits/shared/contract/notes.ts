export interface NoteMentionContract {
  contactId: string;
  start: number;
  end: number;
  displayText: string;
  /** R08 (R20 owns): a mention can name an event; absent means a contact. */
  entityType?: "contact" | "event";
  eventId?: string;
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
  /** R08 (R20 owns, Task notes / plan use): free text, a meeting note or a voice memo. */
  noteKind?: "free" | "meeting" | "voice";
  /** R08 (R20): the note fed the plan analysis. */
  usedForPlan?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** R08: a demo-world record; the UI shows the sample tag and never stores, counts or searches it. */
  sample?: true;
}

export interface NotesCollectionContract {
  notes: readonly NoteContract[];
  total: number;
  nextCursor?: string;
}

export interface NoteDetailContract {
  note: NoteContract;
}
