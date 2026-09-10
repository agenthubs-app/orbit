import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  prepareBatchImage, prepareBatchImages, readPreparedBatchImage, loadSelectedBatchImage,
  type BatchImageNative, type PreparedBatchImage
} from "../src/api/batch-images";
import { createOrbitApiClient } from "../src/api/client";
import { ingestManifestEntrySchema } from "../src/api/schema/business-card-batch";

// Complete local codec-generated JPEG/HEIC; PNG and WebP are single-pixel fixtures.
// HEIF below keeps the HEVC payload and compatible brands, selecting the mif1 major brand.
const JPEG = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAAB//8AAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AACwgAAQABAQERAP/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//dAAQAAf/aAAgBAQAAPwD9/K//2Q==", "base64"));
const HEIC = Uint8Array.from(Buffer.from("AAAAGGZ0eXBoZWljAAAAAGhlaWNtaWYxAAAUNG1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAQACAABodmMxAAAAABppcmVmAAAAAAAAAA5hdXhsAAIAAQABAAATV2lwcnAAABMtaXBjbwAAEahjb2xycHJvZgAAEZxhcHBsAgAAAG1udHJHUkFZWFlaIAfcAAgAFwAPAC4AD2Fjc3BBUFBMAAAAAG5vbmUAAAAAAAAAAAAAAAAAAAAAAAD21gABAAAAANMtYXBwbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABWRlc2MAAADAAAAAeWRzY20AAAE8AAAIGmNwcnQAAAlYAAAAI3d0cHQAAAl8AAAAFGtUUkMAAAmQAAAIDGRlc2MAAAAAAAAAH0dlbmVyaWMgR3JheSBHYW1tYSAyLjIgUHJvZmlsZQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABtbHVjAAAAAAAAAB8AAAAMc2tTSwAAAC4AAAGEZGFESwAAADoAAAGyY2FFUwAAADgAAAHsdmlWTgAAAEAAAAIkcHRCUgAAAEoAAAJkdWtVQQAAACwAAAKuZnJGVQAAAD4AAALaaHVIVQAAADQAAAMYemhUVwAAABoAAANMa29LUgAAACIAAANmbmJOTwAAADoAAAOIY3NDWgAAACgAAAPCaGVJTAAAACQAAAPqcm9STwAAACoAAAQOZGVERQAAAE4AAAQ4aXRJVAAAAE4AAASGc3ZTRQAAADgAAATUemhDTgAAABoAAAUMamFKUAAAACYAAAUmZWxHUgAAACoAAAVMcHRQTwAAAFIAAAV2bmxOTAAAAEAAAAXIZXNFUwAAAEwAAAYIdGhUSAAAADIAAAZUdHJUUgAAACQAAAaGZmlGSQAAAEYAAAaqaHJIUgAAAD4AAAbwcGxQTAAAAEoAAAcuYXJFRwAAACwAAAd4cnVSVQAAADoAAAekZW5VUwAAADwAAAfeAFYBYQBlAG8AYgBlAGMAbgDhACAAcwBpAHYA4QAgAGcAYQBtAGEAIAAyACwAMgBHAGUAbgBlAHIAaQBzAGsAIABnAHIA5QAgADIALAAyACAAZwBhAG0AbQBhAC0AcAByAG8AZgBpAGwARwBhAG0AbQBhACAAZABlACAAZwByAGkAcwBvAHMAIABnAGUAbgDoAHIAaQBjAGEAIAAyAC4AMgBDHqUAdQAgAGgA7ABuAGgAIABNAOAAdQAgAHgA4QBtACAAQwBoAHUAbgBnACAARwBhAG0AbQBhACAAMgAuADIAUABlAHIAZgBpAGwAIABHAGUAbgDpAHIAaQBjAG8AIABkAGEAIABHAGEAbQBhACAAZABlACAAQwBpAG4AegBhAHMAIAAyACwAMgQXBDAEMwQwBDsETAQ9BDAAIABHAHIAYQB5AC0EMwQwBDwEMAAgADIALgAyAFAAcgBvAGYAaQBsACAAZwDpAG4A6QByAGkAcQB1AGUAIABnAHIAaQBzACAAZwBhAG0AbQBhACAAMgAsADIAwQBsAHQAYQBsAOEAbgBvAHMAIABzAHoA/AByAGsAZQAgAGcAYQBtAG0AYQAgADIALgAykBp1KHBwlo5RSV6mADIALgAygnJfaWPPj/DHfLwYACDWjMDJACCsELnIACAAMgAuADIAINUEuFzTDMd8AEcAZQBuAGUAcgBpAHMAawAgAGcAcgDlACAAZwBhAG0AbQBhACAAMgAsADIALQBwAHIAbwBmAGkAbABPAGIAZQBjAG4A4QAgAWEAZQBkAOEAIABnAGEAbQBhACAAMgAuADIF0gXQBd4F1AAgBdAF5AXVBegAIAXbBdwF3AXZACAAMgAuADIARwBhAG0AYQAgAGcAcgBpACAAZwBlAG4AZQByAGkAYwEDACAAMgAsADIAQQBsAGwAZwBlAG0AZQBpAG4AZQBzACAARwByAGEAdQBzAHQAdQBmAGUAbgAtAFAAcgBvAGYAaQBsACAARwBhAG0AbQBhACAAMgAsADIAUAByAG8AZgBpAGwAbwAgAGcAcgBpAGcAaQBvACAAZwBlAG4AZQByAGkAYwBvACAAZABlAGwAbABhACAAZwBhAG0AbQBhACAAMgAsADIARwBlAG4AZQByAGkAcwBrACAAZwByAOUAIAAyACwAMgAgAGcAYQBtAG0AYQBwAHIAbwBmAGkAbGZukBpwcF6mfPtlcAAyAC4AMmPPj/Blh072TgCCLDCwMOwwpDCsMPMw3gAgADIALgAyACAw1zDtMNUwoTCkMOsDkwO1A70DuQO6A8wAIAOTA7oDwQO5ACADkwOsA7wDvAOxACAAMgAuADIAUABlAHIAZgBpAGwAIABnAGUAbgDpAHIAaQBjAG8AIABkAGUAIABjAGkAbgB6AGUAbgB0AG8AcwAgAGQAYQAgAEcAYQBtAG0AYQAgADIALAAyAEEAbABnAGUAbQBlAGUAbgAgAGcAcgBpAGoAcwAgAGcAYQBtAG0AYQAgADIALAAyAC0AcAByAG8AZgBpAGUAbABQAGUAcgBmAGkAbAAgAGcAZQBuAOkAcgBpAGMAbwAgAGQAZQAgAGcAYQBtAG0AYQAgAGQAZQAgAGcAcgBpAHMAZQBzACAAMgAsADIOIw4xDgcOKg41DkEOAQ4hDiEOMg5ADgEOIw4iDkwOFw4xDkgOJw5EDhsAIAAyAC4AMgBHAGUAbgBlAGwAIABHAHIAaQAgAEcAYQBtAGEAIAAyACwAMgBZAGwAZQBpAG4AZQBuACAAaABhAHIAbQBhAGEAbgAgAGcAYQBtAG0AYQAgADIALAAyACAALQBwAHIAbwBmAGkAaQBsAGkARwBlAG4AZQByAGkBDQBrAGkAIABHAHIAYQB5ACAARwBhAG0AbQBhACAAMgAuADIAIABwAHIAbwBmAGkAbABVAG4AaQB3AGUAcgBzAGEAbABuAHkAIABwAHIAbwBmAGkAbAAgAHMAegBhAHIAbwFbAGMAaQAgAGcAYQBtAG0AYQAgADIALAAyBjoGJwZFBicAIAAyAC4AMgAgBkQGSAZGACAGMQZFBicGLwZKACAGOQYnBkUEHgQxBEkEMARPACAEQQQ1BEAEMARPACAEMwQwBDwEPAQwACAAMgAsADIALQQ/BEAEPgREBDgEOwRMAEcAZQBuAGUAcgBpAGMAIABHAHIAYQB5ACAARwBhAG0AbQBhACAAMgAuADIAIABQAHIAbwBmAGkAbABlAAB0ZXh0AAAAAENvcHlyaWdodCBBcHBsZSBJbmMuLCAyMDEyAABYWVogAAAAAAAA81EAAQAAAAEWzGN1cnYAAAAAAAAEAAAAAAUACgAPABQA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", "base64"));
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"));
const WEBP = Uint8Array.from(Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64"));
const HEIF = HEIC.slice();
HEIF.set(new TextEncoder().encode("mif1"), 8);
const input = { uri: "file:///cache/selected.heic", fileName: "misleading.heic", mimeType: "image/heic" };
const digest = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function native(bytes = JPEG): BatchImageNative {
  return {
    openFile: async () => ({ exists: true, size: bytes.byteLength, bytes: async () => bytes }),
    sha256: async (value) => Uint8Array.from(createHash("sha256").update(value).digest()).buffer
  };
}
function errorCode(code: string) {
  return (error: unknown) => {
    assert.equal((error as { code: string }).code, code);
    return true;
  };
}

for (const [mimeType, bytes] of [
  ["image/jpeg", JPEG], ["image/png", PNG], ["image/webp", WEBP],
  ["image/heic", HEIC], ["image/heif", HEIF]
] as const) {
  test(`prepares original ${mimeType} bytes regardless of misleading picker metadata`, async () => {
    const prepared = await prepareBatchImage(input, { native: native(bytes) });
    assert.deepEqual(prepared, {
      uri: input.uri, fileName: input.fileName, mimeType, rawSize: bytes.byteLength, clientDigest: digest(bytes)
    });
    assert.deepEqual(await readPreparedBatchImage(prepared, { native: native(bytes) }), bytes);
    assert.equal(Object.values(prepared).some((value) => ArrayBuffer.isView(value)), false);
  });
}

test("rejects empty, oversized, unsupported and ambiguous images", async () => {
  const ambiguous = JPEG.slice();
  ambiguous.set(new TextEncoder().encode("ftypheic"), 4);
  for (const [bytes, code] of [
    [new Uint8Array(), "EMPTY_FILE"],
    [new Uint8Array(10485761), "FILE_TOO_LARGE"],
    [new TextEncoder().encode("not an image"), "UNSUPPORTED_IMAGE"],
    [ambiguous, "UNSUPPORTED_IMAGE"]
  ] as const) await assert.rejects(prepareBatchImage(input, { native: native(bytes) }), errorCode(code));
});

test("prepared digest satisfies the synced manifest schema and the exact digest-checked bytes are uploaded", async () => {
  const prepared = await prepareBatchImage(input, { native: native() });
  const manifest = ingestManifestEntrySchema.parse({ ...prepared, seq: 1 });
  assert.match(manifest.clientDigest, /^sha256:[0-9a-f]{64}$/);
  const bytes = await readPreparedBatchImage(prepared, { native: native() });
  let uploaded: BodyInit | null | undefined;
  const client = createOrbitApiClient({ fetchImpl: async (_url, init) => {
    uploaded = init?.body;
    return new Response('{"success":true,"data":{}}', { headers: { "Content-Type": "application/json" } });
  } });
  const result = await client.put("/api/test/content", { rawBody: bytes, headers: { "Content-Type": prepared.mimeType } });
  assert.equal(result.success, true);
  assert.equal(uploaded, bytes);
  assert.equal(digest(bytes), manifest.clientDigest);
});

test("allows exactly 10 MiB, rejects oversized metadata before reading and rechecks actual size", async () => {
  const boundary = new Uint8Array(10485760);
  boundary.set(JPEG);
  const prepared = await prepareBatchImage(input, { native: native(boundary) });
  assert.equal(prepared.rawSize, 10485760);
  assert.equal(prepared.clientDigest, digest(boundary));
  let reads = 0;
  const fake = native();
  fake.openFile = async () => ({ exists: true, size: 10485761, bytes: async () => { reads++; return JPEG; } });
  await assert.rejects(prepareBatchImage(input, { native: fake }), errorCode("FILE_TOO_LARGE"));
  assert.equal(reads, 0);
  fake.openFile = async () => ({ exists: true, size: 10, bytes: async () => new Uint8Array(10485761) });
  await assert.rejects(prepareBatchImage(input, { native: fake }), errorCode("FILE_TOO_LARGE"));
});

test("missing, unreadable, nonlocal and changed URI never produces upload bytes", async () => {
  const prepared = await prepareBatchImage(input, { native: native() });
  const changed = JPEG.slice();
  changed[changed.length - 1] = 0;
  await assert.rejects(readPreparedBatchImage(prepared, { native: native(changed) }), errorCode("FILE_CHANGED"));
  for (const update of [{ rawSize: 1 }, { mimeType: "image/png" as const }, { clientDigest: "0".repeat(64) }]) {
    await assert.rejects(readPreparedBatchImage({ ...prepared, ...update }, { native: native() }), errorCode("FILE_CHANGED"));
  }
  const missing = native();
  missing.openFile = async () => ({ exists: false, size: 0, bytes: async () => JPEG });
  await assert.rejects(readPreparedBatchImage(prepared, { native: missing }), errorCode("FILE_UNREADABLE"));
  missing.openFile = async () => { throw new Error("private local path"); };
  await assert.rejects(readPreparedBatchImage(prepared, { native: missing }), errorCode("FILE_UNREADABLE"));
  await assert.rejects(prepareBatchImage({ uri: "https://example.invalid/photo" }, { native: native() }), errorCode("INVALID_URI"));
});

test("100-file preparation is sequential and returns only metadata; 101 is rejected before I/O", async () => {
  let active = 0;
  let peak = 0;
  let opened = 0;
  const files = Array.from({ length: 100 }, (_, index) => ({ uri: `file:///cache/${index}.jpg` }));
  const fake = native();
  fake.openFile = async () => {
    opened++;
    active++;
    peak = Math.max(peak, active);
    return { exists: true, size: JPEG.length, bytes: async () => JPEG.slice() };
  };
  fake.sha256 = async (bytes) => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    active--;
    return Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
  };
  const prepared = await prepareBatchImages(files, { native: fake });
  assert.equal(prepared.length, 100);
  assert.equal(peak, 1);
  assert.equal(opened, 100);
  assert.ok(prepared.every((file) => Object.keys(file).sort().join(",") === "clientDigest,fileName,mimeType,rawSize,uri"));
  await assert.rejects(prepareBatchImages([...files, files[0]!], { native: fake }), errorCode("TOO_MANY_FILES"));
  assert.equal(opened, 100);
});

