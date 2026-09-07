import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { upload } from "@vercel/blob/client";
import { createIngestContentUploader } from "../../app/(app)/app/contacts/new/batch2/ingest-v2-content-transport";

const file = new File([Buffer.alloc(6 * 1024 * 1024)], "card.jpg", { type: "image/jpeg" });
const input = { batchId: "batch", itemId: "item", operation: "replace" as const, expectedVersion: 3,
  file, mimeType: "image/jpeg", digest: `sha256:${"a".repeat(64)}` };
const reply = (status: number, body: unknown) => Response.json(body, { status });
function fixture() {
  const cacheValues = new Map<string, string>();
  const cache = { getItem: (key: string) => cacheValues.get(key) ?? null, setItem: (key: string, value: string) => { cacheValues.set(key, value); } };
  const sources = new Map<string, { id: string; objectKey: string; uploadExpiresAt: string; digest: string; byteSize: number; mimeType: string }>();
  let objectArrived = false, consumed = false, puts = 0, writes = 0, failReservation = false, failConsumption = false, failPut = false;
  let expired = false, offline = false, local = false, localUploads = 0;
  const request: typeof fetch = async (url, init) => {
    if (offline) throw new Error("offline");
    if (!init?.method) return reply(200, { data: { directUpload: !local } });
    if (local) {
      localUploads++; assert.equal(init.body, file); assert.equal(init.method, "POST");
      assert.equal((init.headers as Record<string, string>)["If-Match"], "3");
      return reply(200, { data: { item: { id: "item" } } });
    }
    assert.equal(typeof init.body, "string", "application functions receive metadata, never file bytes");
    assert.ok((init.body as string).length < 2048);
    const body = JSON.parse(init.body as string);
    if (String(url).endsWith("/consume-v2")) {
      assert.equal(body.expectedVersion, 3);
      if (consumed) return reply(200, { data: { item: { id: "item" }, reused: true } });
      if (!objectArrived) return reply(404, { error: { code: "UPLOAD_SOURCE_NOT_UPLOADED" } });
      consumed = true; writes++;
      if (failConsumption) throw new Error("reply lost after commit");
      return reply(200, { data: { item: { id: "item" }, reused: false } });
    }
    let source = sources.get(body.requestKey);
    if (!source) {
      const id = randomUUID();
      source = { id, objectKey: `orbit-card-sources/${"a".repeat(64)}/${"b".repeat(64)}/${id}`,
        uploadExpiresAt: new Date(Date.now() + (expired && sources.size === 0 ? -1000 : 60_000)).toISOString(),
        digest: input.digest, byteSize: file.size, mimeType: file.type };
      sources.set(body.requestKey, source);
    }
    if (failReservation) { failReservation = false; throw new Error("reservation reply lost"); }
    return reply(201, { data: { source } });
  };
  const put: typeof upload = async (pathname, bytes, options) => {
    puts++; assert.equal(bytes, file); assert.equal(options.access, "private");
    assert.equal(options.multipart, true); assert.ok(pathname.endsWith(options.clientPayload!));
    objectArrived = true;
    if (failPut) throw new Error("upload reply lost");
    return {} as Awaited<ReturnType<typeof upload>>;
  };
  return { cache, request, put, sources, counts: () => ({ puts, writes, localUploads }),
    options(value: { failReservation?: boolean; failConsumption?: boolean; failPut?: boolean; expired?: boolean; offline?: boolean; local?: boolean }) {
      if (value.failReservation !== undefined) failReservation = value.failReservation;
      if (value.failConsumption !== undefined) failConsumption = value.failConsumption;
      if (value.failPut !== undefined) failPut = value.failPut;
      if (value.expired !== undefined) expired = value.expired;
      if (value.offline !== undefined) offline = value.offline;
      if (value.local !== undefined) local = value.local;
    },
  };
}

test("private uploads send file bytes only to Blob and deduplicate concurrent calls", async () => {
  const f = fixture(), send = createIngestContentUploader(f);
  const first = send(input), second = send(input); assert.equal(first, second);
  assert.deepEqual(await first, { ok: true, errorCode: null });
  assert.deepEqual(f.counts(), { puts: 1, writes: 1, localUploads: 0 });
  assert.deepEqual(await createIngestContentUploader(f)(input), { ok: true, errorCode: null }, "reload/reselection replays the saved receipt");
  assert.equal(f.counts().puts, 1);
});

test("lost reservation, upload, and committed-consumption replies recover without another target write", async () => {
  for (const failure of ["failReservation", "failPut", "failConsumption"] as const) {
    const f = fixture(); f.options({ [failure]: true });
    const send = createIngestContentUploader(f);
    const first = await send(input);
    if (failure === "failPut") assert.equal(first.ok, true);
    else assert.equal(first.ok, false);
    f.options({ [failure]: false });
    assert.equal((await createIngestContentUploader(f)(input)).ok, true);
    assert.equal(f.sources.size, 1); assert.equal(f.counts().puts, 1); assert.equal(f.counts().writes, 1);
  }
});

test("only an explicit missing object with an expired permit renews a reservation", async () => {
  const f = fixture(); f.options({ expired: true });
  assert.equal((await createIngestContentUploader(f)(input)).ok, true);
  assert.equal(f.sources.size, 2); assert.equal(f.counts().puts, 1);
  f.options({ offline: true });
  assert.equal((await createIngestContentUploader(f)(input)).ok, false);
  assert.equal(f.sources.size, 2);
});

test("local storage retains raw upload compatibility and mode failures never fall back to function upload", async () => {
  const f = fixture(); f.options({ local: true });
  assert.equal((await createIngestContentUploader(f)(input)).ok, true);
  assert.equal(f.counts().localUploads, 1); assert.equal(f.counts().puts, 0);
  f.options({ offline: true });
  assert.equal((await createIngestContentUploader(f)(input)).ok, false);
  assert.equal(f.counts().localUploads, 1);
});

test("a stalled mode response returns a recoverable failure and aborts its request", async () => {
  let signal: AbortSignal | undefined;
  const send = createIngestContentUploader({ timeoutMs: 10, request: async (_, init) => {
    signal = init?.signal ?? undefined; return new Promise<Response>(() => {});
  } });
  assert.deepEqual(await send(input), { ok: false, errorCode: "UPLOAD_UNAVAILABLE" });
  assert.equal(signal?.aborted, true);
});
