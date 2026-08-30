import type {
  ConnectionDTO,
  ContactDTO,
} from "../../shared/domain/contracts";
import {
  INDUSTRY_CATALOG,
  industryLabel,
} from "../../shared/contract/industries";
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
  type NetworkStructureDetailInput,
  type NetworkStructureDetailPayload,
  type NetworkStructureDetailResult,
  type NetworkStructureDimensionId,
  type NetworkStructureDistributionBucket,
  type NetworkStructureDistributions,
  type RelationshipStrengthDistributionBucket,
  type ValueTypeDistributionBucket,
} from "./distribution-contract";
import type { LiveDashboardGraph } from "./storage/dashboard-live-record-provider";
import type { LiveNetworkDistributionAnalyticsProvider } from "./storage/network-distribution-live-record-provider";

export interface LiveNetworkDistributionAnalyticsServiceOptions {
  now?: () => string;
  provider: LiveNetworkDistributionAnalyticsProvider | null;
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

const valueTypeLabels: Record<NetworkRelationshipValueType, string> = {
  commercial_opportunity: "商业机会",
  strategic_fit: "战略匹配",
  referral_path: "引荐路径",
  investor_access: "投资人触达",
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

const structureDimensions: readonly NetworkStructureDimensionId[] = [
  "industry",
  "location",
  "role",
  "relationship",
];

const relationshipLabels: Record<NetworkRelationshipStrength, string> = {
  strong: "强关系",
  warm: "保持联系",
  weak: "待重新联系",
};

function allocatedPercentages(counts: readonly number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((count) => (count / total) * 100);
  const values = exact.map(Math.floor);
  let remainder = 100 - values.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ fraction: value - Math.floor(value), index }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < order.length && remainder > 0; index += 1) {
    values[order[index]!.index] += 1;
    remainder -= 1;
  }
  return values;
}

function normalizedLocation(location?: string): { id: string; label: string; missing: boolean } {
  const value = location?.trim();
  if (!value) return { id: "location_unknown", label: "地区待完善", missing: true };
  const aliases: readonly [RegExp, string, string][] = [
    [/东京|東京都|tokyo/iu, "location_tokyo", "东京"],
    [/大阪|osaka/iu, "location_osaka", "大阪"],
    [/京都|kyoto/iu, "location_kyoto", "京都"],
    [/神户|神戸|kobe/iu, "location_kobe", "神户"],
    [/横滨|横浜|yokohama/iu, "location_yokohama", "横滨"],
  ];
  const alias = aliases.find(([pattern]) => pattern.test(value));
  if (alias) return { id: alias[1], label: alias[2], missing: false };
  return {
    id: `location_${encodeURIComponent(value.toLocaleLowerCase())}`,
    label: value,
    missing: false,
  };
}

function normalizedRole(role?: string): { id: string; label: string; missing: boolean } {
  const value = role?.trim() ?? "";
  if (!value) return { id: "role_unknown", label: "角色待完善", missing: true };
  if (/创始|董事|社长|代表|合伙人|首席|founder|president|\bceo\b|\bcoo\b|\bcfo\b|\bcto\b/iu.test(value)) {
    return { id: "role_decision_maker", label: "经营决策者", missing: false };
  }
  if (/市场|销售|商务|业务拓展|business development|sales|marketing/iu.test(value)) {
    return { id: "role_business_growth", label: "业务拓展", missing: false };
  }
  if (/顾问|律师|会计|税务|consultant|advisor|lawyer/iu.test(value)) {
    return { id: "role_professional_advisor", label: "专业顾问", missing: false };
  }
  return { id: "role_operations", label: "运营与专业角色", missing: false };
}

function connectionByContactId(graph: LiveDashboardGraph): ReadonlyMap<string, ConnectionDTO> {
  return new Map(graph.connections.map((connection) => [connection.contactId, connection]));
}

