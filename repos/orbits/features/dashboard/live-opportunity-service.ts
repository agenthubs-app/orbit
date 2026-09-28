import {
  createLiveOpportunityReminderAnalyticsService as createSharedOpportunityReminderAnalyticsService,
  type LiveOpportunityReminderAnalyticsServiceOptions as SharedServiceOptions,
} from "../../shared/compute/dashboard-opportunity";
import type { OpportunityReminderAnalyticsService } from "./opportunity-contract";

// Sprint 0117 (dashboard D3): opportunity reminders live in the shared
// directory (shared/compute/dashboard-opportunity.ts), which the App runs on
// its device copy of the graph. The shared code never reads a clock, so the
// server's factory supplies the request time when a caller does not.
export * from "../../shared/compute/dashboard-opportunity";

export type LiveOpportunityReminderAnalyticsServiceOptions = Omit<SharedServiceOptions, "now"> & { now?: () => string };

export function createLiveOpportunityReminderAnalyticsService(
  options: LiveOpportunityReminderAnalyticsServiceOptions,
): OpportunityReminderAnalyticsService {
  return createSharedOpportunityReminderAnalyticsService({ ...options, now: options.now ?? (() => new Date().toISOString()) });
}
