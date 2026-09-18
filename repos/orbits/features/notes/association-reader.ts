import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { EVENTS_LIVE_RECORD_COLLECTION } from "../events/event-crud-and-import/providers/storage-event-provider";
import type { LiveContactsGraphProvider } from "../contacts/live-service";
import type { NoteAssociationReader } from "./service";

export function createNoteAssociationReader(input: {
  contactProvider: LiveContactsGraphProvider;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): NoteAssociationReader {
  return {
    async accessibleContactIds({ actorId, ids }) {
      const unique = [...new Set(ids)];
      const resolved = await Promise.all(unique.map(async (id) => {
        const graph = input.contactProvider.readContactGraphForContact
          ? await input.contactProvider.readContactGraphForContact(id, actorId)
          : await input.contactProvider.readContactGraph(actorId);
        return graph.contacts.some((contact) => contact.id === id) ? id : null;
      }));
      return resolved.filter((id): id is string => id !== null);
    },
    async accessibleEventIds({ ids }) {
      if (ids.length === 0) return [];
      const records = await input.store.listRecords({
        limit: "unbounded",
        workspaceId: input.workspaceId,
        collectionName: EVENTS_LIVE_RECORD_COLLECTION,
        recordIds: [...new Set(ids)],
      });
      const active = new Set(records.map((record) => record.recordId));
      return [...new Set(ids)].filter((id) => active.has(id));
    },
    async searchContactIds({ actorId, query }) {
      const graph = input.contactProvider.readContactGraphForList
        ? await input.contactProvider.readContactGraphForList({ actorId, query, limit: 50 }, actorId)
        : await input.contactProvider.readContactGraph(actorId);
      const word = query.trim().toLocaleLowerCase();
      return graph.contacts
        .filter((contact) => !word || `${contact.displayName} ${contact.organization ?? ""} ${contact.role ?? ""}`.toLocaleLowerCase().includes(word))
        .slice(0, 50)
        .map((contact) => contact.id);
    },
  };
}
