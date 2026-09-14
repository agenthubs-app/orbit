import { createHash } from "node:crypto";

import type {
  AccountLanguagePreferenceSaveContract,
  AccountLanguagePreferenceSaveReceiptContract,
  OrbitLanguagePreferenceContract,
} from "../../../shared/contract/account-language-preference";
import { parseOrbitLanguage } from "../../../shared/i18n/orbit-language";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import type { TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";

export const ACCOUNT_LANGUAGE_LIVE_RECORD_COLLECTIONS = {
  mutations: "account_language_preference_mutations",
  preferences: "account_language_preferences",
} as const;

export type AccountLanguagePreferenceProviderSaveResult =
  | { kind: "saved"; receipt: AccountLanguagePreferenceSaveReceiptContract }
  | { kind: "version-conflict" }
  | { kind: "mutation-reused" }
  | { kind: "unavailable" };

export interface AccountLanguagePreferenceProvider {
  read(actorId: string): Promise<OrbitLanguagePreferenceContract>;
  save(input: {
    actorId: string;
    mutation: AccountLanguagePreferenceSaveContract;
    updatedAt: string;
  }): Promise<AccountLanguagePreferenceProviderSaveResult>;
}

export interface StorageAccountLanguagePreferenceProviderOptions {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export class AccountLanguagePreferenceStorageError extends Error {
  constructor() {
    super("Account language preference storage record is invalid.");
  }
}

function recordIdForActor(actorId: string): string {
  return createHash("sha256").update(JSON.stringify(["account-language", actorId])).digest("hex");
}

function mutationRecordId(actorId: string, mutationId: string): string {
  return createHash("sha256").update(JSON.stringify(["account-language", actorId, mutationId])).digest("hex");
}

function fingerprint(input: AccountLanguagePreferenceSaveContract): string {
  return createHash("sha256").update(JSON.stringify([
    input.mode,
    input.language,
    input.expectedUpdatedAt,
    input.mutationId,
  ])).digest("hex");
}

function preferenceFromRecord(
  record: LiveRecord<Record<string, unknown>> | null,
  actorId: string,
): OrbitLanguagePreferenceContract | null {
  if (!record || record.lifecycleState === "deleted") return null;
  if (record.lifecycleState !== "active") throw new AccountLanguagePreferenceStorageError();
  if (record.userId !== actorId || record.payload.actorId !== actorId) {
    throw new AccountLanguagePreferenceStorageError();
  }
  const mode = record.payload.mode;
  const language = parseOrbitLanguage(
    typeof record.payload.language === "string" ? record.payload.language : null,
  );
  const updatedAt = record.payload.updatedAt;
  if (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) return null;
  if (mode === "system" && record.payload.language === null) {
    return { mode: "system", language: null, updatedAt };
  }
  if (mode === "manual" && language) {
    return { mode: "manual", language, updatedAt };
  }
  throw new AccountLanguagePreferenceStorageError();
}

function nextVersion(requested: string, current: string | null): string {
  if (!current || Date.parse(requested) > Date.parse(current)) return requested;
  return new Date(Date.parse(current) + 1).toISOString();
}

export function createStorageAccountLanguagePreferenceProvider({
  store,
  workspaceId,
}: StorageAccountLanguagePreferenceProviderOptions): AccountLanguagePreferenceProvider {
  async function read(actorId: string): Promise<OrbitLanguagePreferenceContract> {
    const record = await store.getRecord({
      collectionName: ACCOUNT_LANGUAGE_LIVE_RECORD_COLLECTIONS.preferences,
      includeDeleted: true,
      recordId: recordIdForActor(actorId),
      workspaceId,
    });
    return preferenceFromRecord(record, actorId) ?? {
      mode: "system",
      language: null,
      updatedAt: null,
    };
  }

  return {
    read,
    async save({ actorId, mutation, updatedAt }) {
      const receiptId = mutationRecordId(actorId, mutation.mutationId);
      const existingReceipt = await store.getRecord({
        collectionName: ACCOUNT_LANGUAGE_LIVE_RECORD_COLLECTIONS.mutations,
        includeDeleted: true,
        recordId: receiptId,
        workspaceId,
      });
      if (existingReceipt) {
        if (
          existingReceipt.userId !== actorId
          || existingReceipt.payload.actorId !== actorId
          || existingReceipt.payload.fingerprint !== fingerprint(mutation)
        ) {
          return { kind: "mutation-reused" };
        }
        const receipt = existingReceipt.payload.receipt as
          | AccountLanguagePreferenceSaveReceiptContract
          | undefined;
        return receipt ? { kind: "saved", receipt } : { kind: "unavailable" };
      }

      const current = await read(actorId);
      if (current.updatedAt !== mutation.expectedUpdatedAt) {
        return { kind: "version-conflict" };
      }
      const version = nextVersion(updatedAt, current.updatedAt);
      const preference: OrbitLanguagePreferenceContract = mutation.mode === "manual"
        ? { mode: "manual", language: mutation.language!, updatedAt: version }
        : { mode: "system", language: null, updatedAt: version };
      const receipt: AccountLanguagePreferenceSaveReceiptContract = {
        ...preference,
        mutationId: mutation.mutationId,
      };
      const preferenceRecordId = recordIdForActor(actorId);
      await store.upsertRecord({
        collectionName: ACCOUNT_LANGUAGE_LIVE_RECORD_COLLECTIONS.preferences,
        createdAt: current.updatedAt ?? version,
        evidenceIds: [],
        lifecycleState: "active",
        payload: { actorId, ...preference },
        recordId: preferenceRecordId,
        searchText: "",
        sourceId: `account-language:${preferenceRecordId}`,
        sourceType: "manual",
        targetId: actorId,
        targetType: "account",
        updatedAt: version,
        userId: actorId,
        workspaceId,
      });
      await store.upsertRecord({
        collectionName: ACCOUNT_LANGUAGE_LIVE_RECORD_COLLECTIONS.mutations,
        createdAt: version,
        evidenceIds: [],
        lifecycleState: "active",
        payload: {
          actorId,
          fingerprint: fingerprint(mutation),
          receipt,
        },
        recordId: receiptId,
        searchText: "",
        sourceId: `account-language-mutation:${receiptId}`,
        sourceType: "manual",
        targetId: actorId,
        targetType: "account",
        updatedAt: version,
        userId: actorId,
        workspaceId,
      });
      return { kind: "saved", receipt };
    },
  };
}

export function createTransactionalStorageAccountLanguagePreferenceProvider({
  client,
  workspaceId,
}: {
  client: TransactionalPostgresClient;
  workspaceId: string;
}): AccountLanguagePreferenceProvider {
  const readStore = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  return {
    read: createStorageAccountLanguagePreferenceProvider({ store: readStore, workspaceId }).read,
    async save(input) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await client.transaction(async (transaction) => {
            await transaction.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
              JSON.stringify(["account-language", workspaceId, input.actorId]),
            ]);
            return createStorageAccountLanguagePreferenceProvider({
              store: createPostgresLiveRecordStore({ client: transaction }),
              workspaceId,
            }).save(input);
          });
        } catch (error) {
          const code = error && typeof error === "object" && "code" in error
            ? error.code
            : null;
          if ((code === "40001" || code === "40P01") && attempt < 2) continue;
          return { kind: "unavailable" };
        }
      }
      return { kind: "unavailable" };
    },
  };
}
