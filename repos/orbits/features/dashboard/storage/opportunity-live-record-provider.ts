import {
  createConfiguredStorageDashboardAggregateProvider,
  createStorageDashboardAggregateProvider,
  type ConfiguredStorageDashboardAggregateProviderOptions,
  type LiveDashboardGraph,
  type StorageDashboardAggregateProviderOptions,
} from "./dashboard-live-record-provider";

export interface LiveOpportunityReminderAnalyticsProvider {
  source: string;
  sourceLabel: string;
  readOpportunityGraph: () => LiveDashboardGraph | Promise<LiveDashboardGraph>;
}

export type StorageOpportunityReminderAnalyticsProviderOptions =
  StorageDashboardAggregateProviderOptions;

export type ConfiguredStorageOpportunityReminderAnalyticsProviderOptions =
  ConfiguredStorageDashboardAggregateProviderOptions;

export function createStorageOpportunityReminderAnalyticsProvider({
  source,
  sourceLabel = "Opportunity reminder shared live storage",
  store,
  workspaceId,
}: StorageOpportunityReminderAnalyticsProviderOptions): LiveOpportunityReminderAnalyticsProvider {
  const provider = createStorageDashboardAggregateProvider({
    source: source ?? `live-record-store:opportunity-reminder:${workspaceId}`,
    sourceLabel,
    store,
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
