import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { createAesGcmPayloadCodec, IDENTITY_PAYLOAD_CODEC } from "../src/data/sync/payload-codec";

const deps = { subtle: webcrypto.subtle as unknown as SubtleCrypto, getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => webcrypto.getRandomValues(bytes) };
const generate = async () => (await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])) as unknown as CryptoKey;

test("identity codec is a pass-through", async () => {
  assert.equal(await IDENTITY_PAYLOAD_CODEC.encode("{\"a\":1}"), "{\"a\":1}");
  assert.equal(await IDENTITY_PAYLOAD_CODEC.decode("x"), "x");
});

test("AES-GCM codec round-trips, never stores plaintext, and uses a fresh IV per payload", async () => {
  const codec = createAesGcmPayloadCodec(await generate(), deps);
  const plain = JSON.stringify({ id: "task:1", title: "秘密标题", accountId: "actor-a" });
  const stored = await codec.encode(plain);
  assert.match(stored, /^orbit-aesgcm-v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  for (const marker of ["task:1", "秘密标题", "accountId", "title"]) assert.ok(!stored.includes(marker), `plaintext leaked: ${marker}`);
  assert.equal(await codec.decode(stored), plain);
  assert.notEqual(await codec.encode(plain), stored, "same plaintext must not produce the same ciphertext");
});

test("a different key cannot decode, and tampered or foreign values are rejected", async () => {
  const a = createAesGcmPayloadCodec(await generate(), deps);
  const b = createAesGcmPayloadCodec(await generate(), deps);
  const stored = await a.encode("{\"secret\":true}");
  await assert.rejects(b.decode(stored));
  await assert.rejects(a.decode(stored.slice(0, -4) + "AAAA"));
  await assert.rejects(a.decode("{\"secret\":true}"), /PAYLOAD_CODEC_UNRECOGNIZED/);
});

test("the key stays non-extractable through the codec", async () => {
  const key = await generate();
  createAesGcmPayloadCodec(key, deps);
  await assert.rejects(webcrypto.subtle.exportKey("raw", key), /not extractable|InvalidAccessError/i);
});
