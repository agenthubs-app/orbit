import type { DomainChange } from "../../shared/contract/universal-read";
import type { ContactSyncPayload } from "../../shared/contract/contact-local-directory";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { contactDetailPayloadFromGraph } from "../contacts/live-detail-service";
import { readContactSyncListRows } from "../contacts/storage/contact-list-postgres-reader";
import { readOwnedContactDetailInputs } from "../contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../contacts/storage/contact-scope-postgres-reader";
import type { ContactGraphSyncSource } from "./domain-registry";
import { SYNC_MAX_PAYLOAD_BYTES, SyncReadError } from "./read-service";

/**
 * Sprint 0116 (offline 1b): the reader behind the contacts domain.
 *
 * Owner: every row the domain touches is an orbit_records row of the four
 * contact collections whose user_id is the authenticated actor. The 0114
 * backfill gave cited rows their owner (and each owner a copy of a shared
 * source); a row that still has no owner, or belongs to someone else, is never
 * read here — it is left out, not refused, so it cannot block a sync.
 *
 * Revision: a contact row's revision is the greatest sync_revision of the
 * contact, its relationships (deleted ones included, so a removal resends the
 * contact), the owner's detail state for it and the owned sources the contact
 * or its relationships cite. All of them take revisions from the orbit_records
 * sequence under the commit-order lock (they are sync collections since this
 * sprint), so a change to any of them resends the contact after every earlier
 * bookmark. A source nobody cites never moves any row.
 *
 * Leaving: a soft-deleted contact keeps its owner and takes a new revision; it
 * is sent as a delete. No product path moves a contact row to another owner
 * (the owner guard refuses it).
 *
 * Payload: the server's own list card, tags and search text
 * (readContactSyncListRows) and its detail read (contactDetailPayloadFromGraph)
 * — the device lists, searches and opens its copy with the same results
 * (shared/contract/contact-local-directory.ts).
 */
const COLLECTIONS_SQL = "('contacts', 'connections', 'contact_detail_states', 'evidence')";

export const CONTACT_DOMAIN_HIGH_WATERMARK_SQL = `
  /* sync:contact-domain:high-watermark */
  select coalesce(max(sync_revision), 0)::text as high_watermark
  from orbit_records
  where workspace_id = $1 and user_id = $2 and collection_name in ${COLLECTIONS_SQL}
`;

const EVIDENCE_IDS = (alias: string) => `jsonb_array_elements_text(case when jsonb_typeof(${alias}.payload->'evidenceIds') = 'array' then ${alias}.payload->'evidenceIds' else '[]'::jsonb end)`;

const CONTACT_DOMAIN_PAGE_SQL = `
  /* sync:contact-domain:page */
  with owned_contacts as (
    select c.record_id, c.payload->>'id' as contact_id, c.lifecycle_state, c.sync_revision, c.payload
    from orbit_records c
    where c.workspace_id = $1 and c.collection_name = 'contacts' and c.user_id = $2
  ), owned_connections as (
    select n.payload->>'contactId' as contact_id, n.sync_revision, n.payload
    from orbit_records n
    where n.workspace_id = $1 and n.collection_name = 'connections' and n.user_id = $2
  ), connection_revisions as (
    select contact_id, max(sync_revision) as rev from owned_connections group by contact_id
  ), state_revisions as (
    select d.payload->>'contactId' as contact_id, max(d.sync_revision) as rev
    from orbit_records d
    where d.workspace_id = $1 and d.collection_name = 'contact_detail_states' and d.user_id = $2
    group by 1
  ), cited as (
    select c.contact_id, cited_id.value as evidence_id from owned_contacts c cross join lateral ${EVIDENCE_IDS("c")} as cited_id(value)
    union
    select n.contact_id, cited_id.value from owned_connections n cross join lateral ${EVIDENCE_IDS("n")} as cited_id(value)
  ), evidence_revisions as (
    select cited.contact_id, max(e.sync_revision) as rev
    from cited
    join orbit_records e on e.workspace_id = $1 and e.collection_name = 'evidence' and e.user_id = $2 and e.payload->>'id' = cited.evidence_id
    group by cited.contact_id
  ), contact_rows as (
    select c.record_id,
      greatest(c.sync_revision, cr.rev, sr.rev, er.rev) as rev,
      (c.lifecycle_state <> 'deleted'
        and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb or c.payload->'accountId' = to_jsonb($2::text))) as visible
    from owned_contacts c
    left join connection_revisions cr on cr.contact_id = c.contact_id
    left join state_revisions sr on sr.contact_id = c.contact_id
    left join evidence_revisions er on er.contact_id = c.contact_id
  )
  select record_id, rev::text as sync_revision, visible
  from contact_rows
  where rev > $3::bigint and rev <= $4::bigint
  order by rev asc, record_id asc
  limit $5
`;

