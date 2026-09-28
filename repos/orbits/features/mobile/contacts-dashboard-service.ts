import { resolveFeatureMode, type FeatureMode } from "../../shared/config/feature-mode";
import {
  mobileContactsAnalysisOverviewPayloadSchema,
  mobileContactsDashboardPayloadSchema,
  mobileContactsDashboardSectionSchemas,
  MOBILE_CONTACTS_DASHBOARD_OPTIONAL_SECTIONS,
  type MobileContactsAnalysisOverviewPayload,
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
  contactsAnalysisGraphSourceDataVersion,
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
  /**
   * Sprint 0121: the full contacts list, for clients that did not declare the
   * roleCounts capability (the pre-0101 contract). Without it such clients get
   * the contacts section as unavailable rather than a partial list.
   */
  loadAllContacts?: MobileContactsDashboardSectionLoader;
  /** Trimmed roles with counts over all contacts (the App "decision role" tile). */
  loadContactRoleCounts?: (
    actorId: string,
  ) => Promise<readonly MobileContactsDashboardRoleCount[]>;
  /**
   * Sprint 0102: the actor's relationship-graph version (null when the
   * database has none). Read in the same request scope as the sections.
   */
  loadGraphVersion?: (actorId: string) => Promise<string | null>;
  now?: () => string;
}

export interface MobileContactsDashboardRoleCount {
  role: string;
  count: number;
}

// Sprint 0117: the page's referenced contacts are chosen by the shared code, so
// the App (computing the page on the device) names the same contacts.
import { referencedContactIds } from "../../shared/compute/dashboard-local";
export { referencedContactIds };

