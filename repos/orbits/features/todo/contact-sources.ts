import { z } from "zod";
import { rowToRecord, type LiveRecordSqlClient, type PostgresLiveRecordRow } from "../../shared/storage/postgres-live-record-store";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createLiveContactAcquisitionDraftService } from "../acquisition/live-service";
import { createStorageContactAcquisitionDraftProvider } from "../acquisition/storage/contact-draft-live-record-provider";
import { completionQuestionRecordId, getCompletionQuestion } from "../contacts/completion/repository";
import { createContactCompletionService } from "../contacts/completion/service";
import type { TodoSourceReader } from "./service";

export const TODO_CONTACT_RELATION_LIMIT = 100;
export const TODO_CONTACT_BYTES_PER_RELATION = 2 * 1024 * 1024;
const allowed = new Set(["contactDrafts", "events", "attendees", "eventParticipantIntents", "networkPeople", "evidence", "contacts", "contactCompletionQuestions"]);
/** LF14: the contact-draft anchors (saved drafts, event attendees) — the most recent of each, never the whole table. */
const DRAFT_ANCHORS = new Set(["contactDrafts", "attendees"]);
/** LF14: the draft graph's joined collections — read only for the records the anchors name. */
const DRAFT_JOINS = new Set(["events", "networkPeople", "eventParticipantIntents", "evidence"]);
const ROW_COLUMNS = "workspace_id,collection_name,record_id,user_id,source_type,source_id,source_label,evidence_ids,lifecycle_state,payload,created_at,updated_at,deleted_at";
const OWNED = "(user_id=$3 or (user_id is null and (payload->>'accountId'=$3 or payload->>'actorId'=$3 or payload->>'ownerId'=$3)))";
const strings = (values: unknown[]): string[] => [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];

