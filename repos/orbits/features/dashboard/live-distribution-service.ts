import type {
  ConnectionDTO,
  ContactDTO,
} from "../../shared/domain/contracts";
import {
  NETWORK_DISTRIBUTION_ANALYTICS_ERROR_DEFINITIONS,
  type IndustryDistributionBucket,
  type NetworkDistributionAnalyticsErrorCode,
  type NetworkDistributionAnalyticsFailure,
  type NetworkDistributionAnalyticsInput,
  type NetworkDistributionAnalyticsPayload,
  type NetworkDistributionAnalyticsProvenance,
  type NetworkDistributionAnalyticsResult,
  type NetworkDistributionAnalyticsScenario,
  type NetworkDistributionAnalyticsService,
  type NetworkDistributionAnalyticsSourceReference,
  type NetworkGapAnalysisItem,
  type NetworkGapAnalysisPayload,
  type NetworkGapAnalysisResult,
  type NetworkGapSeverity,
  type NetworkRelationshipStrength,
  type NetworkRelationshipValueType,
  type RelationshipStrengthDistributionBucket,
  type ValueTypeDistributionBucket,
} from "./distribution-contract";
import type { LiveDashboardGraph } from "./storage/dashboard-live-record-provider";
import type { LiveNetworkDistributionAnalyticsProvider } from "./storage/network-distribution-live-record-provider";

export interface LiveNetworkDistributionAnalyticsServiceOptions {
  now?: () => string;
  provider: LiveNetworkDistributionAnalyticsProvider | null;
}

interface IndustryDefinition {
  bucketId: string;
  label: string;
  suffix: string;
}

const emptyEvidenceId = "evidence:network-distribution-live-empty";
const failedEvidenceId = "evidence:network-distribution-live-failed";
const pendingEvidenceId = "evidence:network-distribution-live-pending";
const unconfiguredEvidenceId =
  "evidence:network-distribution-live-unconfigured";

const supportedScenarios = new Set<NetworkDistributionAnalyticsScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const industryDefinitions: readonly IndustryDefinition[] = [
  {
    bucketId: "industry:foods",
    label: "Food operators",
    suffix: "Foods",
  },
  {
    bucketId: "industry:technologies",
    label: "Technology companies",
    suffix: "Technologies",
  },
  {
    bucketId: "industry:partners",
    label: "Partner and advisory firms",
    suffix: "Partners",
  },
  {
    bucketId: "industry:community",
    label: "Community groups",
    suffix: "Community",
  },
  {
    bucketId: "industry:capital",
    label: "Capital and investors",
    suffix: "Capital",
  },
];

const valueTypeLabels: Record<NetworkRelationshipValueType, string> = {
  commercial_opportunity: "Commercial opportunity",
  strategic_fit: "Strategic fit",
  referral_path: "Referral path",
  investor_access: "Investor access",
};

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function percentage(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function normalizeScenario(
  scenario?: NetworkDistributionAnalyticsInput["scenario"],
): NetworkDistributionAnalyticsScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as NetworkDistributionAnalyticsScenario)
  ) {
    return scenario as NetworkDistributionAnalyticsScenario;
  }

  return "success";
}

function provenance(input: {
  collectedAt: string;
  databaseReadExecuted: boolean;
  evidenceIds: readonly string[];
  generationMethod: NetworkDistributionAnalyticsProvenance["generationMethod"];
  provider: LiveNetworkDistributionAnalyticsProvider | null;
  source?: string;
  sourceLabel?: string;
}): NetworkDistributionAnalyticsProvenance {
  return {
    source:
      input.source ??
      input.provider?.source ??
      "live-record-store:network-distribution:unconfigured",
    sourceLabel:
      input.sourceLabel ??
      input.provider?.sourceLabel ??
      "Network distribution live storage is not configured",
    evidenceIds: input.evidenceIds,
    collectedAt: input.collectedAt,
    privacy: "live-network-distribution-analytics",
    generationMethod: input.generationMethod,
    graphAlgorithmExecuted: false,
    embeddingSearchExecuted: false,
    liveAnalyticsJobExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: input.databaseReadExecuted,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };
}

