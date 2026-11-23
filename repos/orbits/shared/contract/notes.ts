export interface NoteMentionContract {
  contactId?: string;
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
  /**
   * agent-design AG13 (附录 E): the events this memo is linked to, typed (platform or the user's own private event).
   * Absent on memos written before AG13: read as the platform events of `eventIds`. `eventIds` mirrors the platform ones.
   */
  eventRefs?: readonly { kind: "platform" | "private"; id: string }[];
  /** R08 (R20 owns, Task notes / plan use): free text, a meeting note or a voice memo. */
  noteKind?: "free" | "meeting" | "voice";
  /** R08 (R20): the note fed the plan analysis. */
  usedForPlan?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** R08: a demo-world record; the UI shows the sample tag and never stores, counts or searches it. */
  sample?: true;
  /**
   * agent-design AG05 (设计稿 §4, 附录 E): the actual interaction this memo records, if it records one.
   * Read in AG05; written by the Agent's memo writes from AG06.
   */
  interaction?: NoteInteractionContract;
  /**
   * agent-design AG06 (设计稿 §4 "后续效果也属于写入范围", 附录 E): the memo was written by the Agent after a
   * confirmation card, so the old automatic extraction of contact facts must not run on it. Persisted on
   * the memo; both extraction paths (the save hook and the maintenance rescan) honour it.
   */
  autoExtraction?: "suppressed";
}

/**
 * A real exchange the user had with people (设计稿附录 E). `actualContactIds` is a subset of the memo's
 * contactIds: a memo can mention two people and record a call with one. Only a date is kept when only
 * a date is known (precision day); the time it happened is separate from when the memo was written.
 */
export interface NoteInteractionContract {
  actualContactIds: readonly string[];
  channel: "phone" | "meeting" | "message" | "email" | "other";
  direction: "incoming" | "outgoing" | "mutual";
  /** YYYY-MM-DD, when only the date is known. */
  occurredOn?: string;
  /** ISO instant. */
  occurredAt?: string;
  precision: "day" | "instant";
  /** The sentence that supports it, as offsets into the body. */
  sentence?: { start: number; end: number };
}

export interface NotesCollectionContract {
  notes: readonly NoteContract[];
  total: number;
  nextCursor?: string;
}

export interface NoteDetailContract {
  note: NoteContract;
}