test("cancellation is checked before and after native reads and hashing, without processing the next file", async () => {
  for (const phase of ["before", "read", "hash"]) {
    const controller = new AbortController();
    let opened = 0;
    const fake = native();
    fake.openFile = async () => {
      opened++;
      return { exists: true, size: JPEG.length, bytes: async () => {
        if (phase === "read") controller.abort();
        return JPEG;
      } };
    };
    fake.sha256 = async (bytes) => {
      if (phase === "hash") controller.abort();
      return Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
    };
    if (phase === "before") controller.abort();
    await assert.rejects(prepareBatchImages([input, input], { native: fake, signal: controller.signal }), errorCode("CANCELLED"));
    assert.equal(opened, phase === "before" ? 0 : 1);
  }
});

test("native hash failures are sanitized and not treated as a prepared file", async () => {
  const fake = native();
  fake.sha256 = async () => { throw new Error("secret path"); };
  await assert.rejects(prepareBatchImage(input, { native: fake }), (error: unknown) => {
    assert.equal((error as { code: string }).code, "HASH_FAILED");
    assert.doesNotMatch((error as Error).message, /secret path/);
    return true;
  });
});

test("preparation snapshots selection metadata before asynchronous native work", async () => {
  const selection = { ...input };
  const fake = native();
  fake.openFile = async () => {
    selection.uri = "file:///cache/other.jpg";
    selection.fileName = "other.jpg";
    return { exists: true, size: JPEG.length, bytes: async () => JPEG };
  };
  const prepared = await prepareBatchImage(selection, { native: fake });
  assert.equal(prepared.uri, input.uri);
  assert.equal(prepared.fileName, input.fileName);
});

