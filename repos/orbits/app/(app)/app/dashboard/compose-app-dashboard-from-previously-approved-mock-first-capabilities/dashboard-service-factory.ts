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

export interface AppDashboardRouteServices {
  auditService: SourceConsistencyProvenanceAuditService;
  dashboardService: DashboardAggregateService;
  distributionService: NetworkDistributionAnalyticsService;
  opportunityService: OpportunityReminderAnalyticsService;
}

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
  const resolution = resolveAppDashboardRouteServices();

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
