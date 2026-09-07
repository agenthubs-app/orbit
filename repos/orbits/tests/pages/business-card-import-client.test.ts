import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { upload } from "@vercel/blob/client";
import { createV1CardUploader, IMPORTS } from "../../app/(app)/app/contacts/business-card-import-client";

const reply = (status: number, body: unknown) => Response.json(body, { status });
function fixture() {
  const values = new Map<string, string>();
  const cache = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const sources = new Map<string, { id: string; objectKey: string; uploadExpiresAt: string; digest: string; byteSize: number; mimeType: string }>();
  const uploaded = new Set<string>(), jobs = new Map<string, string>();
  let puts = 0, reservations = 0, admissions = 0, verified = 0, maxBody = 0;
  const failures = { reserve: false, put: false, admission: false, missingPut: false, offline: false, local: false, expired: false, unauthorized: false };
  const request: typeof fetch = async (url, init) => {
    if (failures.offline) throw new Error("network unavailable");
    if (failures.unauthorized) return reply(401, {});
    if (!init?.method) return reply(200, { data: { directUpload: !failures.local } });
    assert.equal(typeof init.body, "string", "app endpoints receive only metadata");
    maxBody = Math.max(maxBody, (init.body as string).length); assert.ok(maxBody <= 32 * 1024);
    const body = JSON.parse(init.body as string);
    if (String(url) === IMPORTS) {
      admissions++;
      if (!body.sourceIds.every((id: string) => uploaded.has(id))) return reply(409, { error: { code: "IMPORT_CONFLICT" } });
      if (!jobs.has(body.requestKey)) jobs.set(body.requestKey, randomUUID());
      if (failures.admission) { failures.admission = false; throw new Error("admitted but reply lost"); }
      return reply(202, { data: { job: { id: jobs.get(body.requestKey) } } });
    }
    if (String(url).endsWith("/verify-source")) {
      verified++;
      if (!uploaded.has(body.sourceId)) return reply(404, { error: { code: "UPLOAD_SOURCE_NOT_UPLOADED" } });
      return reply(200, { data: { sourceId: body.sourceId, verified: true } });
    }
    assert.equal(body.pipeline, "v1"); reservations++;
    if (!sources.has(body.requestKey)) {
      const id = randomUUID();
      sources.set(body.requestKey, { id, objectKey: `orbit-card-sources/${"a".repeat(64)}/${"b".repeat(64)}/${id}`,
        uploadExpiresAt: new Date(Date.now() + (failures.expired && sources.size === 0 ? -1000 : 60_000)).toISOString(),
        digest: body.digest, byteSize: body.byteSize, mimeType: body.mimeType });
    }
    if (failures.reserve) { failures.reserve = false; throw new Error("reserved but reply lost"); }
    return reply(201, { data: { source: sources.get(body.requestKey) } });
  };
  const put: typeof upload = async (path, bytes, options) => {
    puts++; assert.ok(bytes instanceof File); assert.equal(options.access, "private"); assert.equal(options.multipart, true);
    assert.ok(path.endsWith(options.clientPayload!)); assert.ok(options.abortSignal);
    const source = [...sources.values()].find((source) => source.id === options.clientPayload)!;
    if (Date.parse(source.uploadExpiresAt) <= Date.now()) throw new Error("permit expired");
    if (!failures.missingPut) uploaded.add(options.clientPayload!);
    if (failures.put || failures.missingPut) throw new Error("SDK response lost");
    return {} as Awaited<ReturnType<typeof upload>>;
  };
  return { cache, request, put, failures, sources, jobs, values, uploaded,
    counts: () => ({ puts, reservations, admissions, verified, maxBody }) };
}
const image = () => new File([new Uint8Array(6 * 1024 * 1024)], "card.jpg", { type: "image/jpeg" });

