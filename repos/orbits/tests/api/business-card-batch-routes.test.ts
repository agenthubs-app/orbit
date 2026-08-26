import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBusinessCardBatchCollectionHandlers } from "../../app/api/contact-drafts/business-card/batches/handler";
import { createBusinessCardBatchDetailHandler } from "../../app/api/contact-drafts/business-card/batches/[id]/handler";
import { createBusinessCardBatchItemImageHandler } from "../../app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/image/handler";
import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { createBusinessCardBatchImageStore } from "../../features/acquisition/storage/business-card-batch-image-store";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const ACTOR = { id: "account:batch-api", name: "Batch API Tester" };
const resolveActor = async () => ACTOR;

// 最小合法 1x1 JPEG。
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

const EXTRACTION = {
  addresses: [],
  certifications: [],
  contactPoints: [],
  departments: [],
  detectedLanguages: ["ja"],
  emails: [],
  fullName: "青空 太郎",
  nativeFullName: "青空 太郎",
  organization: "架空技研株式会社",
  romanizedFullName: null,
  title: "室長",
  website: null,
};
const USAGE = { inputTokens: 10, latencyMs: 5, outputTokens: 5 };

async function setup() {
  const rootDir = await mkdtemp(join(tmpdir(), "orbit-batch-api-"));
  const imageStore = createBusinessCardBatchImageStore({ rootDir });
  const service = createBusinessCardBatchService({
    imageStore,
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:test",
  });
  return { imageStore, service };
}

function uploadRequest(files: { name: string; type: string; bytes: Buffer }[]): Request {
  const formData = new FormData();
  for (const file of files) {
    formData.append(
      "files",
      new File([new Uint8Array(file.bytes)], file.name, { type: file.type }),
    );
  }
  return new Request("http://localhost/api/contact-drafts/business-card/batches", {
    body: formData,
    method: "POST",
  });
}

test("batch upload accepts images, rejects bad files without dropping the batch, and lists it", async () => {
  const { service } = await setup();
  const handlers = createBusinessCardBatchCollectionHandlers(resolveActor, service);

  const response = await handlers.POST(
    uploadRequest([
      { bytes: TINY_JPEG, name: "card-1.jpg", type: "image/jpeg" },
      { bytes: Buffer.from("nope"), name: "junk.txt", type: "text/plain" },
    ]),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: {
      batch: { id: string; totalItems: number };
      rejectedFiles: readonly { fileName: string; reason: string }[];
    };
  };
  assert.equal(body.data.batch.totalItems, 1);
  assert.equal(body.data.rejectedFiles[0]?.fileName, "junk.txt");
  assert.equal(body.data.rejectedFiles[0]?.reason, "unsupported_type");

  const listResponse = await handlers.GET();
  const listBody = (await listResponse.json()) as {
    data: { batches: readonly { id: string }[] };
  };
  assert.equal(listBody.data.batches[0]?.id, body.data.batch.id);
});

test("an upload with no usable files is rejected as empty", async () => {
  const { service } = await setup();
  const handlers = createBusinessCardBatchCollectionHandlers(resolveActor, service);

  const response = await handlers.POST(
    uploadRequest([{ bytes: Buffer.from("nope"), name: "junk.txt", type: "text/plain" }]),
  );
  assert.equal(response.status, 400);
});

test("batch detail hides extraction while processing and the image route serves then 404s", async () => {
  const { imageStore, service } = await setup();
  const handlers = createBusinessCardBatchCollectionHandlers(resolveActor, service);
  const detail = createBusinessCardBatchDetailHandler(resolveActor, service);
  const image = createBusinessCardBatchItemImageHandler(resolveActor, service, imageStore);

  const created = await handlers.POST(
    uploadRequest([{ bytes: TINY_JPEG, name: "card-1.jpg", type: "image/jpeg" }]),
  );
  const { batch } = ((await created.json()) as { data: { batch: { id: string } } }).data;

  const processingDetail = await detail(new Request("http://localhost"), {
    params: Promise.resolve({ id: batch.id }),
  });
  const processingBody = (await processingDetail.json()) as {
    data: { items: readonly { id: string }[] };
  };
  const itemId = processingBody.data.items[0]!.id;
  assert.equal("extraction" in processingBody.data.items[0]!, false);

  const imageResponse = await image(new Request("http://localhost"), {
    params: Promise.resolve({ id: batch.id, itemId }),
  });
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/jpeg");

  const now = new Date().toISOString();
  const [claimed] = await service.claimPendingItems({ limit: 1, now, workerId: "w" });
  await service.completeItem({
    batchId: batch.id,
    extraction: EXTRACTION,
    itemId: claimed!.id,
    now,
    reviewIssues: [],
    usage: USAGE,
    workerId: "w",
  });

  const readyDetail = await detail(new Request("http://localhost"), {
    params: Promise.resolve({ id: batch.id }),
  });
  const readyBody = (await readyDetail.json()) as {
    data: { items: readonly { extraction?: { fullName?: string } }[] };
  };
  assert.equal(readyBody.data.items[0]?.extraction?.fullName, "青空 太郎");

  await service.skipItem({ actorId: ACTOR.id, batchId: batch.id, itemId, now });
  const goneResponse = await image(new Request("http://localhost"), {
    params: Promise.resolve({ id: batch.id, itemId }),
  });
  assert.equal(goneResponse.status, 404);
});
