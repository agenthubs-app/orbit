import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveAccountLanguagePreferenceService,
} from "../../features/account-language/live-service";
import {
  createStorageAccountLanguagePreferenceProvider,
  createTransactionalStorageAccountLanguagePreferenceProvider,
} from "../../features/account-language/storage/account-language-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const workspaceId = "workspace:language-preference";
const actorId = "actor:language-preference";
const instants = [
  "2026-09-15T04:40:00.000Z",
  "2026-09-15T04:40:00.001Z",
  "2026-09-15T04:40:00.002Z",
];

function fixture() {
  let index = 0;
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageAccountLanguagePreferenceProvider({
    store,
    workspaceId,
  });
  const service = createLiveAccountLanguagePreferenceService({
    now: () => instants[Math.min(index++, instants.length - 1)],
    provider,
  });
  return { service, store };
}

test("an account without a preference follows the device without creating a record", async () => {
  const { service, store } = fixture();

  const result = await service.read({ actorId });

  assert.deepEqual(result, {
    success: true,
    data: { mode: "system", language: null, updatedAt: null },
  });
  assert.equal((await store.listRecords({ limit: "unbounded", workspaceId, collectionName: "account_language_preferences" })).length, 0);
});

test("manual and system choices are actor scoped and round-trip through storage", async () => {
  const { service } = fixture();

  const manual = await service.save({
    actorId,
    input: {
      mode: "manual",
      language: "ja",
      expectedUpdatedAt: null,
      mutationId: "manual-ja",
    },
  });
  assert.equal(manual.success, true);
  if (!manual.success) return;
  assert.deepEqual(manual.data, {
    mode: "manual",
    language: "ja",
    mutationId: "manual-ja",
    updatedAt: instants[0],
  });
  assert.deepEqual(await service.read({ actorId }), {
    success: true,
    data: { mode: "manual", language: "ja", updatedAt: instants[0] },
  });
  assert.deepEqual(await service.read({ actorId: "actor:other" }), {
    success: true,
    data: { mode: "system", language: null, updatedAt: null },
  });

  const system = await service.save({
    actorId,
    input: {
      mode: "system",
      language: null,
      expectedUpdatedAt: instants[0],
      mutationId: "follow-system",
    },
  });
  assert.equal(system.success, true);
  if (!system.success) return;
  assert.equal(system.data.mode, "system");
  assert.equal(system.data.language, null);
  assert.equal(system.data.mutationId, "follow-system");
});

test("a mutation replays its receipt, rejects changed payload, and never overwrites a newer version", async () => {
  const { service } = fixture();
  const request = {
    mode: "manual" as const,
    language: "en" as const,
    expectedUpdatedAt: null,
    mutationId: "stable-request",
  };
  const first = await service.save({ actorId, input: request });
  assert.equal(first.success, true);
  assert.deepEqual(await service.save({ actorId, input: request }), first);

  const reused = await service.save({
    actorId,
    input: { ...request, language: "ja" },
  });
  assert.equal(reused.success, false);
  if (!reused.success) assert.equal(reused.error.code, "LANGUAGE_PREFERENCE_MUTATION_ID_REUSED");

  const stale = await service.save({
    actorId,
    input: {
      mode: "manual",
      language: "ja",
      expectedUpdatedAt: null,
      mutationId: "stale-request",
    },
  });
  assert.equal(stale.success, false);
  if (!stale.success) assert.equal(stale.error.code, "LANGUAGE_PREFERENCE_VERSION_CONFLICT");
  assert.deepEqual(await service.read({ actorId }), {
    success: true,
    data: {
      mode: "manual",
      language: "en",
      updatedAt: instants[0],
    },
  });
});

test("invalid mode and language combinations fail before writing", async () => {
  const { service, store } = fixture();
  for (const input of [
    { mode: "system", language: "zh", expectedUpdatedAt: null, mutationId: "bad-system" },
    { mode: "manual", language: null, expectedUpdatedAt: null, mutationId: "bad-manual" },
    { mode: "manual", language: "fr", expectedUpdatedAt: null, mutationId: "bad-language" },
    { mode: "manual", language: "ja", expectedUpdatedAt: null, mutationId: "" },
  ]) {
    const result = await service.save({ actorId, input });
    assert.equal(result.success, false, JSON.stringify(input));
    if (!result.success) assert.equal(result.error.code, "LANGUAGE_PREFERENCE_MUTATION_INVALID");
  }
  assert.equal((await store.listRecords({ limit: "unbounded", workspaceId, collectionName: "account_language_preferences" })).length, 0);
});

test("a corrupt or foreign-owned preference fails closed instead of becoming system mode", async () => {
  const { service, store } = fixture();
  const saved = await service.save({
    actorId,
    input: {
      mode: "manual",
      language: "ja",
      expectedUpdatedAt: null,
      mutationId: "seed-corrupt",
    },
  });
  assert.equal(saved.success, true);
  const [record] = await store.listRecords({
    limit: "unbounded",
    workspaceId,
    collectionName: "account_language_preferences",
  });
  assert.ok(record);
  await store.upsertRecord({
    ...record,
    userId: "actor:foreign",
  });

  const result = await service.read({ actorId });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "LANGUAGE_PREFERENCE_READ_UNAVAILABLE");
});

test("serialization failures retry twice and then fail visibly without an unbounded loop", async () => {
  let attempts = 0;
  const client: TransactionalPostgresClient = {
    async close() {},
    async query() { throw new Error("read must not run"); },
    async transaction() {
      attempts += 1;
      throw Object.assign(new Error("serialization failure"), { code: "40001" });
    },
  };
  const provider = createTransactionalStorageAccountLanguagePreferenceProvider({
    client,
    workspaceId,
  });

  const result = await provider.save({
    actorId,
    updatedAt: instants[0],
    mutation: {
      mode: "manual",
      language: "ja",
      expectedUpdatedAt: null,
      mutationId: "bounded-serialization-retry",
    },
  });

  assert.deepEqual(result, { kind: "unavailable" });
  assert.equal(attempts, 3);
});
