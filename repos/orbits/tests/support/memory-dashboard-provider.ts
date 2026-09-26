import { contactRecordOwnedByActor } from "../../features/contacts/storage/contact-read-authorization";
import type { LiveDashboardAggregateProvider } from "../../features/dashboard/live-service";
import {
  DASHBOARD_LIVE_RECORD_COLLECTIONS,
  dashboardGraphFromRecords,
  type LiveDashboardGraph,
} from "../../features/dashboard/storage/dashboard-live-record-provider";
import type { LiveNetworkDistributionAnalyticsProvider } from "../../features/dashboard/storage/network-distribution-live-record-provider";
import type { LiveOpportunityReminderAnalyticsProvider } from "../../features/dashboard/storage/opportunity-live-record-provider";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";

/**
 * In-memory stand-in for the dashboard provider. Production dashboard reads
 * are SQL only since sprint 0102 (the listRecords fallback with six unbounded
 * reads was removed); tests that exercise the JS services over a memory store
 * build the same graph here with the production record mapping.
 */
export interface MemoryDashboardProviderOptions {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  source?: string;
  sourceLabel?: string;
}

async function readMemoryGraph(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  accountId?: string,
): Promise<LiveDashboardGraph> {
  const owner = accountId === undefined ? {} : { userId: accountId };
  const list = (collectionName: string) =>
    Promise.resolve(store.listRecords({ limit: "unbounded", workspaceId, collectionName, ...owner }));
  const [contacts, connections, detailStates, events, tasks, evidence] = await Promise.all([
    list(DASHBOARD_LIVE_RECORD_COLLECTIONS.contacts),
    list(DASHBOARD_LIVE_RECORD_COLLECTIONS.connections),
    list(DASHBOARD_LIVE_RECORD_COLLECTIONS.detailStates),
    list(DASHBOARD_LIVE_RECORD_COLLECTIONS.events),
    list(DASHBOARD_LIVE_RECORD_COLLECTIONS.tasks),
    list(DASHBOARD_LIVE_RECORD_COLLECTIONS.evidence),
  ]);
  return dashboardGraphFromRecords({
    contacts: accountId === undefined ? contacts : contacts.filter((record) => contactRecordOwnedByActor(record, accountId)),
    connections,
    detailStates,
    events,
    tasks,
    evidence,
  });
}

export function createMemoryDashboardProvider({
  store,
  workspaceId,
  source = `live-record-store:dashboard:${workspaceId}`,
  sourceLabel = "Dashboard shared live storage",
}: MemoryDashboardProviderOptions): LiveDashboardAggregateProvider {
  return {
    source,
    sourceLabel,
    readDashboardGraph: () => readMemoryGraph(store, workspaceId),
    readDashboardGraphForAccount: (accountId) => readMemoryGraph(store, workspaceId, accountId),
  };
}

export function createMemoryNetworkDistributionProvider({
  store,
  workspaceId,
  source = `live-record-store:network-distribution:${workspaceId}`,
  sourceLabel = "Network distribution shared live storage",
}: MemoryDashboardProviderOptions): LiveNetworkDistributionAnalyticsProvider {
  return { source, sourceLabel, readNetworkDistributionGraph: () => readMemoryGraph(store, workspaceId) };
}

export function createMemoryOpportunityReminderProvider({
  store,
  workspaceId,
  source = `live-record-store:opportunity-reminder:${workspaceId}`,
  sourceLabel = "Opportunity reminder shared live storage",
}: MemoryDashboardProviderOptions): LiveOpportunityReminderAnalyticsProvider {
  return { source, sourceLabel, readOpportunityGraph: () => readMemoryGraph(store, workspaceId) };
}