function failure(
  code: NetworkDistributionAnalyticsErrorCode,
  input: {
    now: string;
    provider: LiveNetworkDistributionAnalyticsProvider | null;
  },
): NetworkDistributionAnalyticsFailure {
  const failureProvenance = provenance({
    collectedAt: input.now,
    databaseReadExecuted: input.provider !== null,
    evidenceIds: [
      code === "NETWORK_DISTRIBUTION_ANALYTICS_LIVE_STORE_UNCONFIGURED"
        ? unconfiguredEvidenceId
        : failedEvidenceId,
    ],
    generationMethod: "rule-based-state",
    provider: input.provider,
  });

  return {
    success: false,
    error: {
      ...NETWORK_DISTRIBUTION_ANALYTICS_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance: failureProvenance,
      evidenceIds: failureProvenance.evidenceIds,
    },
  };
}

function distributionsSuccess(
  data: NetworkDistributionAnalyticsPayload,
): NetworkDistributionAnalyticsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function gapsSuccess(data: NetworkGapAnalysisPayload): NetworkGapAnalysisResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function safeSourceType(
  sourceType: ContactDTO["source"]["type"],
): NetworkDistributionAnalyticsSourceReference["type"] {
  if (
    sourceType === "manual" ||
    sourceType === "event_import" ||
    sourceType === "email_signal" ||
    sourceType === "calendar_signal" ||
    sourceType === "chat_summary" ||
    sourceType === "referral"
  ) {
    return sourceType;
  }

  return "system";
}

function sourceRefFor(
  contact: ContactDTO,
): NetworkDistributionAnalyticsSourceReference {
  return {
    type: safeSourceType(contact.source.type),
    id: contact.source.id,
    label: contact.source.label ?? "Live contact source",
    providerRecordId: contact.source.id,
    generatedBy: "live-store-query",
  };
}

function sourceRefsFor(
  contacts: readonly ContactDTO[],
): readonly NetworkDistributionAnalyticsSourceReference[] {
  const refs = new Map<string, NetworkDistributionAnalyticsSourceReference>();

  for (const contact of contacts) {
    const sourceRef = sourceRefFor(contact);
    refs.set(`${sourceRef.type}:${sourceRef.id}`, sourceRef);
  }

  return [...refs.values()].slice(0, 3);
}