test("digest-checked reads compare the manifest snapshot from invocation, not later mutations", async () => {
  const prepared = await prepareBatchImage(input, { native: native() });
  const changed = JPEG.slice();
  changed[changed.length - 1] = 0;
  const fake = native(changed);
  fake.sha256 = async (bytes) => {
    prepared.clientDigest = digest(bytes);
    return Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
  };
  await assert.rejects(readPreparedBatchImage(prepared, { native: fake }), errorCode("FILE_CHANGED"));
});

test("batch preparation snapshots its bounded selection before asynchronous work", async () => {
  const inputs = [{ ...input }];
  const fake = native();
  fake.openFile = async () => {
    if (inputs.length === 1) inputs.push({ ...input, uri: "file:///cache/late.jpg" });
    return { exists: true, size: JPEG.length, bytes: async () => JPEG };
  };
  const prepared = await prepareBatchImages(inputs, { native: fake });
  assert.equal(prepared.length, 1);
});

test("selected-image conversion preserves bytes across base64 chunk boundaries and HEIC MIME aliases", async () => {
  const large = new Uint8Array(0x6000 * 2 + 1);
  large.set(JPEG);
  for (let index = JPEG.length; index < large.length; index++) large[index] = index % 256;
  for (const [bytes, contentType, mimeType] of [[large, "IMAGE/JPEG; test=value", "image/jpeg"], [HEIC, "image/heif", "image/heic"]] as const) {
    const client = createOrbitApiClient({ fetchImpl: async () => new Response(bytes, { headers: { "Content-Type": contentType } }) });
    const selected = await loadSelectedBatchImage(client, "/api/protected/image");
    assert.equal(selected.mimeType, mimeType);
    assert.equal(selected.uri, `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`);
  }
});

