import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Pool } from "pg";

import {
  createIngestV2BatchDetailHandler,
  createIngestV2CancelHandler,
  createIngestV2CollectionHandlers,
  createIngestV2ConfirmHandler,
  createIngestV2FinalizeHandler,
  createIngestV2UploadHandler,
  createIngestV2ReplaceHandler,
  type IngestV2Runtime,
} from "../../app/api/contact-drafts/business-card/batches/v2/handlers";
import type { BusinessCardStructuredExtraction } from "../../features/acquisition/business-card-cloud-ocr";
import { createFilesystemDerivativeStore } from "../../features/acquisition/business-card-ingest-v2/derivative-store";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { createBusinessCardIngestRepository } from "../../features/acquisition/business-card-ingest-v2/repository";
import { withQueuedCardIngest } from "../../features/acquisition/business-card-queue-dispatch";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";

const FIXTURE_HEIC = join(__dirname, "..", "fixtures", "business-card-tiny.heic");

const fakeActor = async () => ({ id: "actor:test" });

test("committed upload and replacement survive dispatch failure; rejected replacements clean only their new object", { skip }, async () => {
  await withHarness(async ({ runtime, deps }) => {
    const bytes = await readFile(FIXTURE_HEIC);
    const created = await runtime.repository.createBatch({ actorId: "actor:test", idempotencyKey: "dispatch-failure", manifest: [{
      cardId: "card:dispatch-failure", side: "front", fileName: "card.heic", mimeType: "image/heic", rawSize: bytes.length, seq: 1, clientDigest: sha256(bytes),
    }] });
    const batchId = created.batch.id;
    const itemId = created.items[0]!.id;
    const savedRepository = runtime.repository;
    const savedStore = runtime.store;
    const written: string[] = [];
    runtime.store = { ...savedStore, async put(value) {
      const stored = await savedStore.put(value); written.push(stored.objectKey); return stored;
    } };
    runtime.repository = withQueuedCardIngest(savedRepository, async () => { throw new Error("private dispatch detail"); });
    const context = params({ id: batchId, itemId });
    const request = (method: string, version?: number) => new Request("http://test/image", {
      method, body: new Uint8Array(bytes), headers: { "content-type": "image/heic", ...(version ? { "if-match": String(version) } : {}) },
    });
    const dispatchError = { message: "Business-card changes were saved, but background dispatch is unavailable." };
    await assert.rejects(createIngestV2UploadHandler(deps)(request("PUT"), context), dispatchError);
    const uploaded = (await savedRepository.getBatch({ actorId: "actor:test", batchId }))!.items[0]!;
    assert.equal(uploaded.derivativeObjectKey, written[0]);
    assert.ok(await savedStore.get(written[0]!));
    await assert.rejects(createIngestV2ReplaceHandler(deps)(request("POST", uploaded.version), context), dispatchError);
    const replaced = (await savedRepository.getBatch({ actorId: "actor:test", batchId }))!.items[0]!;
    assert.equal(replaced.derivativeObjectKey, written[1]);
    assert.ok(await savedStore.get(written[1]!));
    const rejected = await createIngestV2ReplaceHandler(deps)(request("POST", uploaded.version), context);
    assert.equal(rejected.status, 409);
    assert.equal(await savedStore.get(written[2]!), null);
    assert.ok(await savedStore.get(written[1]!));
    runtime.repository = { ...runtime.repository, async getBatch() { throw new Error("database unavailable"); } };
    const unknown = await createIngestV2ReplaceHandler(deps)(request("POST", uploaded.version), context);
    assert.equal(unknown.status, 409);
    assert.ok(await savedStore.get(written[3]!), "uncertain state must not trigger deletion");
    for (const key of written) await savedStore.delete(key);
  });
});

