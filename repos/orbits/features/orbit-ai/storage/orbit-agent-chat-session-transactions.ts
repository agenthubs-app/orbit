import { createHash } from "node:crypto";

import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
  type LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type { TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";

const GROUP_COLLECTION = "orbit_agent_chat_groups";
const ORGANIZATION_COLLECTION = "orbit_agent_chat_session_organizations";
const MAX_GROUP_NAME_LENGTH = 80;
const MAX_CUSTOM_TITLE_LENGTH = 120;

export interface OrbitAgentChatSessionOrganization {
  customTitle: string | null;
  groupId: string | null;
  pinned: boolean;
  revision: number;
}

export interface OrbitAgentChatSessionGroup {
  createdAt: string;
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
}

export type SessionOrganizationPatch = Partial<
  Pick<OrbitAgentChatSessionOrganization, "customTitle" | "groupId" | "pinned">
>;

export class OrbitAgentChatOrganizationError extends Error {
  constructor(
    readonly code:
      | "GROUP_DELETED"
      | "GROUP_NOT_FOUND"
      | "MUTATION_ID_REUSED"
      | "REVISION_CONFLICT"
      | "VALIDATION_ERROR",
  ) {
    super(
      code === "GROUP_DELETED"
        ? "Deleted group cannot be changed"
        : code === "GROUP_NOT_FOUND"
          ? "Session group was not found"
          : code === "MUTATION_ID_REUSED"
            ? "Mutation ID was already used for different input"
            : code === "REVISION_CONFLICT"
              ? "Organization changed on another client"
              : "Invalid session organization mutation",
    );
  }
}

export interface OrbitAgentChatOrganizationStore {
  createGroup(input: {
    id: string;
    mutationId: string;
    name: string;
  }): Promise<OrbitAgentChatSessionGroup>;
  deleteGroup(
    groupId: string,
    input: { expectedRevision: number; mutationId: string },
  ): Promise<{ deleted: true; id: string; ungroupedCount: number }>;
  getGroup(groupId: string): Promise<OrbitAgentChatSessionGroup | null>;
  getSessionOrganization(
    sessionId: string,
  ): Promise<OrbitAgentChatSessionOrganization>;
  listGroups(): Promise<readonly OrbitAgentChatSessionGroup[]>;
  listSessionOrganizations(
    sessionIds?: readonly string[],
  ): Promise<ReadonlyMap<string, OrbitAgentChatSessionOrganization>>;
  mutateGroup(
    groupId: string,
    input: { expectedRevision: number; mutationId: string; name: string },
  ): Promise<OrbitAgentChatSessionGroup>;
  mutateSessionOrganization(
    sessionId: string,
    input: {
      expectedRevision: number;
      mutationId: string;
      patch: SessionOrganizationPatch;
    },
  ): Promise<OrbitAgentChatSessionOrganization>;
}

type OrganizationRecord = LiveRecord<Record<string, unknown>>;
type TransactionRunner = <T>(
  operation: (store: LiveRecordStoreLike<Record<string, unknown>>) => Promise<T>,
) => Promise<T>;

function cleanIdentifier(value: string): string {
  const clean = value.trim();
  if (!clean || clean.length > 160) {
    throw new OrbitAgentChatOrganizationError("VALIDATION_ERROR");
  }
  return clean;
}

function cleanName(value: string): string {
  const clean = value.trim();
  if (!clean || clean.length > MAX_GROUP_NAME_LENGTH) {
    throw new OrbitAgentChatOrganizationError("VALIDATION_ERROR");
  }
  return clean;
}

function cleanCustomTitle(value: string | null): string | null {
  if (value === null) return null;
  const clean = value.trim();
  if (!clean || clean.length > MAX_CUSTOM_TITLE_LENGTH) {
    throw new OrbitAgentChatOrganizationError("VALIDATION_ERROR");
  }
  return clean;
}

function requireRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new OrbitAgentChatOrganizationError("VALIDATION_ERROR");
  }
  return value;
}

