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
  createIngestV2DuplicateCandidatesHandler,
  createIngestV2FinalizeHandler,
  createIngestV2UploadHandler,
  createIngestV2ReplaceHandler,
  type IngestV2Runtime,
} from "../../app/api/contact-drafts/business-card/batches/v2/handlers";
import type { BusinessCardStructuredExtraction } from "../../features/acquisition/business-card-cloud-ocr";
import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
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

    // 第二张同邮箱但职位不同 → duplicate_review，不创建第二个联系人
    // （所有字段都相同的卡会直接并入已有联系人，见下方「links identical cards」）
    const duplicateResponse = await confirm(
      new Request("http://test/confirm", {
        method: "POST",
        body: JSON.stringify({
          displayName: "王 小明",
          organization: "Orbit",
          role: "CTO",
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
          role: "CTO",
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
    const secondBody = { ...body, confirmationIntentId: "confirm:card-one-second", expectedCardItems: secondReview.items.map(item => ({ itemId: item.id, version: item.version, imageDigest: item.imageDigest })), fieldSources: { displayName: secondItem.id, organization: secondItem.id, role: secondItem.id, email: secondItem.id, phone: null, address: null }, displayName: "次郎", email: "jiro@example.test", address: "東京都テスト区1-2-3", allowDuplicate: true };
    const secondResponse = await confirm(new Request("http://test/confirm", { method: "POST", body: JSON.stringify(secondBody) }), params({ id: secondBatch.id, itemId: secondItem.id }));
    assert.equal(secondResponse.status, 200);
    const secondPayload = await envelope(secondResponse);
    assert.notEqual(secondPayload.contactId, payloads[0]!.contactId, "same client cardId in another batch must create an independent contact");
    const secondContact = await pool.query(`select payload->>'location' as location from orbit_records where collection_name = 'contacts' and record_id = $1`, [secondPayload.contactId]);
    assert.equal(secondContact.rows[0]?.location, "東京都テスト区1-2-3", "the reviewed address is saved as the contact's location");
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
    // 最后一张上传完会在服务端自动开始识别——但同样要过 provider 预检：未配置时批次保持 collecting。
    const upload = createIngestV2UploadHandler({ ...deps, isOcrProviderConfigured: () => false });
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

test("v2 last upload starts recognition on the server; re-uploading the same bytes afterwards stays idempotent", { skip }, async () => {
  await withHarness(async ({ deps }) => {
    const heic = await readFile(FIXTURE_HEIC);
    const collection = createIngestV2CollectionHandlers(deps);
    const createResponse = await collection.POST(
      new Request("http://test/batches", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "auto-finalize",
          manifest: [{ fileName: "a.heic", mimeType: "image/heic", rawSize: heic.length, seq: 1, clientDigest: sha256(heic) }],
        }),
      }),
    );
    const created = await envelope(createResponse);
    const batch = created.batch as { id: string };
    const items = created.items as Array<{ id: string }>;
    const upload = createIngestV2UploadHandler({ ...deps, isOcrProviderConfigured: () => true });
    const put = () => upload(
      new Request("http://test/upload", { method: "PUT", body: new Uint8Array(heic), headers: { "content-type": "image/heic" } }),
      params({ id: batch.id, itemId: items[0]!.id }),
    );
    assert.equal((await put()).status, 200);
    const detail = createIngestV2BatchDetailHandler(deps);
    const after = await envelope(await detail(new Request(`http://test/batches/${batch.id}`), params({ id: batch.id })));
    assert.equal((after.batch as { status: string }).status, "processing", "no manual finalize needed");
    const replay = await put();
    assert.equal(replay.status, 200);
    assert.equal((await envelope(replay)).alreadyUploaded, true);
  });
});

test("v2 confirm links identical cards to the existing contact, surfaces similar ones, and merges on request", { skip }, async () => {
  await withHarness(async ({ deps, runtime, pool }) => {
    const heic = await readFile(FIXTURE_HEIC);
    const created = await envelope(await createIngestV2CollectionHandlers(deps).POST(new Request("http://test/api/v2", { method: "POST", body: JSON.stringify({
      idempotencyKey: "key-merge",
      manifest: ["a", "b", "c"].map((card, index) => ({ cardId: `card:${card}`, side: "front", fileName: `${card}.heic`, mimeType: "image/heic", rawSize: heic.length, seq: index + 1, clientDigest: sha256(heic) })),
    }) })));
    const batch = created.batch as { id: string };
    const upload = createIngestV2UploadHandler(deps);
    for (const item of created.items as Array<{ id: string }>) {
      assert.equal((await upload(new Request("http://test/upload", { method: "PUT", body: new Uint8Array(heic), headers: { "content-type": "image/heic" } }), params({ id: batch.id, itemId: item.id }))).status, 200);
    }
    await createIngestV2FinalizeHandler(deps)(new Request("http://test/finalize", { method: "POST" }), params({ id: batch.id }));
    const extraction: BusinessCardStructuredExtraction = {
      fullName: "佐々木 芳邦", nativeFullName: "佐々木 芳邦", romanizedFullName: null, organization: "TEN法律事務所", departments: [], title: "顧問",
      emails: [], contactPoints: [{ label: "MOBILE", type: "mobile", value: "090-1838-1818" }], website: null,
      addresses: [{ label: null, value: "東京都文京区本郷4丁目2-2" }], certifications: [], detectedLanguages: ["ja"],
    };
    for (const item of await runtime.repository.claimItems({ limit: 3 })) {
      await runtime.repository.submitExtraction({ itemId: item.id, leaseToken: item.leaseToken, expectedVersion: item.version, extraction, reviewIssues: [], usage: null });
    }
    const review = (await runtime.repository.getBatch({ actorId: "actor:test", batchId: batch.id }))!;
    const itemFor = (card: string) => review.items.find(item => item.cardId === `card:${card}`)!;
    const fields = { displayName: "佐々木 芳邦", organization: "TEN法律事務所", role: "顧問", email: "", phone: "090-1838-1818", address: "東京都文京区本郷4丁目2-2" };
    const body = (card: string, overrides: Record<string, unknown> = {}) => {
      const item = itemFor(card);
      return {
        confirmationIntentId: `confirm:${card}:${JSON.stringify(overrides)}`,
        expectedCardItems: [{ itemId: item.id, version: item.version, imageDigest: item.imageDigest }],
        fieldSources: { displayName: item.id, organization: item.id, role: item.id, email: null, phone: item.id, address: item.id },
        ...fields, relationshipContext: "", notes: "正面 · x.heic\n传真: 03-6800-3712", ...overrides,
      };
    };
    const confirm = createIngestV2ConfirmHandler(deps);
    const post = async (card: string, payload: Record<string, unknown>) => {
      const response = await confirm(new Request("http://test/confirm", { method: "POST", body: JSON.stringify(payload) }), params({ id: batch.id, itemId: itemFor(card).id }));
      assert.equal(response.status, 200);
      return envelope(response);
    };

    const first = await post("a", body("a"));
    assert.equal(first.state, "created");
    assert.equal(first.merged, false);

    const identical = await post("b", body("b"));
    assert.equal(identical.state, "created", "an identical card is linked without asking");
    assert.equal(identical.merged, true);
    assert.equal(identical.contactId, first.contactId);

    const similar = await post("c", body("c", { organization: "別の事務所" }));
    assert.equal(similar.state, "duplicate_review");
    const candidate = similar.candidate as { contactId: string; identical: boolean; matchedOn: string[]; organization: string };
    assert.equal(candidate.contactId, first.contactId);
    assert.equal(candidate.identical, false);
    assert.deepEqual(candidate.matchedOn, ["phone"]);
    assert.equal(candidate.organization, "TEN法律事務所");

    const lookup = await envelope(await createIngestV2DuplicateCandidatesHandler(deps)(
      new Request("http://test/duplicates", { method: "POST", body: JSON.stringify({ cards: [{ cardId: "card:c", fields: { ...fields, organization: "別の事務所" } }, { cardId: "card:x", fields: { ...fields, displayName: "別人", phone: "03-0000-0000" } }] }) }),
      params({ id: batch.id }),
    ));
    const matches = lookup.matches as Record<string, { contactId: string } | null>;
    assert.equal(matches["card:c"]?.contactId, first.contactId);
    assert.equal(matches["card:x"], null);

    const merged = await post("c", body("c", { organization: "別の事務所", mergeIntoContactId: first.contactId }));
    assert.equal(merged.state, "created");
    assert.equal(merged.merged, true);
    assert.equal(merged.contactId, first.contactId);

    const contacts = await pool.query(`select payload from orbit_records where collection_name = 'contacts'`);
    assert.equal(contacts.rows.length, 1, "three cards of the same person leave one contact");
    const payload = contacts.rows[0].payload as { organization: string; location: string; notes: string };
    assert.equal(payload.organization, "TEN法律事務所", "merging never overwrites an existing value");
    assert.equal(payload.location, "東京都文京区本郷4丁目2-2");
    assert.match(payload.notes, /公司: 別の事務所/);
  });
});

// W0013：确认时写入审阅页的行业；合并只补空；提取结构 v1 的旧批次照常打开与确认。
test("v2 confirm writes the reviewed industry, merges only into empty industry fields, and keeps v1 extractions confirmable", { skip }, async () => {
  await withHarness(async ({ deps, runtime, pool }) => {
    const heic = await readFile(FIXTURE_HEIC);
    const created = await envelope(await createIngestV2CollectionHandlers(deps).POST(new Request("http://test/api/v2", { method: "POST", body: JSON.stringify({
      idempotencyKey: "key-industry",
      manifest: ["a", "b", "c", "d"].map((card, index) => ({ cardId: `card:${card}`, side: "front", fileName: `${card}.heic`, mimeType: "image/heic", rawSize: heic.length, seq: index + 1, clientDigest: sha256(heic) })),
    }) })));
    const batch = created.batch as { id: string };
    const upload = createIngestV2UploadHandler(deps);
    for (const item of created.items as Array<{ id: string }>) {
      assert.equal((await upload(new Request("http://test/upload", { method: "PUT", body: new Uint8Array(heic), headers: { "content-type": "image/heic" } }), params({ id: batch.id, itemId: item.id }))).status, 200);
    }
    await createIngestV2FinalizeHandler(deps)(new Request("http://test/finalize", { method: "POST" }), params({ id: batch.id }));
    const extraction: BusinessCardStructuredExtraction = {
      fullName: "青空 太郎", nativeFullName: "青空 太郎", romanizedFullName: null, organization: "架空法律事務所", departments: [], title: "弁護士",
      emails: [], contactPoints: [], website: null, addresses: [], certifications: [], detectedLanguages: ["ja"],
      primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal",
    };
    for (const item of await runtime.repository.claimItems({ limit: 4 })) {
      await runtime.repository.submitExtraction({ itemId: item.id, leaseToken: item.leaseToken, expectedVersion: item.version, extraction, reviewIssues: [], usage: null });
    }
    // 把 card:d 改回 v1 形状（没有行业键、版本 1），模拟升级前识别完的旧批次。
    await pool.query(
      `update bc_ingest_items set extraction = extraction - 'primaryIndustryId' - 'secondaryIndustryId', extraction_schema_version = 1 where card_id = 'card:d'`,
    );
    const detail = await envelope(await createIngestV2BatchDetailHandler(deps)(new Request("http://test/detail"), params({ id: batch.id })));
    const items = detail.items as IngestItemDTO[];
    const itemFor = (card: string) => items.find(entry => entry.cardId === `card:${card}`)!;
    assert.equal(itemFor("a").extractionSchemaVersion, 2);
    assert.equal(itemFor("a").extraction?.secondaryIndustryId, "professional_services.legal");
    assert.equal(itemFor("d").extractionSchemaVersion, 1);
    assert.equal(itemFor("d").extraction?.primaryIndustryId, null, "v1 JSON without industry reads back as null");
    assert.equal(itemFor("d").extraction?.secondaryIndustryId, null);
    assert.equal(itemFor("d").extraction?.organization, "架空法律事務所");

    const body = (card: string, fields: Record<string, unknown>) => {
      const item = itemFor(card);
      return {
        confirmationIntentId: `confirm:${card}`,
        expectedCardItems: [{ itemId: item.id, version: item.version, imageDigest: item.imageDigest }],
        fieldSources: { displayName: null, organization: null, role: null, email: null, phone: null },
        organization: "", role: "", email: "", phone: "", relationshipContext: "", notes: "",
        ...fields,
      };
    };
    const confirm = createIngestV2ConfirmHandler(deps);
    const post = async (card: string, payload: Record<string, unknown>) => {
      const response = await confirm(new Request("http://test/confirm", { method: "POST", body: JSON.stringify(payload) }), params({ id: batch.id, itemId: itemFor(card).id }));
      return { status: response.status, data: await envelope(response) };
    };
    const payloadOf = async (contactId: unknown) =>
      (await pool.query(`select payload from orbit_records where collection_name = 'contacts' and record_id = $1`, [contactId])).rows[0].payload as Record<string, unknown>;

    const mismatched = await post("a", body("a", { displayName: "青空 太郎", primaryIndustryId: "professional_services", secondaryIndustryId: "finance_investment.banking" }));
    assert.equal(mismatched.status, 400, "a mismatched pair is rejected before any write");

    // 新建：写入审阅页的行业。
    const createdA = await post("a", body("a", { displayName: "青空 太郎", primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" }));
    assert.equal(createdA.data.state, "created");
    const contactA = await payloadOf(createdA.data.contactId);
    assert.equal(contactA.primaryIndustryId, "professional_services");
    assert.equal(contactA.secondaryIndustryId, "professional_services.legal");

    // 旧客户端不传行业：新建联系人没有行业。
    const createdB = await post("b", body("b", { displayName: "別の 人" }));
    assert.equal(createdB.data.state, "created");
    assert.equal((await payloadOf(createdB.data.contactId)).primaryIndustryId, undefined);

    // 合并到行业为空的联系人：补上。
    const mergedIntoEmpty = await post("c", body("c", { displayName: "別の 人", mergeIntoContactId: createdB.data.contactId, primaryIndustryId: "finance_investment", secondaryIndustryId: "finance_investment.insurance" }));
    assert.equal(mergedIntoEmpty.data.merged, true);
    const contactB = await payloadOf(createdB.data.contactId);
    assert.equal(contactB.primaryIndustryId, "finance_investment");
    assert.equal(contactB.secondaryIndustryId, "finance_investment.insurance");

    // v1 旧卡合并到已有行业的联系人：确认成功，已有行业不被覆盖。
    const mergedIntoExisting = await post("d", body("d", { displayName: "青空 太郎", mergeIntoContactId: createdA.data.contactId, primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" }));
    assert.equal(mergedIntoExisting.status, 200);
    assert.equal(mergedIntoExisting.data.state, "created");
    const contactAAfter = await payloadOf(createdA.data.contactId);
    assert.equal(contactAAfter.primaryIndustryId, "professional_services");
    assert.equal(contactAAfter.secondaryIndustryId, "professional_services.legal");
  });
});