test("6 MiB photos and 49 MiB PDFs bypass application bodies and are admitted as one ordered task", async () => {
  const f = fixture(); const progress: number[] = [];
  const result = await createV1CardUploader(f)([image(), new File([new Uint8Array(49 * 1024 * 1024)], "cards.pdf", { type: "application/pdf" })], (done) => progress.push(done));
  assert.equal(result.kind, "created"); assert.deepEqual(progress, [1, 2]);
  assert.equal(f.sources.size, 2); assert.equal(f.jobs.size, 1); assert.equal(f.counts().puts, 2); assert.equal(f.values.size, 0);
  assert.ok(f.counts().maxBody < 1024);
});

test("lost reservation, SDK and admission responses recover across new uploader instances without duplicate tasks", async () => {
  for (const failure of ["reserve", "put", "admission"] as const) {
    const f = fixture(), files = [image()]; f.failures[failure] = true;
    const initial = await createV1CardUploader(f)(files);
    if (failure === "put") assert.equal(initial.kind, "created");
    else {
      assert.equal(initial.kind, "error");
      assert.equal((await createV1CardUploader(f)(files)).kind, "created");
    }
    assert.equal(f.sources.size, 1); assert.equal(f.counts().puts, 1); assert.equal(f.jobs.size, 1);
  }
});

test("an upload that never arrives remains retryable and a completed earlier file is not uploaded twice", async () => {
  const f = fixture(), files = [image()]; f.failures.missingPut = true;
  assert.equal((await createV1CardUploader(f)(files)).kind, "error"); assert.equal(f.jobs.size, 0);
  f.failures.missingPut = false;
  assert.equal((await createV1CardUploader(f)(files)).kind, "created");
  assert.equal(f.sources.size, 1); assert.equal(f.jobs.size, 1); assert.equal(f.counts().puts, 2);
});

test("a missing upload with an expired permit renews, while offline and authentication failures never fall back", async () => {
  const f = fixture(), files = [image()]; f.failures.expired = true;
  assert.equal((await createV1CardUploader(f)(files)).kind, "error");
  assert.equal((await createV1CardUploader(f)(files)).kind, "created"); assert.equal(f.sources.size, 2);
  for (const failure of ["offline", "unauthorized"] as const) {
    const failed = fixture(); failed.failures[failure] = true;
    assert.equal((await createV1CardUploader(failed)(files)).kind, "error"); assert.equal(failed.sources.size, 0);
  }
  const local = fixture(); local.failures.local = true;
  assert.deepEqual(await createV1CardUploader(local)(files), { kind: "legacy" }); assert.equal(local.counts().puts, 0);
});

test("500 images retain the product limit, 501 and unsupported/oversized files stop before upload", async () => {
  const f = fixture();
  const files = Array.from({ length: 500 }, (_, i) => new File(["x"], `card-${i}.heic`, { type: "" }));
  assert.equal((await createV1CardUploader(f)(files)).kind, "created"); assert.equal(f.counts().puts, 500);
  assert.ok(f.counts().maxBody > 16 * 1024); assert.equal(f.jobs.size, 1);
  const rejected = fixture(); const send = createV1CardUploader(rejected);
  for (const input of [[...files, files[0]], [new File(["x"], "bad.exe")],
    [new File([new Uint8Array(10 * 1024 * 1024 + 1)], "too-large.jpg", { type: "image/jpeg" })]]) {
    assert.deepEqual(await send(input), { kind: "error", code: "INVALID_IMPORT_FILES" });
  }
  assert.equal(rejected.sources.size, 0);
});

test("a hung metadata request times out without discarding saved receipts", async () => {
  const f = fixture(); f.failures.admission = true; const files = [image()];
  assert.equal((await createV1CardUploader(f)(files)).kind, "error");
  const saved = [...f.values.values()];
  const request: typeof fetch = async () => new Promise<Response>(() => {});
  assert.equal((await createV1CardUploader({ ...f, request, timeoutMs: 10 })(files)).kind, "error");
  assert.deepEqual([...f.values.values()], saved);
  assert.equal((await createV1CardUploader(f)(files)).kind, "created"); assert.equal(f.jobs.size, 1);
});
