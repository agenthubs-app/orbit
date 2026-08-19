import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  CONTACT_ACTOR_LINK_COLLECTION,
  createStorageContactActorLinkProvider,
} from "../../features/contacts/contact-actor-links/storage-provider";
import type { ContactActorLink } from "../../features/contacts/contact-actor-links/contract";
import {
  createMemoryLiveRecordStore,
  type LiveRecordStoreLike,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const workspaceId = "workspace:contact-actor-links";
const ownerActorId = "account:xiaoyu";
const linkedActorId = "user:wei-yuhang";
const linkedAt = "2026-08-19T00:00:00.000Z";

function recordId(owner: string, contactId: string): string {
  return `contact-actor-link:${createHash("sha256")
    .update(`${owner}\u0000${contactId}`)
    .digest("hex")}`;
}

function providerWithStore() {
  const store = createMemoryLiveRecordStore();

  return {
    provider: createStorageContactActorLinkProvider({ store, workspaceId }),
    store,
  };
}

function input(overrides: Partial<ContactActorLink> = {}) {
  return {
    contactId: "contact_090",
    evidenceIds: ["evidence:organizer-account-manifest:v1"],
    linkedActorId,
    linkedAt,
    ownerActorId,
    ...overrides,
  };
}

function validRecord(overrides: Partial<LiveRecord<Record<string, unknown>>> = {}) {
  return {
    workspaceId,
    collectionName: CONTACT_ACTOR_LINK_COLLECTION,
    recordId: recordId(ownerActorId, "contact_090"),
    userId: ownerActorId,
    sourceType: "contact_actor_link",
    sourceId: recordId(ownerActorId, "contact_090"),
    evidenceIds: ["evidence:organizer-account-manifest:v1"],
    createdAt: linkedAt,
    updatedAt: linkedAt,
    lifecycleState: "active" as const,
    payload: {
      contactId: "contact_090",
      evidenceIds: ["evidence:organizer-account-manifest:v1"],
      linkedActorId,
      linkedAt,
      state: "active",
    },
    ...overrides,
  } satisfies LiveRecord<Record<string, unknown>>;
}

test("creates an active link with deterministic private ownership and payload shape", async () => {
  const { provider, store } = providerWithStore();

  const result = await provider.ensureActive(input());
  const saved = await store.getRecord({
    workspaceId,
    collectionName: CONTACT_ACTOR_LINK_COLLECTION,
    recordId: recordId(ownerActorId, "contact_090"),
  });

  assert.equal(result.state, "created");
  assert.deepEqual(result.link, {
    contactId: "contact_090",
    evidenceIds: ["evidence:organizer-account-manifest:v1"],
    linkedActorId,
    linkedAt,
    ownerActorId,
    state: "active",
  });
  assert.equal(saved?.userId, ownerActorId);
  assert.equal(saved?.payload.ownerActorId, undefined);
  assert.deepEqual(saved?.payload, {
    contactId: "contact_090",
    evidenceIds: ["evidence:organizer-account-manifest:v1"],
    linkedActorId,
    linkedAt,
    state: "active",
  });
  assert.equal((await provider.listActiveForOwner(ownerActorId)).length, 1);
});

test("replays the same active link idempotently", async () => {
  const { provider } = providerWithStore();

  await provider.ensureActive(input());
  const replayed = await provider.ensureActive(input());

  assert.equal(replayed.state, "replayed");
  assert.equal(replayed.link.linkedActorId, linkedActorId);
});

test("rejects active contact and actor uniqueness conflicts within one owner", async () => {
  const { provider } = providerWithStore();

  await provider.ensureActive(input());

  await assert.rejects(
    provider.ensureActive(
      input({ linkedActorId: "user:other", linkedAt: "2026-08-19T01:00:00.000Z" }),
    ),
    /contact is already linked/i,
  );
  await assert.rejects(
    provider.ensureActive(
      input({ contactId: "contact_091", linkedAt: "2026-08-19T02:00:00.000Z" }),
    ),
    /actor is already linked/i,
  );
});

test("isolates active links by owner actor", async () => {
  const { provider } = providerWithStore();

  await provider.ensureActive(input());
  const otherOwner = await provider.ensureActive(
    input({ ownerActorId: "account:other" }),
  );

  assert.equal(otherOwner.state, "created");
  assert.equal((await provider.listActiveForOwner(ownerActorId)).length, 1);
  assert.equal((await provider.listActiveForOwner("account:other")).length, 1);
});

test("preserves revoked-link history and does not reactivate it", async () => {
  const { provider, store } = providerWithStore();
  const revoked: LiveRecord<Record<string, unknown>> = {
    workspaceId,
    collectionName: CONTACT_ACTOR_LINK_COLLECTION,
    recordId: recordId(ownerActorId, "contact_090"),
    userId: ownerActorId,
    sourceType: "manual",
    sourceId: "contact-actor-link:history",
    evidenceIds: ["evidence:revocation"],
    createdAt: linkedAt,
    updatedAt: "2026-08-19T03:00:00.000Z",
    lifecycleState: "active",
    payload: {
      contactId: "contact_090",
      evidenceIds: ["evidence:revocation"],
      linkedActorId,
      linkedAt,
      revokedAt: "2026-08-19T03:00:00.000Z",
      state: "revoked",
    },
  };
  store.upsertRecord(revoked);

  assert.equal((await provider.listActiveForOwner(ownerActorId)).length, 0);
  await assert.rejects(provider.ensureActive(input()), /revoked link history/i);
  assert.deepEqual(
    (await store.getRecord({
      workspaceId,
      collectionName: CONTACT_ACTOR_LINK_COLLECTION,
      recordId: revoked.recordId,
      includeDeleted: true,
    }))?.payload,
    revoked.payload,
  );
});

test("rejects malformed link input instead of persisting partial records", async () => {
  const { provider } = providerWithStore();

  await assert.rejects(
    provider.ensureActive(input({ contactId: "   " })),
    /invalid contact actor link/i,
  );
  await assert.rejects(
    provider.ensureActive(input({ evidenceIds: [] })),
    /invalid contact actor link/i,
  );
  await assert.rejects(
    provider.ensureActive(input({ linkedAt: "not-a-timestamp" })),
    /invalid contact actor link/i,
  );
});

test("rejects a stored link whose record id is not derived from its owner and contact", async () => {
  const { provider, store } = providerWithStore();

  store.upsertRecord(
    validRecord({ recordId: "contact-actor-link:not-the-deterministic-id" }),
  );

  await assert.rejects(
    provider.listActiveForOwner(ownerActorId),
    /invalid contact actor link/i,
  );
});

test("rejects null and array payloads with the provider validation error", async () => {
  for (const payload of [null, []]) {
    const { provider, store } = providerWithStore();
    store.upsertRecord(
      validRecord({ payload: payload as unknown as Record<string, unknown> }),
    );

    await assert.rejects(
      provider.listActiveForOwner(ownerActorId),
      /invalid contact actor link/i,
    );
  }
});

test("serializes concurrent writes for one owner across provider instances", async () => {
  const baseStore = createMemoryLiveRecordStore();
  let listCalls = 0;
  let releaseFirstList: (() => void) | undefined;
  let firstListEntered: (() => void) | undefined;
  const firstList = new Promise<void>((resolve) => {
    firstListEntered = resolve;
  });
  const firstListRelease = new Promise<void>((resolve) => {
    releaseFirstList = resolve;
  });
  const store: LiveRecordStoreLike<Record<string, unknown>> = {
    deleteRecord: (input) => baseStore.deleteRecord(input),
    getRecord: (query) => baseStore.getRecord(query),
    async listRecords(query) {
      listCalls += 1;
      if (listCalls === 1) {
        firstListEntered?.();
        await firstListRelease;
      }
      return baseStore.listRecords(query);
    },
    upsertRecord: (record) => baseStore.upsertRecord(record),
  };
  const firstProvider = createStorageContactActorLinkProvider({ store, workspaceId });
  const secondProvider = createStorageContactActorLinkProvider({ store, workspaceId });

  const firstWrite = firstProvider.ensureActive(input());
  await firstList;
  const secondWrite = secondProvider.ensureActive(
    input({ linkedActorId: "user:other" }),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(listCalls, 1);
  releaseFirstList?.();

  const results = await Promise.allSettled([firstWrite, secondWrite]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await firstProvider.listActiveForOwner(ownerActorId)).length, 1);
});
