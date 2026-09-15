import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createScheduleAuthorityService } from "../personal-schedule/authority-service";

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
      | "personal_schedule_items"
      | "orbitScheduleItems",
    recordId: string,
    now: string,
  ) => Promise<void>;
}

export function createStorageEventActionWriter(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  userId?: string | null;
  workspaceId: string;
}): EventActionWriter {
  const schedule = createScheduleAuthorityService({
    store: input.store,
    workspaceId: input.workspaceId,
  });
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
      userId: input.userId,
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
      payload: {
        accountId: input.userId,
        ...payload,
      },
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
    async saveScheduleItem(item) {
      const actorId = input.userId?.trim();
      if (!actorId) throw new Error("Schedule actions require an authenticated actor.");
      const saved = await schedule.saveEvent({
        actorId,
        endsAt: item.endsAt,
        eventId: item.eventId,
        evidenceIds: item.evidenceIds,
        id: item.scheduleId,
        location: item.location,
        now: item.now,
        startsAt: item.startsAt,
        title: item.title,
      });
      return { recordId: saved.id };
    },
    async removeRecord(collectionName, recordId, now) {
      if (collectionName === "orbitScheduleItems" || collectionName === "personal_schedule_items") {
        const actorId = input.userId?.trim();
        if (!actorId) throw new Error("Schedule actions require an authenticated actor.");
        await schedule.cancel({ actorId, id: recordId });
        return;
      }
      await input.store.deleteRecord({
        workspaceId: input.workspaceId,
        collectionName,
        recordId,
        deletedAt: now,
      });
    },
  };
}
