import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createCardUploadSourceReader } from "../../features/acquisition/storage/business-card-upload-source-reader";
import type { CardUploadSource } from "../../features/acquisition/storage/business-card-upload-sources";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function source(bytes: Buffer): CardUploadSource {
  const id = randomUUID();
  return { id, actorId: "owner", pipeline: "v1", fileName: "card.jpg", mimeType: "image/jpeg",
    byteSize: bytes.length, digest: `sha256:${hash(bytes)}`,
    objectKey: `orbit-card-sources/${hash("workspace")}/${hash("owner")}/${id}`,
    uploadExpiresAt: new Date(0).toISOString() };
}
const verifiedError = { message: "Uploaded file could not be verified. Please retry the upload." };

test("reads an exact 6 MiB source in chunks and preserves the 50 MiB PDF allowance", async () => {
  for (const size of [6 * 1024 * 1024, 50 * 1024 * 1024]) {
    const bytes = Buffer.alloc(size, 42), record = source(bytes);
    if (size > 10 * 1024 * 1024) record.mimeType = "application/pdf";
    let offset = 0;
    const read = createCardUploadSourceReader({ workspaceId: "workspace", transport: {
      async open(pathname, signal) {
        assert.equal(pathname, record.objectKey); assert.equal(signal.aborted, false);
        return new ReadableStream({ pull(controller) {
          if (offset === size) { controller.close(); return; }
          controller.enqueue(bytes.subarray(offset, offset = Math.min(size, offset + 64 * 1024)));
        } });
      },
    } });
    assert.deepEqual(await read("owner", record), bytes);
  }
});

test("rejects foreign scope, URLs and invalid limits before opening storage", async () => {
  const record = source(Buffer.from("card")); let opened = 0;
  const read = createCardUploadSourceReader({ workspaceId: "workspace", transport: {
    async open() { opened++; return null; },
  } });
  for (const bad of [
    { ...record, actorId: "other" }, { ...record, objectKey: "https://example.invalid/source" },
    { ...record, byteSize: 10 * 1024 * 1024 + 1 }, { ...record, byteSize: NaN },
    { ...record, mimeType: "application/pdf", pipeline: "v2" as const },
    { ...record, objectKey: record.objectKey.replace(hash("workspace"), hash("other")) },
  ]) await assert.rejects(read("owner", bad), /Invalid upload source reference/);
  assert.equal(opened, 0);
});

test("counts actual stream bytes, rejects short/corrupt content and cancels oversized reads", async () => {
  const record = source(Buffer.from("card"));
  for (const bytes of [Buffer.from("car"), Buffer.from("xxxx"), Buffer.from("card-extra")]) {
    let cancelled = false;
    const read = createCardUploadSourceReader({ workspaceId: "workspace", transport: {
      async open() { return new ReadableStream({ start(c) { c.enqueue(bytes); if (bytes.length <= 4) c.close(); },
        cancel() { cancelled = true; },
      }); },
    } });
    await assert.rejects(read("owner", record), verifiedError);
    if (bytes.length > 4) assert.equal(cancelled, true);
  }
});

test("deadline covers opening and body stalls without waiting for a stuck cancellation", async () => {
  const record = source(Buffer.from("card"));
  for (const stallOpening of [true, false]) {
    let signal: AbortSignal | undefined, cancelled = false;
    const read = createCardUploadSourceReader({ workspaceId: "workspace", timeoutMs: 20, transport: {
      async open(_, abort) {
        signal = abort;
        if (stallOpening) return new Promise(() => {});
        return new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } });
      },
    } });
    await assert.rejects(read("owner", record), verifiedError);
    assert.equal(signal?.aborted, true);
    if (!stallOpening) assert.equal(cancelled, true);
  }
});

test("cancels a late-opened body after the deadline and sanitizes transport failures", async () => {
  let resolveOpen!: (stream: ReadableStream<Uint8Array>) => void;
  let cancelled = false;
  const read = createCardUploadSourceReader({ workspaceId: "workspace", timeoutMs: 10, transport: {
    open() { return new Promise((resolve) => { resolveOpen = resolve; }); },
  } });
  await assert.rejects(read("owner", source(Buffer.from("card"))), verifiedError);
  resolveOpen(new ReadableStream({ cancel() { cancelled = true; } }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
  for (const missing of [true, false]) {
    const failing = createCardUploadSourceReader({ workspaceId: "workspace", transport: {
      async open() { if (missing) return null; throw new Error("synthetic-private-provider-detail"); },
    } });
    await assert.rejects(failing("owner", source(Buffer.from("card"))), verifiedError);
  }
});
