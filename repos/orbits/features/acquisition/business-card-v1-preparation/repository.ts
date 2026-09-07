import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";

export const V1_PREPARATION_JOBS = "businessCardImportJobs";
const SOURCES = "businessCardImportSources", REQUESTS = "businessCardImportRequests";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export interface PreparedCardPage {
  itemId: string; sourceId: string; sourcePage: number | null; sourceFileName: string;
  uploadMimeType: string; imagePath: string; imageDigest: string; seq: number;
}
export interface V1PreparationJob {
  id: string; actorId: string; sourceIds: string[];
  state: "pending" | "processing" | "ready" | "completed" | "cancelled" | "failed";
  nextSource: number; nextPage: number; sourcePageCount: number | null;
  pages: PreparedCardPage[]; leaseKey: string | null; leaseExpiresAt: string | null;
  nextAttemptAt: string; failures: number; errorCode: string | null; targetId: string | null;
  createdAt: string; updatedAt: string; expiresAt: string;
}
type Store = LiveRecordStoreLike<Record<string, unknown>>;
interface Context { client: PoolClient; store: Store; now: string }

export function createV1PreparationRepository({ pool, workspaceId, wake }: {
  pool: Pick<Pool, "connect">; workspaceId: string; wake(): Promise<void>;
}) {
  if (!workspaceId.trim()) throw new Error("Preparation workspace is required.");
  function ids(values: readonly string[]) {
    if (!values.length || values.length > 500 || values.some((id) => !UUID.test(id)) || new Set(values).size !== values.length) throw new Error("Invalid preparation sources.");
    return [...values].sort();
  }
  async function context(client: PoolClient): Promise<Context> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`orbit:business-card-batch:v1:${workspaceId}`]);
    const sql: LiveRecordSqlClient = { async query<TRow>(text: string, values?: readonly unknown[]) {
      const result = await client.query(text, values ? [...values] : undefined); return { rows: result.rows as TRow[] };
    } };
    const time = await client.query("SELECT clock_timestamp() AS time");
    return { client, store: createPostgresLiveRecordStore({ client: sql }), now: new Date(time.rows[0].time).toISOString() };
  }
  async function transaction<T>(operation: (ctx: Context) => Promise<T>, beforeLock?: (client: PoolClient) => Promise<void>): Promise<T> {
    const client = await pool.connect(); let broken = false;
    try {
      await client.query("BEGIN");
      // Source locks always precede the V1 workspace lock, including completion
      // inside the source repository's outer transaction.
      await beforeLock?.(client);
      const result = await operation(await context(client)); await client.query("COMMIT"); return result;
    } catch (error) { try { await client.query("ROLLBACK"); } catch { broken = true; } throw error; }
    finally { client.release(broken); }
  }
  async function raw(client: PoolClient, actorId: string, sourceIds: readonly string[]) {
    const result = await client.query(`SELECT *, expires_at > now() AS usable FROM bc_ingest_raw_uploads
      WHERE workspace_id=$1 AND actor_id=$2 AND pipeline='v1' AND id=ANY($3::uuid[]) ORDER BY id FOR UPDATE`, [workspaceId, actorId, ids(sourceIds)]);
    if (result.rows.length !== sourceIds.length) throw new Error("Preparation source not found.");
    return result.rows;
  }
  async function get(ctx: Context, id: string, actorId?: string): Promise<V1PreparationJob> {
    if (!UUID.test(id)) throw new Error("Preparation job not found.");
    const record = await ctx.store.getRecord({ workspaceId, collectionName: V1_PREPARATION_JOBS, recordId: id });
    const job = record?.payload.job as V1PreparationJob | undefined;
    if (!job || (actorId !== undefined && job.actorId !== actorId)) throw new Error("Preparation job not found.");
    return job;
  }
  async function record(ctx: Context, collectionName: string, recordId: string, actorId: string, payload: Record<string, unknown>, createdAt = ctx.now) {
    await ctx.store.upsertRecord({ workspaceId, collectionName, recordId, userId: actorId,
      sourceType: "business_card", sourceId: recordId, evidenceIds: [], lifecycleState: "active", payload, createdAt, updatedAt: ctx.now });
  }
  async function save(ctx: Context, job: V1PreparationJob) {
    job.updatedAt = ctx.now; await record(ctx, V1_PREPARATION_JOBS, job.id, job.actorId, { job }, job.createdAt); return job;
  }
  function requireLease(job: V1PreparationJob, leaseKey: string, now: string) {
    if (job.state !== "processing" || job.leaseKey !== leaseKey || !job.leaseExpiresAt || job.leaseExpiresAt <= now || job.expiresAt <= now) throw new Error("Preparation lease is no longer valid.");
  }
  const clearLease = (job: V1PreparationJob) => { job.leaseKey = null; job.leaseExpiresAt = null; };

  return {
    async admit(input: { actorId: string; requestKey: string; sourceIds: readonly string[] }) {
      if (!input.actorId.trim() || !UUID.test(input.requestKey)) throw new Error("Invalid preparation request.");
      ids(input.sourceIds);
      let rows: Awaited<ReturnType<typeof raw>> = [];
      const job = await transaction(async (ctx) => {
        const requestId = `${hash(input.actorId)}:${input.requestKey}`;
        const prior = await ctx.store.getRecord({ workspaceId, collectionName: REQUESTS, recordId: requestId });
        const bindings = await ctx.store.listRecords({ workspaceId, collectionName: SOURCES, recordIds: input.sourceIds });
        const existingId = prior?.payload.jobId ?? bindings[0]?.payload.jobId;
        if (existingId) {
          const existing = await get(ctx, String(existingId), input.actorId);
          if (JSON.stringify(existing.sourceIds) !== JSON.stringify(input.sourceIds)) throw new Error("Preparation request conflicts with an existing import.");
          if (!prior) await record(ctx, REQUESTS, requestId, input.actorId, { jobId: existing.id });
          return existing;
        }
        if (bindings.length || rows.some((row) => row.state !== "reserved" || !row.usable)) throw new Error("Preparation source is unavailable.");
        const expiresAt = new Date(Math.min(...rows.map((row) => new Date(row.expires_at).getTime()))).toISOString();
        if (expiresAt <= ctx.now) throw new Error("Preparation source is expired.");
        const created: V1PreparationJob = { id: randomUUID(), actorId: input.actorId, sourceIds: [...input.sourceIds],
          state: "pending", nextSource: 0, nextPage: 1, sourcePageCount: null, pages: [], leaseKey: null, leaseExpiresAt: null,
          nextAttemptAt: ctx.now, failures: 0, errorCode: null, targetId: null, createdAt: ctx.now, updatedAt: ctx.now, expiresAt };
        await save(ctx, created);
        await record(ctx, REQUESTS, requestId, input.actorId, { jobId: created.id });
        for (const sourceId of input.sourceIds) await record(ctx, SOURCES, sourceId, input.actorId, { jobId: created.id });
        return created;
      }, async (client) => { rows = await raw(client, input.actorId, input.sourceIds); });
      await wake(); return job;
    },

    get(actorId: string, id: string) { return transaction((ctx) => get(ctx, id, actorId)); },

    list(actorId: string) {
      return transaction(async (ctx) => {
        const result = await ctx.client.query(`SELECT record_id FROM orbit_records WHERE workspace_id=$1 AND collection_name=$2
          AND user_id=$3 AND lifecycle_state='active' ORDER BY created_at DESC LIMIT 50`, [workspaceId, V1_PREPARATION_JOBS, actorId]);
        return Promise.all(result.rows.map((row) => get(ctx, row.record_id, actorId)));
      });
    },

    nextReady(): Promise<V1PreparationJob | null> {
      return transaction(async (ctx) => {
        const result = await ctx.client.query(`SELECT record_id FROM orbit_records WHERE workspace_id=$1 AND collection_name=$2
          AND lifecycle_state='active' AND payload->'job'->>'state'='ready'
          AND (payload->'job'->>'expiresAt')::timestamptz > clock_timestamp() ORDER BY created_at LIMIT 1`, [workspaceId, V1_PREPARATION_JOBS]);
        return result.rows[0] ? get(ctx, result.rows[0].record_id) : null;
      });
    },

    expire() {
      return transaction(async (ctx) => {
        const result = await ctx.client.query(`SELECT record_id FROM orbit_records WHERE workspace_id=$1 AND collection_name=$2
          AND lifecycle_state='active' AND payload->'job'->>'state' IN ('pending','processing','ready')
          AND (payload->'job'->>'expiresAt')::timestamptz <= clock_timestamp() ORDER BY created_at LIMIT 20`, [workspaceId, V1_PREPARATION_JOBS]);
        for (const row of result.rows) {
          const job = await get(ctx, row.record_id); job.state = "failed"; job.errorCode = "SOURCE_EXPIRED"; clearLease(job); await save(ctx, job);
        }
        return result.rows.length;
      });
    },

    async claim(): Promise<V1PreparationJob | null> {
      return transaction(async (ctx) => {
        const result = await ctx.client.query(`SELECT record_id FROM orbit_records WHERE workspace_id=$1
          AND collection_name=$2 AND lifecycle_state='active' AND payload->'job'->>'state' IN ('pending','processing')
          AND (payload->'job'->>'expiresAt')::timestamptz > clock_timestamp()
          AND (payload->'job'->>'nextAttemptAt')::timestamptz <= clock_timestamp()
          AND (payload->'job'->>'leaseExpiresAt' IS NULL OR (payload->'job'->>'leaseExpiresAt')::timestamptz <= clock_timestamp())
          ORDER BY created_at,record_id LIMIT 1`, [workspaceId, V1_PREPARATION_JOBS]);
        if (!result.rows.length) return null;
        const job = await get(ctx, result.rows[0].record_id);
        job.state = "processing"; job.leaseKey = randomUUID(); job.leaseExpiresAt = new Date(Date.parse(ctx.now) + 15 * 60_000).toISOString();
        return save(ctx, job);
      });
    },

    checkpoint(input: { jobId: string; leaseKey: string; sourceId: string; page: number; pageCount: number;
      itemId: string; imagePath: string; imageDigest: string }) {
      return transaction(async (ctx) => {
        const job = await get(ctx, input.jobId); requireLease(job, input.leaseKey, ctx.now);
        if (job.sourceIds[job.nextSource] !== input.sourceId || input.page !== job.nextPage ||
            !Number.isInteger(input.pageCount) || input.pageCount < input.page || input.pageCount > 500 ||
            (job.sourcePageCount !== null && job.sourcePageCount !== input.pageCount) ||
            job.pages.length + input.pageCount - input.page + 1 > 500 || !UUID.test(input.itemId) ||
            job.pages.some((page) => page.itemId === input.itemId) || !/^sha256:[a-f0-9]{64}$/.test(input.imageDigest)) throw new Error("Invalid preparation checkpoint.");
        const expectedPath = `orbit-card-images/${hash(workspaceId)}/v1/${hash(job.id)}/${hash(input.itemId)}.jpg`;
        if (input.imagePath !== expectedPath) throw new Error("Invalid preparation image scope.");
        const source = await ctx.client.query("SELECT file_name,mime_type,digest FROM bc_ingest_raw_uploads WHERE workspace_id=$1 AND actor_id=$2 AND id=$3 AND pipeline='v1'", [workspaceId, job.actorId, input.sourceId]);
        const file = source.rows[0]; if (!file) throw new Error("Preparation source not found.");
        if (file.mime_type !== "application/pdf" && (input.page !== 1 || input.pageCount !== 1)) throw new Error("An image has one page.");
        if (file.mime_type !== "application/pdf" && input.imageDigest !== file.digest) throw new Error("Preparation image digest does not match its source.");
        const intent = await ctx.client.query("SELECT state FROM bc_ingest_image_writes WHERE workspace_id=$1 AND object_key=$2 AND pipeline='v1' FOR UPDATE", [workspaceId, input.imagePath]);
        if (intent.rows[0]?.state !== "pending") throw new Error("Preparation image write is unavailable.");
        job.pages.push({ itemId: input.itemId, sourceId: input.sourceId, sourcePage: file.mime_type === "application/pdf" ? input.page : null,
          sourceFileName: file.file_name, uploadMimeType: file.mime_type, imagePath: input.imagePath, imageDigest: input.imageDigest, seq: job.pages.length + 1 });
        job.failures = 0; job.errorCode = null;
        if (input.page === input.pageCount) { job.nextSource++; job.nextPage = 1; job.sourcePageCount = null; }
        else { job.nextPage++; job.sourcePageCount = input.pageCount; }
        if (job.nextSource === job.sourceIds.length) { job.state = "ready"; clearLease(job); }
        return save(ctx, job);
      });
    },

    release(jobId: string, leaseKey: string) {
      return transaction(async (ctx) => {
        const job = await get(ctx, jobId); requireLease(job, leaseKey, ctx.now);
        job.state = "pending"; clearLease(job); job.nextAttemptAt = ctx.now; return save(ctx, job);
      });
    },

    fail(jobId: string, leaseKey: string, code: "SOURCE_UNAVAILABLE" | "PDF_INVALID" | "IMAGE_INVALID" | "BATCH_TOO_LARGE", retryable: boolean) {
      return transaction(async (ctx) => {
        const job = await get(ctx, jobId); requireLease(job, leaseKey, ctx.now);
        job.failures++; job.errorCode = code; job.state = retryable && job.failures < 5 ? "pending" : "failed";
        clearLease(job); job.nextAttemptAt = new Date(Date.parse(ctx.now) + 60_000).toISOString(); return save(ctx, job);
      });
    },

    async cancel(actorId: string, id: string) {
      const initial = await transaction((ctx) => get(ctx, id, actorId));
      const job = await transaction(async (ctx) => {
        const current = await get(ctx, id, actorId);
        if (current.state === "completed") throw new Error("Preparation already created a batch.");
        if (current.state === "cancelled") return current;
        current.state = "cancelled"; clearLease(current);
        await ctx.client.query(`UPDATE bc_ingest_raw_uploads SET expires_at=now(),next_attempt_at=greatest(now(),upload_expires_at+interval '1 minute'),
          state='reserved',lease_key=null,lease_expires_at=null,updated_at=now()
          WHERE workspace_id=$1 AND actor_id=$2 AND id=ANY($3::uuid[]) AND state IN ('reserved','processing')`, [workspaceId, actorId, initial.sourceIds]);
        return save(ctx, current);
      }, async (client) => { await raw(client, actorId, initial.sourceIds); });
      await wake(); return job;
    },

    /** Called only inside source.consume's transaction. Target writes, job
     * completion and raw-source receipts are committed by that outer owner.
     */
    async complete(input: { client: PoolClient; actorId: string; jobId: string; sourceIds: readonly string[];
      writeTarget(client: PoolClient, job: V1PreparationJob): Promise<string> }) {
      await input.client.query("SAVEPOINT bc_v1_preparation");
      try {
        const ctx = await context(input.client); const job = await get(ctx, input.jobId, input.actorId);
        if (JSON.stringify(ids(job.sourceIds)) !== JSON.stringify(ids(input.sourceIds))) throw new Error("Preparation sources do not match.");
        if (job.state !== "ready" || job.expiresAt <= ctx.now || !job.pages.length) throw new Error("Preparation is not ready.");
        const targetId = await input.writeTarget(input.client, job);
        if (targetId !== job.id) throw new Error("Preparation target must use its reserved batch id.");
        job.state = "completed"; job.targetId = targetId; await save(ctx, job);
        await input.client.query("RELEASE SAVEPOINT bc_v1_preparation"); return targetId;
      } catch (error) {
        await input.client.query("ROLLBACK TO SAVEPOINT bc_v1_preparation"); await input.client.query("RELEASE SAVEPOINT bc_v1_preparation"); throw error;
      }
    },
  };
}
