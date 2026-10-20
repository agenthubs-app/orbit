import { createHash } from "node:crypto";

import { del, get, put } from "@vercel/blob";

export interface PrivateAccountExportBlobClient {
  put(key: string, bytes: Buffer, options: { access: "private"; contentType: "application/zip"; allowOverwrite: false }): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(keys: string[]): Promise<void>;
}

const blobClient: PrivateAccountExportBlobClient = {
  async put(key, bytes, options) {
    await put(key, bytes, { ...options, addRandomSuffix: false });
  },
  async get(key) {
    const response = await get(key, { access: "private", useCache: false });
    if (!response) return null;
    if (response.statusCode !== 200) throw new Error("Unexpected private blob response");
    return Buffer.from(await new Response(response.stream).arrayBuffer());
  },
  async delete(keys) {
    if (keys.length) await del(keys);
  },
};

function digest(value: string): string {
  if (!value.trim() || value.length > 1024) throw new Error("Invalid export file reference");
  return createHash("sha256").update(value).digest("hex");
}

async function storageCall<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch { throw new Error("Private export storage unavailable"); }
}

export function createPrivateAccountExportStore({
  workspaceId,
  client = blobClient,
}: {
  workspaceId: string;
  client?: PrivateAccountExportBlobClient;
}) {
  const prefix = `account-exports/${digest(workspaceId)}/`;
  function keyFor(actorId: string, exportId: string) {
    return `${prefix}${digest(actorId)}/${digest(exportId)}.zip`;
  }
  function validate(actorId: string, key: string) {
    const actorPrefix = `${prefix}${digest(actorId)}/`;
    if (!key.startsWith(actorPrefix) || !/^[a-f0-9]{64}\.zip$/.test(key.slice(actorPrefix.length))) {
      throw new Error("Invalid export file reference");
    }
    return key;
  }
  return {
    async put(actorId: string, exportId: string, bytes: Buffer): Promise<string> {
      const key = keyFor(actorId, exportId);
      await storageCall(async () => {
        // A retry reuses the first complete object. Never overwrite a ZIP that
        // another lease has already uploaded for this accepted export.
        if (await client.get(key)) return;
        try {
          await client.put(key, bytes, { access: "private", contentType: "application/zip", allowOverwrite: false });
        } catch (error) {
          if (!await client.get(key)) throw error;
        }
      });
      return key;
    },
    async get(actorId: string, key: string): Promise<Buffer | null> {
      const scopedKey = validate(actorId, key);
      return storageCall(() => client.get(scopedKey));
    },
    async delete(actorId: string, key: string): Promise<void> {
      const scopedKey = validate(actorId, key);
      return storageCall(() => client.delete([scopedKey]));
    },
  };
}
