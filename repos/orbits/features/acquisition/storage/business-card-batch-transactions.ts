import { Pool } from "pg";

import type { BusinessCardBatchService } from "../business-card-batch-service";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

const pools = new Map<string, Pool>();

export function configuredBusinessCardBatchPool(connectionString: string): Pool {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({ connectionString, max: 4, allowExitOnIdle: true });
    pools.set(connectionString, pool);
  }
  return pool;
}

/**
 * V1 stores state across multiple generic records. Its read/check/write and
 * count reconciliation must share a transaction and lock across processes.
 * V2 has its own row-level repository and does not use this legacy boundary.
 */
export function createTransactionalBusinessCardBatchService({
  pool,
  workspaceId,
  createService,
}: {
  pool: Pick<Pool, "connect">;
  workspaceId: string;
  createService: (store: LiveRecordStoreLike<Record<string, unknown>>) => BusinessCardBatchService;
}): BusinessCardBatchService {
  if (!workspaceId.trim()) throw new Error("Business-card workspace is required.");

  async function run<T>(operation: (service: BusinessCardBatchService) => Promise<T>): Promise<T> {
    const connection = await pool.connect().catch(() => {
      throw new Error("Business-card batch storage unavailable.");
    });
    let broken = false;
    const client: LiveRecordSqlClient = {
      async query<TRow>(text: string, values?: readonly unknown[]) {
        try {
          const result = await connection.query(text, values ? [...values] : undefined);
          return { rows: result.rows as TRow[] };
        } catch {
          throw new Error("Business-card batch storage unavailable.");
        }
      },
    };
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `orbit:business-card-batch:v1:${workspaceId}`,
      ]);
      const result = await operation(createService(createPostgresLiveRecordStore({ client })));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await connection.query("ROLLBACK"); } catch { broken = true; }
      throw error;
    } finally {
      connection.release(broken);
    }
  }

  return {
    createBatch: (input) => run((service) => service.createBatch(input)),
    listBatches: (actorId) => run((service) => service.listBatches(actorId)),
    getBatch: (actorId, batchId) => run((service) => service.getBatch(actorId, batchId)),
    claimPendingItems: (input) => run((service) => service.claimPendingItems(input)),
    completeItem: (input) => run((service) => service.completeItem(input)),
    failItem: (input) => run((service) => service.failItem(input)),
    retryItem: (input) => run((service) => service.retryItem(input)),
    confirmItem: (input) => run((service) => service.confirmItem(input)),
    skipItem: (input) => run((service) => service.skipItem(input)),
    finishBatch: (input) => run((service) => service.finishBatch(input)),
    sweepExpired: (now) => run((service) => service.sweepExpired(now)),
  };
}