export function createTodoContactReadStore(input: { client: LiveRecordSqlClient; workspaceId: string; actorId: string; assertAllowed: (collection: string) => void }): LiveRecordStoreLike<Record<string, unknown>> {
  const fail = async (): Promise<never> => { throw Error("TODO_SOURCE_WRITE_FORBIDDEN"); };
  const bounded = (rows: readonly PostgresLiveRecordRow[]): readonly PostgresLiveRecordRow[] => {
    if (Buffer.byteLength(JSON.stringify(rows)) > TODO_CONTACT_BYTES_PER_RELATION) throw Error("TODO_SOURCE_READ_LIMIT");
    return rows;
  };
  const live = `workspace_id=$1 and collection_name=$2 and lifecycle_state<>'deleted' and deleted_at is null and ${OWNED}`;
  // The latest TODO_CONTACT_RELATION_LIMIT anchors (the to-do total is capped at 100 anyway), once per read.
  const anchors = new Map<string, Promise<readonly PostgresLiveRecordRow[]>>();
  const anchor = (collection: string) => {
    let rows = anchors.get(collection);
    if (!rows) {
      rows = input.client.query<PostgresLiveRecordRow>(`select ${ROW_COLUMNS} from orbit_records where ${live} order by updated_at desc,record_id limit $4`,
        [input.workspaceId, collection, input.actorId, TODO_CONTACT_RELATION_LIMIT]).then((reply) => bounded(reply.rows));
      anchors.set(collection, rows);
    }
    return rows;
  };
  const byIds = async (collection: string, ids: string[]) => ids.length === 0 ? [] : bounded((await input.client.query<PostgresLiveRecordRow>(
    `select ${ROW_COLUMNS} from orbit_records where ${live} and (record_id = any($4::text[]) or payload->>'id' = any($4::text[])) order by updated_at desc,record_id limit $5`,
    [input.workspaceId, collection, input.actorId, ids, ids.length])).rows);
  const joined = new Map<string, Promise<readonly PostgresLiveRecordRow[]>>();
  const join = (collection: string): Promise<readonly PostgresLiveRecordRow[]> => {
    let rows = joined.get(collection);
    if (rows) return rows;
    rows = (async () => {
      const attendees = (await anchor("attendees")).map((row) => row.payload as Record<string, unknown>);
      if (collection === "events") return byIds(collection, strings(attendees.map((item) => item.eventId)));
      if (collection === "networkPeople") return byIds(collection, strings(attendees.map((item) => item.personId)));
      if (collection === "eventParticipantIntents") {
        const ids = strings(attendees.map((item) => item.id));
        return ids.length === 0 ? [] : bounded((await input.client.query<PostgresLiveRecordRow>(
          `select ${ROW_COLUMNS} from orbit_records where ${live} and payload->>'attendeeId' = any($4::text[]) order by updated_at desc,record_id limit $5`,
          [input.workspaceId, collection, input.actorId, ids, ids.length * 4])).rows);
      }
      // evidence: what the attendees, their intents and people cite, plus the saved drafts' own evidence ids.
      const cited = [...attendees, ...(await join("eventParticipantIntents")).map((row) => row.payload as Record<string, unknown>), ...(await join("networkPeople")).map((row) => row.payload as Record<string, unknown>)]
        .flatMap((item) => (Array.isArray(item.evidenceIds) ? item.evidenceIds : []));
      const drafts = (await anchor("contactDrafts")).flatMap((row) => row.evidence_ids ?? []);
      return byIds(collection, strings([...cited, ...drafts]));
    })();
    joined.set(collection, rows);
    return rows;
  };
  const read = async (query: { collectionName?: string; workspaceId: string; recordId?: string; userId?: string | null }) => {
    if (!query.collectionName || !allowed.has(query.collectionName) || query.workspaceId !== input.workspaceId || (query.userId && query.userId !== input.actorId)) throw Error("TODO_SOURCE_READ_SCOPE_INVALID");
    input.assertAllowed(query.collectionName);
    if (!query.recordId && DRAFT_ANCHORS.has(query.collectionName)) return (await anchor(query.collectionName)).map((row) => rowToRecord<Record<string, unknown>>(row));
    if (!query.recordId && DRAFT_JOINS.has(query.collectionName)) return (await join(query.collectionName)).map((row) => rowToRecord<Record<string, unknown>>(row));
    const reply = await input.client.query<PostgresLiveRecordRow>(`select ${ROW_COLUMNS} from orbit_records
      where ${live} and ($4::text is null or record_id=$4) order by updated_at desc,record_id limit $5`,
    [input.workspaceId, query.collectionName, input.actorId, query.recordId ?? null, query.recordId ? 1 : TODO_CONTACT_RELATION_LIMIT + 1]);
    if (reply.rows.length > TODO_CONTACT_RELATION_LIMIT || Buffer.byteLength(JSON.stringify(reply.rows)) > TODO_CONTACT_BYTES_PER_RELATION) throw Error("TODO_SOURCE_READ_LIMIT");
    return reply.rows.map(row => rowToRecord<Record<string, unknown>>(row));
  };
  return { listRecords: read, getRecord: async query => (await read(query))[0] ?? null, upsertRecord: fail, deleteRecord: fail };
}
export function createTodoContactReaders(input: { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string }): { contact_draft: TodoSourceReader; completion_question: TodoSourceReader } {
  return {
    contact_draft: async query => {
      const provider = createStorageContactAcquisitionDraftProvider({ store: input.store, workspaceId: input.workspaceId, actorId: query.actorId });
      const result = await createLiveContactAcquisitionDraftService({ provider }).listContactDrafts();
      if (!result.success) throw Error("TODO_CONTACT_DRAFT_UNAVAILABLE");
      const pending = [...new Map(result.data.drafts.filter(draft => draft.status === "pending_confirmation").map(draft => [draft.id, draft])).values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const after = query.cursor ? z.string().min(1).max(2048).parse(JSON.parse(query.cursor)) : null;
      const remaining = pending.filter(draft => !after || draft.id > after);
      return { total: Math.min(100, pending.length), capped: pending.length > 100, hasMore: remaining.length > query.limit,
        entries: remaining.slice(0, query.limit).map(draft => ({ cursor: JSON.stringify(draft.id), item: {
          key: `contact_draft:${draft.id}`, source: "contact_draft", sourceId: draft.id, titlePreview: draft.displayName.slice(0, 240), createdAt: draft.createdAt,
          contactNamePreview: draft.displayName.slice(0, 120), reasonPreview: draft.relationshipContext.slice(0, 320), actions: ["open"],
        } })) };
    },
    completion_question: async query => {
      const existing = await getCompletionQuestion(input.store, input.workspaceId, query.actorId, completionQuestionRecordId(query.actorId, query.date));
      if (!existing || existing.status === "none") return { entries: [], total: 0, hasMore: false, notImplemented: true };
      if (existing.status !== "open") return { entries: [], total: 0, hasMore: false };
      // Only the persisted-open branch is invoked. Absent/none questions never
      // enter today()'s write-on-read generation path. The store rejects writes.
      const service = createContactCompletionService({ now: () => new Date(`${query.date}T00:00:00+09:00`), storage: {
        workspaceId: input.workspaceId, read: fn => fn(input.store), write: async () => { throw Error("TODO_SOURCE_WRITE_FORBIDDEN"); },
      } });
      const question = await service.today(query.actorId);
      if (!question) return { entries: [], total: 0, hasMore: false };
      return { total: 1, hasMore: false, entries: query.cursor ? [] : [{ cursor: JSON.stringify(question.id), item: {
        key: `completion_question:${question.id}`, source: "completion_question", sourceId: question.id,
        titlePreview: question.question.slice(0, 240), createdAt: existing.createdAt, contactId: question.contactId,
        ...(question.contactName ? { contactNamePreview: question.contactName.slice(0, 120) } : {}), actions: ["open"],
      } }] };
    },
  };
}
