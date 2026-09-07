import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  INGEST_V2_DERIVATIVE_TARGET_EDGE_PX,
  INGEST_V2_MAX_RAW_BYTES,
} from "../../features/acquisition/business-card-ingest-v2/contract";
import {
  IngestImageInvalidError,
  createNormalizationGate,
  normalizeIngestImage,
  scanHeifDeclaredPixels,
} from "../../features/acquisition/business-card-ingest-v2/normalization";

const FIXTURE_HEIC = join(__dirname, "..", "fixtures", "business-card-tiny.heic");

async function expectInvalid(
  promise: Promise<unknown>,
  reason: IngestImageInvalidError["reason"],
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof IngestImageInvalidError, String(error));
    assert.equal(error.reason, reason);
    return;
  }
  assert.fail(`expected IngestImageInvalidError(${reason})`);
}

test("normalizes a real HEIC into a bounded stripped JPEG", async () => {
  const bytes = await readFile(FIXTURE_HEIC);
  const result = await normalizeIngestImage({ bytes, declaredMimeType: "image/heic" });
  const metadata = await sharp(result.jpegBytes).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.ok((metadata.width ?? 0) <= INGEST_V2_DERIVATIVE_TARGET_EDGE_PX);
  assert.ok((metadata.height ?? 0) <= INGEST_V2_DERIVATIVE_TARGET_EDGE_PX);
  // 元数据剥离：无 EXIF
  assert.equal(metadata.exif, undefined);
});

test("normalizes and downsizes an oversized JPEG", async () => {
  const big = await sharp({
    create: { width: 4000, height: 2600, channels: 3, background: { r: 240, g: 240, b: 235 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  const result = await normalizeIngestImage({ bytes: big, declaredMimeType: "image/jpeg" });
  const metadata = await sharp(result.jpegBytes).metadata();
  assert.ok((metadata.width ?? 0) <= INGEST_V2_DERIVATIVE_TARGET_EDGE_PX);
});

test("rejects mime spoofing via magic byte sniffing", async () => {
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  await expectInvalid(
    normalizeIngestImage({ bytes: png, declaredMimeType: "image/jpeg" }),
    "MAGIC_MISMATCH",
  );
  await expectInvalid(
    normalizeIngestImage({
      bytes: Buffer.from("not an image at all"),
      declaredMimeType: "image/jpeg",
    }),
    "MAGIC_MISMATCH",
  );
});

test("rejects unsupported mime types and oversize payloads", async () => {
  await expectInvalid(
    normalizeIngestImage({ bytes: Buffer.from([1]), declaredMimeType: "application/pdf" }),
    "UNSUPPORTED_MIME",
  );
  await expectInvalid(
    normalizeIngestImage({
      bytes: Buffer.alloc(INGEST_V2_MAX_RAW_BYTES + 1),
      declaredMimeType: "image/jpeg",
    }),
    "RAW_TOO_LARGE",
  );
});

test("reads declared pixel dimensions from heif ispe boxes", async () => {
  const bytes = await readFile(FIXTURE_HEIC);
  const pixels = scanHeifDeclaredPixels(bytes);
  assert.ok(pixels !== null && pixels > 0, `expected ispe pixels, got ${pixels}`);

  // 构造声明超大尺寸的假 HEIC：像素炸弹在解码前被拒
  const bomb = Buffer.from(bytes);
  const ispeIndex = bomb.indexOf(Buffer.from("ispe", "latin1"));
  assert.ok(ispeIndex > 0);
  bomb.writeUInt32BE(65_000, ispeIndex + 8);
  bomb.writeUInt32BE(65_000, ispeIndex + 12);
  await expectInvalid(
    normalizeIngestImage({ bytes: bomb, declaredMimeType: "image/heic" }),
    "TOO_MANY_PIXELS",
  );
});

test("normalization gate serializes per actor and bounds global concurrency", async () => {
  const gate = createNormalizationGate({ globalLimit: 2 });
  let active = 0;
  let peak = 0;
  let actorAOverlap = 0;
  let actorAActive = 0;
  const job = (actorId: string) =>
    gate.run(actorId, async () => {
      active += 1;
      peak = Math.max(peak, active);
      if (actorId === "a") {
        actorAActive += 1;
        actorAOverlap = Math.max(actorAOverlap, actorAActive);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (actorId === "a") {
        actorAActive -= 1;
      }
      active -= 1;
    });
  await Promise.all([job("a"), job("a"), job("b"), job("c"), job("a")]);
  assert.ok(peak <= 2, `global peak ${peak}`);
  assert.equal(actorAOverlap, 1);
});