export interface MobileContactsDashboardInput {
  actorId: string;
  /**
   * "referenced" (default): the page's contacts plus roleCounts, for clients
   * that declared the roleCounts capability. "all": the original full list,
   * for clients that did not (they derive role ratios from the list).
   */
  contactsScope?: "referenced" | "all";
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

export type MobileContactsAnalysisOverviewResult =
  | { success: true; data: MobileContactsAnalysisOverviewPayload }
  | { success: false; error: { code: MobileContactsDashboardFailureCode; section: "aggregate" } };

export type MobileContactsAnalysisSourceResult =
  | { success: true; source: ContactsAnalysisSource }
  | { success: false; error: "conflict" | "unavailable" };

export interface MobileContactsDashboardService {
  getDashboard: (
    input: MobileContactsDashboardInput,
  ) => Promise<MobileContactsDashboardResult>;
  /**
   * The AI contacts-analysis entry (sprint 0102): when a graph version is
   * available and the page's version does not match it, returns "conflict"
   * after that one small query, without reading any section. Otherwise builds
   * the same source the page was built from (SQL read models + snapshot).
   */
  getAnalysisSource?: (input: {
    actorId: string;
    claimedSourceDataVersion: string;
  }) => Promise<MobileContactsAnalysisSourceResult>;
  /**
   * Sprint 0117 (dashboard D3): the AI report and the profile it is bound to,
   * for a client that computes every section itself (the App, from its
   * dashboard-graph copy). With a graph version this costs the version query,
   * the profile and the report sessions — no section, graph or contact read.
   */
  getAnalysisOverview?: (input: { actorId: string }) => Promise<MobileContactsAnalysisOverviewResult>;
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

async function settle(
  load: () => MobileContactsDashboardSectionResult | Promise<MobileContactsDashboardSectionResult>,
): Promise<MobileContactsDashboardSectionResult> {
  try {
    return await load();
  } catch (error) {
    return { success: false, error };
  }
}

export function createMobileContactsDashboardService(
  dependencies: MobileContactsDashboardDependencies,
): MobileContactsDashboardService {
  const now = dependencies.now ?? (() => new Date().toISOString());

  const loadGraphVersion = (actorId: string): Promise<string | null> =>
    dependencies.loadGraphVersion
      ? dependencies.loadGraphVersion(actorId).catch(() => null)
      : Promise.resolve(null);

  // Must run inside withDashboardLiveReadScope so the graph version, the
  // snapshot and any graph read are shared by every section.
  async function loadSections(actorId: string, preloadedProfile?: MobileContactsDashboardSectionResult) {
    const [sections, graphVersion] = await Promise.all([
      Promise.all([
        dependencies.loadAggregate(actorId),
        dependencies.loadSummary(actorId),
        dependencies.loadOpportunities(actorId),
        dependencies.loadGaps(actorId),
        dependencies.loadDistributions(actorId),
        preloadedProfile ?? dependencies.loadProfile(actorId),
      ]),
      loadGraphVersion(actorId),
    ]);
    const [aggregateSection, , opportunitiesSection] = sections;
    const contactIds = referencedContactIds({
      aggregate: aggregateSection.success ? aggregateSection.data : null,
      opportunities: opportunitiesSection.success ? opportunitiesSection.data : null,
    });
    const contacts = await loadReferencedContacts(dependencies, actorId, contactIds);
    return { sections: [...sections, contacts] as const, graphVersion };
  }

  function assemble({ sections, graphVersion }: Awaited<ReturnType<typeof loadSections>>) {
      const [
        aggregateResult,
        summaryResult,
        opportunitiesResult,
        gapsResult,
        distributionsResult,
        profileResult,
        contactsResult,
      ] = sections;

      if (!aggregateResult.success) {
        return {
          success: false as const,
          error: {
            code: "MOBILE_CONTACTS_DASHBOARD_REQUIRED_SECTION_FAILED" as const,
            section: "aggregate" as const,
          },
        };
      }

      const aggregate = mobileContactsDashboardSectionSchemas.aggregate.safeParse(
        aggregateResult.data,
      );
      if (!aggregate.success) {
        return {
          success: false as const,
          error: {
            code: "MOBILE_CONTACTS_DASHBOARD_CONTRACT_MISMATCH" as const,
            section: "aggregate" as const,
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
        ...(graphVersion === null ? {} : { graphVersion }),
      } as ContactsAnalysisSource;
      return { success: true as const, aggregate: aggregate.data, optionalResults, analysisSource };
  }

  return {
    async getAnalysisSource({ actorId, claimedSourceDataVersion }) {
      return withDashboardLiveReadScope(async (): Promise<MobileContactsAnalysisSourceResult> => {
        // The AI version binds the graph version and the profile the model
        // reads (0121), so both are checked before any section is read.
        const [graphVersion, profile] = await Promise.all([
          loadGraphVersion(actorId),
          settle(() => dependencies.loadProfile(actorId)),
        ]);
        if (
          graphVersion !== null &&
          contactsAnalysisGraphSourceDataVersion(graphVersion, optionalSection("profile", profile).data) !== claimedSourceDataVersion
        ) {
          return { success: false, error: "conflict" };
        }
        const assembled = assemble(await loadSections(actorId, profile));
        return assembled.success
          ? { success: true, source: assembled.analysisSource }
          : { success: false, error: "unavailable" };
      });
    },

    async getAnalysisOverview({ actorId }) {
      const [graphVersion, profile] = await withDashboardLiveReadScope(() => Promise.all([
        loadGraphVersion(actorId),
        settle(() => dependencies.loadProfile(actorId)),
      ]));
      const profileSection = optionalSection("profile", profile);
      let source: ContactsAnalysisSource;
      if (graphVersion === null) {
        // Without a graph version the report's version is the content hash of
        // the whole page source, so the sections are read as for the full page.
        const assembled = assemble(await withDashboardLiveReadScope(() => loadSections(actorId, profile)));
        if (!assembled.success) return { success: false, error: assembled.error };
        source = assembled.analysisSource;
      } else {
        // The version binds only the graph version and the profile (0121).
        source = { graphVersion, profile: profileSection.data } as unknown as ContactsAnalysisSource;
      }
      let analysis: ReturnType<typeof optionalSection> | undefined;
      if (dependencies.loadAnalysis) {
        let analysisResult: MobileContactsDashboardSectionResult;
        try {
          analysisResult = await dependencies.loadAnalysis(actorId, source);
        } catch (error) {
          analysisResult = { success: false, error };
        }
        analysis = optionalSection("analysis", analysisResult);
      }
      const payload = mobileContactsAnalysisOverviewPayloadSchema.safeParse({
        schemaVersion: 1,
        generatedAt: now(),
        ...(analysis ? { analysis: analysis.data } : {}),
        profile: profileSection.data,
        unavailableSections: [
          ...(analysis?.unavailable ? ["analysis" as const] : []),
          ...(profileSection.unavailable ? ["profile" as const] : []),
        ],
      });
      if (!payload.success) {
        return { success: false, error: { code: "MOBILE_CONTACTS_DASHBOARD_CONTRACT_MISMATCH", section: "aggregate" } };
      }
      return { success: true, data: payload.data };
    },

    async getDashboard({ actorId, contactsScope = "referenced" }) {
      const assembled = assemble(await withDashboardLiveReadScope(() => loadSections(actorId)));
      if (!assembled.success) return { success: false, error: assembled.error };
      const { aggregate, analysisSource } = assembled;
      // The AI source (and its version) always uses the page's contacts; only
      // the response's contacts section follows the client's contract.
      const optionalResults = contactsScope === "all"
        ? {
            ...assembled.optionalResults,
            contacts: optionalSection(
              "contacts",
              dependencies.loadAllContacts
                ? await settle(() => dependencies.loadAllContacts!(actorId))
                : { success: false, error: new Error("full contacts list unavailable") },
            ),
          }
        : assembled.optionalResults;
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
        aggregate,
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
  /** Sprint 0102: relationship-graph version (live dashboard provider). */
  graphVersion?: (actorId: string) => Promise<string | null>;
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
  graphVersion,
  loadAnalysis,
}: MobileContactsDashboardSources): MobileContactsDashboardService {
  return createMobileContactsDashboardService({
    loadAnalysis,
    ...(graphVersion ? { loadGraphVersion: graphVersion } : {}),
    loadAggregate: (actorId) =>
      dashboard.getDashboardAggregate({ actorId, activityLimit: 4 }),
    loadSummary: (actorId) => dashboard.getDashboardSummary({ actorId }),
    loadOpportunities: (actorId) =>
      opportunity(actorId).getOpportunityReminderAnalytics(),
    loadGaps: (actorId) => distribution(actorId).getNetworkGaps(),
    loadDistributions: (actorId) => distribution(actorId).getDistributions(),
    loadProfile: (actorId) => profile.getProfile({ actorId }),
    loadContacts: (actorId, contactIds) => contacts.listContacts({ actorId, contactIds }),
    loadAllContacts: (actorId) => contacts.listContacts({ actorId }),
    loadContactRoleCounts: (actorId) =>
      contactRoleCounts ? contactRoleCounts(actorId) : roleCountsFromFullList(contacts, actorId),
  });
}

async function configuredGraphVersion(actorId: string): Promise<string | null> {
  const provider = createConfiguredStorageDashboardAggregateProvider();
  return provider?.readDashboardGraphVersionForAccount
    ? provider.readDashboardGraphVersionForAccount(actorId)
    : null;
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
    ...(mode === "live"
      ? { contactRoleCounts: configuredContactRoleCounts, graphVersion: configuredGraphVersion }
      : {}),
    loadAnalysis: (actorId, source) =>
      createContactsAnalysisReportProvider({
        sessionProvider: createOrbitAgentChatSessionProvider(mode, actorId),
      }).getAnalysis({ source }),
  });
}
