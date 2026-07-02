// Dashboard service factory 管理仪表盘聚合、网络分布分析和机会提醒分析。
// 页面和 API 只依赖这些 contract，具体实现由 mock/hybrid/live mode 决定。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createHybridDashboardAggregateService } from "./dashboard-aggregate-mock/hybrid-service";
import { createLiveNetworkDistributionAnalyticsService } from "./live-distribution-service";
import { createLiveOpportunityReminderAnalyticsService } from "./live-opportunity-service";
import { createLiveDashboardAggregateService } from "./live-service";
import { createMockNetworkDistributionAnalyticsService } from "./mock-distribution-service";
import { createMockOpportunityReminderAnalyticsService } from "./mock-opportunity-service";
import { createMockDashboardAggregateService } from "./mock-service";
import { createConfiguredStorageDashboardAggregateProvider } from "./storage/dashboard-live-record-provider";
import { createConfiguredStorageNetworkDistributionAnalyticsProvider } from "./storage/network-distribution-live-record-provider";
import { createConfiguredStorageOpportunityReminderAnalyticsProvider } from "./storage/opportunity-live-record-provider";
import type { NetworkDistributionAnalyticsService } from "./distribution-contract";
import type { OpportunityReminderAnalyticsService } from "./opportunity-contract";
import type { DashboardAggregateService } from "./service";

export const dashboardAggregateServiceFactory =
  createModuleServiceFactory<DashboardAggregateService>({
    capabilityId: "dashboard-aggregate",
    implementations: {
      hybrid: () => createHybridDashboardAggregateService(),
      live: () =>
        createLiveDashboardAggregateService({
          provider: createConfiguredStorageDashboardAggregateProvider(),
        }),
      mock: () => createMockDashboardAggregateService(),
    },
  });

export const networkDistributionAnalyticsServiceFactory =
  createModuleServiceFactory<NetworkDistributionAnalyticsService>({
    capabilityId: "network-distribution-analytics",
    implementations: {
      live: () =>
        createLiveNetworkDistributionAnalyticsService({
          provider: createConfiguredStorageNetworkDistributionAnalyticsProvider(),
        }),
      mock: () => createMockNetworkDistributionAnalyticsService(),
    },
  });

export const opportunityReminderAnalyticsServiceFactory =
  createModuleServiceFactory<OpportunityReminderAnalyticsService>({
    capabilityId: "opportunity-reminder-analytics",
    implementations: {
      live: () =>
        createLiveOpportunityReminderAnalyticsService({
          provider: createConfiguredStorageOpportunityReminderAnalyticsProvider(),
        }),
      mock: () => createMockOpportunityReminderAnalyticsService(),
    },
  });

export function resolveDashboardAggregateService(mode?: ModuleMode | string) {
  return dashboardAggregateServiceFactory.create(mode);
}

export function createDashboardAggregateService(
  mode?: ModuleMode | string,
): DashboardAggregateService {
  const resolution = resolveDashboardAggregateService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveNetworkDistributionAnalyticsService(
  mode?: ModuleMode | string,
) {
  return networkDistributionAnalyticsServiceFactory.create(mode);
}

export function createNetworkDistributionAnalyticsService(
  mode?: ModuleMode | string,
): NetworkDistributionAnalyticsService {
  const resolution = resolveNetworkDistributionAnalyticsService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveOpportunityReminderAnalyticsService(
  mode?: ModuleMode | string,
) {
  return opportunityReminderAnalyticsServiceFactory.create(mode);
}

export function createOpportunityReminderAnalyticsService(
  mode?: ModuleMode | string,
): OpportunityReminderAnalyticsService {
  const resolution = resolveOpportunityReminderAnalyticsService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