async function withHarness(
  fn: (ctx: {
    runtime: IngestV2Runtime;
    pool: Pool;
    deps: {
      resolveActor: typeof fakeActor;
      runtime: IngestV2Runtime;
      isOcrProviderConfigured: () => boolean;
    };
  }) => Promise<void>,
): Promise<void> {
  const schema = `bc_ingest_api_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await admin.query(`create schema ${schema}`);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schema}`,
    });
    try {
      const client = await pool.connect();
      try {
        await runBusinessCardIngestV2Migrations(client);
        await runOrbitRecordsMigration(client);
      } finally {
        client.release();
      }
      const rootDir = await mkdtemp(join(tmpdir(), "orbit-ingest-v2-api-"));
      const runtime: IngestV2Runtime = {
        repository: createBusinessCardIngestRepository({
          pool,
          workspaceId: "workspace:test",
        }),
        store: createFilesystemDerivativeStore({ rootDir }),
        workspaceId: "workspace:test",
        ready: Promise.resolve(),
      };
      await fn({
        runtime,
        pool,
        deps: {
          resolveActor: fakeActor,
          runtime,
          isOcrProviderConfigured: () => true,
        },
      });
    } finally {
      await pool.end();
    }
  } finally {
    await admin.query(`drop schema ${schema} cascade`).catch(() => undefined);
    await admin.end();
  }
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function envelope(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as { data?: unknown; error?: unknown };
  return (body.data ?? body.error ?? {}) as Record<string, unknown>;
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

test("v2 ingest flow: manifest → per-item upload → finalize → summary", { skip }, async () => {
  await withHarness(async ({ deps }) => {
    const heic = await readFile(FIXTURE_HEIC);
    const collection = createIngestV2CollectionHandlers(deps);

    const createResponse = await collection.POST(
      new Request("http://test/api/v2", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "key-1",
          manifest: [
            {
              fileName: "card-1.heic",
              mimeType: "image/heic",
              rawSize: heic.length,
              seq: 1,
              clientDigest: sha256(heic),
            },
          ],
        }),
      }),
    );
    assert.equal(createResponse.status, 201);
    const created = await envelope(createResponse);
    const batch = created.batch as { id: string; status: string };
    const items = created.items as Array<{ id: string; status: string }>;
    assert.equal(batch.status, "collecting");
    assert.equal(items.length, 1);

    // 重复创建（同 key 同 manifest）→ 200 reused
    const replayResponse = await collection.POST(
      new Request("http://test/api/v2", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "key-1",
          manifest: [
            {
              fileName: "card-1.heic",
              mimeType: "image/heic",
              rawSize: heic.length,
              seq: 1,
              clientDigest: sha256(heic),
            },
          ],
        }),
      }),
    );
    assert.equal(replayResponse.status, 200);

    const upload = createIngestV2UploadHandler(deps);
    const uploadResponse = await upload(
      new Request("http://test/upload", {
        method: "PUT",
        body: new Uint8Array(heic),
        headers: { "content-type": "image/heic" },
      }),
      params({ id: batch.id, itemId: items[0]!.id }),
    );
    assert.equal(uploadResponse.status, 200, await uploadResponse.clone().text());
    const uploaded = await envelope(uploadResponse);
    assert.equal((uploaded.item as { status: string }).status, "uploaded");

    // 同字节重传 → 幂等
    const replayUpload = await upload(
      new Request("http://test/upload", {
        method: "PUT",
        body: new Uint8Array(heic),
        headers: { "content-type": "image/heic" },
      }),
      params({ id: batch.id, itemId: items[0]!.id }),
    );
    assert.equal(replayUpload.status, 200);
    assert.equal((await envelope(replayUpload)).alreadyUploaded, true);

    const finalize = createIngestV2FinalizeHandler(deps);
    const finalizeResponse = await finalize(
      new Request("http://test/finalize", { method: "POST" }),
      params({ id: batch.id }),
    );
    assert.equal(finalizeResponse.status, 200, await finalizeResponse.clone().text());
    const finalized = await envelope(finalizeResponse);
    assert.equal((finalized.batch as { status: string }).status, "processing");

    const detail = createIngestV2BatchDetailHandler(deps);
    const summaryResponse = await detail(
      new Request(`http://test/batches/${batch.id}?view=summary`),
      params({ id: batch.id }),
    );
    const summary = await envelope(summaryResponse);
    assert.equal(
      (summary.counts as { queuedReady: number }).queuedReady,
      1,
      JSON.stringify(summary),
    );
  });
});

