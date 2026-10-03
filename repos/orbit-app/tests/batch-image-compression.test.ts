import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  BATCH_IMAGE_COMPRESSION_STEPS,
  prepareBatchImage,
  prepareBatchImages,
  readPreparedBatchImage,
  type BatchImageCompressor,
  type BatchImageNative
} from "../src/api/batch-images";
import { MAX_ORBIT_BINARY_BYTES, createOrbitApiClient } from "../src/api/client";
import { ingestManifestEntrySchema } from "../src/api/schema/business-card-batch";

// Sprint 0140: oversized card images are compressed on the device before any
// digest, manifest or upload. The fake compressor stands in for the native
// (expo-image-manipulator) and browser (canvas) encoders; real-sample evidence
// lives in batch-image-compression-web.test.ts and the Simulator run.
const JPEG_HEADER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const MIB = 1024 * 1024;
const digest = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function jpegOfSize(size: number, fill = 7): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size).fill(fill);
  bytes.set(JPEG_HEADER);
  return bytes;
}

interface Harness {
  native: BatchImageNative;
  compressor: BatchImageCompressor;
  originalReads: number;
  encodes: Array<{ width: number; height: number; quality: number }>;
  discarded: string[];
  closed: number;
}

function harness({
  originalSize = 14 * MIB,
  width = 8064,
  height = 6048,
  copySizes = [3 * MIB],
  failEncode = false,
  onEncode
}: {
  originalSize?: number;
  width?: number;
  height?: number;
  copySizes?: number[];
  failEncode?: boolean;
  onEncode?: (index: number) => void;
} = {}): Harness {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  files.set("file:///picker/IMG_0001.HEIC", jpegOfSize(originalSize, 1));
  const state: Harness = {
    originalReads: 0,
    encodes: [],
    discarded: [],
    closed: 0,
    native: {
      async openFile(uri) {
        const bytes = files.get(uri);
        if (!bytes) return { exists: false, size: 0, bytes: async () => new Uint8Array() };
        return {
          exists: true,
          size: bytes.byteLength,
          bytes: async () => {
            if (uri === "file:///picker/IMG_0001.HEIC") state.originalReads++;
            return bytes;
          }
        };
      },
      sha256: async (value) => Uint8Array.from(createHash("sha256").update(value).digest()).buffer
    },
    compressor: {
      async open() {
        return {
          width,
          height,
          async encode(target, quality) {
            const index = state.encodes.length;
            state.encodes.push({ ...target, quality });
            onEncode?.(index);
            if (failEncode) throw new Error("decoder exploded at /private/var/secret");
            const size = copySizes[Math.min(index, copySizes.length - 1)]!;
            const uri = `file:///cache/compressed-${index}.jpg`;
            files.set(uri, jpegOfSize(size, 10 + index));
            return { uri, size };
          },
          discard(copy) { state.discarded.push(copy.uri); files.delete(copy.uri); },
          close() { state.closed++; }
        };
      }
    }
  };
  return state;
}

const oversizedInput = { uri: "file:///picker/IMG_0001.HEIC", fileName: "IMG_0001.HEIC", mimeType: "image/heic", fileSize: 14 * MIB };
function errorCode(code: string) {
  return (error: unknown) => {
    assert.equal((error as { code: string }).code, code);
    assert.doesNotMatch((error as Error).message, /secret|private/u);
    return true;
  };
}

test("compression policy is a fixed, descending ladder that keeps OCR-legible resolution", () => {
  assert.deepEqual(BATCH_IMAGE_COMPRESSION_STEPS, [
    { maxLongEdge: 4096, quality: 0.85 },
    { maxLongEdge: 3200, quality: 0.8 },
    { maxLongEdge: 2560, quality: 0.75 },
    { maxLongEdge: 2048, quality: 0.7 }
  ]);
});

test("an oversized original is replaced by its compressed copy before digest, manifest and upload", async () => {
  const h = harness();
  const prepared = await prepareBatchImage(oversizedInput, { native: h.native, compressor: h.compressor });
  assert.equal(h.originalReads, 0, "the oversized original bytes are never read into JS");
  assert.deepEqual(h.encodes, [{ width: 4096, height: 3072, quality: 0.85 }]);
  assert.equal(prepared.uri, "file:///cache/compressed-0.jpg");
  assert.equal(prepared.fileName, "IMG_0001.jpg");
  assert.equal(prepared.mimeType, "image/jpeg");
  assert.equal(prepared.rawSize, 3 * MIB);
  const copy = jpegOfSize(3 * MIB, 10);
  assert.equal(prepared.clientDigest, digest(copy));
  assert.equal(h.closed, 1);
  assert.deepEqual(h.discarded, []);

  const manifest = ingestManifestEntrySchema.parse({ ...prepared, cardId: "card:one", side: "front", seq: 1 });
  const bytes = await readPreparedBatchImage(prepared, { native: h.native });
  let uploaded: BodyInit | null | undefined;
  let contentType = "";
  const client = createOrbitApiClient({ fetchImpl: async (_url, init) => {
    uploaded = init?.body;
    contentType = new Headers(init?.headers).get("Content-Type") ?? "";
    return new Response('{"success":true,"data":{}}', { headers: { "Content-Type": "application/json" } });
  } });
  const result = await client.put("/api/test/content", { rawBody: bytes, headers: { "Content-Type": prepared.mimeType } });
  assert.equal(result.success, true);
  assert.equal(uploaded, bytes);
  assert.equal((uploaded as Uint8Array).byteLength, manifest.rawSize);
  assert.equal(digest(bytes), manifest.clientDigest);
  assert.equal(contentType, manifest.mimeType);
  assert.equal(h.originalReads, 0);
});

