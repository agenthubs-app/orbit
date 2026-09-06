import { createHash, randomUUID } from "node:crypto";
import { del, get, list, put } from "@vercel/blob";

import type { IngestDerivativeStore } from "../business-card-ingest-v2/derivative-store";
import type { BusinessCardBatchImageStore } from "./business-card-batch-image-store";

/** Injectable transport; authorization remains in the batch API/repository. */
export interface PrivateCardBlobClient {
  put(pathname: string, bytes: Buffer): Promise<void>;
  get(pathname: string): Promise<Buffer | null>;
  delete(pathnames: string[]): Promise<void>;
  list(prefix: string, cursor?: string): Promise<{
    pathnames: string[];
    hasMore: boolean;
    cursor?: string;
  }>;
}

// The SDK resolves the deployment's BLOB_READ_WRITE_TOKEN internally. Never
// expose it, a signed URL, or the provider's raw error to the review client.
const blobClient: PrivateCardBlobClient = {
  async put(pathname, bytes) {
    await put(pathname, bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
    });
  },
  async get(pathname) {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200) throw new Error("Unexpected blob response");
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  },
  async delete(pathnames) {
    if (pathnames.length) await del(pathnames);
  },
  async list(prefix, cursor) {
    const result = await list({ prefix, cursor, limit: 1000 });
    return {
      pathnames: result.blobs.map((blob) => blob.pathname),
      hasMore: result.hasMore,
      cursor: result.cursor,
    };
  },
};

export function usesPrivateBusinessCardBlob(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL === "1" || env.ORBIT_BATCH_IMAGE_STORAGE === "private-blob";
}

function digestIdentifier(value: string): string {
  if (!value.trim() || value.length > 1024) {
    throw new Error("Invalid card image scope");
  }
  return createHash("sha256").update(value).digest("hex");
}

async function storageCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new Error("Private card image storage unavailable");
  }
}

export function createPrivateBlobBatchImageStore({
  workspaceId,
  client = blobClient,
}: {
  workspaceId: string;
  client?: PrivateCardBlobClient;
}): BusinessCardBatchImageStore {
  const prefix = `orbit-card-images/${digestIdentifier(workspaceId)}/v1/`;
  function validate(pathname: string): string {
    if (!pathname.startsWith(prefix) ||
        !/^[a-f0-9]{64}\/[a-f0-9]{64}\.jpg$/.test(pathname.slice(prefix.length))) {
      throw new Error("Invalid card image reference");
    }
    return pathname;
  }

  return {
    async save(batchId, itemId, bytes) {
      const pathname = `${prefix}${digestIdentifier(batchId)}/${digestIdentifier(itemId)}.jpg`;
      await storageCall(() => client.put(pathname, bytes));
      return pathname;
    },
    read(pathname) {
      const scopedPath = validate(pathname);
      return storageCall(() => client.get(scopedPath));
    },
    removeItemImage(pathname) {
      const scopedPath = validate(pathname);
      return storageCall(() => client.delete([scopedPath]));
    },
    async removeBatchImages(batchId) {
      const batchPrefix = `${prefix}${digestIdentifier(batchId)}/`;
      await storageCall(async () => {
        // Collect before deleting: deleting a page must not shift the next
        // page's cursor and leave images behind. Batch sizes are API-bounded.
        const pathnames: string[] = [];
        const seenCursors = new Set<string>();
        let cursor: string | undefined;
        for (;;) {
          const page = await client.list(batchPrefix, cursor);
          for (const pathname of page.pathnames) {
            validate(pathname);
            if (!pathname.startsWith(batchPrefix)) throw new Error("Wrong batch");
            pathnames.push(pathname);
          }
          if (!page.hasMore) break;
          if (!page.cursor || seenCursors.has(page.cursor)) throw new Error("Invalid cursor");
          seenCursors.add(page.cursor);
          cursor = page.cursor;
        }
        await client.delete(pathnames);
      });
    },
  };
}

export function createPrivateBlobDerivativeStore({
  workspaceId,
  client = blobClient,
}: {
  workspaceId: string;
  client?: PrivateCardBlobClient;
}): IngestDerivativeStore {
  const prefix = `orbit-card-images/${digestIdentifier(workspaceId)}/v2/`;
  function pathname(objectKey: string): string {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/.test(objectKey)) {
      throw new Error("Invalid card image reference");
    }
    return prefix + objectKey;
  }
  return {
    async put(bytes) {
      const objectKey = `${randomUUID()}.jpg`;
      await storageCall(() => client.put(pathname(objectKey), bytes));
      return { objectKey, size: bytes.length };
    },
    get(objectKey) {
      const scopedPath = pathname(objectKey);
      return storageCall(() => client.get(scopedPath));
    },
    delete(objectKey) {
      const scopedPath = pathname(objectKey);
      return storageCall(() => client.delete([scopedPath]));
    },
  };
}
