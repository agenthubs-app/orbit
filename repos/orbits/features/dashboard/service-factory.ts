// Dashboard service factory 管理仪表盘聚合、网络分布分析和机会提醒分析。
// 当前所有数据来自 mock analytics，便于页面稳定展示指标和来源解释。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createHybridDashboardAggregateService } from "./dashboard-aggregate-mock/hybrid-service";
import { createMockNetworkDistributionAnalyticsService } from "./mock-distribution-service";
import { createMockOpportunityReminderAnalyticsService } from "./mock-opportunity-service";
import { createMockDashboardAggregateService } from "./mock-service";
import type { NetworkDistributionAnalyticsService } from "./distribution-contract";
import type { OpportunityReminderAnalyticsService } from "./opportunity-contract";
import type { DashboardAggregateService } from "./service";

export const dashboardAggregateServiceFactory =
  createModuleServiceFactory<DashboardAggregateService>({
    capabilityId: "dashboard-aggregate",
    implementations: {
      hybrid: () => createHybridDashboardAggregateService(),
      mock: () => createMockDashboardAggregateService(),
    },
  });

export const networkDistributionAnalyticsServiceFactory =
  createModuleServiceFactory<NetworkDistributionAnalyticsService>({
    capabilityId: "network-distribution-analytics",
    implementations: {
      mock: () => createMockNetworkDistributionAnalyticsService(),
    },
  });

export const opportunityReminderAnalyticsServiceFactory =
  createModuleServiceFactory<OpportunityReminderAnalyticsService>({
    capabilityId: "opportunity-reminder-analytics",
    implementations: {
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
