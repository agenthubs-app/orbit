import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";

// 衍生图存储适配器（方案 §八）：put/get/delete，UUID key（不含文件名或联系人信息）。
// 本地/单实例持久盘部署 = 文件系统；多实例部署前必须先实现共享对象存储。

export interface IngestDerivativeStore {
  put(bytes: Buffer): Promise<{ objectKey: string; size: number }>;
  get(objectKey: string): Promise<Buffer | null>;
  delete(objectKey: string): Promise<void>;
}

const OBJECT_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export function createFilesystemDerivativeStore(options: {
  rootDir: string;
}): IngestDerivativeStore {
  const rootDir = isAbsolute(options.rootDir)
    ? options.rootDir
    : resolve(process.cwd(), options.rootDir);

  function pathFor(objectKey: string): string {
    if (!OBJECT_KEY_PATTERN.test(objectKey)) {
      throw new Error(`invalid derivative object key: ${objectKey}`);
    }
    const filePath = resolve(rootDir, objectKey);
    if (filePath !== join(rootDir, objectKey) || !filePath.startsWith(rootDir + sep)) {
      throw new Error("derivative path escapes the store root");
    }
    return filePath;
  }

  return {
    async put(bytes) {
      const objectKey = `${randomUUID()}.jpg`;
      const filePath = pathFor(objectKey);
      await mkdir(rootDir, { recursive: true });
      await writeFile(filePath, bytes);
      return { objectKey, size: bytes.length };
    },
    async get(objectKey) {
      try {
        return await readFile(pathFor(objectKey));
      } catch {
        return null;
      }
    },
    async delete(objectKey) {
      await rm(pathFor(objectKey), { force: true });
    },
  };
}

export function resolveIngestDerivativeRootDir(): string {
  const base = process.env.ORBIT_BATCH_UPLOAD_DIR?.trim() || ".orbit-batch-uploads";
  return join(base, "ingest-v2");
}
