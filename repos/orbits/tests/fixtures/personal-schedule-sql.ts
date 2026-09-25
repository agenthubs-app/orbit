import { createTransactionalPostgresClient, type TransactionalPostgresPool } from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

// SQL-boundary fixture: production transaction/store/service remain real.
// This is not PostgreSQL evidence. Unsupported SQL fails instead of succeeding.
export function personalScheduleSqlFixture() {
  let rows = new Map<string, Record<string, unknown>>();
  let failCollection: string | null = null;
  const locks: string[] = [];
  const columns = ["workspace_id", "collection_name", "record_id", "user_id", "source_type", "source_id", "source_label", "provider", "provider_record_id", "evidence_ids", "target_type", "target_id", "occurred_at", "lifecycle_state", "search_text", "payload", "created_at", "updated_at", "deleted_at"];
  async function query(data: typeof rows, sql: string, values: readonly unknown[] = []) {
    const text = sql.trim();
    if (text.startsWith("select pg_advisory_xact_lock")) { locks.push(String(values[0])); return { rows: [] }; }
    if (text.startsWith("insert into orbit_records")) {
      if (values[1] === failCollection) throw new Error("injected plan storage failure");
      const row = Object.fromEntries(columns.map((column, index) => [column, structuredClone(values[index])]));
      data.set(JSON.stringify(values.slice(0, 3)), row);
      return { rows: [structuredClone(row)] };
    }
    if (text.startsWith("select to_regclass")) return { rows: [] };
    const isScheduleExceptionWindowQuery = /from\s+orbit_records\s+where\s+workspace_id\s*=\s*\$1/i.test(text) &&
      /collection_name\s*=\s*\$2/i.test(text) && /user_id\s*=\s*\$3/i.test(text) &&
      /source_id\s*=\s*\$4/i.test(text) && /lifecycle_state\s*<>\s*'deleted'/i.test(text) &&
      /record_id\s*=\s*any\(\$5::text\[\]\)/i.test(text) &&
      /left\s*\(\s*payload->'patch'->>'startsAt'\s*,\s*10\s*\)\s+between\s+\$6\s+and\s+\$7/i.test(text);
    if (text.startsWith("select") && isScheduleExceptionWindowQuery) {
      const [workspaceId, collectionName, actorId, sourceId, rawIds, earliest, latest] = values;
      if (typeof workspaceId !== "string" || typeof collectionName !== "string" || typeof actorId !== "string" ||
        typeof sourceId !== "string" || !Array.isArray(rawIds) || rawIds.some(id => typeof id !== "string") ||
        typeof earliest !== "string" || typeof latest !== "string") {
        throw new Error("Invalid schedule exception window SQL parameters");
      }
      const occurrenceIds = new Set(rawIds as string[]);
      const selected = [...data.values()].filter(row => {
        if (row.workspace_id !== workspaceId || row.collection_name !== collectionName || row.user_id !== actorId ||
          row.source_id !== sourceId || row.lifecycle_state === "deleted") return false;
        const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        const patch = payload && typeof payload === "object" ? (payload as Record<string, unknown>).patch : undefined;
        const startsAt = patch && typeof patch === "object" ? (patch as Record<string, unknown>).startsAt : undefined;
        const movedDate = typeof startsAt === "string" ? startsAt.slice(0, 10) : "";
        return occurrenceIds.has(String(row.record_id)) || (movedDate >= earliest && movedDate <= latest);
      });
      selected.sort((left, right) => String(left.record_id) < String(right.record_id) ? -1 : String(left.record_id) > String(right.record_id) ? 1 : 0);
      return { rows: structuredClone(selected) };
    }
    // Match the scoped join first, then report matching but malformed facts as
    // invalid rows; production relies on those rows to fail closed.
    if (/from\s+unnest\(\$3::text\[\],\s*\$4::text\[\]\)\s+s\(event_key,record_id\)\s+join\s+orbit_records\s+r/i.test(text)) {
      const eventKeys = values[2];
      const recordIds = values[3];
      if (!Array.isArray(eventKeys) || !Array.isArray(recordIds) || eventKeys.length !== recordIds.length) {
        throw new Error("Invalid historical suppression key pairs in schedule fixture");
      }
      const actorId = values[1];
      const collectionName = values[4];
      const result = eventKeys.flatMap((eventKey, index) => [...data.values()]
        .filter(row => row.workspace_id === values[0] && row.collection_name === collectionName && row.record_id === recordIds[index])
        .map(row => {
          const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
          const batchId = payload && typeof payload === "object" ? (payload as Record<string, unknown>).batchId : undefined;
          const recordedAt = payload && typeof payload === "object" ? (payload as Record<string, unknown>).recordedAt : undefined;
          return {
            event_key: eventKey,
            valid: row.user_id === actorId && row.lifecycle_state === "active" &&
              (payload as Record<string, unknown> | undefined)?.actorId === actorId &&
              (payload as Record<string, unknown> | undefined)?.eventKey === eventKey &&
              (payload as Record<string, unknown> | undefined)?.reason === "historical_backfill" &&
              typeof batchId === "string" && [...batchId].length >= 1 && [...batchId].length <= 4096 &&
              typeof recordedAt === "string",
          };
        }));
      return { rows: structuredClone(result) };
    }
    if (text.startsWith("select") && text.includes("from orbit_records")) {
      let found = [...data.values()].filter(row => row.workspace_id === values[0]);
      if (sql.includes("collection_name='reminderPlans'")) {
        found = found.filter(row => row.collection_name === 'reminderPlans');
        const entity = (row: Record<string, unknown>) => (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload)?.entity;
        if (sql.includes('record_id=any($3::text[])')) return { rows: found.filter(row => (values[2] as string[]).includes(String(row.record_id))).map(row => ({ record_id: row.record_id,
          valid: row.user_id === values[1] && row.source_id === row.record_id && entity(row)?.id === row.record_id && entity(row)?.ownerUserId === values[1] && entity(row)?.accountId === values[1] })) };
        if (sql.includes("record_id like $3 || '%'")) {
          found = found.filter(row => row.user_id === values[1] && row.lifecycle_state === 'active' && String(row.record_id).startsWith(String(values[2])) &&
            (values[3] === null || !String(row.record_id).startsWith(String(values[3]))) && String(row.record_id) > String(values[4]) &&
            entity(row)?.status === 'scheduled' && entity(row)?.ownerUserId === values[1] && entity(row)?.accountId === values[1] && Date.parse(entity(row)?.fireAt) >= Date.parse(String(values[5])));
          found.sort((a, b) => String(a.record_id) < String(b.record_id) ? -1 : String(a.record_id) > String(b.record_id) ? 1 : 0);
          return { rows: structuredClone(found.slice(0, 50)) };
        }
      }
      for (const column of ["collection_name", "record_id", "source_id", "user_id", "lifecycle_state"]) {
        const match = new RegExp(`\\b${column}\\s*=\\s*\\$(\\d+)\\b`).exec(sql);
        if (match) found = found.filter(row => row[column] === values[Number(match[1]) - 1]);
      }
      const recordIdsMatch = /\brecord_id\s*=\s*any\(\$(\d+)::text\[\]\)/i.exec(text);
      if (recordIdsMatch) {
        const recordIds = values[Number(recordIdsMatch[1]) - 1];
        if (!Array.isArray(recordIds)) throw new Error("Invalid record ID array in schedule fixture");
        found = found.filter(row => recordIds.includes(row.record_id));
      }
      if (sql.includes("lifecycle_state <> 'deleted'")) found = found.filter(row => row.lifecycle_state !== "deleted");
      if (sql.includes("collection_name='businessCardBatches'")) {
        const [workspaceId, actorId, afterId] = values;
        if (typeof workspaceId !== "string" || typeof actorId !== "string" || typeof afterId !== "string" || !/record_id\s*>\s*\$3/i.test(text)) {
          throw new Error("Invalid business-card batch keyset query in schedule fixture");
        }
        found = found.filter(row => row.workspace_id === workspaceId && row.collection_name === "businessCardBatches" &&
          row.user_id === actorId && row.lifecycle_state === "active" && String(row.record_id) > afterId);
      }
      if (sql.includes("collection_name in ('reminderPlans','businessCardBatches')")) found = found.filter(row => ["reminderPlans", "businessCardBatches"].includes(String(row.collection_name)) && String(row.record_id) > String(values[2]));
      found.sort((a, b) => String(a.record_id).localeCompare(String(b.record_id)));
      const parameterizedLimit = /\blimit\s+\$(\d+)\b/i.exec(text);
      if (parameterizedLimit) {
        const limit = values[Number(parameterizedLimit[1]) - 1];
        if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid parameterized limit in schedule fixture");
        found = found.slice(0, limit);
      } else if (sql.includes("limit 1")) found = found.slice(0, 1);
      else if (sql.includes("limit 50")) found = found.slice(0, 50);
      return { rows: structuredClone(found) };
    }
    throw new Error(`Unsupported schedule fixture SQL: ${text.slice(0, 70)}`);
  }
  const pool: TransactionalPostgresPool = {
    query: (sql, values) => query(rows, sql, values),
    async connect() {
      const transaction = structuredClone(rows);
      return { async query(sql, values) {
        if (sql === "begin isolation level serializable" || sql === "rollback") return { rows: [] };
        if (sql === "commit") { rows = transaction; return { rows: [] }; }
        return query(transaction, sql, values);
      }, release() {} };
    }, async end() {},
  };
  const client = createTransactionalPostgresClient({ connectionString: "postgres://fixture.invalid/no-network", pool });
  return { client, store: createPostgresLiveRecordStore({ client }), locks, failPlans: () => { failCollection = "reminderPlans"; } };
}