test("v2 upload rejects digest mismatch and oversize bodies", { skip }, async () => {
  await withHarness(async ({ deps }) => {
    const heic = await readFile(FIXTURE_HEIC);
    const collection = createIngestV2CollectionHandlers(deps);
    const createResponse = await collection.POST(
      new Request("http://test/api/v2", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "key-2",
          manifest: [
            {
              fileName: "card-1.heic",
              mimeType: "image/heic",
              rawSize: heic.length,
              seq: 1,
              clientDigest: sha256(Buffer.from("different bytes")),
            },
          ],
        }),
      }),
    );
    const created = await envelope(createResponse);
    const batch = created.batch as { id: string };
    const items = created.items as Array<{ id: string }>;

    const upload = createIngestV2UploadHandler(deps);
    const mismatch = await upload(
      new Request("http://test/upload", {
        method: "PUT",
        body: new Uint8Array(heic),
        headers: { "content-type": "image/heic" },
      }),
      params({ id: batch.id, itemId: items[0]!.id }),
    );
    assert.equal(mismatch.status, 400);
    assert.match(await mismatch.text(), /DIGEST_MISMATCH/);

    const oversize = await upload(
      new Request("http://test/upload", {
        method: "PUT",
        body: new Uint8Array(11 * 1024 * 1024),
        headers: { "content-type": "image/jpeg" },
      }),
      params({ id: batch.id, itemId: items[0]!.id }),
    );
    assert.equal(oversize.status, 400);
    assert.match(await oversize.text(), /RAW_TOO_LARGE/);
  });
});

