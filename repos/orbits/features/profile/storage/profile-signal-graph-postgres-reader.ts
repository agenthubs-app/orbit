import type { LiveRecord } from "../../../shared/storage/live-record-store";
import {
  rowToRecord,
  type PostgresLiveRecordRow,
} from "../../../shared/storage/postgres-live-record-store";
import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import {
  actorConnectionReferences,
  PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS,
  PROFILE_SIGNAL_PAYLOAD_FIELDS,
  selectActorRecordsBeforeEvidence,
  type ProfileSignalGraphRecordReader,
  type ProfileSignalRawRecords,
} from "./profile-signal-live-record-provider";

// W0042: the profile signal graph reads only the actor's candidate rows.
//
// Every round returns, per collection, a subsequence of the old whole-collection
// list in the same ORDER BY: the object-payload rows SQL can prove the
// JavaScript selection may pick, plus every non-object payload row of that
// collection (jsonb null / array / number / string — including double-encoded
// JSON strings that rowToRecord parses, or fails to parse, exactly as before).
// The unchanged JavaScript selection then decides on these candidates, so the
// graph, its order, generatedAt and the bad-data outcomes stay those of the
// whole-workspace read.
//
// Ownership is `user_id = actor` or `payload -> 'accountId'` equal to the actor
// as a jsonb string (a numeric 123 never equals "123", exactly `===`; never
// `->>`). Id membership compares a jsonb string `id` / `contactId` /
// `connectionId` with ids the JavaScript selection collected from the previous
// rounds (already non-empty strings, so plain equality is the JavaScript
// `nonEmptyString(x) && set.has(x)`).
//
// Rounds: 1 profiles + connections; 2 contacts + interactionMemories (ids from
// the actor's connections); 3 evidence (ids the actor's selected records
// reference). Payloads are projected to the field table next to the parsers;
// search_text is not read.

type Collection = keyof ProfileSignalRawRecords;

interface IdMatch {
  collection: Collection;
  field: "id" | "contactId" | "connectionId";
  ids: readonly string[];
}

// Read at call time: this module and the provider import each other.
function collectionName(collection: Collection): string {
  return PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS[collection];
}

function payloadFields(collection: Collection): string[] {
  const table = PROFILE_SIGNAL_PAYLOAD_FIELDS[collection];
  return [...new Set<string>([...table.derivation, ...table.parser])];
}

function candidateQuery(
  workspaceId: string,
  actorId: string,
  collections: readonly Collection[],
  matches: readonly IdMatch[],
): { text: string; values: unknown[] } {
  const values: unknown[] = [
    workspaceId,
    collections.map((collection) => collectionName(collection)),
    actorId,
  ];
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const fieldCases = collections
    .map((collection) => `when ${param(collectionName(collection))}::text then ${param(payloadFields(collection))}::text[]`)
    .join(" ");
  const idClauses = matches
    .filter((match) => match.ids.length > 0)
    .map((match) =>
      `(collection_name = ${param(collectionName(match.collection))}::text` +
      ` and jsonb_typeof(payload -> '${match.field}') = 'string'` +
      ` and payload ->> '${match.field}' = any(${param([...match.ids])}::text[]))`,
    );
  return {
    text: `
      select
        -- w0042-profile-signal-graph
        workspace_id,
        collection_name,
        record_id,
        user_id,
        source_type,
        source_id,
        source_label,
        provider,
        provider_record_id,
        evidence_ids,
        target_type,
        target_id,
        occurred_at,
        lifecycle_state,
        null::text as search_text,
        /* w0042-projection */ case when jsonb_typeof(payload) = 'object'
          then (select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
                from jsonb_each(payload) field
                where field.key = any(case collection_name ${fieldCases} end))
          else payload
        end /* end-w0042-projection */ as payload,
        created_at,
        updated_at,
        deleted_at
      from orbit_records
      where workspace_id = $1
        and collection_name = any($2::text[])
        and lifecycle_state <> 'deleted'
        and (
          jsonb_typeof(payload) <> 'object'
          or user_id = $3
          or payload -> 'accountId' = to_jsonb($3::text)
          ${idClauses.map((clause) => `or ${clause}`).join("\n          ")}
        )
      order by coalesce(occurred_at, updated_at) desc, updated_at desc
    `,
    values,
  };
}

export function createPostgresProfileSignalGraphRecordReader(input: {
  /** The provider's own (metered) client; never a new pool. */
  client: TransactionalSqlExecutor;
  workspaceId: string;
}): ProfileSignalGraphRecordReader {
  const read = async (
    actorId: string,
    collections: readonly Collection[],
    matches: readonly IdMatch[] = [],
  ): Promise<Record<Collection, LiveRecord<Record<string, unknown>>[]>> => {
    const query = candidateQuery(input.workspaceId, actorId, collections, matches);
    const result = await input.client.query<PostgresLiveRecordRow>(query.text, query.values);
    const byCollection = Object.fromEntries(
      collections.map((collection) => [collection, [] as LiveRecord<Record<string, unknown>>[]]),
    ) as Record<Collection, LiveRecord<Record<string, unknown>>[]>;
    const collectionOf = new Map(
      collections.map((collection) => [collectionName(collection), collection]),
    );
    for (const row of result.rows) {
      const collection = collectionOf.get(row.collection_name);
      if (!collection) throw new Error("Profile signal graph read returned an unexpected collection.");
      byCollection[collection].push(rowToRecord<Record<string, unknown>>(row));
    }
    return byCollection;
  };

  return async (actorId) => {
    const first = await read(actorId, ["profiles", "connections"]);
    const { actorConnectionIds, actorContactIds } = actorConnectionReferences(
      first.connections,
      actorId,
    );
    const second = await read(actorId, ["contacts", "interactionMemories"], [
      { collection: "contacts", field: "id", ids: [...actorContactIds] },
      { collection: "interactionMemories", field: "contactId", ids: [...actorContactIds] },
      { collection: "interactionMemories", field: "connectionId", ids: [...actorConnectionIds] },
    ]);
    const { actorEvidenceIds } = selectActorRecordsBeforeEvidence(
      {
        connections: first.connections,
        contacts: second.contacts,
        interactionMemories: second.interactionMemories,
        profiles: first.profiles,
      },
      actorId,
    );
    // Column evidence ids are not filtered (an empty or blank one is kept);
    // no evidence `payload.id` that passes `nonEmptyString` can equal those.
    const evidenceIds = [...actorEvidenceIds].filter(
      (id) => typeof id === "string" && id.trim().length > 0,
    );
    const third = await read(actorId, ["evidence"], [
      { collection: "evidence", field: "id", ids: evidenceIds },
    ]);
    return {
      connections: first.connections,
      contacts: second.contacts,
      evidence: third.evidence,
      interactionMemories: second.interactionMemories,
      profiles: first.profiles,
    };
  };
}
