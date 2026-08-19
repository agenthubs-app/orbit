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