test("v2 confirm creates the contact in the same transaction, exactly once", { skip }, async () => {
  await withHarness(async ({ deps, runtime, pool }) => {
    const heic = await readFile(FIXTURE_HEIC);
    const collection = createIngestV2CollectionHandlers(deps);
    const createResponse = await collection.POST(
      new Request("http://test/api/v2", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "key-confirm",
          manifest: [1, 2].map((seq) => ({
            fileName: `card-${seq}.heic`,
            mimeType: "image/heic",
            rawSize: heic.length,
            seq,
            clientDigest: sha256(heic),
          })),
        }),
      }),
    );
    const created = await envelope(createResponse);
    const batch = created.batch as { id: string };
    const items = created.items as Array<{ id: string }>;
    const upload = createIngestV2UploadHandler(deps);
    for (const item of items) {
      const response = await upload(
        new Request("http://test/upload", {
          method: "PUT",
          body: new Uint8Array(heic),
          headers: { "content-type": "image/heic" },
        }),
        params({ id: batch.id, itemId: item.id }),
      );
      assert.equal(response.status, 200);
    }
    const finalize = createIngestV2FinalizeHandler(deps);
    await finalize(new Request("http://test/finalize", { method: "POST" }), params({ id: batch.id }));

    // 模拟 worker 完成两张的 OCR
    const extraction: BusinessCardStructuredExtraction = {
      fullName: "王 小明",
      nativeFullName: null,
      romanizedFullName: null,
      organization: "Orbit",
      departments: [],
      title: null,
      emails: [{ label: null, value: "xiaoming@example.com" }],
      contactPoints: [],
      website: null,
      addresses: [],
      certifications: [],
      detectedLanguages: ["zh"],
    };
    const claimed = await runtime.repository.claimItems({ limit: 2 });
    for (const item of claimed) {
      await runtime.repository.submitExtraction({
        itemId: item.id,
        leaseToken: item.leaseToken,
        expectedVersion: item.version,
        extraction,
        reviewIssues: [],
        usage: null,
      });
    }

    const confirm = createIngestV2ConfirmHandler(deps);
    const confirmResponse = await confirm(
      new Request("http://test/confirm", {
        method: "POST",
        body: JSON.stringify({
          displayName: "王 小明",
          organization: "Orbit",
          email: "xiaoming@example.com",
        }),
      }),
      params({ id: batch.id, itemId: items[0]!.id }),
    );
    assert.equal(confirmResponse.status, 200, await confirmResponse.clone().text());
    const confirmed = await envelope(confirmResponse);
    assert.equal(confirmed.state, "created");
    assert.ok(confirmed.contactId);

    const contactRows = await pool.query(
      `select count(*)::int as n from orbit_records where collection_name = 'contacts'`,
    );
    assert.equal(contactRows.rows[0].n, 1);

    // 第二张同邮箱 → duplicate_review，不创建第二个联系人
    const duplicateResponse = await confirm(
      new Request("http://test/confirm", {
        method: "POST",
        body: JSON.stringify({
          displayName: "王 小明",
          organization: "Orbit",
          email: "xiaoming@example.com",
        }),
      }),
      params({ id: batch.id, itemId: items[1]!.id }),
    );
    assert.equal(duplicateResponse.status, 200);
    const duplicate = await envelope(duplicateResponse);
    assert.equal(duplicate.state, "duplicate_review");
    const afterDuplicate = await pool.query(
      `select count(*)::int as n from orbit_records where collection_name = 'contacts'`,
    );
    assert.equal(afterDuplicate.rows[0].n, 1);
    // duplicate_review 整个事务回滚：item 仍是 extracted
    const detailAfter = await runtime.repository.getBatch({
      actorId: "actor:test",
      batchId: batch.id,
    });
    assert.equal(
      detailAfter?.items.find((item) => item.id === items[1]!.id)?.status,
      "extracted",
    );

    // allowDuplicate=true → 第二个联系人创建成功
    const forced = await confirm(
      new Request("http://test/confirm", {
        method: "POST",
        body: JSON.stringify({
          displayName: "王 小明",
          organization: "Orbit",
          email: "xiaoming@example.com",
          allowDuplicate: true,
        }),
      }),
      params({ id: batch.id, itemId: items[1]!.id }),
    );
    assert.equal(forced.status, 200);
    assert.equal((await envelope(forced)).state, "created");
    const finalCount = await pool.query(
      `select count(*)::int as n from orbit_records where collection_name = 'contacts'`,
    );
    assert.equal(finalCount.rows[0].n, 2);
  });
});

