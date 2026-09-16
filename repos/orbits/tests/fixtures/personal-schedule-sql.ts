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
    if (text.startsWith("select") && text.includes("from orbit_records")) {
      let found = [...data.values()].filter(row => row.workspace_id === values[0]);
      for (const column of ["collection_name", "record_id", "source_id", "user_id", "lifecycle_state"]) {
        const match = new RegExp(`\\b${column}\\s*=\\s*\\$(\\d+)\\b`).exec(sql);
        if (match) found = found.filter(row => row[column] === values[Number(match[1]) - 1]);
      }
      if (sql.includes("lifecycle_state <> 'deleted'")) found = found.filter(row => row.lifecycle_state !== "deleted");
      if (sql.includes("collection_name in ('reminderPlans','businessCardBatches')")) found = found.filter(row => ["reminderPlans", "businessCardBatches"].includes(String(row.collection_name)) && String(row.record_id) > String(values[2]));
      found.sort((a, b) => String(a.record_id).localeCompare(String(b.record_id)));
      if (sql.includes("limit 1")) found = found.slice(0, 1);
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