test("oversize detected only from the opened file (no picker size) still compresses", async () => {
  const h = harness();
  const { fileSize: _omit, ...withoutSize } = oversizedInput;
  const prepared = await prepareBatchImage(withoutSize, { native: h.native, compressor: h.compressor });
  assert.equal(prepared.mimeType, "image/jpeg");
  assert.equal(prepared.rawSize, 3 * MIB);
  assert.equal(h.originalReads, 0);
});

test("the ladder stops at the first copy within the limit and discards larger attempts", async () => {
  const h = harness({ copySizes: [11 * MIB, 10 * MIB + 1, 6 * MIB] });
  const prepared = await prepareBatchImage(oversizedInput, { native: h.native, compressor: h.compressor });
  assert.deepEqual(h.encodes, [
    { width: 4096, height: 3072, quality: 0.85 },
    { width: 3200, height: 2400, quality: 0.8 },
    { width: 2560, height: 1920, quality: 0.75 }
  ]);
  assert.deepEqual(h.discarded, ["file:///cache/compressed-0.jpg", "file:///cache/compressed-1.jpg"]);
  assert.equal(prepared.uri, "file:///cache/compressed-2.jpg");
  assert.equal(prepared.rawSize, 6 * MIB);
});

test("portrait and already-small dimensions are never upscaled", async () => {
  const portrait = harness({ width: 3000, height: 9000 });
  await prepareBatchImage(oversizedInput, { native: portrait.native, compressor: portrait.compressor });
  assert.deepEqual(portrait.encodes[0], { width: 1365, height: 4096, quality: 0.85 });
  const small = harness({ width: 2000, height: 1200 });
  await prepareBatchImage(oversizedInput, { native: small.native, compressor: small.compressor });
  assert.deepEqual(small.encodes[0], { width: 2000, height: 1200, quality: 0.85 });
});

test("images at or under the limit are not recompressed", async () => {
  for (const size of [1 * MIB, MAX_ORBIT_BINARY_BYTES]) {
    const h = harness({ originalSize: size });
    const prepared = await prepareBatchImage({ ...oversizedInput, fileSize: size }, { native: h.native, compressor: h.compressor });
    assert.deepEqual(h.encodes, []);
    assert.equal(prepared.uri, oversizedInput.uri);
    assert.equal(prepared.rawSize, size);
  }
});

test("still oversized after the whole ladder fails visibly with no upload candidate", async () => {
  const h = harness({ copySizes: [11 * MIB] });
  await assert.rejects(prepareBatchImage(oversizedInput, { native: h.native, compressor: h.compressor }), errorCode("FILE_TOO_LARGE"));
  assert.equal(h.encodes.length, BATCH_IMAGE_COMPRESSION_STEPS.length);
  assert.equal(h.discarded.length, BATCH_IMAGE_COMPRESSION_STEPS.length);
  assert.equal(h.closed, 1);
  assert.equal(h.originalReads, 0);
});

test("a decoder failure is sanitized as COMPRESSION_FAILED and never falls back to the original", async () => {
  const h = harness({ failEncode: true });
  await assert.rejects(prepareBatchImage(oversizedInput, { native: h.native, compressor: h.compressor }), errorCode("COMPRESSION_FAILED"));
  const unopenable = harness();
  unopenable.compressor = { open: async () => { throw new Error("secret codec path"); } };
  await assert.rejects(prepareBatchImage(oversizedInput, { native: unopenable.native, compressor: unopenable.compressor }), errorCode("COMPRESSION_FAILED"));
  assert.equal(h.originalReads + unopenable.originalReads, 0);
});

test("cancelling during compression discards the copy and stops the batch", async () => {
  const controller = new AbortController();
  const h = harness({ onEncode: () => controller.abort() });
  await assert.rejects(
    prepareBatchImages([oversizedInput, oversizedInput], { native: h.native, compressor: h.compressor, signal: controller.signal }),
    errorCode("CANCELLED")
  );
  assert.equal(h.encodes.length, 1);
  assert.deepEqual(h.discarded, ["file:///cache/compressed-0.jpg"]);
  assert.equal(h.closed, 1);
});

test("a tighter transport limit compresses to that limit and validates reads against it", async () => {
  const h = harness({ originalSize: 9 * MIB, copySizes: [8 * MIB, 5 * MIB] });
  const limit = 7 * MIB;
  const prepared = await prepareBatchImage({ ...oversizedInput, fileSize: 9 * MIB }, { native: h.native, compressor: h.compressor, maxBytes: limit });
  assert.equal(h.encodes.length, 2);
  assert.equal(prepared.rawSize, 5 * MIB);
  const bytes = await readPreparedBatchImage(prepared, { native: h.native, maxBytes: limit });
  assert.equal(bytes.byteLength, 5 * MIB);
  assert.equal(digest(bytes), prepared.clientDigest);
});
