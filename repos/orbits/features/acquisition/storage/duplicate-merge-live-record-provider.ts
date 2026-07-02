import type {
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  createConfiguredPostgresLiveRecordStore,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { createStorageContactGraphProvider } from "../../contacts/storage/contact-live-record-provider";
import type { ContactAcquisitionDraft } from "../contract";
import { createLiveContactAcquisitionDraftService } from "../live-service";
import { createStorageContactAcquisitionDraftProvider } from "./contact-draft-live-record-provider";

export interface LiveDuplicateMergeGraph {
  contactDrafts: readonly ContactAcquisitionDraft[];
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
}

export type LiveDuplicateMergeProviderResult<TResult> =
  TResult | Promise<TResult>;

export interface LiveDuplicateMergeProvider {
  source: string;
  sourceLabel: string;
  readDuplicateMergeGraph: () => LiveDuplicateMergeProviderResult<LiveDuplicateMergeGraph>;
}

export interface StorageDuplicateMergeProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageDuplicateMergeProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

function latestTimestamp(values: readonly string[]): string {
  return (
    values
      .filter((value) => value.trim().length > 0)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

export function createStorageDuplicateMergeProvider({
  source,
  sourceLabel = "Duplicate merge shared live storage",
  store,
  workspaceId,
}: StorageDuplicateMergeProviderOptions): LiveDuplicateMergeProvider {
  const draftProvider = createStorageContactAcquisitionDraftProvider({
    source: `live-record-store:duplicate-merge-drafts:${workspaceId}`,
    sourceLabel,
    store,
    workspaceId,
  });
  const contactProvider = createStorageContactGraphProvider({
    source: `live-record-store:duplicate-merge-contacts:${workspaceId}`,
    sourceLabel,
    store,
    workspaceId,
  });
  const draftService = createLiveContactAcquisitionDraftService({
    provider: draftProvider,
  });

  return {
    source: source ?? `live-record-store:duplicate-merge:${workspaceId}`,
    sourceLabel,
    async readDuplicateMergeGraph(): Promise<LiveDuplicateMergeGraph> {
      const [draftResult, contactGraph] = await Promise.all([
        draftService.listContactDrafts(),
        contactProvider.readContactGraph(),
      ]);
      const contactDrafts =
        draftResult.success === true ? draftResult.data.drafts : [];

      return {
        contactDrafts,
        contacts: contactGraph.contacts,
        evidence: contactGraph.evidence,
        generatedAt: latestTimestamp([
          draftResult.success === true
            ? draftResult.data.provenance.collectedAt
            : new Date(0).toISOString(),
          contactGraph.generatedAt,
        ]),
      };
    },
  };
}

export function createConfiguredStorageDuplicateMergeProvider({
  env,
  sourceLabel = "Duplicate merge Postgres live storage",
}: ConfiguredStorageDuplicateMergeProviderOptions = {}): LiveDuplicateMergeProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStorageDuplicateMergeProvider({
    source: `postgres-live-record-store:duplicate-merge:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