test("selected-image loading uses authenticated bytes transport and returns only the selected in-memory source", async () => {
  let captured: RequestInit | undefined;
  let path = "";
  const client = createOrbitApiClient({ baseUrl: "http://localhost:3000", authCookieHeader: "synthetic=session",
    fetchImpl: async (url, init) => {
      path = String(url); captured = init;
      return new Response(PNG, { headers: { "Content-Type": "image/png" } });
    }
  });
  const selected = await loadSelectedBatchImage(client, "/api/protected/already%2Fencoded/image");
  assert.equal(path, "http://localhost:3000/api/protected/already%2Fencoded/image");
  assert.equal(captured?.credentials, "omit");
  assert.equal(new Headers(captured?.headers).get("Cookie"), "synthetic=session");
  assert.deepEqual(selected, { uri: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`, mimeType: "image/png", rawSize: PNG.length });
  assert.doesNotMatch(selected.uri, /synthetic|session/);
});

test("selected-image loading rejects unsupported or mislabeled bytes and preserves API failure context", async () => {
  for (const [body, contentType] of [[PNG, "image/heic"], [new Uint8Array(), "image/png"], [new Uint8Array([1, 2]), "image/png"]] as const) {
    const client = createOrbitApiClient({ fetchImpl: async () => new Response(body, { headers: { "Content-Type": contentType } }) });
    await assert.rejects(loadSelectedBatchImage(client, "/api/protected/image"), errorCode(body.length ? "UNSUPPORTED_IMAGE" : "EMPTY_FILE"));
  }
  const client = createOrbitApiClient({ fetchImpl: async () => new Response(JSON.stringify({
    success: false, error: { code: "NOT_FOUND", message: "missing" }
  }), { status: 404, headers: { "Content-Type": "application/json", "X-Orbit-Privacy": "private" } }) });
  await assert.rejects(loadSelectedBatchImage(client, "/api/protected/image"), (error: unknown) => {
    const value = error as { code: string; apiFailure: { status: number; meta: { privacy: string }; error: { code: string } } };
    assert.equal(value.code, "API_ERROR");
    assert.equal(value.apiFailure.status, 404);
    assert.equal(value.apiFailure.meta.privacy, "private");
    assert.equal(value.apiFailure.error.code, "NOT_FOUND");
    return true;
  });
});

test("selected-image cancellation discards an in-flight response even when fetch ignores abort", async () => {
  const controller = new AbortController();
  const client = createOrbitApiClient({ fetchImpl: async () => {
    controller.abort();
    return new Response(PNG, { headers: { "Content-Type": "image/png" } });
  } });
  await assert.rejects(loadSelectedBatchImage(client, "/api/protected/image", { signal: controller.signal }), errorCode("CANCELLED"));
});

for (const size of [JPEG.length, 0x6000 * 2 + 1]) {
  test(`selected-image encoding works without btoa and roundtrips all ${size} bytes`, async () => {
    const bytes = new Uint8Array(size);
    bytes.set(JPEG);
    for (let index = JPEG.length; index < bytes.length; index++) bytes[index] = index % 256;
    const originalBtoa = Object.getOwnPropertyDescriptor(globalThis, "btoa");
    Reflect.deleteProperty(globalThis, "btoa");
    try {
      const client = createOrbitApiClient({ fetchImpl: async () => new Response(bytes, {
        headers: { "Content-Type": "image/jpeg" }
      }) });
      const selected = await loadSelectedBatchImage(client, "/api/protected/image");
      assert.equal(selected.rawSize, size);
      assert.equal(selected.mimeType, "image/jpeg");
      assert.ok(selected.uri.startsWith("data:image/jpeg;base64,"));
      const encoded = selected.uri.slice("data:image/jpeg;base64,".length);
      // Node's independent decoder checks the production encoder's complete output.
      assert.deepEqual(Uint8Array.from(Buffer.from(encoded, "base64")), bytes);
      assert.equal(Reflect.has(globalThis, "btoa"), false);
    } finally {
      if (originalBtoa) Object.defineProperty(globalThis, "btoa", originalBtoa);
    }
  });
}
