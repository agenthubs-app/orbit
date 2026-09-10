import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { send } from "@vercel/queue";
import type { CardPipeline } from "../business-card-queue-dispatch";

const CLEANUP_DELAY_SECONDS = 24 * 60 * 60;
const KEY = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/;

function validImageKey(workspaceId: string, objectKey: string, pipeline: CardPipeline): boolean {
  if (!workspaceId.trim()) return false;
  if (pipeline === "v2") return KEY.test(objectKey);
  if (pipeline !== "v1") return false;
  const prefix = `orbit-card-images/${createHash("sha256").update(workspaceId).digest("hex")}/v1/`;
  return objectKey.startsWith(prefix) && /^[a-f0-9]{64}\/[a-f0-9]{64}\.jpg$/.test(objectKey.slice(prefix.length));
}

async function wakeImageCleanup(pipeline: CardPipeline): Promise<void> {
  await send("business-card-processing", { version: 1, pipeline }, {
    delaySeconds: CLEANUP_DELAY_SECONDS + 60, retentionSeconds: 7 * CLEANUP_DELAY_SECONDS,
  });
}

export async function registerCardImageWrite({ pool, workspaceId, objectKey, pipeline = "v2", wake }: {
  pool: Pick<Pool, "query">; workspaceId: string; objectKey: string; pipeline?: CardPipeline; wake?: () => Promise<void>;
}): Promise<void> {
  if (!validImageKey(workspaceId, objectKey, pipeline)) throw new Error("Invalid card image write scope.");
  try {
    // Commit before storing bytes. A failed wake prevents the upload, while the
    // harmless pending intent can still be recovered by the independent scan.
    await pool.query("INSERT INTO bc_ingest_image_writes (workspace_id, object_key, pipeline) VALUES ($1, $2, $3)", [workspaceId, objectKey, pipeline]);
    await (wake ?? (() => wakeImageCleanup(pipeline)))();
  } catch { throw new Error("Card image write registration unavailable."); }
}

export async function reapUnattachedCardImages({ pool, workspaceId, remove, pipeline = "v2" }: {
  pool: Pick<Pool, "query" | "connect">; workspaceId: string; remove: (objectKey: string) => Promise<void>; pipeline?: CardPipeline;
}): Promise<number> {
  if (!workspaceId.trim()) throw new Error("Invalid card image write scope.");
  try {
    const candidates = await pool.query(`SELECT object_key FROM bc_ingest_image_writes
      WHERE workspace_id = $1 AND pipeline = $2 AND state IN ('pending','deleting') AND next_attempt_at <= now()
      ORDER BY next_attempt_at LIMIT 20`, [workspaceId, pipeline]);
    let deleted = 0;
    for (const row of candidates.rows) {
      const objectKey = String(row.object_key);
      if (!validImageKey(workspaceId, objectKey, pipeline)) throw new Error("Invalid image write key");
      const client = await pool.connect();
      let removeNow = false;
      let broken = false;
      try {
        await client.query("BEGIN");
        const locked = await client.query(`SELECT state FROM bc_ingest_image_writes
          WHERE workspace_id = $1 AND object_key = $2 AND pipeline = $3 AND state IN ('pending','deleting')
            AND next_attempt_at <= now() FOR UPDATE SKIP LOCKED`, [workspaceId, objectKey, pipeline]);
        if (locked.rows.length) {
          const reference = await client.query(pipeline === "v2" ? `SELECT EXISTS (SELECT 1 FROM bc_ingest_items
            WHERE workspace_id = $1 AND derivative_object_key = $2) AS attached` : `SELECT EXISTS (SELECT 1 FROM orbit_records
            WHERE workspace_id = $1 AND collection_name = 'businessCardBatchItems' AND lifecycle_state <> 'deleted'
              AND payload->'item'->>'imagePath' = $2) AS attached`, [workspaceId, objectKey]);
          if (reference.rows[0]?.attached === true) {
            await client.query("UPDATE bc_ingest_image_writes SET state = 'attached', updated_at = now() WHERE workspace_id = $1 AND object_key = $2", [workspaceId, objectKey]);
          } else if (reference.rows[0]?.attached === false) {
            // Persist the fence BEFORE deleting bytes. A crash cannot roll it
            // back and permit a late reference to a now-deleted object.
            await client.query(`UPDATE bc_ingest_image_writes SET state = 'deleting', updated_at = now(),
              next_attempt_at = now() + interval '1 minute' WHERE workspace_id = $1 AND object_key = $2`, [workspaceId, objectKey]);
            removeNow = true;
          } else throw new Error("Image reference state unavailable");
        }
        await client.query("COMMIT");
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { broken = true; }
        throw error;
      } finally { client.release(broken); }
      if (!removeNow) continue;
      try {
        await remove(objectKey);
        await pool.query("UPDATE bc_ingest_image_writes SET state = 'deleted', updated_at = now() WHERE workspace_id = $1 AND object_key = $2 AND state = 'deleting'", [workspaceId, objectKey]);
        deleted++;
      } catch {
        // Keep the durable deleting fence and retry after the stored backoff.
      }
    }
    return deleted;
  } catch { throw new Error("Card image cleanup unavailable."); }
}
