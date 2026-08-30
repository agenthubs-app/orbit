import { resolveFeatureMode, type FeatureMode } from "../../shared/config/feature-mode";
import {
  mobileContactsDashboardPayloadSchema,
  mobileContactsDashboardSectionSchemas,
  MOBILE_CONTACTS_DASHBOARD_OPTIONAL_SECTIONS,
  type MobileContactsDashboardOptionalSection,
  type MobileContactsDashboardPayload,
} from "../../shared/api-schema/mobile-contacts-dashboard";
import { createContactsListSearchAndFilterService } from "../contacts/service-factory";
import {
  createActorScopedNetworkDistributionAnalyticsService,
  createActorScopedOpportunityReminderAnalyticsService,
  createDashboardAggregateService,
  createNetworkDistributionAnalyticsService,
  createOpportunityReminderAnalyticsService,
} from "../dashboard/service-factory";
import { createProfileService } from "../profile/service-factory";

export type MobileContactsDashboardSectionResult =
  | { success: true; data: unknown }
  | { success: false; error: unknown };

type MobileContactsDashboardSectionLoader = (
  actorId: string,
) =>
  | MobileContactsDashboardSectionResult
  | Promise<MobileContactsDashboardSectionResult>;

export interface MobileContactsDashboardDependencies {
  loadAggregate: MobileContactsDashboardSectionLoader;
  loadSummary: MobileContactsDashboardSectionLoader;
  loadOpportunities: MobileContactsDashboardSectionLoader;
  loadGaps: MobileContactsDashboardSectionLoader;
  loadDistributions: MobileContactsDashboardSectionLoader;
  loadProfile: MobileContactsDashboardSectionLoader;
  loadContacts: MobileContactsDashboardSectionLoader;
  now?: () => string;
}

export interface MobileContactsDashboardInput {
  actorId: string;
}

export type MobileContactsDashboardFailureCode =
  | "MOBILE_CONTACTS_DASHBOARD_REQUIRED_SECTION_FAILED"
  | "MOBILE_CONTACTS_DASHBOARD_CONTRACT_MISMATCH";

export type MobileContactsDashboardResult =
  | { success: true; data: MobileContactsDashboardPayload }
  | {
      success: false;
      error: {
        code: MobileContactsDashboardFailureCode;
        section: "aggregate";
      };
    };

export interface MobileContactsDashboardService {
  getDashboard: (
    input: MobileContactsDashboardInput,
  ) => Promise<MobileContactsDashboardResult>;
}

function optionalSection(
  section: MobileContactsDashboardOptionalSection,
  result: MobileContactsDashboardSectionResult,
): { data: unknown | null; unavailable: boolean } {
  if (!result.success) {
    return { data: null, unavailable: true };
  }

  const parsed = mobileContactsDashboardSectionSchemas[section].safeParse(
    result.data,
  );

  return parsed.success
    ? { data: parsed.data, unavailable: false }
    : { data: null, unavailable: true };
}

export function createMobileContactsDashboardService(
  dependencies: MobileContactsDashboardDependencies,
): MobileContactsDashboardService {
  const now = dependencies.now ?? (() => new Date().toISOString());

  return {
    async getDashboard({ actorId }) {
      const [
        aggregateResult,
        summaryResult,
        opportunitiesResult,
        gapsResult,
        distributionsResult,
        profileResult,
        contactsResult,
      ] = await Promise.all([
        dependencies.loadAggregate(actorId),
        dependencies.loadSummary(actorId),
        dependencies.loadOpportunities(actorId),
        dependencies.loadGaps(actorId),
        dependencies.loadDistributions(actorId),
        dependencies.loadProfile(actorId),
        dependencies.loadContacts(actorId),
      ]);

      if (!aggregateResult.success) {
        return {
          success: false,
          error: {
            code: "MOBILE_CONTACTS_DASHBOARD_REQUIRED_SECTION_FAILED",
            section: "aggregate",
          },
        };
      }

      const aggregate = mobileContactsDashboardSectionSchemas.aggregate.safeParse(
        aggregateResult.data,
      );
      if (!aggregate.success) {
        return {
          success: false,
          error: {
            code: "MOBILE_CONTACTS_DASHBOARD_CONTRACT_MISMATCH",
            section: "aggregate",
          },
        };
      }

      const optionalResults = {
        summary: optionalSection("summary", summaryResult),
        opportunities: optionalSection("opportunities", opportunitiesResult),
        gaps: optionalSection("gaps", gapsResult),
        distributions: optionalSection("distributions", distributionsResult),
        profile: optionalSection("profile", profileResult),
        contacts: optionalSection("contacts", contactsResult),
      };
      const unavailableSections = MOBILE_CONTACTS_DASHBOARD_OPTIONAL_SECTIONS.filter(
        (section) => optionalResults[section].unavailable,
      );
      const payload = mobileContactsDashboardPayloadSchema.safeParse({
        schemaVersion: 1,
        generatedAt: now(),
        aggregate: aggregate.data,
        summary: optionalResults.summary.data,
        opportunities: optionalResults.opportunities.data,
        gaps: optionalResults.gaps.data,
        distributions: optionalResults.distributions.data,
        profile: optionalResults.profile.data,
        contacts: optionalResults.contacts.data,
        unavailableSections,
      });

      if (!payload.success) {
        return {
          success: false,
          error: {
            code: "MOBILE_CONTACTS_DASHBOARD_CONTRACT_MISMATCH",
            section: "aggregate",
          },
        };
      }

      return { success: true, data: payload.data };
    },
  };
}

export function createConfiguredMobileContactsDashboardService(
  mode: FeatureMode = resolveFeatureMode(),
): MobileContactsDashboardService {
  const dashboard = createDashboardAggregateService(mode);
  const profile = createProfileService(mode);
  const contacts = createContactsListSearchAndFilterService(mode);

  function distribution(actorId: string) {
    return mode === "live"
      ? createActorScopedNetworkDistributionAnalyticsService(actorId)
      : createNetworkDistributionAnalyticsService(mode);
  }

  function opportunity(actorId: string) {
    return mode === "live"
      ? createActorScopedOpportunityReminderAnalyticsService(actorId)
      : createOpportunityReminderAnalyticsService(mode);
  }

  return createMobileContactsDashboardService({
    loadAggregate: (actorId) =>
      dashboard.getDashboardAggregate({ actorId, activityLimit: 4 }),
    loadSummary: (actorId) => dashboard.getDashboardSummary({ actorId }),
    loadOpportunities: (actorId) =>
      opportunity(actorId).getOpportunityReminderAnalytics(),
    loadGaps: (actorId) => distribution(actorId).getNetworkGaps(),
    loadDistributions: (actorId) => distribution(actorId).getDistributions(),
    loadProfile: (actorId) => profile.getProfile({ actorId }),
    loadContacts: (actorId) => contacts.listContacts({ actorId }),
  });
}