test("v2 two-sided confirm binds both source snapshots and replays one contact", { skip }, async () => {
  await withHarness(async ({ deps, runtime, pool }) => {
    const heic = await readFile(FIXTURE_HEIC);
    const collection = createIngestV2CollectionHandlers(deps);
    const createdResponse = await collection.POST(new Request("http://test/api/v2", {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: "key-two-sided", manifest: [
        { cardId: "card:one", side: "front", fileName: "front.heic", mimeType: "image/heic", rawSize: heic.length, seq: 1, clientDigest: sha256(heic) },
        { cardId: "card:one", side: "back", fileName: "back.heic", mimeType: "image/heic", rawSize: heic.length, seq: 2, clientDigest: sha256(heic) },
      ] }),
    }));
    assert.equal(createdResponse.status, 201);
    const created = await envelope(createdResponse);
    const batch = created.batch as { id: string };
    const items = created.items as Array<{ id: string }>;
    const upload = createIngestV2UploadHandler(deps);
    for (const item of items) {
      const response = await upload(new Request("http://test/upload", { method: "PUT", body: new Uint8Array(heic), headers: { "content-type": "image/heic" } }), params({ id: batch.id, itemId: item.id }));
      assert.equal(response.status, 200);
    }
    await createIngestV2FinalizeHandler(deps)(new Request("http://test/finalize", { method: "POST" }), params({ id: batch.id }));
    const extraction: BusinessCardStructuredExtraction = {
      fullName: "山田 太郎", nativeFullName: "山田 太郎", romanizedFullName: "Taro Yamada",
      organization: "Orbit 株式会社", departments: [], title: "代表", emails: [{ label: null, value: "taro@example.test" }],
      contactPoints: [], website: null, addresses: [], certifications: [], detectedLanguages: ["ja"],
    };
    for (const item of await runtime.repository.claimItems({ limit: 2 })) {
      await runtime.repository.submitExtraction({ itemId: item.id, leaseToken: item.leaseToken, expectedVersion: item.version, extraction, reviewIssues: [], usage: null });
    }
    const review = (await runtime.repository.getBatch({ actorId: "actor:test", batchId: batch.id }))!;
    const body = {
      confirmationIntentId: "confirm:card-one",
      expectedCardItems: review.items.map(item => ({ itemId: item.id, version: item.version, imageDigest: item.imageDigest })),
      fieldSources: { displayName: review.items[0]!.id, organization: review.items[0]!.id, role: review.items[0]!.id, email: review.items[1]!.id, phone: null },
      displayName: "山田 太郎", organization: "Orbit 株式会社", role: "代表", email: "taro@example.test", phone: "", relationshipContext: "展示会", notes: "両面確認", allowDuplicate: false,
    };
    const confirm = createIngestV2ConfirmHandler(deps);
    const missingMetadata = await confirm(new Request("http://test/confirm", { method: "POST", body: JSON.stringify({ displayName: "山田 太郎", organization: "Orbit 株式会社", role: "代表", email: "taro@example.test", phone: "", relationshipContext: "", notes: "" }) }), params({ id: batch.id, itemId: review.items[0]!.id }));
    assert.equal(missingMetadata.status, 400, "explicit/two-sided cards cannot use the legacy confirmation fallback");
    const invoke = () => confirm(new Request("http://test/confirm", { method: "POST", body: JSON.stringify(body) }), params({ id: batch.id, itemId: review.items[0]!.id }));
    const responses = await Promise.all([invoke(), invoke()]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    const payloads = await Promise.all(responses.map(envelope));
    assert.equal(payloads[0]!.contactId, payloads[1]!.contactId);
    assert.deepEqual(payloads.map(payload => payload.replayed).sort(), [false, true]);
    for (const payload of payloads) {
      const confirmed = payload.items as Array<{ cardId: string; side: string; confirmedContactId: string }>;
      assert.deepEqual(confirmed.map(item => item.side), ["front", "back"]);
      assert.ok(confirmed.every(item => item.cardId === "card:one" && item.confirmedContactId === payload.contactId));
    }
    const count = await pool.query(`select count(*)::int as n from orbit_records where collection_name = 'contacts'`);
    assert.equal(count.rows[0].n, 1);
    const reopened = (await runtime.repository.getBatch({ actorId: "actor:test", batchId: batch.id }))!;
    assert.deepEqual(reopened.items[0]!.confirmedFieldSources, body.fieldSources);
    assert.deepEqual(reopened.items[1]!.confirmedFieldSources, body.fieldSources);
    const conflict = await confirm(new Request("http://test/confirm", { method: "POST", body: JSON.stringify({ ...body, organization: "Changed" }) }), params({ id: batch.id, itemId: review.items[0]!.id }));
    assert.equal(conflict.status, 409);

    const secondCreated = await envelope(await collection.POST(new Request("http://test/api/v2", { method: "POST", body: JSON.stringify({ idempotencyKey: "key-two-sided-second", manifest: [
      { cardId: "card:one", side: "front", fileName: "second.heic", mimeType: "image/heic", rawSize: heic.length, seq: 1, clientDigest: sha256(heic) },
    ] }) })));
    const secondBatch = secondCreated.batch as { id: string };
    const secondItem = (secondCreated.items as Array<{ id: string }>)[0]!;
    assert.equal((await upload(new Request("http://test/upload", { method: "PUT", body: new Uint8Array(heic), headers: { "content-type": "image/heic" } }), params({ id: secondBatch.id, itemId: secondItem.id }))).status, 200);
    await createIngestV2FinalizeHandler(deps)(new Request("http://test/finalize", { method: "POST" }), params({ id: secondBatch.id }));
    const [secondClaimed] = (await runtime.repository.claimItems({ limit: 1 })).filter(item => item.batchId === secondBatch.id);
    assert.ok(secondClaimed);
    await runtime.repository.submitExtraction({ itemId: secondClaimed.id, leaseToken: secondClaimed.leaseToken, expectedVersion: secondClaimed.version, extraction, reviewIssues: [], usage: null });
    const secondReview = (await runtime.repository.getBatch({ actorId: "actor:test", batchId: secondBatch.id }))!;
    const secondBody = { ...body, confirmationIntentId: "confirm:card-one-second", expectedCardItems: secondReview.items.map(item => ({ itemId: item.id, version: item.version, imageDigest: item.imageDigest })), fieldSources: { displayName: secondItem.id, organization: secondItem.id, role: secondItem.id, email: secondItem.id, phone: null }, displayName: "次郎", email: "jiro@example.test", allowDuplicate: true };
    const secondResponse = await confirm(new Request("http://test/confirm", { method: "POST", body: JSON.stringify(secondBody) }), params({ id: secondBatch.id, itemId: secondItem.id }));
    assert.equal(secondResponse.status, 200);
    const secondPayload = await envelope(secondResponse);
    assert.notEqual(secondPayload.contactId, payloads[0]!.contactId, "same client cardId in another batch must create an independent contact");
    const finalCount = await pool.query(`select count(*)::int as n from orbit_records where collection_name = 'contacts'`);
    assert.equal(finalCount.rows[0].n, 2);
  });
});

