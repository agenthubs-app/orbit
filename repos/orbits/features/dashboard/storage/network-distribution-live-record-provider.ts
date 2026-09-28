import type { LiveNetworkDistributionAnalyticsProvider } from "../../../shared/compute/dashboard-distribution";
import {
  createConfiguredStorageDashboardAggregateProvider,
  createStorageDashboardAggregateProvider,
  type ConfiguredStorageDashboardAggregateProviderOptions,
  type LiveDashboardGraph,
  type StorageDashboardAggregateProviderOptions,
} from "./dashboard-live-record-provider";

// Sprint 0117: the provider and read-model types live with the shared
// distribution code (shared/compute/dashboard-distribution.ts).
export type {
  LiveNetworkDistributionAnalyticsProvider,
  NetworkDistributionReadModel,
  NetworkStructureDimensionKey,
} from "../../../shared/compute/dashboard-distribution";

export type StorageNetworkDistributionAnalyticsProviderOptions =
  StorageDashboardAggregateProviderOptions;

export type ConfiguredStorageNetworkDistributionAnalyticsProviderOptions =
  ConfiguredStorageDashboardAggregateProviderOptions;

export function createStorageNetworkDistributionAnalyticsProvider({
  source,
  sourceLabel = "Network distribution shared live storage",
  sqlClient,
  workspaceId,
}: StorageNetworkDistributionAnalyticsProviderOptions): LiveNetworkDistributionAnalyticsProvider {
  const provider = createStorageDashboardAggregateProvider({
    source: source ?? `live-record-store:network-distribution:${workspaceId}`,
    sourceLabel,
    sqlClient,
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