const REVISION = /^(?:0|[1-9]\d*)$/;

// What a device never needs from the detail read: the boundary flags of the
// preview service and the provenance block.
const DETAIL_FLAGS = new Set([
  "tagWriteExecuted", "statusWriteExecuted", "noteWriteExecuted", "productionAuditLogWriteExecuted", "databaseReadExecuted",
  "databaseWriteExecuted", "externalNetworkRequested", "deviceRequested", "aiProviderRequested", "calendarProviderRequested",
  "emailProviderRequested", "notificationDelivered",
]);

function withoutFlags(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFlags);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !DETAIL_FLAGS.has(key)).map(([key, item]) => [key, withoutFlags(item)]));
}

/** The detail read as a device stores it: everything the screen reads, no provenance or write flags. */
export function deviceContactDetail(payload: Record<string, unknown>): Record<string, unknown> {
  const { provenance: _provenance, ...rest } = payload;
  return withoutFlags(rest) as Record<string, unknown>;
}

const PROVIDER = { source: "sync:contacts", sourceLabel: "Contacts sync domain" } as const;
// A page stays well under SYNC_MAX_PAGE_BYTES however long a contact's detail is.
const PAGE_BUDGET_BYTES = 768 * 1_024;

type PageRow = { record_id: string; sync_revision: string; visible: boolean };

export async function readContactDomainHighWatermark(client: LiveRecordSqlClient, input: { workspaceId: string; actorId: string }): Promise<string> {
  const value = (await client.query<{ high_watermark: string }>(CONTACT_DOMAIN_HIGH_WATERMARK_SQL, [input.workspaceId, input.actorId])).rows[0]?.high_watermark;
  if (typeof value !== "string" || !REVISION.test(value)) throw new SyncReadError("SYNC_INVALID_HIGH_WATERMARK", "The sync high watermark is invalid.");
  return value;
}

async function payloads(client: LiveRecordSqlClient, input: { workspaceId: string; actorId: string; recordIds: readonly string[]; issuedAt: string }): Promise<Map<string, ContactSyncPayload>> {
  const built = new Map<string, ContactSyncPayload>();
  if (input.recordIds.length === 0) return built;
  const [listRows, detailInputs] = await Promise.all([
    readContactSyncListRows(client, { workspaceId: input.workspaceId, actorId: input.actorId, contactRecordIds: input.recordIds }),
    readOwnedContactDetailInputs({
      actorId: input.actorId,
      contactRecordIds: input.recordIds,
      scopeReader: createPostgresContactScopeRecordReader({ client, workspaceId: input.workspaceId }),
      store: createPostgresLiveRecordStore({ client }),
      workspaceId: input.workspaceId,
    }),
  ]);
  const contacts = new Map(detailInputs.graph.contacts.map((contact) => [contact.id, contact]));
  for (const row of listRows) {
    const contact = contacts.get(row.contactId);
    const detail = contact
      ? contactDetailPayloadFromGraph({
          collectedAt: input.issuedAt,
          contact,
          connections: detailInputs.graph.connections,
          evidence: detailInputs.graph.evidence,
          persistedState: detailInputs.detailStates.get(row.contactId) ?? null,
          provider: PROVIDER,
        })
      : null;
    const payload: ContactSyncPayload = {
      id: row.recordId,
      card: row.card,
      tags: row.tags,
      search: { text: row.searchText, occurredAt: row.sortOccurredAt, updatedAt: row.sortUpdatedAt, error: row.errorCode },
      detail: detail ? deviceContactDetail(detail as unknown as Record<string, unknown>) : null,
    };
    // A contact whose detail alone is too large still lists and searches; its detail stays a network read.
    built.set(row.recordId, Buffer.byteLength(JSON.stringify(payload), "utf8") > SYNC_MAX_PAYLOAD_BYTES ? { ...payload, detail: null } : payload);
  }
  return built;
}

