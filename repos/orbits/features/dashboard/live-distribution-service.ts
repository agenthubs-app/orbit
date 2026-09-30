import {
  createLiveNetworkDistributionAnalyticsService as createSharedNetworkDistributionAnalyticsService,
  type LiveNetworkDistributionAnalyticsServiceOptions as SharedServiceOptions,
} from "../../shared/compute/dashboard-distribution";
import type { NetworkDistributionAnalyticsService } from "./distribution-contract";

// Sprint 0117 (dashboard D3): network distributions and gaps live in the shared
// directory (shared/compute/dashboard-distribution.ts), which the App runs on
// its device copy of the graph. The shared code never reads a clock, so the
// server's factory supplies the request time when a caller does not.
export * from "../../shared/compute/dashboard-distribution";

export type LiveNetworkDistributionAnalyticsServiceOptions = Omit<SharedServiceOptions, "now"> & { now?: () => string };

export function createLiveNetworkDistributionAnalyticsService(
  options: LiveNetworkDistributionAnalyticsServiceOptions,
): NetworkDistributionAnalyticsService {
  return createSharedNetworkDistributionAnalyticsService({ ...options, now: options.now ?? (() => new Date().toISOString()) });
}
