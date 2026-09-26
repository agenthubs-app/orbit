import {
  createConfiguredStorageDashboardAggregateProvider,
  createStorageDashboardAggregateProvider,
  type ConfiguredStorageDashboardAggregateProviderOptions,
  type LiveDashboardGraph,
  type StorageDashboardAggregateProviderOptions,
} from "./dashboard-live-record-provider";

export interface LiveNetworkDistributionAnalyticsProvider {
  source: string;
  sourceLabel: string;
  readNetworkDistributionGraph: () =>
    | LiveDashboardGraph
    | Promise<LiveDashboardGraph>;
  /** Sprint 0101: grouped distribution rows computed in SQL (no full-graph read). */
  readNetworkDistributionReadModel?: () => Promise<NetworkDistributionReadModel>;
}

export type NetworkStructureDimensionKey = "industry" | "location" | "role" | "relationship";

/**
 * Grouped rows behind /api/dashboard/distributions. Positions are the graph
 * order (contact graph position, evidence ordinal) so the service can merge raw
 * groups (location aliases, role categories) exactly like the JS grouping.
 */
export interface NetworkDistributionReadModel {
  generatedAt: string;
  contactsCount: number;
  connectionsCount: number;
  structureGroups: readonly {
    dimension: NetworkStructureDimensionKey;
    key: string | null;
    count: number;
    firstPosition: number;
    firstMissing: boolean;
  }[];
  structureEvidence: readonly {
    dimension: NetworkStructureDimensionKey;
    key: string | null;
    evidenceId: string;
    position: readonly number[];
  }[];
  industryOrganizations: readonly { key: string | null; organization: string; count: number }[];
  industrySources: readonly { key: string | null; type: string; id: string; label: string | null }[];
  valueTypes: readonly {
    valueType: string;
    count: number;
    exampleConnectionIds: readonly string[];
    evidenceIds: readonly string[];
  }[];
  strengths: readonly { strength: string; count: number; evidenceIds: readonly string[] }[];
  provenanceEvidenceIds: readonly string[];
}

export type StorageNetworkDistributionAnalyticsProviderOptions =
  StorageDashboardAggregateProviderOptions;

export type ConfiguredStorageNetworkDistributionAnalyticsProviderOptions =
  ConfiguredStorageDashboardAggregateProviderOptions;

export function createStorageNetworkDistributionAnalyticsProvider({
  source,
  sourceLabel = "Network distribution shared live storage",
  store,
  workspaceId,
}: StorageNetworkDistributionAnalyticsProviderOptions): LiveNetworkDistributionAnalyticsProvider {
  const provider = createStorageDashboardAggregateProvider({
    source: source ?? `live-record-store:network-distribution:${workspaceId}`,
    sourceLabel,
    store,
    workspaceId,
  });

  return {
    source: provider.source,
    sourceLabel: provider.sourceLabel,
    readNetworkDistributionGraph: () => provider.readDashboardGraph(),
  };
}

export function createConfiguredStorageNetworkDistributionAnalyticsProvider({
  env,
  sourceLabel = "Network distribution Postgres live storage",
}: ConfiguredStorageNetworkDistributionAnalyticsProviderOptions = {}): LiveNetworkDistributionAnalyticsProvider | null {
  const provider = createConfiguredStorageDashboardAggregateProvider({
    env,
    sourceLabel,
  });

  if (!provider) {
    return null;
  }

  return {
    source: provider.source.replace(
      "postgres-live-record-store:dashboard:",
      "postgres-live-record-store:network-distribution:",
    ),
    sourceLabel: provider.sourceLabel,
    readNetworkDistributionGraph: () => provider.readDashboardGraph(),
  };
}
