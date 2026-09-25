import { createTransactionalPostgresClient, type TransactionalPostgresPool } from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

// Only the SQL/pool boundary is simulated. Production transactions, store,
// contact graph, note decoding, ACL, schedule mutations and receipts stay real.
// This is not PostgreSQL isolation or native/runtime acceptance evidence.
export function personalScheduleTransactionAssociationsFixture() {
  const rows = new Map<string, Record<string, unknown>>();
  const calls: { lane: "pool" | "transaction"; connection?: number; sql: string; values: readonly unknown[] }[] = [];
  const held = new Map<string, Promise<void>>();
  let leased = 0, highWater = 0, sequence = 0, escapedReads = 0;
  let failCollection: string | null = null;
  let barrier: { arrivals: number; ready: Promise<void>; release: () => void } | null = null;
  const columns = ["workspace_id", "collection_name", "record_id", "user_id", "source_type", "source_id", "source_label", "provider", "provider_record_id", "evidence_ids", "target_type", "target_id", "occurred_at", "lifecycle_state", "search_text", "payload", "created_at", "updated_at", "deleted_at"];
  const key = (values: readonly unknown[]) => JSON.stringify(values.slice(0, 3));
  async function query(data: Map<string, Record<string, unknown>>, sql: string, values: readonly unknown[] = []) {
    const text = sql.trim();
    if (text.startsWith("insert into orbit_records")) {
      if (values[1] === failCollection) throw Error("injected association schedule SQL failure");
      const row = Object.fromEntries(columns.map((column, index) => [column, structuredClone(values[index])]));
      data.set(key(values), row);
      return { rows: [structuredClone(row)] };
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
      const ids = /record_id = any\(\$(\d+)::text\[\]\)/.exec(sql);
      if (ids) found = found.filter(row => (values[Number(ids[1]) - 1] as unknown[]).includes(row.record_id));
      if (sql.includes("lifecycle_state <> 'deleted'")) found = found.filter(row => row.lifecycle_state !== "deleted");
      found.sort((a, b) => String(a.record_id).localeCompare(String(b.record_id)));
      if (sql.includes("limit 1")) found = found.slice(0, 1);
      return { rows: structuredClone(found) };
    }
    throw Error(`Unsupported transaction association fixture SQL: ${text.slice(0, 70)}`);
  }
  const pool: TransactionalPostgresPool = {
    async query(sql, values = []) {
      calls.push({ lane: "pool", sql, values: structuredClone(values) });
      if (leased === 2) {
        escapedReads++;
        throw Error("association read escaped transaction: max2 pool has no free lease");
      }
      return query(rows, sql, values);
    },
    async connect() {
      if (leased >= 2) throw Error("max2 transaction lease budget exceeded");
      leased++; highWater = Math.max(highWater, leased);
      const connection = ++sequence, writes = new Map<string, Record<string, unknown>>();
      const unlock: (() => void)[] = [];
      return {
        async query(sql, values = []) {
          calls.push({ lane: "transaction", connection, sql, values: structuredClone(values) });
          if (sql === "begin isolation level serializable") return { rows: [] };
          if (sql === "rollback" || sql === "commit") {
            if (sql === "commit") for (const [id, row] of writes) rows.set(id, row);
            writes.clear(); unlock.splice(0).forEach(release => release());
            return { rows: [] };
          }
          if (sql.startsWith("select pg_advisory_xact_lock")) {
            // Both real transaction leases reach the actor-lock boundary before
            // the holder runs ACL; the second waits for the holder's release.
            const rendezvous = barrier;
            if (rendezvous) {
              if (++rendezvous.arrivals === 2) { barrier = null; rendezvous.release(); }
              await rendezvous.ready;
            }
            const actorKey = String(values[0]), previous = held.get(actorKey);
            let release!: () => void;
            const pending = new Promise<void>(resolve => { release = resolve; });
            held.set(actorKey, pending);
            unlock.push(() => { release(); if (held.get(actorKey) === pending) held.delete(actorKey); });
            await previous;
            return { rows: [] };
          }
          const data = new Map([...rows, ...writes]);
          const result = await query(data, sql, values);
          if (sql.trim().startsWith("insert into orbit_records")) writes.set(key(values), data.get(key(values))!);
          return result;
        },
        release() { unlock.splice(0).forEach(release => release()); leased--; },
      };
    },
    async end() { if (leased) throw Error("transaction lease leaked"); },
  };
  const client = createTransactionalPostgresClient({ connectionString: "postgres://fixture.invalid/no-network", max: 2, pool });
  return {
    client, store: createPostgresLiveRecordStore({ client }), calls,
    stats: () => ({ leased, highWater, escapedReads }),
    snapshot: () => structuredClone([...rows.entries()].sort(([a], [b]) => a.localeCompare(b))),
    failWritesTo: (collection: string | null) => { failCollection = collection; },
    concurrentPair() {
      if (barrier || leased) throw Error("concurrent pair requires an idle fixture");
      let release!: () => void;
      const ready = new Promise<void>(resolve => { release = resolve; });
      barrier = { arrivals: 0, ready, release };
    },
  };
}
