import type { ContactDTO } from "../../../shared/domain/contracts";
import {
  isRelationshipStage,
  isSourceType,
} from "../../../shared/domain/source-types";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type { BusinessCardContactWriteProvider } from "../contact-write-contract";

export interface StorageBusinessCardContactWriteProviderOptions {
  recordProvider?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredBusinessCardContactWriteProviderOptions {
  env?: LiveDatabaseEnv;
  recordProvider?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value : undefined;
}

function contactFromRecord(
  record: LiveRecord<Record<string, unknown>> | null,
): ContactDTO | null {
  if (!record) {
    return null;
  }

  const payload = record.payload;
  const source = payload.source;
  const evidenceIds = Array.isArray(payload.evidenceIds)
    ? payload.evidenceIds.filter(
        (evidenceId): evidenceId is string => nonEmptyString(evidenceId),
      )
    : [];

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.displayName) ||
    !isRelationshipStage(payload.stage) ||
    !isRecord(source) ||
    !isSourceType(source.type) ||
    !nonEmptyString(source.id) ||
    evidenceIds.length === 0 ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    primaryEmail: optionalString(payload.primaryEmail),
    primaryPhone: optionalString(payload.primaryPhone),
    profileSnippet: optionalString(payload.profileSnippet),
    stage: payload.stage,
    source: {
      id: source.id,
      label: optionalString(source.label),
      type: source.type,
    },
    evidenceIds: evidenceIds as [string, ...string[]],
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function belongsToActor(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): boolean {
  return (
    record.userId === actorId ||
    record.payload.accountId === actorId
  );
}

export function createStorageBusinessCardContactWriteProvider({
  recordProvider = "orbit-business-card-contact-write",
  store,
  workspaceId,
}: StorageBusinessCardContactWriteProviderOptions): BusinessCardContactWriteProvider {
  return {
    async getContact(contactId, actorId) {
      const record = await store.getRecord({
          collectionName: "contacts",
          recordId: contactId,
          workspaceId,
        });

      return record && belongsToActor(record, actorId)
        ? contactFromRecord(record)
        : null;
    },

    async listContacts(actorId) {
      const records = await store.listRecords({
        collectionName: "contacts",
        lifecycleState: "active",
        workspaceId,
      });

      return records
        .filter((record) => belongsToActor(record, actorId))
        .map((record) => contactFromRecord(record))
        .filter((contact): contact is ContactDTO => contact !== null);
    },

    async saveContact(contact, actorId) {
      const record: LiveRecord<Record<string, unknown>> = {
        collectionName: "contacts",
        createdAt: contact.createdAt,
        evidenceIds: contact.evidenceIds,
        lifecycleState: "active",
        occurredAt: contact.createdAt,
        payload: contact as unknown as Record<string, unknown>,
        provider: recordProvider,
        providerRecordId: contact.id,
        recordId: contact.id,
        searchText: [
          contact.displayName,
          contact.organization,
          contact.role,
          contact.primaryEmail,
          contact.primaryPhone,
          contact.profileSnippet,
        ]
          .filter(Boolean)
          .join(" "),
        sourceId: contact.source.id,
        sourceLabel: contact.source.label,
        sourceType: contact.source.type,
        targetId: contact.id,
        targetType: "contact",
        updatedAt: contact.updatedAt,
        userId: actorId,
        workspaceId,
      };
      const saved = await store.upsertRecord(record);

      return contactFromRecord(saved) ?? contact;
    },
  };
}

export function createConfiguredStorageBusinessCardContactWriteProvider({
  env,
  recordProvider,
}: ConfiguredBusinessCardContactWriteProviderOptions = {}): BusinessCardContactWriteProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({ env });

  if (!configuredStore) {
    return null;
  }

  return createStorageBusinessCardContactWriteProvider({
    recordProvider,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
