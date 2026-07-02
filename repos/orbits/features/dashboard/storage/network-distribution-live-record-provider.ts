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
