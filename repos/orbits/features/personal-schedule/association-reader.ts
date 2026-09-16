import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createStorageContactGraphProvider } from "../contacts/storage/contact-live-record-provider";
import { createNoteRepository } from "../notes/repository";

export interface PersonalScheduleAssociationReader {
  accessibleIds(input: { actorId: string; kind: "contact" | "note"; ids: readonly string[] }): Promise<readonly string[]>;
}

export function createPersonalScheduleAssociationReader(input: { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string }): PersonalScheduleAssociationReader {
  const contacts = createStorageContactGraphProvider(input);
  const notes = createNoteRepository(input);
  return {
    async accessibleIds({ actorId, kind, ids }) {
      if (!actorId) return [];
      const found = await Promise.all(ids.map(async id => {
        if (kind === "note") return await notes.get(actorId, id) ? id : null;
        const graph = await contacts.readContactGraphForContact!(id, actorId);
        return graph.contacts.some(contact => contact.id === id) ? id : null;
      }));
      return found.filter((id): id is string => id !== null);
    },
  };
}
