import type {
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  isRelationshipStage,
  isSourceType,
} from "../../../shared/domain/source-types";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export interface LiveBusinessCardScanOcrGraph {
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
}

export type LiveBusinessCardScanOcrProviderResult<TResult> =
  TResult | Promise<TResult>;

export interface LiveBusinessCardScanOcrProvider {
  source: string;
  sourceLabel: string;
  readBusinessCardScanOcrGraph: () => LiveBusinessCardScanOcrProviderResult<LiveBusinessCardScanOcrGraph>;
}

export const BUSINESS_CARD_SCAN_OCR_LIVE_RECORD_COLLECTIONS = {
  contacts: "contacts",
  evidence: "evidence",
} as const;

export interface StorageBusinessCardScanOcrProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageBusinessCardScanOcrProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => nonEmptyString(item))
    : [];
}

function evidenceIds(value: unknown): readonly [string, ...string[]] | null {
  const ids = stringArray(value);

  return ids.length > 0 ? [ids[0], ...ids.slice(1)] : null;
}

function sourceReference(value: unknown): ContactDTO["source"] | null {
  if (!isRecord(value) || !isSourceType(value.type) || !nonEmptyString(value.id)) {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    label: optionalString(value.label),
  };
}

function contactFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ContactDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.displayName) ||
    !isRelationshipStage(payload.stage) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    personId: optionalString(payload.personId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    location: optionalString(payload.location),
    primaryEmail: optionalString(payload.primaryEmail),
    primaryPhone: optionalString(payload.primaryPhone),
    profileSnippet: optionalString(payload.profileSnippet),
    stage: payload.stage,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function evidenceFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): RelationshipEvidenceDTO | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !isSourceType(payload.sourceType) ||
    !nonEmptyString(payload.sourceId) ||
    !nonEmptyString(payload.summary) ||
    !nonEmptyString(payload.occurredAt) ||
    typeof payload.confidence !== "number" ||
    !nonEmptyString(payload.createdBy)
  ) {
    return null;
  }

  return {
    id: payload.id,
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    summary: payload.summary,
    occurredAt: payload.occurredAt,
    confidence: payload.confidence,
    createdBy: payload.createdBy,
  };
}

function latestTimestamp(
  records: readonly LiveRecord<Record<string, unknown>>[],
): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter(nonEmptyString)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

async function listCollection(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  collectionName: string,
): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
  return store.listRecords({
    workspaceId,
    collectionName,
  });
}

export function createStorageBusinessCardScanOcrProvider({
  source,
  sourceLabel = "Business card scan OCR shared live storage",
  store,
  workspaceId,
}: StorageBusinessCardScanOcrProviderOptions): LiveBusinessCardScanOcrProvider {
  return {
    source: source ?? `live-record-store:business-card-scan-ocr:${workspaceId}`,
    sourceLabel,
    async readBusinessCardScanOcrGraph(): Promise<LiveBusinessCardScanOcrGraph> {
      const [contactRecords, evidenceRecords] = await Promise.all([
        listCollection(
          store,
          workspaceId,
          BUSINESS_CARD_SCAN_OCR_LIVE_RECORD_COLLECTIONS.contacts,
        ),
        listCollection(
          store,
          workspaceId,
          BUSINESS_CARD_SCAN_OCR_LIVE_RECORD_COLLECTIONS.evidence,
        ),
      ]);

      return {
        contacts: contactRecords
          .map(contactFromRecord)
          .filter((contact): contact is ContactDTO => contact !== null),
        evidence: evidenceRecords
          .map(evidenceFromRecord)
          .filter(
            (evidence): evidence is RelationshipEvidenceDTO =>
              evidence !== null,
          ),
        generatedAt: latestTimestamp([...contactRecords, ...evidenceRecords]),
      };
    },
  };
}

export function createConfiguredStorageBusinessCardScanOcrProvider({
  env,
  sourceLabel = "Business card scan OCR Postgres live storage",
}: ConfiguredStorageBusinessCardScanOcrProviderOptions = {}): LiveBusinessCardScanOcrProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStorageBusinessCardScanOcrProvider({
    source: `postgres-live-record-store:business-card-scan-ocr:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
