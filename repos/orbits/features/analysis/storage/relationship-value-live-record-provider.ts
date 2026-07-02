import {
  createConfiguredStorageConnectionEvidenceProvider,
  createStorageConnectionEvidenceProvider,
  type ConfiguredStorageConnectionEvidenceProviderOptions,
  type LiveConnectionEvidenceGraph,
  type StorageConnectionEvidenceProviderOptions,
} from "../../connections/storage/connection-live-record-provider";

export interface LiveRelationshipValueProvider {
  source: string;
  sourceLabel: string;
  readRelationshipGraph: () =>
    | LiveConnectionEvidenceGraph
    | Promise<LiveConnectionEvidenceGraph>;
  readRelationshipGraphForConnection?: (
    connectionId: string,
  ) => LiveConnectionEvidenceGraph | Promise<LiveConnectionEvidenceGraph>;
}

export type StorageRelationshipValueProviderOptions =
  StorageConnectionEvidenceProviderOptions;

export type ConfiguredStorageRelationshipValueProviderOptions =
  ConfiguredStorageConnectionEvidenceProviderOptions;

export function createStorageRelationshipValueProvider({
  source,
  sourceLabel = "Relationship value shared live storage",
  store,
  workspaceId,
}: StorageRelationshipValueProviderOptions): LiveRelationshipValueProvider {
  const provider = createStorageConnectionEvidenceProvider({
    source: source ?? `live-record-store:relationship-value:${workspaceId}`,
    sourceLabel,
    store,
    workspaceId,
  });

  return {
    source: provider.source,
    sourceLabel: provider.sourceLabel,
    readRelationshipGraph: () => provider.readConnectionEvidenceGraph(),
    readRelationshipGraphForConnection: (connectionId) =>
      provider.readConnectionEvidenceGraphForConnection
        ? provider.readConnectionEvidenceGraphForConnection(connectionId)
        : provider.readConnectionEvidenceGraph(),
  };
}

export function createConfiguredStorageRelationshipValueProvider({
  env,
  sourceLabel = "Relationship value Postgres live storage",
}: ConfiguredStorageRelationshipValueProviderOptions = {}): LiveRelationshipValueProvider | null {
  const provider = createConfiguredStorageConnectionEvidenceProvider({
    env,
    sourceLabel,
  });

  if (!provider) {
    return null;
  }

  return {
    source: provider.source.replace(
      "postgres-live-record-store:connections:",
      "postgres-live-record-store:relationship-value:",
    ),
    sourceLabel: provider.sourceLabel,
    readRelationshipGraph: () => provider.readConnectionEvidenceGraph(),
    readRelationshipGraphForConnection: (connectionId) =>
      provider.readConnectionEvidenceGraphForConnection
        ? provider.readConnectionEvidenceGraphForConnection(connectionId)
        : provider.readConnectionEvidenceGraph(),
  };
}
