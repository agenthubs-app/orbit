import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { resolveLiveDatabaseConnectionConfig } from "../../../shared/storage/live-database-config";
import { configuredV1CardImageJournal } from "./business-card-v1-image-journal";
import { reapUnattachedCardImages, registerCardImageWrite } from "../business-card-ingest-v2/image-write-journal";
import {
  createPrivateBlobBatchImageStore,
  usesPrivateBusinessCardBlob,
} from "./business-card-private-blob-store";

export interface BusinessCardBatchImageStore {
  save(batchId: string, itemId: string, jpegBytes: Buffer): Promise<string>;
  read(imagePath: string): Promise<Buffer | null>;
  removeItemImage(imagePath: string): Promise<void>;
  removeBatchImages(batchId: string): Promise<void>;
  prepareWrites?(): Promise<void>;
  reapUnattachedWrites?(): Promise<number>;
}

/**
 * Transcoded batch card images use private Blob on Vercel and local disk in
 * development until the reviewer confirms
 * or skips the card — the deliberate, user-approved relaxation of the
 * "no image persistence" invariant that single-shot scans still keep.
 */
export function createBusinessCardBatchImageStore({
  env = process.env,
  rootDir = env.ORBIT_BATCH_UPLOAD_DIR ?? ".orbit-batch-uploads",
}: { env?: Record<string, string | undefined>; rootDir?: string } = {}): BusinessCardBatchImageStore {
  if (usesPrivateBusinessCardBlob(env)) {
    const workspaceId = env.ORBIT_WORKSPACE_ID?.trim() || "workspace:default";
    function journal() {
      const config = resolveLiveDatabaseConnectionConfig(env);
      if (!config) throw new Error("V1 card image journal unavailable.");
      return configuredV1CardImageJournal(config.connectionString);
    }
    const store = createPrivateBlobBatchImageStore({
      workspaceId,
      lifecycle: {
        prepare: () => journal().prepare(),
        async beforePut(objectKey) {
          const runtime = journal(); await runtime.prepare();
          await registerCardImageWrite({ pool: runtime.pool, workspaceId, objectKey, pipeline: "v1",
            ...(env.VERCEL === "1" ? {} : { wake: async () => {} }),
          });
        },
        async reap() {
          const runtime = journal(); await runtime.prepare();
          return reapUnattachedCardImages({ pool: runtime.pool, workspaceId, pipeline: "v1", remove: (key) => store.removeItemImage(key) });
        },
      },
    });
    return store;
  }
  const absoluteRoot = resolve(rootDir);

  function guardInsideRoot(imagePath: string): string {
    const absolute = resolve(imagePath);

    if (!absolute.startsWith(absoluteRoot + sep)) {
      throw new Error("Business-card batch image path escapes the upload root.");
    }

    return absolute;
  }

  return {
    async save(batchId, itemId, jpegBytes) {
      const directory = join(absoluteRoot, batchId);
      await mkdir(directory, { recursive: true });
      const imagePath = join(directory, `${itemId}.jpg`);
      await writeFile(imagePath, jpegBytes);

      return imagePath;
    },
    async read(imagePath) {
      try {
        return await readFile(guardInsideRoot(imagePath));
      } catch {
        return null;
      }
    },
    async removeItemImage(imagePath) {
      await rm(guardInsideRoot(imagePath), { force: true });
    },
    async removeBatchImages(batchId) {
      await rm(join(absoluteRoot, batchId), { force: true, recursive: true });
    },
  };
}
