import type { LiveOpportunityReminderAnalyticsProvider } from "../../../shared/compute/dashboard-opportunity";
import {
  createConfiguredStorageDashboardAggregateProvider,
  createStorageDashboardAggregateProvider,
  type ConfiguredStorageDashboardAggregateProviderOptions,
  type LiveDashboardGraph,
  type StorageDashboardAggregateProviderOptions,
} from "./dashboard-live-record-provider";

// Sprint 0117: the provider type lives with the shared opportunity code
// (shared/compute/dashboard-opportunity.ts).
export type { LiveOpportunityReminderAnalyticsProvider } from "../../../shared/compute/dashboard-opportunity";

export type StorageOpportunityReminderAnalyticsProviderOptions =
  StorageDashboardAggregateProviderOptions;

export type ConfiguredStorageOpportunityReminderAnalyticsProviderOptions =
  ConfiguredStorageDashboardAggregateProviderOptions;

export function createStorageOpportunityReminderAnalyticsProvider({
  source,
  sourceLabel = "Opportunity reminder shared live storage",
  sqlClient,
  workspaceId,
}: StorageOpportunityReminderAnalyticsProviderOptions): LiveOpportunityReminderAnalyticsProvider {
  const provider = createStorageDashboardAggregateProvider({
    source: source ?? `live-record-store:opportunity-reminder:${workspaceId}`,
    sourceLabel,
    sqlClient,
    workspaceId,
  });

  return {
    source: provider.source,
    sourceLabel: provider.sourceLabel,
    readOpportunityGraph: () => provider.readDashboardGraph(),
  };
}

export function createConfiguredStorageOpportunityReminderAnalyticsProvider({
  env,
  sourceLabel = "Opportunity reminder Postgres live storage",
}: ConfiguredStorageOpportunityReminderAnalyticsProviderOptions = {}): LiveOpportunityReminderAnalyticsProvider | null {
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
      "postgres-live-record-store:opportunity-reminder:",
    ),
    sourceLabel: provider.sourceLabel,
    readOpportunityGraph: () => provider.readDashboardGraph(),
  };
}