function topOrganizations(contacts: readonly ContactDTO[]): readonly string[] {
  const counts = new Map<string, number>();

  for (const contact of contacts) {
    const organization = contact.organization?.trim();

    if (organization) {
      counts.set(organization, (counts.get(organization) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort(
      ([leftLabel, leftCount], [rightLabel, rightCount]) =>
        rightCount - leftCount || leftLabel.localeCompare(rightLabel),
    )
    .slice(0, 3)
    .map(([organization]) => organization);
}

function contactsForIndustry(
  graph: LiveDashboardGraph,
  definition: IndustryDefinition,
): readonly ContactDTO[] {
  return graph.contacts.filter((contact) =>
    contact.organization?.endsWith(definition.suffix),
  );
}

function industryDistribution(
  graph: LiveDashboardGraph,
): readonly IndustryDistributionBucket[] {
  const totalContacts = graph.contacts.length;

  return industryDefinitions
    .map((definition) => {
      const contacts = contactsForIndustry(graph, definition);
      const evidenceIds = uniqueStrings(
        contacts.flatMap((contact) => contact.evidenceIds),
      );

      return {
        bucketId: definition.bucketId,
        label: definition.label,
        contactCount: contacts.length,
        percentage: percentage(contacts.length, totalContacts),
        topOrganizations: topOrganizations(contacts),
        sourceRefs: sourceRefsFor(contacts),
        evidenceIds:
          evidenceIds.length > 0
            ? evidenceIds
            : [`evidence:network-distribution:${definition.suffix}`],
      };
    })
    .filter((bucket) => bucket.contactCount > 0);
}

function contactById(
  contacts: readonly ContactDTO[],
): ReadonlyMap<string, ContactDTO> {
  return new Map(contacts.map((contact) => [contact.id, contact]));
}

function hasInvestorAccess(
  connection: ConnectionDTO,
  contactsById: ReadonlyMap<string, ContactDTO>,
): boolean {
  const contact = contactsById.get(connection.contactId);
  const searchable = `${contact?.role ?? ""} ${contact?.organization ?? ""}`;

  return /investor|capital/i.test(searchable);
}

function valueTypesForConnection(
  connection: ConnectionDTO,
  contactsById: ReadonlyMap<string, ContactDTO>,
): readonly NetworkRelationshipValueType[] {
  const values: NetworkRelationshipValueType[] = [];

  if (connection.valueTypes.includes("commercial_opportunity")) {
    values.push("commercial_opportunity");
  }

  if (connection.valueTypes.includes("strategic_fit")) {
    values.push("strategic_fit");
  }

  if (connection.valueTypes.includes("referral_path")) {
    values.push("referral_path");
  }

  if (hasInvestorAccess(connection, contactsById)) {
    values.push("investor_access");
  }

  return values;
}

function valueTypeDistribution(
  graph: LiveDashboardGraph,
): readonly ValueTypeDistributionBucket[] {
  const contactsById = contactById(graph.contacts);
  const buckets = new Map<
    NetworkRelationshipValueType,
    { connectionIds: string[]; evidenceIds: string[] }
  >();

  for (const connection of graph.connections) {
    for (const valueType of valueTypesForConnection(connection, contactsById)) {
      const bucket =
        buckets.get(valueType) ?? { connectionIds: [], evidenceIds: [] };

      bucket.connectionIds.push(connection.id);
      bucket.evidenceIds.push(...connection.evidenceIds);
      buckets.set(valueType, bucket);
    }
  }

  const totalAssignments = [...buckets.values()].reduce(
    (total, bucket) => total + bucket.connectionIds.length,
    0,
  );
  const orderedValueTypes: readonly NetworkRelationshipValueType[] = [
    "commercial_opportunity",
    "strategic_fit",
    "referral_path",
    "investor_access",
  ];

  return orderedValueTypes
    .map((valueType) => {
      const bucket = buckets.get(valueType);
      const relationshipCount = bucket?.connectionIds.length ?? 0;

      return {
        valueType,
        label: valueTypeLabels[valueType],
        relationshipCount,
        percentage: percentage(relationshipCount, totalAssignments),
        exampleConnectionIds: (bucket?.connectionIds ?? []).slice(0, 3),
        evidenceIds:
          uniqueStrings(bucket?.evidenceIds ?? []).length > 0
            ? uniqueStrings(bucket?.evidenceIds ?? [])
            : [`evidence:network-distribution:value:${valueType}`],
      };
    })
    .filter((bucket) => bucket.relationshipCount > 0);
}

function strengthFor(connection: ConnectionDTO): NetworkRelationshipStrength {
  const score =
    connection.relationshipStrength ?? connection.businessRelevanceScore ?? 0;

  if (score >= 70) {
    return "strong";
  }

  if (score >= 45) {
    return "warm";
  }

  return "weak";
}

function followupRiskFor(
  strength: NetworkRelationshipStrength,
): RelationshipStrengthDistributionBucket["followupRisk"] {
  if (strength === "strong") {
    return "low";
  }

  if (strength === "warm") {
    return "moderate";
  }

  return "high";
}

function strengthDistribution(
  graph: LiveDashboardGraph,
): readonly RelationshipStrengthDistributionBucket[] {
  const buckets = new Map<NetworkRelationshipStrength, ConnectionDTO[]>();

  for (const connection of graph.connections) {
    const strength = strengthFor(connection);
    const bucket = buckets.get(strength) ?? [];

    bucket.push(connection);
    buckets.set(strength, bucket);
  }

  const orderedStrengths: readonly NetworkRelationshipStrength[] = [
    "strong",
    "warm",
    "weak",
  ];

  return orderedStrengths
    .map((strength) => {
      const connections = buckets.get(strength) ?? [];

      return {
        strength,
        relationshipCount: connections.length,
        percentage: percentage(connections.length, graph.connections.length),
        followupRisk: followupRiskFor(strength),
        evidenceIds:
          uniqueStrings(connections.flatMap((connection) => connection.evidenceIds))
            .length > 0
            ? uniqueStrings(
                connections.flatMap((connection) => connection.evidenceIds),
              )
            : [`evidence:network-distribution:strength:${strength}`],
      };
    })
    .filter((bucket) => bucket.relationshipCount > 0);
}

function evidenceIdsFor(graph: LiveDashboardGraph): readonly string[] {
  const ids = uniqueStrings([
    ...graph.contacts.flatMap((contact) => contact.evidenceIds),
    ...graph.connections.flatMap((connection) => connection.evidenceIds),
  ]);

  return ids.length > 0 ? ids : ["evidence:network-distribution-live-empty"];
}

function distributionPayload(
  graph: LiveDashboardGraph,
  provider: LiveNetworkDistributionAnalyticsProvider,
): NetworkDistributionAnalyticsPayload {
  return {
    state: graph.contacts.length > 0 ? "success" : "empty",
    industryDistribution: industryDistribution(graph),
    valueTypeDistribution: valueTypeDistribution(graph),
    relationshipStrengthDistribution: strengthDistribution(graph),
    summary:
      "Live network distribution analytics grouped source-backed contacts and relationships from shared live storage.",
    provenance: provenance({
      collectedAt: graph.generatedAt,
      databaseReadExecuted: true,
      evidenceIds: evidenceIdsFor(graph),
      generationMethod: "live-store-query",
      provider,
    }),
    nextAction:
      "Use live distribution buckets to choose the next event and follow-up focus.",
  };
}

function emptyDistributionPayload(input: {
  evidenceId: string;
  now: string;
  provider: LiveNetworkDistributionAnalyticsProvider;
  state: "empty" | "pending";
  summary: string;
  nextAction: string;
}): NetworkDistributionAnalyticsPayload {
  return {
    state: input.state,
    industryDistribution: [],
    valueTypeDistribution: [],
    relationshipStrengthDistribution: [],
    summary: input.summary,
    provenance: provenance({
      collectedAt: input.now,
      databaseReadExecuted: true,
      evidenceIds: [input.evidenceId],
      generationMethod: "rule-based-state",
      provider: input.provider,
    }),
    nextAction: input.nextAction,
  };
}

function severityFor(currentCount: number, targetCount: number): NetworkGapSeverity {
  const deficitRatio =
    targetCount > 0 ? (targetCount - currentCount) / targetCount : 0;

  if (deficitRatio >= 0.35) {
    return "high";
  }

  if (deficitRatio >= 0.1) {
    return "medium";
  }

  return "low";
}

function gap(input: {
  currentCount: number;
  evidenceIds: readonly string[];
  gapId: string;
  gapType: NetworkGapAnalysisItem["gapType"];
  label: string;
  recommendedAction: string;
  targetCount: number;
}): NetworkGapAnalysisItem {
  return {
    gapId: input.gapId,
    label: input.label,
    gapType: input.gapType,
    severity: severityFor(input.currentCount, input.targetCount),
    currentCount: input.currentCount,
    targetCount: input.targetCount,
    recommendedAction: input.recommendedAction,
    evidenceIds: input.evidenceIds,
  };
}

function coverageScore(gaps: readonly NetworkGapAnalysisItem[]): number {
  const totalTarget = gaps.reduce((total, item) => total + item.targetCount, 0);
  const totalDeficit = gaps.reduce(
    (total, item) => total + Math.max(0, item.targetCount - item.currentCount),
    0,
  );

  if (totalTarget === 0) {
    return 100;
  }

  return Math.max(0, Math.round(100 - (totalDeficit / totalTarget) * 125));
}

function gapPayload(
  graph: LiveDashboardGraph,
  provider: LiveNetworkDistributionAnalyticsProvider,
): NetworkGapAnalysisPayload {
  const industries = industryDistribution(graph);
  const values = valueTypeDistribution(graph);
  const strengths = strengthDistribution(graph);
  const smallestIndustry = [...industries].sort(
    (left, right) => left.contactCount - right.contactCount,
  )[0];
  const investorBucket = values.find(
    (bucket) => bucket.valueType === "investor_access",
  );
  const strongBucket = strengths.find((bucket) => bucket.strength === "strong");
  const industryTarget = Math.ceil(graph.contacts.length * 0.21);
  const investorTarget = Math.ceil(graph.connections.length * 0.1);
  const strongTarget = Math.ceil(graph.connections.length * 0.45);
  const gaps: NetworkGapAnalysisItem[] = [];

  if (smallestIndustry && smallestIndustry.contactCount < industryTarget) {
    gaps.push(
      gap({
        gapId: `gap:${smallestIndustry.bucketId.replace("industry:", "")}`,
        label: `${smallestIndustry.label} coverage`,
        gapType: "industry_underrepresented",
        currentCount: smallestIndustry.contactCount,
        targetCount: industryTarget,
        recommendedAction:
          "Prioritize sourced introductions that expand this underrepresented relationship segment.",
        evidenceIds: smallestIndustry.evidenceIds,
      }),
    );
  }

  if ((investorBucket?.relationshipCount ?? 0) < investorTarget) {
    gaps.push(
      gap({
        gapId: "gap:investor-access",
        label: "Investor access coverage",
        gapType: "value_type_underrepresented",
        currentCount: investorBucket?.relationshipCount ?? 0,
        targetCount: investorTarget,
        recommendedAction:
          "Use warm referrals and event recommendations to add more investor access paths.",
        evidenceIds:
          investorBucket?.evidenceIds ?? [
            "evidence:network-distribution:value:investor_access",
          ],
      }),
    );
  }

  if ((strongBucket?.relationshipCount ?? 0) < strongTarget) {
    gaps.push(
      gap({
        gapId: "gap:strong-relationships",
        label: "Strong relationship coverage",
        gapType: "strength_underrepresented",
        currentCount: strongBucket?.relationshipCount ?? 0,
        targetCount: strongTarget,
        recommendedAction:
          "Move warm relationships with clear business context into explicit follow-up tasks.",
        evidenceIds:
          strongBucket?.evidenceIds ?? [
            "evidence:network-distribution:strength:strong",
          ],
      }),
    );
  }

  return {
    state: graph.contacts.length > 0 ? "success" : "empty",
    coverageScore: coverageScore(gaps),
    gaps,
    summary:
      "Live network gap analysis compares generated relationship coverage against deterministic target thresholds.",
    provenance: provenance({
      collectedAt: graph.generatedAt,
      databaseReadExecuted: true,
      evidenceIds: uniqueStrings(gaps.flatMap((item) => item.evidenceIds)),
      generationMethod: "rule-based-gap-analysis",
      provider,
    }),
    nextAction:
      "Use live gap recommendations to tune event goals and follow-up priorities.",
  };
}

function emptyGapPayload(input: {
  evidenceId: string;
  now: string;
  provider: LiveNetworkDistributionAnalyticsProvider;
  state: "empty" | "pending";
  summary: string;
  nextAction: string;
}): NetworkGapAnalysisPayload {
  return {
    state: input.state,
    coverageScore: 0,
    gaps: [],
    summary: input.summary,
    provenance: provenance({
      collectedAt: input.now,
      databaseReadExecuted: true,
      evidenceIds: [input.evidenceId],
      generationMethod: "rule-based-state",
      provider: input.provider,
    }),
    nextAction: input.nextAction,
  };
}

export function createLiveNetworkDistributionAnalyticsService({
  now = () => new Date().toISOString(),
  provider,
}: LiveNetworkDistributionAnalyticsServiceOptions): NetworkDistributionAnalyticsService {
  return {
    async getDistributions(input = {}) {
      const capturedNow = now();

      if (!provider) {
        return failure("NETWORK_DISTRIBUTION_ANALYTICS_LIVE_STORE_UNCONFIGURED", {
          now: capturedNow,
          provider,
        });
      }

      switch (normalizeScenario(input.scenario)) {
        case "empty":
          return distributionsSuccess(
            emptyDistributionPayload({
              evidenceId: emptyEvidenceId,
              now: capturedNow,
              provider,
              state: "empty",
              summary:
                "No live relationships are available for network distribution analytics.",
              nextAction:
                "Seed or import source-backed contacts before showing distribution analytics.",
            }),
          );
        case "pending":
          return distributionsSuccess(
            emptyDistributionPayload({
              evidenceId: pendingEvidenceId,
              now: capturedNow,
              provider,
              state: "pending",
              summary:
                "Live network distribution analytics is waiting for relationship source review.",
              nextAction:
                "Keep distribution analytics pending until live source review is complete.",
            }),
          );
        case "failure":
          return failure("NETWORK_DISTRIBUTION_ANALYTICS_LIVE_FAILED", {
            now: capturedNow,
            provider,
          });
        case "success":
        default:
          return distributionsSuccess(
            distributionPayload(
              await provider.readNetworkDistributionGraph(),
              provider,
            ),
          );
      }
    },

    async getNetworkGaps(input = {}) {
      const capturedNow = now();

      if (!provider) {
        return failure("NETWORK_DISTRIBUTION_ANALYTICS_LIVE_STORE_UNCONFIGURED", {
          now: capturedNow,
          provider,
        });
      }

      switch (normalizeScenario(input.scenario)) {
        case "empty":
          return gapsSuccess(
            emptyGapPayload({
              evidenceId: emptyEvidenceId,
              now: capturedNow,
              provider,
              state: "empty",
              summary: "No live relationships are available for network gap analysis.",
              nextAction:
                "Seed or import source-backed contacts before showing network gaps.",
            }),
          );
        case "pending":
          return gapsSuccess(
            emptyGapPayload({
              evidenceId: pendingEvidenceId,
              now: capturedNow,
              provider,
              state: "pending",
              summary:
                "Live network gap analysis is waiting for relationship source review.",
              nextAction:
                "Keep network gap analysis pending until live source review is complete.",
            }),
          );
        case "failure":
          return failure("NETWORK_DISTRIBUTION_ANALYTICS_LIVE_FAILED", {
            now: capturedNow,
            provider,
          });
        case "success":
        default:
          return gapsSuccess(
            gapPayload(await provider.readNetworkDistributionGraph(), provider),
          );
      }
    },
  };
}