function structureDescriptor(
  dimension: NetworkStructureDimensionId,
  contact: ContactDTO,
  connections: ReadonlyMap<string, ConnectionDTO>,
): { id: string; label: string; missing: boolean } {
  if (dimension === "industry") {
    return contact.primaryIndustryId
      ? {
          id: contact.primaryIndustryId,
          label: industryLabel(contact.primaryIndustryId, "zh"),
          missing: false,
        }
      : { id: "unclassified", label: "未分类", missing: true };
  }
  if (dimension === "location") return normalizedLocation(contact.location);
  if (dimension === "role") return normalizedRole(contact.role);
  const connection = connections.get(contact.id);
  const strength = connection ? strengthFor(connection) : "weak";
  return { id: strength, label: relationshipLabels[strength], missing: !connection };
}

function structureDistribution(
  graph: LiveDashboardGraph,
  dimension: NetworkStructureDimensionId,
): readonly NetworkStructureDistributionBucket[] {
  const connections = connectionByContactId(graph);
  const groups = new Map<
    string,
    { label: string; missing: boolean; contacts: ContactDTO[] }
  >();
  for (const contact of graph.contacts) {
    const descriptor = structureDescriptor(dimension, contact, connections);
    const group = groups.get(descriptor.id) ?? {
      label: descriptor.label,
      missing: descriptor.missing,
      contacts: [],
    };
    group.contacts.push(contact);
    groups.set(descriptor.id, group);
  }
  let entries = [...groups.entries()];
  if (dimension === "industry") {
    const order = new Map(INDUSTRY_CATALOG.map((item, index) => [item.id, index]));
    entries.sort(([left], [right]) =>
      (order.get(left as never) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right as never) ?? Number.MAX_SAFE_INTEGER),
    );
  } else if (dimension === "relationship") {
    const order = new Map(["strong", "warm", "weak"].map((id, index) => [id, index]));
    entries.sort(([left], [right]) => (order.get(left) ?? 9) - (order.get(right) ?? 9));
  } else {
    entries.sort(([, left], [, right]) =>
      right.contacts.length - left.contacts.length || left.label.localeCompare(right.label),
    );
  }
  const percentages = allocatedPercentages(entries.map(([, group]) => group.contacts.length));
  return entries.map(([bucketId, group], index) => ({
    bucketId,
    label: group.label,
    contactCount: group.contacts.length,
    percentage: percentages[index] ?? 0,
    evidenceIds: uniqueStrings(group.contacts.flatMap((contact) => contact.evidenceIds)),
    missingData: group.missing,
    ...(dimension === "industry" && bucketId !== "unclassified"
      ? { primaryIndustryId: bucketId as NetworkStructureDistributionBucket["primaryIndustryId"] }
      : {}),
  }));
}

function structureDistributions(graph: LiveDashboardGraph): NetworkStructureDistributions {
  return Object.fromEntries(
    structureDimensions.map((dimension) => [dimension, structureDistribution(graph, dimension)]),
  ) as unknown as NetworkStructureDistributions;
}

function industryDistribution(
  graph: LiveDashboardGraph,
): readonly IndustryDistributionBucket[] {
  const groups = structureDistribution(graph, "industry");
  return groups.map((group) => {
    const contacts = contactsForStructureBucket(graph, "industry", group.bucketId);
    return {
      bucketId: group.bucketId,
      label: group.label,
      contactCount: group.contactCount,
      percentage: group.percentage,
      topOrganizations: topOrganizations(contacts),
      sourceRefs: sourceRefsFor(contacts),
      evidenceIds: group.evidenceIds.length
        ? group.evidenceIds
        : [`evidence:network-distribution:${group.bucketId}`],
    };
  });
}

