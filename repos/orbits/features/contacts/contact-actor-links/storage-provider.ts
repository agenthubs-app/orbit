import { createHash } from "node:crypto";

import type {
  ContactActorLink,
  ContactActorLinkProvider,
  EnsureActiveContactActorLinkInput,
  StorageContactActorLinkProviderOptions,
} from "./contract";
import type { LiveRecord } from "../../../shared/storage/live-record-store";

export const CONTACT_ACTOR_LINK_COLLECTION = "contact_actor_links";

const PROVIDER = "contact-actor-link-storage";

const ownerLocks = new WeakMap<
  object,
  Map<string, Promise<void>>
>();

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isTimestamp(value: unknown): value is string {
  return (
    nonEmptyString(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isEvidenceIds(value: unknown): value is readonly [string, ...string[]] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((evidenceId) => nonEmptyString(evidenceId))
  );
}

function recordId(ownerActorId: string, contactId: string): string {
  return `contact-actor-link:${createHash("sha256")
    .update(`${ownerActorId}\u0000${contactId}`)
    .digest("hex")}`;
}

function invalidLink(): Error {
  return new Error("Invalid contact actor link.");
}

function assertInput(
  input: EnsureActiveContactActorLinkInput,
): asserts input is EnsureActiveContactActorLinkInput {
  if (
    !input ||
    typeof input !== "object" ||
    !nonEmptyString(input.ownerActorId) ||
    !nonEmptyString(input.contactId) ||
    !nonEmptyString(input.linkedActorId) ||
    !isTimestamp(input.linkedAt) ||
    !isEvidenceIds(input.evidenceIds)
  ) {
    throw invalidLink();
  }
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function linkFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ContactActorLink {
  if (
    record.collectionName !== CONTACT_ACTOR_LINK_COLLECTION ||
    !nonEmptyString(record.userId) ||
    record.lifecycleState !== "active"
  ) {
    throw invalidLink();
  }

  if (!isPlainObject(record.payload)) {
    throw invalidLink();
  }

  const payload = record.payload;
  const state = payload.state;
  const keys = state === "active"
    ? ["contactId", "evidenceIds", "linkedActorId", "linkedAt", "state"]
    : ["contactId", "evidenceIds", "linkedActorId", "linkedAt", "revokedAt", "state"];

  if (
    !exactKeys(payload, keys) ||
    !nonEmptyString(payload.contactId) ||
    !isEvidenceIds(payload.evidenceIds) ||
    !nonEmptyString(payload.linkedActorId) ||
    !isTimestamp(payload.linkedAt) ||
    (state !== "active" && state !== "revoked") ||
    (state === "revoked" && !isTimestamp(payload.revokedAt))
  ) {
    throw invalidLink();
  }

  if (record.recordId !== recordId(record.userId, payload.contactId)) {
    throw invalidLink();
  }

  return {
    ownerActorId: record.userId,
    contactId: payload.contactId,
    linkedActorId: payload.linkedActorId,
    state,
    linkedAt: payload.linkedAt,
    evidenceIds: payload.evidenceIds,
    ...(state === "revoked"
      ? { revokedAt: payload.revokedAt as string }
      : {}),
  };
}

function sameLink(left: ContactActorLink, right: EnsureActiveContactActorLinkInput): boolean {
  return (
    left.ownerActorId === right.ownerActorId &&
    left.contactId === right.contactId &&
    left.linkedActorId === right.linkedActorId &&
    left.linkedAt === right.linkedAt &&
    left.state === "active" &&
    left.evidenceIds.length === right.evidenceIds.length &&
    left.evidenceIds.every((id, index) => id === right.evidenceIds[index])
  );
}

async function withOwnerLock<TResult>(
  store: object,
  workspaceId: string,
  ownerActorId: string,
  operation: () => Promise<TResult>,
): Promise<TResult> {
  let locks = ownerLocks.get(store);
  if (!locks) {
    locks = new Map();
    ownerLocks.set(store, locks);
  }

  const key = `${workspaceId}\u0000${ownerActorId}`;
  const previous = locks.get(key);
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(key, current);

  if (previous) {
    await previous;
  }

  try {
    return await operation();
  } finally {
    release();
    if (locks.get(key) === current) {
      locks.delete(key);
    }
    if (locks.size === 0) {
      ownerLocks.delete(store);
    }
  }
}

export function createStorageContactActorLinkProvider({
  store,
  workspaceId,
}: StorageContactActorLinkProviderOptions): ContactActorLinkProvider {
  async function listOwnerRecords(ownerActorId: string) {
    return store.listRecords({
      workspaceId,
      collectionName: CONTACT_ACTOR_LINK_COLLECTION,
      includeDeleted: true,
      userId: ownerActorId,
    });
  }

  return {
    async ensureActive(input) {
      assertInput(input);
      return withOwnerLock(
        store,
        workspaceId,
        input.ownerActorId,
        async () => {
          const id = recordId(input.ownerActorId, input.contactId);
          const existing = await store.getRecord({
            workspaceId,
            collectionName: CONTACT_ACTOR_LINK_COLLECTION,
            recordId: id,
            includeDeleted: true,
          });

          if (existing) {
            const existingLink = linkFromRecord(existing);
            if (existingLink.state === "revoked") {
              throw new Error("A revoked link history cannot be reactivated.");
            }
            if (sameLink(existingLink, input)) {
              return { state: "replayed", link: existingLink };
            }
            throw new Error("Contact is already linked to a different actor.");
          }

          const records = await listOwnerRecords(input.ownerActorId);
          for (const record of records) {
            const link = linkFromRecord(record);
            if (link.state !== "active") {
              continue;
            }
            if (link.contactId === input.contactId) {
              throw new Error("Contact is already linked to a different actor.");
            }
            if (link.linkedActorId === input.linkedActorId) {
              throw new Error("Actor is already linked to a different contact.");
            }
          }

          const link: ContactActorLink = {
            ownerActorId: input.ownerActorId,
            contactId: input.contactId,
            linkedActorId: input.linkedActorId,
            state: "active",
            linkedAt: input.linkedAt,
            evidenceIds: [...input.evidenceIds],
          };
          await store.upsertRecord({
            workspaceId,
            collectionName: CONTACT_ACTOR_LINK_COLLECTION,
            recordId: id,
            userId: input.ownerActorId,
            sourceType: "contact_actor_link",
            sourceId: id,
            provider: PROVIDER,
            providerRecordId: id,
            evidenceIds: [...input.evidenceIds],
            createdAt: input.linkedAt,
            updatedAt: input.linkedAt,
            lifecycleState: "active",
            payload: {
              contactId: input.contactId,
              evidenceIds: [...input.evidenceIds],
              linkedActorId: input.linkedActorId,
              linkedAt: input.linkedAt,
              state: "active",
            },
          });

          return { state: "created", link };
        }
      );
    },

    async listActiveForOwner(ownerActorId) {
      if (!nonEmptyString(ownerActorId)) {
        throw invalidLink();
      }
      const records = await listOwnerRecords(ownerActorId);
      return records
        .map(linkFromRecord)
        .filter((link) => link.state === "active");
    },
  };
}
