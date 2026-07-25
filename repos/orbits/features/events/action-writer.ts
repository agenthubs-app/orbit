import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export interface EventActionWriter {
  saveMeetingNote: (input: {
    noteId: string;
    eventId: string;
    contactId?: string;
    text: string;
    noteSource: "typed" | "voice_transcript";
    evidenceIds: readonly string[];
    now: string;
  }) => Promise<{ recordId: string }>;
  saveBrief: (input: {
    briefId: string;
    eventId: string;
    title: string;
    body: string;
    evidenceIds: readonly string[];
    now: string;
  }) => Promise<{ recordId: string }>;
  saveGoal: (input: {
    goalId: string;
    eventId: string;
    goal: string;
    evidenceIds: readonly string[];
    now: string;
  }) => Promise<{ recordId: string }>;
  saveScheduleItem: (input: {
    scheduleId: string;
    eventId: string;
    title: string;
    startsAt: string;
    endsAt?: string;
    location?: string;
    evidenceIds: readonly string[];
    now: string;
  }) => Promise<{ recordId: string }>;
  removeRecord: (
    collectionName:
      | "encounterNotes"
      | "eventBriefs"
      | "eventGoals"
      | "orbitScheduleItems",
    recordId: string,
    now: string,
  ) => Promise<void>;
}

export function createStorageEventActionWriter(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): EventActionWriter {
  async function save(
    collectionName: string,
    recordId: string,
    eventId: string,
    searchText: string,
    evidenceIds: readonly string[],
    payload: Record<string, unknown>,
    now: string,
  ): Promise<{ recordId: string }> {
    await input.store.upsertRecord({
      workspaceId: input.workspaceId,
      collectionName,
      recordId,
      sourceType: "agent_action",
      sourceId: recordId,
      sourceLabel: "Orbit Agent confirmed event record",
      evidenceIds,
      targetType: "event",
      targetId: eventId,
      occurredAt: now,
      lifecycleState: "active",
      searchText,
      payload,
      createdAt: now,
      updatedAt: now,
    });
    return { recordId };
  }

  return {
    saveMeetingNote(note) {
      return save(
        "encounterNotes",
        note.noteId,
        note.eventId,
        note.text,
        note.evidenceIds,
        {
          id: note.noteId,
          eventId: note.eventId,
          contactId: note.contactId,
          kind:
            note.noteSource === "voice_transcript"
              ? "confirmed_voice_transcript"
              : "typed_note",
          text: note.text,
          confirmed: true,
          evidenceIds: note.evidenceIds,
          createdAt: note.now,
          updatedAt: note.now,
        },
        note.now,
      );
    },
    saveBrief(brief) {
      return save(
        "eventBriefs",
        brief.briefId,
        brief.eventId,
        `${brief.title} ${brief.body}`,
        brief.evidenceIds,
        {
          id: brief.briefId,
          eventId: brief.eventId,
          title: brief.title,
          body: brief.body,
          evidenceIds: brief.evidenceIds,
          createdAt: brief.now,
          updatedAt: brief.now,
        },
        brief.now,
      );
    },
    saveGoal(goal) {
      return save(
        "eventGoals",
        goal.goalId,
        goal.eventId,
        goal.goal,
        goal.evidenceIds,
        {
          id: goal.goalId,
          eventId: goal.eventId,
          goal: goal.goal,
          evidenceIds: goal.evidenceIds,
          createdAt: goal.now,
          updatedAt: goal.now,
        },
        goal.now,
      );
    },
    saveScheduleItem(item) {
      return save(
        "orbitScheduleItems",
        item.scheduleId,
        item.eventId,
        `${item.title} ${item.startsAt} ${item.location ?? ""}`,
        item.evidenceIds,
        {
          id: item.scheduleId,
          eventId: item.eventId,
          title: item.title,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          location: item.location,
          status: "confirmed",
          evidenceIds: item.evidenceIds,
          createdAt: item.now,
          updatedAt: item.now,
        },
        item.now,
      );
    },
    async removeRecord(collectionName, recordId, now) {
      await input.store.deleteRecord({
        workspaceId: input.workspaceId,
        collectionName,
        recordId,
        deletedAt: now,
      });
    },
  };
}
