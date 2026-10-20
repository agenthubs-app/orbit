import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { get } from "@vercel/blob";

import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import type { ExportImage } from "./archive";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const V2_KEY = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/;

/** Only references owned by this actor are selected. Missing images fail the
 * export, so its manifest cannot quietly imply that the archive is complete. */
export function createAccountExportImageReader(input: {
  db: TransactionalSqlExecutor;
  workspaceId: string;
  actorId: string;
  open(key: string, source: "v1" | "v2"): Promise<Buffer | null>;
}) {
  return async (): Promise<ExportImage[]> => {
    const v1 = await input.db.query<{ image_path: string }>(`select payload->'item'->>'imagePath' as image_path
      from orbit_records where workspace_id=$1 and collection_name='businessCardBatchItems' and user_id=$2
      and lifecycle_state<>'deleted' and payload->'item'->>'actorId'=$2
      and payload->'item'->>'imagePath' is not null order by record_id limit 1001`,
    [input.workspaceId, input.actorId]);
    const v2Present = await input.db.query<{ present: string | null }>(`select to_regclass('bc_ingest_items')::text as present`);
    const v2 = v2Present.rows[0]?.present ? await input.db.query<{ image_path: string }>(`select i.derivative_object_key as image_path
      from bc_ingest_items i join bc_ingest_batches b on b.workspace_id=i.workspace_id and b.id=i.batch_id
      where i.workspace_id=$1 and b.actor_id=$2 and i.derivative_object_key is not null
      order by i.id limit 1001`, [input.workspaceId, input.actorId]) : { rows: [] };
    const keys = [
      ...v1.rows.map(row => ({ key: row.image_path, source: "v1" as const })),
      ...v2.rows.map(row => ({ key: row.image_path, source: "v2" as const })),
    ];
    if (keys.length > 1000) throw new Error("Export exceeds image limit");
    const images: ExportImage[] = [];
    let total = 0;
    for (const { key, source } of keys) {
      if (!key || source === "v2" && !V2_KEY.test(key)) throw new Error("Invalid export image reference");
      const bytes = await input.open(key, source);
      if (!bytes) throw new Error("Export domain unavailable: business-card-images");
      total += bytes.length;
      if (total > 50 * 1024 * 1024) throw new Error("Export exceeds image size limit");
      images.push({ name: `card-${hash(`${source}:${key}`).slice(0, 24)}.jpg`, bytes });
    }
    return images;
  };
}

export function createConfiguredAccountImageOpener(workspaceId: string, env: Record<string, string | undefined> = process.env) {
  const privateImages = env.VERCEL === "1" || env.ORBIT_BATCH_IMAGE_STORAGE === "private-blob";
  const privatePrefix = `orbit-card-images/${hash(workspaceId)}/`;
  const localRoot = resolve(env.ORBIT_BATCH_UPLOAD_DIR?.trim() || ".orbit-batch-uploads");
  return async (key: string, source: "v1" | "v2"): Promise<Buffer | null> => {
    let path: string;
    if (privateImages) {
      if (source === "v1") {
        const rest = key.startsWith(`${privatePrefix}v1/`) ? key.slice(`${privatePrefix}v1/`.length) : "";
        if (!/^[a-f0-9]{64}\/[a-f0-9]{64}\.jpg$/.test(rest)) throw new Error("Invalid export image reference");
        path = key;
      } else {
        if (!V2_KEY.test(key)) throw new Error("Invalid export image reference");
        path = `${privatePrefix}v2/${key}`;
      }
      const response = await get(path, { access: "private", useCache: false });
      return response?.statusCode === 200 ? Buffer.from(await new Response(response.stream).arrayBuffer()) : null;
    }
    path = source === "v1" ? resolve(key) : resolve(join(localRoot, "ingest-v2", key));
    if (source === "v2" && !V2_KEY.test(key) || !path.startsWith(localRoot + sep)) throw new Error("Invalid export image reference");
    try { return await readFile(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  };
}