function contactsForStructureBucket(
  graph: LiveDashboardGraph,
  dimension: NetworkStructureDimensionId,
  bucketId: string,
): readonly ContactDTO[] {
  const connections = connectionByContactId(graph);
  return graph.contacts.filter(
    (contact) => structureDescriptor(dimension, contact, connections).id === bucketId,
  );
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

  return /investor|capital|投资|资本/i.test(searchable);
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
    structureDistributions: structureDistributions(graph),
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
    structureDistributions: {
      industry: [],
      location: [],
      role: [],
      relationship: [],
    },
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
    return 0;
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

function structureDetailSuccess(
  data: NetworkStructureDetailPayload,
): NetworkStructureDetailResult {
  return { success: true, data: clonePayload(data) };
}

function structureDetailPayload(
  graph: LiveDashboardGraph,
  provider: LiveNetworkDistributionAnalyticsProvider,
  input: NetworkStructureDetailInput & { dimension: NetworkStructureDimensionId },
): NetworkStructureDetailPayload | null {
  const bucket = structureDistribution(graph, input.dimension).find(
    (item) => item.bucketId === input.bucketId,
  );
  if (!bucket) return null;
  const contacts = contactsForStructureBucket(graph, input.dimension, input.bucketId);
  const connections = connectionByContactId(graph);
  const strengths: readonly NetworkRelationshipStrength[] = ["strong", "warm", "weak"];
  const qualityCounts = strengths.map(
    (strength) =>
      contacts.filter((contact) => {
        const connection = connections.get(contact.id);
        return (connection ? strengthFor(connection) : "weak") === strength;
      }).length,
  );
  const qualityPercentages = allocatedPercentages(qualityCounts);
  const tagCounts = new Map<string, number>();
  for (const contact of contacts) {
    for (const tag of new Set(contact.customTags ?? [])) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const commonTags = [...tagCounts.entries()]
    .sort(([leftTag, leftCount], [rightTag, rightCount]) =>
      rightCount - leftCount || leftTag.localeCompare(rightTag),
    )
    .slice(0, 4)
    .map(([label, contactCount]) => ({ label, contactCount }));
  const strongestIndex = qualityCounts.indexOf(Math.max(...qualityCounts));
  const strongest = strengths[Math.max(0, strongestIndex)] ?? "weak";

  return {
    state: contacts.length ? "success" : "empty",
    dimension: input.dimension,
    bucket,
    totalContactCount: graph.contacts.length,
    relationshipQuality: strengths.map((id, index) => ({
      id,
      label: relationshipLabels[id],
      contactCount: qualityCounts[index] ?? 0,
      percentage: qualityPercentages[index] ?? 0,
    })),
    commonTags,
    insight:
      contacts.length === 0
        ? "该分组暂时没有联系人。"
        : `${bucket.label}共有 ${contacts.length} 位联系人，当前以${relationshipLabels[strongest]}为主。`,
    contacts: [...contacts]
      .sort(
        (left, right) =>
          (connections.get(right.id)?.relationshipStrength ?? 0) -
            (connections.get(left.id)?.relationshipStrength ?? 0) ||
          left.displayName.localeCompare(right.displayName),
      )
      .map((contact) => {
        const connection = connections.get(contact.id);
        return {
          id: contact.id,
          displayName: contact.displayName,
          organization: contact.organization ?? "",
          role: contact.role ?? "",
          location: contact.location ?? "",
          relationshipStrength: connection ? strengthFor(connection) : "weak",
          tags: contact.customTags ?? [],
        };
      }),
    provenance: provenance({
      collectedAt: graph.generatedAt,
      databaseReadExecuted: true,
      evidenceIds: bucket.evidenceIds.length ? bucket.evidenceIds : [emptyEvidenceId],
      generationMethod: "live-store-query",
      provider,
    }),
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

    async getStructureDetail(input) {
      const capturedNow = now();
      if (!provider) {
        return failure("NETWORK_DISTRIBUTION_ANALYTICS_LIVE_STORE_UNCONFIGURED", {
          now: capturedNow,
          provider,
        });
      }
      if (!structureDimensions.includes(input.dimension as NetworkStructureDimensionId)) {
        return failure("NETWORK_STRUCTURE_BUCKET_NOT_FOUND", {
          now: capturedNow,
          provider,
        });
      }
      if (normalizeScenario(input.scenario) === "failure") {
        return failure("NETWORK_DISTRIBUTION_ANALYTICS_LIVE_FAILED", {
          now: capturedNow,
          provider,
        });
      }
      const graph = await provider.readNetworkDistributionGraph();
      const payload = structureDetailPayload(graph, provider, {
        ...input,
        dimension: input.dimension as NetworkStructureDimensionId,
      });
      return payload
        ? structureDetailSuccess(payload)
        : failure("NETWORK_STRUCTURE_BUCKET_NOT_FOUND", {
            now: capturedNow,
            provider,
          });
    },
  };
}
