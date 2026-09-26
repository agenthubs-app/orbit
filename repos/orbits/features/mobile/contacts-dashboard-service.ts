import { resolveFeatureMode, type FeatureMode } from "../../shared/config/feature-mode";
import {
  mobileContactsDashboardPayloadSchema,
  mobileContactsDashboardSectionSchemas,
  MOBILE_CONTACTS_DASHBOARD_OPTIONAL_SECTIONS,
  type MobileContactsDashboardOptionalSection,
  type MobileContactsDashboardPayload,
} from "../../shared/api-schema/mobile-contacts-dashboard";
import { createContactsListSearchAndFilterService } from "../contacts/service-factory";
import type { ContactsListSearchAndFilterService } from "../contacts/service";
import type { DashboardAggregateService } from "../dashboard/service";
import type { NetworkDistributionAnalyticsService } from "../dashboard/distribution-contract";
import type { OpportunityReminderAnalyticsService } from "../dashboard/opportunity-contract";
import type { ProfileService } from "../profile/service";
import {
  createActorScopedNetworkDistributionAnalyticsService,
  createActorScopedOpportunityReminderAnalyticsService,
  createDashboardAggregateService,
  createNetworkDistributionAnalyticsService,
  createOpportunityReminderAnalyticsService,
} from "../dashboard/service-factory";
import {
  createConfiguredStorageDashboardAggregateProvider,
  withDashboardLiveReadScope,
} from "../dashboard/storage/dashboard-live-record-provider";
import { createProfileService } from "../profile/service-factory";
import { createOrbitAgentChatSessionProvider } from "../orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import {
  createContactsAnalysisReportProvider,
  type ContactsAnalysisSource,
} from "./contacts-analysis-report-provider";

export type MobileContactsDashboardSectionResult =
  | { success: true; data: unknown }
  | { success: false; error: unknown };

type MobileContactsDashboardSectionLoader = (
  actorId: string,
) =>
  | MobileContactsDashboardSectionResult
  | Promise<MobileContactsDashboardSectionResult>;

export interface MobileContactsDashboardDependencies {
  loadAnalysis?: (
    actorId: string,
    source: ContactsAnalysisSource,
  ) => MobileContactsDashboardSectionResult | Promise<MobileContactsDashboardSectionResult>;
  loadAggregate: MobileContactsDashboardSectionLoader;
  loadSummary: MobileContactsDashboardSectionLoader;
  loadOpportunities: MobileContactsDashboardSectionLoader;
  loadGaps: MobileContactsDashboardSectionLoader;
  loadDistributions: MobileContactsDashboardSectionLoader;
  loadProfile: MobileContactsDashboardSectionLoader;
  /**
   * Sprint 0101: only the contacts the page shows, by domain id (the ids come
   * from the aggregate and opportunity sections of the same response).
   */
  loadContacts: (
    actorId: string,
    contactIds: readonly string[],
  ) =>
    | MobileContactsDashboardSectionResult
    | Promise<MobileContactsDashboardSectionResult>;
  /** Trimmed roles with counts over all contacts (the App "decision role" tile). */
  loadContactRoleCounts?: (
    actorId: string,
  ) => Promise<readonly MobileContactsDashboardRoleCount[]>;
  now?: () => string;
}

export interface MobileContactsDashboardRoleCount {
  role: string;
  count: number;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Contact ids that the contacts-analysis page (App and web) displays or links. */
export function referencedContactIds(sections: {
  aggregate: unknown;
  opportunities: unknown;
}): readonly string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = stringValue(value);
    if (id) ids.add(id);
  };
  const list = (value: unknown): readonly Record<string, unknown>[] =>
    Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      : [];
  const aggregate = (sections.aggregate ?? {}) as Record<string, any>;
  for (const item of list(aggregate.newContacts?.contacts)) add(item.contactId);
  for (const item of list(aggregate.dormantContacts?.contacts)) add(item.contactId);
  const opportunities = (sections.opportunities ?? {}) as Record<string, any>;
  for (const item of list(opportunities.highPriorityOpportunities)) {
    add(item.contactId);
    const brief = (item.actionBrief ?? {}) as Record<string, any>;
    add(brief.primaryAction?.contactId);
    add(brief.secondaryAction?.contactId);
  }
  for (const item of list(opportunities.dormantHighValueContacts)) add(item.contactId);
  return [...ids];
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

  if (parsed.success && section === "profile") {
    const data = parsed.data as NonNullable<MobileContactsDashboardPayload["profile"]>;
    if (data.profile) {
      const { birthDate: _privateBirthDate, ...profile } = data.profile;
      return { data: { ...data, profile }, unavailable: false };
    }
  }

  return parsed.success
    ? { data: parsed.data, unavailable: false }
    : { data: null, unavailable: true };
}