test("v2 finalize refuses when the provider is unconfigured and keeps collecting", { skip }, async () => {
  await withHarness(async ({ deps, runtime }) => {
    const heic = await readFile(FIXTURE_HEIC);
    const collection = createIngestV2CollectionHandlers(deps);
    const createResponse = await collection.POST(
      new Request("http://test/api/v2", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "key-3",
          manifest: [
            {
              fileName: "card-1.heic",
              mimeType: "image/heic",
              rawSize: heic.length,
              seq: 1,
              clientDigest: sha256(heic),
            },
          ],
        }),
      }),
    );
    const created = await envelope(createResponse);
    const batch = created.batch as { id: string };
    const items = created.items as Array<{ id: string }>;
    const upload = createIngestV2UploadHandler(deps);
    await upload(
      new Request("http://test/upload", {
        method: "PUT",
        body: new Uint8Array(heic),
        headers: { "content-type": "image/heic" },
      }),
      params({ id: batch.id, itemId: items[0]!.id }),
    );

    const finalize = createIngestV2FinalizeHandler({
      ...deps,
      isOcrProviderConfigured: () => false,
    });
    const refused = await finalize(
      new Request("http://test/finalize", { method: "POST" }),
      params({ id: batch.id }),
    );
    assert.equal(refused.status, 503);

    const stillCollecting = await runtime.repository.getBatch({
      actorId: "actor:test",
      batchId: batch.id,
    });
    assert.equal(stillCollecting?.batch.status, "collecting");

    // 取消批次 → cancelled
    const cancel = createIngestV2CancelHandler(deps);
    const cancelled = await cancel(
      new Request("http://test/cancel", { method: "POST" }),
      params({ id: batch.id }),
    );
    assert.equal(cancelled.status, 200);
    assert.equal(((await envelope(cancelled)).batch as { status: string }).status, "cancelled");
  });
});
