import assert from "node:assert/strict";
import test from "node:test";

import { computeManifestFingerprint } from "../../features/acquisition/business-card-ingest-v2/repository";

const digest = (value: string) => `sha256:${value.repeat(64)}`;

async function schemas() {
  return import("../../shared/api-schema/business-card-batch") as Promise<Record<string, { parse(value: unknown): unknown; safeParse(value: unknown): { success: boolean } }>>;
}

test("two-sided manifest keeps explicit card identity and side in the idempotency fingerprint", async () => {
  const module = await schemas();
  const validator = module.ingestManifestEntrySchema;
  assert.ok(validator, "ingestManifestEntrySchema must exist");
  const front = { cardId: "card:one", side: "front", fileName: "front.heic", mimeType: "image/heic", rawSize: 100, seq: 1, clientDigest: digest("a") };
  const back = { cardId: "card:one", side: "back", fileName: "back.heic", mimeType: "image/heic", rawSize: 120, seq: 2, clientDigest: digest("b") };
  assert.deepEqual(validator.parse(front), front);
  assert.deepEqual(validator.parse(back), back);
  assert.equal(validator.safeParse({ ...front, cardId: undefined }).success, false);
  assert.equal(validator.safeParse({ ...front, side: "inside" }).success, false);
  assert.notEqual(
    computeManifestFingerprint([front, back] as never),
    computeManifestFingerprint([{ ...front, cardId: "card:other" }, { ...back, cardId: "card:other" }] as never),
  );
});

test("card confirmation input binds intent, both source versions and field provenance", async () => {
  const module = await schemas();
  const validator = module.ingestCardConfirmationInputSchema;
  assert.ok(validator, "ingestCardConfirmationInputSchema must exist");
  const input = {
    confirmationIntentId: "confirm:one",
    expectedCardItems: [
      { itemId: "item:front", version: 3, imageDigest: digest("a") },
      { itemId: "item:back", version: 4, imageDigest: digest("b") },
    ],
    fieldSources: {
      displayName: "item:front",
      organization: "item:back",
      role: null,
      email: "item:back",
      phone: null,
    },
    displayName: "山田 太郎",
    organization: "Orbit 株式会社",
    role: "代表",
    email: "taro@example.test",
    phone: "",
    relationshipContext: "展示会",
    notes: "裏面を確認",
    allowDuplicate: false,
  };
  assert.deepEqual(validator.parse(input), input);
  for (const mutation of [
    { confirmationIntentId: "" },
    { expectedCardItems: [...input.expectedCardItems, input.expectedCardItems[0]] },
    { fieldSources: { ...input.fieldSources, organization: "item:outside" } },
  ]) {
    assert.equal(validator.safeParse({ ...input, ...mutation }).success, false, JSON.stringify(mutation));
  }
});

test("created confirmation proves every side resolved to the same contact", async () => {
  const module = await schemas();
  const item = (id: string, side: "front" | "back") => ({
    id, batchId: "batch:one", cardId: "card:one", side, seq: side === "front" ? 1 : 2,
    status: "confirmed", version: 5, sourceFileName: `${side}.heic`, rawSize: 100,
    rawMimeType: "image/heic", clientDigest: digest(side === "front" ? "a" : "b"),
    imageDigest: digest(side === "front" ? "a" : "b"), derivativeObjectKey: null,
    derivativeSize: null, extraction: null, extractionSchemaVersion: 1, reviewIssues: [], usage: null,
    confirmedContactId: "contact:one", attemptCount: 1, nextRetryAt: null,
    leaseExpiresAt: null, errorStage: null, errorCode: null,
    createdAt: "2026-09-14T00:00:00Z", updatedAt: "2026-09-14T00:00:00Z",
  });
  const validator = module.ingestConfirmationResponseSchema;
  assert.ok(validator, "ingestConfirmationResponseSchema must exist");
  const response = { state: "created", contactId: "contact:one", item: item("item:front", "front"), items: [item("item:front", "front"), item("item:back", "back")], replayed: false };
  assert.deepEqual(validator.parse(response), response);
  assert.equal(validator.safeParse({ ...response, items: [response.items[0], { ...response.items[1], confirmedContactId: "contact:two" }] }).success, false);
  assert.equal(validator.safeParse({ ...response, items: [response.items[0], { ...response.items[1], cardId: "card:two" }] }).success, false);
});
