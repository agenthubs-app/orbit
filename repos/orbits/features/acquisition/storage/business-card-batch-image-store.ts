import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface BusinessCardBatchImageStore {
  save(batchId: string, itemId: string, jpegBytes: Buffer): Promise<string>;
  read(imagePath: string): Promise<Buffer | null>;
  removeItemImage(imagePath: string): Promise<void>;
  removeBatchImages(batchId: string): Promise<void>;
}

/**
 * Transcoded batch card images live on local disk until the reviewer confirms
 * or skips the card — the deliberate, user-approved relaxation of the
 * "no image persistence" invariant that single-shot scans still keep.
 */
export function createBusinessCardBatchImageStore({
  rootDir = process.env.ORBIT_BATCH_UPLOAD_DIR ?? ".orbit-batch-uploads",
}: { rootDir?: string } = {}): BusinessCardBatchImageStore {
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
