import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { CardPipeline } from "../business-card-queue-dispatch";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export interface CardUploadSource {
  id: string; actorId: string; pipeline: CardPipeline; fileName: string; mimeType: string;
  byteSize: number; digest: string; objectKey: string; uploadExpiresAt: string;
}
type Row = Record<string, any>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function objectKey(workspaceId: string, actorId: string, id: string) {
  return `orbit-card-sources/${hash(workspaceId)}/${hash(actorId)}/${id}`;
}
function dto(row: Row): CardUploadSource {
  return { id: row.id, actorId: row.actor_id, pipeline: row.pipeline, fileName: row.file_name,
    mimeType: row.mime_type, byteSize: Number(row.byte_size), digest: row.digest,
    objectKey: row.object_key, uploadExpiresAt: new Date(row.upload_expires_at).toISOString() };
}

export function createCardUploadSourceRepository({ pool, workspaceId, wake }: {
  pool: Pick<Pool, "connect" | "query">; workspaceId: string;
  wake(pipeline: CardPipeline, delaySeconds: number): Promise<void>;
}) {
  if (!workspaceId.trim()) throw new Error("Upload workspace is required.");

  async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect(); let broken = false;
    try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; }
    catch (error) { try { await client.query("ROLLBACK"); } catch { broken = true; } throw error; }
    finally { client.release(broken); }
  }
  function idsOf(ids: readonly string[]) {
    if (!ids.length || ids.length > 500 || ids.some((id) => !UUID.test(id)) || new Set(ids).size !== ids.length) throw new Error("Invalid upload source list.");
    return [...ids].sort();
  }
  async function locked(client: PoolClient, actorId: string, ids: readonly string[]) {
    const r = await client.query(`SELECT *, expires_at > now() AS usable,
      lease_expires_at > now() AS leased FROM bc_ingest_raw_uploads
      WHERE workspace_id = $1 AND actor_id = $2 AND id = ANY($3::uuid[]) ORDER BY id FOR UPDATE`, [workspaceId, actorId, idsOf(ids)]);
    if (r.rows.length !== ids.length) throw new Error("Upload source not found.");
    if (new Set(r.rows.map((row) => row.pipeline)).size !== 1) throw new Error("Upload pipelines cannot be mixed.");
    return r.rows;
  }
  async function schedule(ids: readonly string[], pipeline: CardPipeline) {
    const r = await pool.query(`SELECT greatest(1, ceil(extract(epoch FROM max(next_attempt_at) - now())))::int AS delay
      FROM bc_ingest_raw_uploads WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, [workspaceId, ids]);
    const delay = r.rows[0]?.delay;
    if (!Number.isInteger(delay) || delay < 1 || delay > 7 * 86400) throw new Error("Upload cleanup schedule unavailable.");
    await wake(pipeline, delay);
  }

  return {
    async reserve(input: { actorId: string; requestKey: string; pipeline: CardPipeline; fileName: string; mimeType: string; byteSize: number; digest: string }): Promise<CardUploadSource> {
      const pdf = input.mimeType === "application/pdf" && input.pipeline === "v1";
      if (!input.actorId.trim() || !UUID.test(input.requestKey) || !["v1", "v2"].includes(input.pipeline) ||
          !input.fileName.trim() || input.fileName.length > 255 || (!pdf && !IMAGES.has(input.mimeType)) ||
          !Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > (pdf ? 50 : 10) * 1024 * 1024 || !DIGEST.test(input.digest)) {
        throw new Error("Invalid upload source metadata.");
      }
      const id = randomUUID();
      await pool.query(`INSERT INTO bc_ingest_raw_uploads
        (workspace_id,id,actor_id,request_key,pipeline,file_name,mime_type,byte_size,digest,object_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (workspace_id,actor_id,request_key) DO NOTHING`,
      [workspaceId, id, input.actorId, input.requestKey, input.pipeline, input.fileName, input.mimeType, input.byteSize, input.digest, objectKey(workspaceId, input.actorId, id)]);
      const r = await pool.query(`SELECT *, upload_expires_at > now() AS valid FROM bc_ingest_raw_uploads
        WHERE workspace_id = $1 AND actor_id = $2 AND request_key = $3`, [workspaceId, input.actorId, input.requestKey]);
      const row = r.rows[0];
      if (!row || row.state !== "reserved" || !row.valid || row.pipeline !== input.pipeline || row.file_name !== input.fileName ||
          row.mime_type !== input.mimeType || Number(row.byte_size) !== input.byteSize || row.digest !== input.digest) throw new Error("Upload reservation conflicts with existing state.");
      // Commit the record and accept its cleanup wake before exposing a source
      // that may receive bytes. Retrying the same request key schedules again.
      await schedule([row.id], row.pipeline);
      return dto(row);
    },

    async authorize(actorId: string, id: string, pathname: string) {
      if (!UUID.test(id)) throw new Error("Invalid upload source.");
      const r = await pool.query(`SELECT * FROM bc_ingest_raw_uploads WHERE workspace_id=$1 AND actor_id=$2 AND id=$3
        AND state='reserved' AND upload_expires_at > now()`, [workspaceId, actorId, id]);
      const row = r.rows[0];
      if (!row || pathname !== row.object_key || pathname !== objectKey(workspaceId, actorId, id)) throw new Error("Upload authorization unavailable.");
      return { allowedContentTypes: [row.mime_type as string], maximumSizeInBytes: Number(row.byte_size),
        validUntil: new Date(row.upload_expires_at).getTime(), addRandomSuffix: false, allowOverwrite: false };
    },

    async claim(actorId: string, ids: readonly string[]) {
      return transaction(async (client) => {
        const rows = await locked(client, actorId, ids);
        if (rows.every((row) => ["consumed", "deleting", "deleted"].includes(row.state) && row.target_ref) && new Set(rows.map((row) => row.target_ref)).size === 1) {
          return { state: "consumed" as const, targetRef: rows[0].target_ref as string };
        }
        if (rows.some((row) => !row.usable || !["reserved", "processing"].includes(row.state) || row.leased)) throw new Error("Upload source is not available for processing.");
        const leaseKey = randomUUID();
        await client.query(`UPDATE bc_ingest_raw_uploads SET state='processing', lease_key=$3,
          lease_expires_at=now()+interval '15 minutes',updated_at=now() WHERE workspace_id=$1 AND id=ANY($2::uuid[])`, [workspaceId, ids, leaseKey]);
        return { state: "claimed" as const, leaseKey, sources: rows.map(dto) };
      });
    },

    async consume(input: { actorId: string; ids: readonly string[]; leaseKey: string;
      // All target database mutations MUST use this client, never another pool.
      writeTarget(client: PoolClient, sources: readonly CardUploadSource[]): Promise<string>;
    }): Promise<string> {
      const result = await transaction(async (client) => {
        const rows = await locked(client, input.actorId, input.ids);
        if (rows.every((row) => ["consumed", "deleting", "deleted"].includes(row.state) && row.target_ref) && new Set(rows.map((row) => row.target_ref)).size === 1) return { targetRef: rows[0].target_ref, pipeline: rows[0].pipeline };
        if (rows.some((row) => row.state !== "processing" || row.lease_key !== input.leaseKey || !row.leased || !row.usable)) throw new Error("Upload source lease is no longer valid.");
        const targetRef = await input.writeTarget(client, rows.map(dto));
        if (!targetRef?.trim()) throw new Error("Upload target receipt is required.");
        await client.query(`UPDATE bc_ingest_raw_uploads SET state='consumed',target_ref=$3,lease_key=null,lease_expires_at=null,
          next_attempt_at=greatest(now(),upload_expires_at+interval '1 minute'),updated_at=now()
          WHERE workspace_id=$1 AND id=ANY($2::uuid[])`, [workspaceId, input.ids, targetRef]);
        return { targetRef, pipeline: rows[0].pipeline };
      });
      await schedule(input.ids, result.pipeline);
      return result.targetRef as string;
    },

    async release(actorId: string, ids: readonly string[], leaseKey: string) {
      await pool.query(`UPDATE bc_ingest_raw_uploads SET state='reserved',lease_key=null,lease_expires_at=null,updated_at=now()
        WHERE workspace_id=$1 AND actor_id=$2 AND id=ANY($3::uuid[]) AND state='processing' AND lease_key=$4`, [workspaceId, actorId, idsOf(ids), leaseKey]);
    },

    async reap(pipeline: CardPipeline, remove: (key: string) => Promise<void>) {
      const candidates = await pool.query(`SELECT id FROM bc_ingest_raw_uploads WHERE workspace_id=$1 AND pipeline=$2
        AND state <> 'deleted' AND next_attempt_at<=now() AND upload_expires_at+interval '1 minute'<=now()
        AND (state IN ('consumed','deleting') OR (expires_at<=now() AND (lease_expires_at IS NULL OR lease_expires_at<=now())))
        ORDER BY next_attempt_at LIMIT 20`, [workspaceId, pipeline]);
      let deleted = 0, failed = 0;
      for (const { id } of candidates.rows) {
        const key = await transaction(async (client) => {
          const r = await client.query(`SELECT * FROM bc_ingest_raw_uploads WHERE workspace_id=$1 AND id=$2
            AND state <> 'deleted' AND next_attempt_at<=now() AND upload_expires_at+interval '1 minute'<=now()
            AND (state IN ('consumed','deleting') OR (expires_at<=now() AND (lease_expires_at IS NULL OR lease_expires_at<=now()))) FOR UPDATE SKIP LOCKED`, [workspaceId, id]);
          const row = r.rows[0]; if (!row) return null;
          if (!UUID.test(row.id) || row.object_key !== objectKey(workspaceId, row.actor_id, row.id)) throw new Error("Invalid upload cleanup scope.");
          await client.query(`UPDATE bc_ingest_raw_uploads SET state='deleting',lease_key=null,lease_expires_at=null,
            next_attempt_at=now()+interval '1 minute',updated_at=now() WHERE workspace_id=$1 AND id=$2`, [workspaceId, id]);
          return row.object_key as string;
        });
        if (!key) continue;
        try {
          await remove(key);
          await pool.query("UPDATE bc_ingest_raw_uploads SET state='deleted',updated_at=now() WHERE workspace_id=$1 AND id=$2 AND state='deleting'", [workspaceId, id]);
          deleted++;
        } catch { failed++; }
      }
      return { deleted, failed };
    },
  };
}