function recordId(actorId: string, kind: string, id: string): string {
  return createHash("sha256")
    .update(JSON.stringify([actorId, kind, id]))
    .digest("hex");
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function defaultOrganization(): OrbitAgentChatSessionOrganization {
  return { customTitle: null, groupId: null, pinned: false, revision: 0 };
}

function organizationFromRecord(
  record: OrganizationRecord | null,
): OrbitAgentChatSessionOrganization {
  if (!record || record.lifecycleState === "deleted") return defaultOrganization();
  return {
    customTitle:
      typeof record.payload.customTitle === "string"
        ? record.payload.customTitle
        : null,
    groupId:
      typeof record.payload.groupId === "string" ? record.payload.groupId : null,
    pinned: record.payload.pinned === true,
    revision:
      typeof record.payload.revision === "number" ? record.payload.revision : 0,
  };
}

function groupFromRecord(record: OrganizationRecord | null): OrbitAgentChatSessionGroup | null {
  if (!record || record.lifecycleState === "deleted") return null;
  const { payload } = record;
  if (
    typeof payload.id !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.revision !== "number"
  ) {
    return null;
  }
  return {
    createdAt:
      typeof payload.createdAt === "string" ? payload.createdAt : record.createdAt,
    id: payload.id,
    name: payload.name,
    revision: payload.revision,
    updatedAt:
      typeof payload.updatedAt === "string" ? payload.updatedAt : record.updatedAt,
  };
}

function storedRecord(input: {
  actorId: string;
  collectionName: string;
  createdAt: string;
  id: string;
  payload: Record<string, unknown>;
  recordId: string;
  updatedAt: string;
  workspaceId: string;
}): OrganizationRecord {
  return {
    collectionName: input.collectionName,
    createdAt: input.createdAt,
    evidenceIds: [],
    lifecycleState: "active",
    payload: input.payload,
    recordId: input.recordId,
    searchText: "",
    sourceId: `orbit-agent-organization:${input.id}`,
    sourceType: "manual",
    updatedAt: input.updatedAt,
    userId: input.actorId,
    workspaceId: input.workspaceId,
  };
}

function assertReplay(
  record: OrganizationRecord,
  mutationId: string,
  mutationFingerprint: string,
): boolean {
  if (record.payload.lastMutationId !== mutationId) return false;
  if (record.payload.lastMutationFingerprint !== mutationFingerprint) {
    throw new OrbitAgentChatOrganizationError("MUTATION_ID_REUSED");
  }
  return true;
}

export function createOrbitAgentChatOrganizationStore(input: {
  actorId: string;
  now?: () => string;
  runTransaction: TransactionRunner;
  workspaceId: string;
}): OrbitAgentChatOrganizationStore {
  const actorId = cleanIdentifier(input.actorId);
  const now = input.now ?? (() => new Date().toISOString());
  const groupRecordId = (id: string) => recordId(actorId, "group", id);
  const organizationRecordId = (id: string) =>
    recordId(actorId, "session-organization", id);

  async function readRecord(
    store: LiveRecordStoreLike<Record<string, unknown>>,
    collectionName: string,
    id: string,
  ) {
    const record = await store.getRecord({
      collectionName,
      includeDeleted: true,
      recordId: id,
      workspaceId: input.workspaceId,
    });
    return record?.userId === actorId ? record : null;
  }

  async function read<T>(
    operation: (store: LiveRecordStoreLike<Record<string, unknown>>) => Promise<T>,
  ): Promise<T> {
    return input.runTransaction(operation);
  }

  return {
    createGroup(groupInput) {
      const id = cleanIdentifier(groupInput.id);
      const mutationId = cleanIdentifier(groupInput.mutationId);
      const name = cleanName(groupInput.name);
      const mutationFingerprint = fingerprint({ id, name });
      return input.runTransaction(async (store) => {
        const idForRecord = groupRecordId(id);
        const existing = await readRecord(store, GROUP_COLLECTION, idForRecord);
        if (existing) {
          if (assertReplay(existing, mutationId, mutationFingerprint)) {
            const replay = groupFromRecord(existing);
            if (replay) return replay;
          }
          throw new OrbitAgentChatOrganizationError(
            existing.lifecycleState === "deleted" ? "GROUP_DELETED" : "REVISION_CONFLICT",
          );
        }
        const at = now();
        const group: OrbitAgentChatSessionGroup = {
          createdAt: at,
          id,
          name,
          revision: 1,
          updatedAt: at,
        };
        await store.upsertRecord(
          storedRecord({
            actorId,
            collectionName: GROUP_COLLECTION,
            createdAt: at,
            id,
            payload: {
              ...group,
              lastMutationFingerprint: mutationFingerprint,
              lastMutationId: mutationId,
            },
            recordId: idForRecord,
            updatedAt: at,
            workspaceId: input.workspaceId,
          }),
        );
        return group;
      });
    },

    deleteGroup(groupIdInput, mutationInput) {
      const groupId = cleanIdentifier(groupIdInput);
      const mutationId = cleanIdentifier(mutationInput.mutationId);
      const expectedRevision = requireRevision(mutationInput.expectedRevision);
      const mutationFingerprint = fingerprint({ expectedRevision, groupId });
      return input.runTransaction(async (store) => {
        const idForRecord = groupRecordId(groupId);
        const existing = await readRecord(store, GROUP_COLLECTION, idForRecord);
        if (!existing) throw new OrbitAgentChatOrganizationError("GROUP_NOT_FOUND");
        if (assertReplay(existing, mutationId, mutationFingerprint)) {
          return existing.payload.lastMutationResult as {
            deleted: true;
            id: string;
            ungroupedCount: number;
          };
        }
        if (existing.lifecycleState === "deleted") {
          throw new OrbitAgentChatOrganizationError("GROUP_DELETED");
        }
        const group = groupFromRecord(existing);
        if (!group) throw new OrbitAgentChatOrganizationError("GROUP_NOT_FOUND");
        if (group.revision !== expectedRevision) {
          throw new OrbitAgentChatOrganizationError("REVISION_CONFLICT");
        }
        const organizations = await store.listRecords({
          collectionName: ORGANIZATION_COLLECTION,
          userId: actorId,
          workspaceId: input.workspaceId,
        });
        const matching = organizations.filter(
          (record) => record.payload.groupId === groupId,
        );
        const at = now();
        for (const record of matching) {
          await store.upsertRecord({
              ...record,
              payload: {
                ...record.payload,
                groupId: null,
                revision:
                  (typeof record.payload.revision === "number"
                    ? record.payload.revision
                    : 0) + 1,
                updatedAt: at,
              },
              updatedAt: at,
            });
        }
        const result = {
          deleted: true as const,
          id: groupId,
          ungroupedCount: matching.length,
        };
        await store.upsertRecord({
          ...existing,
          deletedAt: at,
          lifecycleState: "deleted",
          payload: {
            ...existing.payload,
            lastMutationFingerprint: mutationFingerprint,
            lastMutationId: mutationId,
            lastMutationResult: result,
          },
          updatedAt: at,
        });
        return result;
      });
    },

    getGroup(groupIdInput) {
      const groupId = cleanIdentifier(groupIdInput);
      return read(async (store) =>
        groupFromRecord(
          await readRecord(store, GROUP_COLLECTION, groupRecordId(groupId)),
        ),
      );
    },

    getSessionOrganization(sessionIdInput) {
      const sessionId = cleanIdentifier(sessionIdInput);
      return read(async (store) =>
        organizationFromRecord(
          await readRecord(
            store,
            ORGANIZATION_COLLECTION,
            organizationRecordId(sessionId),
          ),
        ),
      );
    },

    listGroups() {
      return read(async (store) => {
        const records = await store.listRecords({
          collectionName: GROUP_COLLECTION,
          userId: actorId,
          workspaceId: input.workspaceId,
        });
        return records
          .flatMap((record) => {
            const group = groupFromRecord(record);
            return group ? [group] : [];
          })
          .sort(
            (left, right) =>
              right.updatedAt.localeCompare(left.updatedAt) ||
              left.id.localeCompare(right.id),
          );
      });
    },

    listSessionOrganizations(sessionIds) {
      const requested = sessionIds?.map(cleanIdentifier);
      return read(async (store) => {
        const records = await store.listRecords({
          collectionName: ORGANIZATION_COLLECTION,
          recordIds: requested?.map(organizationRecordId),
          userId: actorId,
          workspaceId: input.workspaceId,
        });
        const result = new Map<string, OrbitAgentChatSessionOrganization>();
        for (const record of records) {
          if (typeof record.payload.sessionId === "string") {
            result.set(record.payload.sessionId, organizationFromRecord(record));
          }
        }
        return result;
      });
    },

    mutateGroup(groupIdInput, mutationInput) {
      const groupId = cleanIdentifier(groupIdInput);
      const mutationId = cleanIdentifier(mutationInput.mutationId);
      const expectedRevision = requireRevision(mutationInput.expectedRevision);
      const name = cleanName(mutationInput.name);
      const mutationFingerprint = fingerprint({ expectedRevision, groupId, name });
      return input.runTransaction(async (store) => {
        const idForRecord = groupRecordId(groupId);
        const existing = await readRecord(store, GROUP_COLLECTION, idForRecord);
        if (!existing) throw new OrbitAgentChatOrganizationError("GROUP_NOT_FOUND");
        if (assertReplay(existing, mutationId, mutationFingerprint)) {
          const replay = groupFromRecord(existing);
          if (replay) return replay;
        }
        if (existing.lifecycleState === "deleted") {
          throw new OrbitAgentChatOrganizationError("GROUP_DELETED");
        }
        const current = groupFromRecord(existing);
        if (!current) throw new OrbitAgentChatOrganizationError("GROUP_NOT_FOUND");
        if (current.revision !== expectedRevision) {
          throw new OrbitAgentChatOrganizationError("REVISION_CONFLICT");
        }
        const at = now();
        const next = { ...current, name, revision: current.revision + 1, updatedAt: at };
        await store.upsertRecord({
          ...existing,
          payload: {
            ...existing.payload,
            ...next,
            lastMutationFingerprint: mutationFingerprint,
            lastMutationId: mutationId,
          },
          updatedAt: at,
        });
        return next;
      });
    },

    mutateSessionOrganization(sessionIdInput, mutationInput) {
      const sessionId = cleanIdentifier(sessionIdInput);
      const mutationId = cleanIdentifier(mutationInput.mutationId);
      const expectedRevision = requireRevision(mutationInput.expectedRevision);
      const patch: SessionOrganizationPatch = {};
      if ("customTitle" in mutationInput.patch) {
        patch.customTitle = cleanCustomTitle(mutationInput.patch.customTitle ?? null);
      }
      if ("groupId" in mutationInput.patch) {
        patch.groupId =
          mutationInput.patch.groupId === null
            ? null
            : cleanIdentifier(mutationInput.patch.groupId ?? "");
      }
      if ("pinned" in mutationInput.patch) {
        if (typeof mutationInput.patch.pinned !== "boolean") {
          throw new OrbitAgentChatOrganizationError("VALIDATION_ERROR");
        }
        patch.pinned = mutationInput.patch.pinned;
      }
      if (Object.keys(patch).length === 0) {
        throw new OrbitAgentChatOrganizationError("VALIDATION_ERROR");
      }
      const mutationFingerprint = fingerprint({ expectedRevision, patch, sessionId });
      return input.runTransaction(async (store) => {
        if (patch.groupId !== undefined && patch.groupId !== null) {
          const group = groupFromRecord(
            await readRecord(store, GROUP_COLLECTION, groupRecordId(patch.groupId)),
          );
          if (!group) throw new OrbitAgentChatOrganizationError("GROUP_NOT_FOUND");
        }
        const idForRecord = organizationRecordId(sessionId);
        const existing = await readRecord(
          store,
          ORGANIZATION_COLLECTION,
          idForRecord,
        );
        if (existing && assertReplay(existing, mutationId, mutationFingerprint)) {
          return organizationFromRecord(existing);
        }
        const current = organizationFromRecord(existing);
        if (current.revision !== expectedRevision) {
          throw new OrbitAgentChatOrganizationError("REVISION_CONFLICT");
        }
        const at = now();
        const next: OrbitAgentChatSessionOrganization = {
          ...current,
          ...patch,
          revision: current.revision + 1,
        };
        await store.upsertRecord(
          storedRecord({
            actorId,
            collectionName: ORGANIZATION_COLLECTION,
            createdAt: existing?.createdAt ?? at,
            id: sessionId,
            payload: {
              ...next,
              lastMutationFingerprint: mutationFingerprint,
              lastMutationId: mutationId,
              sessionId,
              updatedAt: at,
            },
            recordId: idForRecord,
            updatedAt: at,
            workspaceId: input.workspaceId,
          }),
        );
        return next;
      });
    },
  };
}

function createSerializedMemoryRunner(input: {
  beforeCommit?: (() => void) | undefined;
  store: LiveRecordStoreLike<Record<string, unknown>>;
}): TransactionRunner {
  let queue = Promise.resolve();
  return async <T>(operation: (store: LiveRecordStoreLike<Record<string, unknown>>) => Promise<T>) => {
    let release!: () => void;
    const previous = queue;
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const seed = (
        await Promise.all(
          [GROUP_COLLECTION, ORGANIZATION_COLLECTION].map((collectionName) =>
            input.store.listRecords({
              collectionName,
              includeDeleted: true,
              workspaceId: "__all__",
            }),
          ),
        )
      ).flat();
      // Stores cannot list all workspaces, so transactions track writes in an overlay.
      const writes = new Map<string, OrganizationRecord>();
      const overlay: LiveRecordStoreLike<Record<string, unknown>> = {
        async deleteRecord(query) {
          const current = await overlay.getRecord({ ...query, includeDeleted: true });
          if (!current) return null;
          const deleted = {
            ...current,
            deletedAt: query.deletedAt,
            lifecycleState: "deleted" as const,
            updatedAt: query.deletedAt,
          };
          writes.set(`${query.workspaceId}\u0000${query.collectionName}\u0000${query.recordId}`, deleted);
          return deleted;
        },
        async getRecord(query) {
          const key = `${query.workspaceId}\u0000${query.collectionName}\u0000${query.recordId}`;
          const record = writes.get(key) ?? (await input.store.getRecord({ ...query, includeDeleted: true }));
          return !record || (record.lifecycleState === "deleted" && !query.includeDeleted)
            ? null
            : record;
        },
        async listRecords(query) {
          const base = await input.store.listRecords({ ...query, includeDeleted: true });
          const merged = new Map(base.map((record) => [
            `${record.workspaceId}\u0000${record.collectionName}\u0000${record.recordId}`,
            record,
          ]));
          for (const [key, record] of writes) {
            if (record.workspaceId === query.workspaceId) merged.set(key, record);
          }
          return createMemoryLiveRecordStore([...seed, ...merged.values()]).listRecords(query);
        },
        async upsertRecord(record) {
          writes.set(
            `${record.workspaceId}\u0000${record.collectionName}\u0000${record.recordId}`,
            record,
          );
          return record;
        },
      };
      const result = await operation(overlay);
      input.beforeCommit?.();
      for (const record of writes.values()) await input.store.upsertRecord(record);
      return result;
    } finally {
      release();
    }
  };
}

