import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isBusinessCardUploadMimeType,
  normalizeBusinessCardUploadImage,
  resolveBusinessCardUploadMimeType,
} from "../../features/acquisition/business-card-image-normalization";

const TINY_HEIC_FIXTURE_URL = new URL(
  "../fixtures/business-card-tiny.heic",
  import.meta.url,
);

test("upload mime acceptance includes HEIC and HEIF next to the provider trio", () => {
  for (const accepted of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]) {
    assert.equal(isBusinessCardUploadMimeType(accepted), true);
  }
  assert.equal(isBusinessCardUploadMimeType("image/gif"), false);
  assert.equal(isBusinessCardUploadMimeType(undefined), false);
});

test("upload mime resolution falls back to the file extension for empty browser types", () => {
  assert.equal(
    resolveBusinessCardUploadMimeType({ declaredType: "", fileName: "IMG_0001.HEIC" }),
    "image/heic",
  );
  assert.equal(
    resolveBusinessCardUploadMimeType({ declaredType: "image/jpeg", fileName: "card.heic" }),
    "image/jpeg",
  );
  assert.equal(resolveBusinessCardUploadMimeType({ fileName: "notes.txt" }), undefined);
});

test("HEIC uploads are transcoded to JPEG for the OCR provider", async () => {
  const heicBytes = await readFile(TINY_HEIC_FIXTURE_URL);
  const normalized = await normalizeBusinessCardUploadImage({
    imageBase64: heicBytes.toString("base64"),
    mimeType: "image/heic",
  });

  assert.equal(normalized.mimeType, "image/jpeg");
  const jpegBytes = Buffer.from(normalized.imageBase64, "base64");
  assert.equal(jpegBytes[0], 0xff);
  assert.equal(jpegBytes[1], 0xd8);
});

test("provider-native uploads pass through untouched", async () => {
  const normalized = await normalizeBusinessCardUploadImage({
    imageBase64: "aGVsbG8=",
    mimeType: "image/png",
  });

  assert.deepEqual(normalized, { imageBase64: "aGVsbG8=", mimeType: "image/png" });
});

test("corrupt HEIC input rejects instead of silently passing through", async () => {
  await assert.rejects(
    normalizeBusinessCardUploadImage({
      imageBase64: Buffer.from("definitely not heic").toString("base64"),
      mimeType: "image/heic",
    }),
  );
});
