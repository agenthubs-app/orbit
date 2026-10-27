import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { EVENTS_LIVE_RECORD_COLLECTION } from "../events/event-crud-and-import/providers/storage-event-provider";
import type { LiveContactsGraphProvider } from "../contacts/live-service";
import type { NoteAssociationReader } from "./service";

interface Queryable {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

// Events the actor signed up for, applied to or organizes (event operations). These are the events on
// the App's event day, which is what the note editor offers; they are not in the orbit_records events.
const OWN_EVENT_OPS_SQL = `
  select event_id from event_ops_membership_heads where workspace_id = $1 and actor_id = $2 and event_id = any($3)
  union select event_id from event_ops_admission_application_heads where workspace_id = $1 and actor_id = $2 and event_id = any($3)
  union select event_id from event_ops_events where workspace_id = $1 and organizer_actor_id = $2 and event_id = any($3)`;

export function createNoteAssociationReader(input: {
  contactProvider: LiveContactsGraphProvider;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  eventOps?: Queryable | null;
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
    async accessibleEventIds({ actorId, ids }) {
      if (ids.length === 0) return [];
      const unique = [...new Set(ids)];
      const records = await input.store.listRecords({
        limit: "unbounded",
        workspaceId: input.workspaceId,
        collectionName: EVENTS_LIVE_RECORD_COLLECTION,
        recordIds: unique,
      });
      const active = new Set(records.map((record) => record.recordId));
      const rest = unique.filter((id) => !active.has(id));
      if (rest.length && input.eventOps) {
        const own = await input.eventOps.query<{ event_id: string }>(OWN_EVENT_OPS_SQL, [input.workspaceId, actorId, rest]);
        own.rows.forEach((row) => active.add(row.event_id));
      }
      return unique.filter((id) => active.has(id));
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