export function createMemoryOrbitAgentChatOrganizationStore(input: {
  actorId: string;
  beforeCommit?: (() => void) | undefined;
  now?: () => string;
  store?: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): OrbitAgentChatOrganizationStore {
  const store = input.store ?? createMemoryLiveRecordStore<Record<string, unknown>>();
  return createOrbitAgentChatOrganizationStore({
    actorId: input.actorId,
    now: input.now,
    runTransaction: createSerializedMemoryRunner({
      beforeCommit: input.beforeCommit,
      store,
    }),
    workspaceId: input.workspaceId,
  });
}

export function createTransactionalOrbitAgentChatOrganizationStore(input: {
  actorId: string;
  client: TransactionalPostgresClient;
  now?: () => string;
  workspaceId: string;
}): OrbitAgentChatOrganizationStore {
  const actorId = cleanIdentifier(input.actorId);
  return createOrbitAgentChatOrganizationStore({
    actorId,
    now: input.now,
    runTransaction: async (operation) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await input.client.transaction(async (transaction) => {
            await transaction.query(
              "select pg_advisory_xact_lock(hashtextextended($1, 0))",
              [JSON.stringify(["orbit-agent-organization", input.workspaceId, actorId])],
            );
            return operation(
              createPostgresLiveRecordStore<Record<string, unknown>>({
                client: transaction,
              }),
            );
          });
        } catch (error) {
          const code =
            error && typeof error === "object" && "code" in error
              ? error.code
              : null;
          if ((code === "40001" || code === "40P01") && attempt < 2) continue;
          throw error;
        }
      }
      throw new Error("Orbit Agent organization transaction retry exhausted");
    },
    workspaceId: input.workspaceId,
  });
}
