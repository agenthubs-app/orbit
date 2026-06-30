import { createSourceConsistencyProvenanceAuditService } from "../../../../../features/audit/service-factory";
import type { SourceConsistencyProvenanceAuditService } from "../../../../../features/audit/provenance-contract";
import { createDashboardAggregateService } from "../../../../../features/dashboard/service-factory";
import type { DashboardAggregateService } from "../../../../../features/dashboard/service";
import { createNetworkDistributionAnalyticsService } from "../../../../../features/dashboard/service-factory";
import type { NetworkDistributionAnalyticsService } from "../../../../../features/dashboard/distribution-contract";
import { createOpportunityReminderAnalyticsService } from "../../../../../features/dashboard/service-factory";
import type { OpportunityReminderAnalyticsService } from "../../../../../features/dashboard/opportunity-contract";
import {
  createModuleServiceFactory,
  type ModuleMode,
  type ServiceResolution,
} from "../../../../../shared/services/module-mode";

// Dashboard 页面是多个分析模块的聚合视图。
// 这个 factory 把首页摘要、网络分布、机会提醒和 provenance audit 组合成页面级依赖。
export interface AppDashboardRouteServices {
  auditService: SourceConsistencyProvenanceAuditService;
  dashboardService: DashboardAggregateService;
  distributionService: NetworkDistributionAnalyticsService;
  opportunityService: OpportunityReminderAnalyticsService;
}

// 各子模块保持独立 capabilityId，方便未来只替换其中某个分析服务。
export const appDashboardAggregateServiceFactory =
  createModuleServiceFactory<DashboardAggregateService>({
    capabilityId: "app-dashboard-aggregate",
    implementations: {
      mock: () => createDashboardAggregateService(),
    },
  });

export const appDashboardDistributionServiceFactory =
  createModuleServiceFactory<NetworkDistributionAnalyticsService>({
    capabilityId: "app-dashboard-network-distributions",
    implementations: {
      mock: () => createNetworkDistributionAnalyticsService(),
    },
  });

export const appDashboardOpportunityServiceFactory =
  createModuleServiceFactory<OpportunityReminderAnalyticsService>({
    capabilityId: "app-dashboard-opportunities",
    implementations: {
      mock: () => createOpportunityReminderAnalyticsService(),
    },
  });

export const appDashboardAuditServiceFactory =
  createModuleServiceFactory<SourceConsistencyProvenanceAuditService>({
    capabilityId: "app-dashboard-provenance-audit",
    implementations: {
      mock: () => createSourceConsistencyProvenanceAuditService(),
    },
  });

export function resolveAppDashboardRouteServices(
  mode?: ModuleMode | string,
): ServiceResolution<AppDashboardRouteServices> {
  // 逐个解析子服务；任何一个失败都让页面拿到明确的 unavailable 原因。
  const dashboardResolution = appDashboardAggregateServiceFactory.create(mode);
  const distributionResolution =
    appDashboardDistributionServiceFactory.create(mode);
  const opportunityResolution = appDashboardOpportunityServiceFactory.create(mode);
  const auditResolution = appDashboardAuditServiceFactory.create(mode);
  const failedResolution = [
    dashboardResolution,
    distributionResolution,
    opportunityResolution,
    auditResolution,
  ].find((resolution) => resolution.success === false);

  if (failedResolution?.success === false) {
    return failedResolution;
  }

  // 这个 fallback 服务 TypeScript 收窄，也避免返回半成功的 dashboard bundle。
  if (
    dashboardResolution.success === false ||
    distributionResolution.success === false ||
    opportunityResolution.success === false ||
    auditResolution.success === false
  ) {
    return {
      success: false,
      error: {
        availableModes: [],
        capabilityId: "dashboard",
        code: "NOT_IMPLEMENTED",
        message: "Dashboard route services are unavailable in the requested mode.",
        requestedMode: "mock",
      },
    };
  }

  // 全部子服务可用后才返回页面可消费的聚合对象。
  return {
    success: true,
    mode: dashboardResolution.mode,
    service: {
      auditService: auditResolution.service,
      dashboardService: dashboardResolution.service,
      distributionService: distributionResolution.service,
      opportunityService: opportunityResolution.service,
    },
  };
}

export function createAppDashboardRouteServices(): AppDashboardRouteServices {
  // 页面运行时使用 throwing 版本；测试 mode 边界时优先用 resolve 函数。
  const resolution = resolveAppDashboardRouteServices();

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