async function loadReferencedContacts(
  dependencies: MobileContactsDashboardDependencies,
  actorId: string,
  contactIds: readonly string[],
): Promise<MobileContactsDashboardSectionResult> {
  const [contacts, roleCounts] = await Promise.all([
    dependencies.loadContacts(actorId, contactIds),
    dependencies.loadContactRoleCounts
      ? dependencies.loadContactRoleCounts(actorId).then(
          (value) => ({ success: true as const, value }),
          (error: unknown) => ({ success: false as const, error }),
        )
      : null,
  ]);
  if (!contacts.success || roleCounts === null) return contacts;
  // Without role counts the App would compute its role tile from the partial
  // list, so the section is reported unavailable instead of silently wrong.
  if (roleCounts.success === false) return { success: false, error: roleCounts.error };
  return {
    success: true,
    data: { ...(contacts.data as Record<string, unknown>), roleCounts: roleCounts.value },
  };
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
      ] = await withDashboardLiveReadScope(async () => {
        const sections = await Promise.all([
          dependencies.loadAggregate(actorId),
          dependencies.loadSummary(actorId),
          dependencies.loadOpportunities(actorId),
          dependencies.loadGaps(actorId),
          dependencies.loadDistributions(actorId),
          dependencies.loadProfile(actorId),
        ]);
        const [aggregateSection, , opportunitiesSection] = sections;
        const contactIds = referencedContactIds({
          aggregate: aggregateSection.success ? aggregateSection.data : null,
          opportunities: opportunitiesSection.success ? opportunitiesSection.data : null,
        });
        const contacts = await loadReferencedContacts(dependencies, actorId, contactIds);
        return [...sections, contacts] as const;
      });

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
      const analysisSource = {
        aggregate: aggregate.data,
        summary: optionalResults.summary.data,
        opportunities: optionalResults.opportunities.data,
        gaps: optionalResults.gaps.data,
        distributions: optionalResults.distributions.data,
        profile: optionalResults.profile.data,
        contacts: optionalResults.contacts.data,
      } as ContactsAnalysisSource;
      let analysis: ReturnType<typeof optionalSection> | undefined;
      if (dependencies.loadAnalysis) {
        let analysisResult: MobileContactsDashboardSectionResult;
        try {
          analysisResult = await dependencies.loadAnalysis(actorId, analysisSource);
        } catch (error) {
          analysisResult = { success: false, error };
        }
        analysis = optionalSection("analysis", analysisResult);
      }
      const unavailableSections = MOBILE_CONTACTS_DASHBOARD_OPTIONAL_SECTIONS.filter((section) =>
        section === "analysis"
          ? analysis?.unavailable === true
          : optionalResults[section].unavailable,
      );
      const payload = mobileContactsDashboardPayloadSchema.safeParse({
        schemaVersion: 1,
        generatedAt: now(),
        ...(analysis ? { analysis: analysis.data } : {}),
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

export interface MobileContactsDashboardSources {
  dashboard: DashboardAggregateService;
  distribution: (actorId: string) => NetworkDistributionAnalyticsService;
  opportunity: (actorId: string) => OpportunityReminderAnalyticsService;
  profile: ProfileService;
  contacts: ContactsListSearchAndFilterService;
  /** Defaults to counting roles over the full contacts list (non-live modes). */
  contactRoleCounts?: (actorId: string) => Promise<readonly MobileContactsDashboardRoleCount[]>;
  loadAnalysis?: MobileContactsDashboardDependencies["loadAnalysis"];
}

async function roleCountsFromFullList(
  contacts: ContactsListSearchAndFilterService,
  actorId: string,
): Promise<readonly MobileContactsDashboardRoleCount[]> {
  const result = await contacts.listContacts({ actorId });
  if (result.success === false) throw new Error(result.error.code);
  const counts = new Map<string, number>();
  for (const contact of result.data.contacts) {
    const role = contact.role.trim();
    if (role) counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return [...counts.entries()].map(([role, count]) => ({ role, count }));
}

/** One composition shared by production and the read-cost ledger. */
export function createMobileContactsDashboardServiceFromSources({
  dashboard,
  distribution,
  opportunity,
  profile,
  contacts,
  contactRoleCounts,
  loadAnalysis,
}: MobileContactsDashboardSources): MobileContactsDashboardService {
  return createMobileContactsDashboardService({
    loadAnalysis,
    loadAggregate: (actorId) =>
      dashboard.getDashboardAggregate({ actorId, activityLimit: 4 }),
    loadSummary: (actorId) => dashboard.getDashboardSummary({ actorId }),
    loadOpportunities: (actorId) =>
      opportunity(actorId).getOpportunityReminderAnalytics(),
    loadGaps: (actorId) => distribution(actorId).getNetworkGaps(),
    loadDistributions: (actorId) => distribution(actorId).getDistributions(),
    loadProfile: (actorId) => profile.getProfile({ actorId }),
    loadContacts: (actorId, contactIds) => contacts.listContacts({ actorId, contactIds }),
    loadContactRoleCounts: (actorId) =>
      contactRoleCounts ? contactRoleCounts(actorId) : roleCountsFromFullList(contacts, actorId),
  });
}

async function configuredContactRoleCounts(
  actorId: string,
): Promise<readonly MobileContactsDashboardRoleCount[]> {
  const provider = createConfiguredStorageDashboardAggregateProvider();
  if (!provider?.readContactRoleCountsForAccount) {
    throw new Error("Dashboard live storage is not configured");
  }
  return provider.readContactRoleCountsForAccount(actorId);
}

export function createConfiguredMobileContactsDashboardService(
  mode: FeatureMode = resolveFeatureMode(),
): MobileContactsDashboardService {
  return createMobileContactsDashboardServiceFromSources({
    dashboard: createDashboardAggregateService(mode),
    distribution: (actorId) =>
      mode === "live"
        ? createActorScopedNetworkDistributionAnalyticsService(actorId)
        : createNetworkDistributionAnalyticsService(mode),
    opportunity: (actorId) =>
      mode === "live"
        ? createActorScopedOpportunityReminderAnalyticsService(actorId)
        : createOpportunityReminderAnalyticsService(mode),
    profile: createProfileService(mode),
    contacts: createContactsListSearchAndFilterService(mode),
    ...(mode === "live" ? { contactRoleCounts: configuredContactRoleCounts } : {}),
    loadAnalysis: (actorId, source) =>
      createContactsAnalysisReportProvider({
        sessionProvider: createOrbitAgentChatSessionProvider(mode, actorId),
      }).getAnalysis({ source }),
  });
}
