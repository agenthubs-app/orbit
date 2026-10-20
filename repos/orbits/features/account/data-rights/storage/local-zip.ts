import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

function digest(value: string): string {
  if (!value.trim() || value.length > 1024) throw new Error("Invalid export file reference");
  return createHash("sha256").update(value).digest("hex");
}

export function createLocalAccountExportStore({ workspaceId, root }: { workspaceId: string; root: string }) {
  const base = resolve(root);
  const prefix = `account-exports/${digest(workspaceId)}/`;
  function validate(actorId: string, key: string): string {
    const actorPrefix = `${prefix}${digest(actorId)}/`;
    if (!key.startsWith(actorPrefix) || !/^[a-f0-9]{64}\.zip$/.test(key.slice(actorPrefix.length))) {
      throw new Error("Invalid export file reference");
    }
    return join(base, key);
  }
  return {
    async put(actorId: string, exportId: string, bytes: Buffer): Promise<string> {
      const key = `${prefix}${digest(actorId)}/${digest(exportId)}.zip`;
      const path = validate(actorId, key);
      await mkdir(join(base, prefix, digest(actorId)), { recursive: true, mode: 0o700 });
      const temporary = `${path}.${randomUUID()}.part`;
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally { await file.close(); }
      try {
        await link(temporary, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      } finally { await rm(temporary, { force: true }); }
      return key;
    },
    async get(actorId: string, key: string): Promise<Buffer | null> {
      try { return await readFile(validate(actorId, key)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    },
    async delete(actorId: string, key: string): Promise<void> {
      await rm(validate(actorId, key), { force: true });
    },
  };
}