/**
 * Two contacts can share a revision (both cite one source row, whose edit is
 * then the greatest revision of each). A bookmark is "everything up to
 * revision N", so a page never ends inside such a group: it stops before the
 * group, or — when the group alone fills the page — takes the whole group.
 */
export async function readContactDomainPage(
  client: LiveRecordSqlClient,
  _source: ContactGraphSyncSource,
  input: { workspaceId: string; actorId: string; afterRevision: string; highWatermark: string; limit: number; issuedAt: string },
): Promise<{ changes: DomainChange[]; hasMore: boolean; lastRevision: string | null }> {
  const read = (after: string, high: string, limit: number) => client.query<PageRow>(CONTACT_DOMAIN_PAGE_SQL, [input.workspaceId, input.actorId, after, high, limit]);
  const result = await read(input.afterRevision, input.highWatermark, input.limit + 1);
  for (const row of result.rows) if (!REVISION.test(row.sync_revision)) throw new SyncReadError("SYNC_INVALID_RECORD", "A contact sync revision is invalid.");
  let pageRows: readonly PageRow[] = result.rows.slice(0, input.limit);
  let hasMore = result.rows.length > input.limit;
  if (hasMore) {
    const boundary = result.rows[input.limit]!.sync_revision;
    const before = pageRows.filter((row) => row.sync_revision !== boundary);
    pageRows = before.length > 0 ? before : (await read((BigInt(boundary) - BigInt(1)).toString(), boundary, 100_000)).rows;
  }
  const built = await payloads(client, { workspaceId: input.workspaceId, actorId: input.actorId, recordIds: pageRows.filter((row) => row.visible).map((row) => row.record_id), issuedAt: input.issuedAt });
  const sized = pageRows.map((row) => {
    const payload = row.visible ? built.get(row.record_id) : undefined;
    // Deleted, or no longer accepted by the list: the device drops it.
    const change: DomainChange = payload
      ? { id: row.record_id, revision: row.sync_revision, operation: "upsert", payload: payload as unknown as Record<string, unknown> }
      : { id: row.record_id, revision: row.sync_revision, operation: "delete", payload: null };
    return { change, size: Buffer.byteLength(JSON.stringify(change), "utf8") };
  });
  let consumed = 0;
  let bytes = 0;
  for (const { size } of sized) {
    if (consumed > 0 && bytes + size > PAGE_BUDGET_BYTES) break;
    bytes += size;
    consumed += 1;
  }
  if (consumed < sized.length) {
    hasMore = true;
    const boundary = sized[consumed]!.change.revision;
    let groupStart = consumed;
    while (groupStart > 0 && sized[groupStart - 1]!.change.revision === boundary) groupStart -= 1;
    // Stop before the group; a first group larger than the budget is sent whole.
    if (groupStart > 0) consumed = groupStart;
    else while (consumed < sized.length && sized[consumed]!.change.revision === boundary) consumed += 1;
  }
  const kept = sized.slice(0, consumed);
  // A first pull has nothing to remove: tombstones are only sent after a bookmark.
  const changes = kept.map(({ change }) => change).filter((change) => !(change.operation === "delete" && input.afterRevision === "0"));
  return { changes, hasMore, lastRevision: kept.length ? kept.at(-1)!.change.revision : null };
}
