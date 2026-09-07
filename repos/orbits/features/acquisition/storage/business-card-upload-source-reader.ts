import { createHash } from "node:crypto";
import { get } from "@vercel/blob";
import type { CardUploadSource } from "./business-card-upload-sources";

export interface CardSourceTransport {
  open(pathname: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array> | null>;
}

const privateTransport: CardSourceTransport = {
  async open(pathname, signal) {
    const result = await get(pathname, { access: "private", useCache: false, abortSignal: signal });
    if (!result) return null;
    if (result.statusCode !== 200) throw new Error("Unexpected source response.");
    return result.stream;
  },
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Only consume server-owned reservation records after acquiring their lease.
 * A digest match verifies uploaded bytes, not whether the image/PDF can decode.
 */
export function createCardUploadSourceReader({ workspaceId, transport = privateTransport, timeoutMs = 60_000 }: {
  workspaceId: string; transport?: CardSourceTransport; timeoutMs?: number;
}) {
  if (!workspaceId.trim() || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("Invalid source reader configuration.");
  }
  return async function read(actorId: string, source: CardUploadSource): Promise<Buffer> {
    const pdf = source.pipeline === "v1" && source.mimeType === "application/pdf";
    if (!actorId.trim() || source.actorId !== actorId || !UUID.test(source.id) ||
        !["v1", "v2"].includes(source.pipeline) || (!pdf && !IMAGE_TYPES.has(source.mimeType)) ||
        !Number.isSafeInteger(source.byteSize) || source.byteSize < 1 ||
        source.byteSize > (pdf ? 50 : 10) * 1024 * 1024 || !/^sha256:[a-f0-9]{64}$/.test(source.digest) ||
        source.objectKey !== `orbit-card-sources/${hash(workspaceId)}/${hash(actorId)}/${source.id}`) {
      throw new Error("Invalid upload source reference.");
    }

    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Upload source read expired."));
        controller.abort();
      }, timeoutMs);
    });
    let complete = false;
    try {
      const opening = transport.open(source.objectKey, controller.signal).then((stream) => {
        // An adapter that ignores abort may resolve after our deadline. Do not
        // leave that late response body open or wait for its cancellation.
        if (controller.signal.aborted && stream) {
          void stream.cancel().catch(() => {});
          return null;
        }
        return stream;
      });
      const stream = await Promise.race([opening, expired]);
      if (!stream) throw new Error("Upload source missing.");
      reader = stream.getReader();
      const chunks: Buffer[] = [];
      const digest = createHash("sha256");
      let size = 0;
      for (;;) {
        const next = await Promise.race([reader.read(), expired]);
        if (next.done) break;
        const bytes = next.value;
        if (!(bytes instanceof Uint8Array) || bytes.byteLength > source.byteSize - size) {
          throw new Error("Upload source size exceeded.");
        }
        size += bytes.byteLength;
        // Copy each chunk: transports may reuse their backing buffer.
        if (bytes.byteLength) chunks.push(Buffer.from(bytes));
        digest.update(bytes);
      }
      if (size !== source.byteSize || `sha256:${digest.digest("hex")}` !== source.digest) {
        throw new Error("Upload source integrity mismatch.");
      }
      complete = true;
      return Buffer.concat(chunks, size);
    } catch {
      // Never propagate SDK URLs, authorization data, or raw provider errors.
      throw new Error("Uploaded file could not be verified. Please retry the upload.");
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (reader) {
        if (!complete) void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  };
}
