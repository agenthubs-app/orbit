import {
  SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ENTITY_KINDS,
  SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_DEFINITIONS,
  type SourceConsistencyAuditedCollection,
  type SourceConsistencyAuditFinding,
  type SourceConsistencyProvenanceAuditEntityKind,
  type SourceConsistencyProvenanceAuditErrorCode,
  type SourceConsistencyProvenanceAuditFailure,
  type SourceConsistencyProvenanceAuditInput,
  type SourceConsistencyProvenanceAuditPayload,
  type SourceConsistencyProvenanceAuditProvenance,
  type SourceConsistencyProvenanceAuditResult,
  type SourceConsistencyProvenanceAuditRunPayload,
  type SourceConsistencyProvenanceAuditRunResult,
  type SourceConsistencyProvenanceAuditScenario,
  type SourceConsistencyProvenanceAuditService,
  type SourceConsistencyProvenanceAuditSourceReference,
} from "./provenance-contract";
import {
  isSourceType,
  type SourceType,
} from "../../shared/domain/source-types";
import type { LiveRecord } from "../../shared/storage/live-record-store";

type LiveSourceConsistencyProvenanceAuditProviderResult<TResult> =
  | Promise<TResult>
  | TResult;

export interface LiveSourceConsistencyAuditCollectionRecords {
  collectionName: string;
  entityKind: SourceConsistencyProvenanceAuditEntityKind;
  records: readonly LiveRecord<Record<string, unknown>>[];
}

export interface LiveSourceConsistencyProvenanceGraph {
  collections: readonly LiveSourceConsistencyAuditCollectionRecords[];
  generatedAt: string;
}

export interface LiveSourceConsistencyProvenanceAuditProvider {
  source: string;
  sourceLabel: string;
  readAuditGraph: () => LiveSourceConsistencyProvenanceAuditProviderResult<LiveSourceConsistencyProvenanceGraph>;
}

export interface LiveSourceConsistencyProvenanceAuditServiceOptions {
  provider?: LiveSourceConsistencyProvenanceAuditProvider | null;
}

const supportedScenarios = new Set<SourceConsistencyProvenanceAuditScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const collectionLabels: Record<SourceConsistencyProvenanceAuditEntityKind, string> =
  {
    agent_action: "Agent actions",
    chat_summary: "Chat summaries",
    connection: "Connections",
    contact: "Contacts",
    evidence: "Evidence",
    recommendation: "Recommendations",
    task: "Tasks",
  };

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeScenario(
  scenario?: SourceConsistencyProvenanceAuditInput["scenario"],
): SourceConsistencyProvenanceAuditScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as SourceConsistencyProvenanceAuditScenario)
  ) {
    return scenario as SourceConsistencyProvenanceAuditScenario;
  }

  return "success";
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function liveSourceType(value: unknown): SourceType {
  return typeof value === "string" && isSourceType(value) ? value : "system";
}

function sourceReferenceFor(
  record: LiveRecord<Record<string, unknown>>,
): SourceConsistencyProvenanceAuditSourceReference {
  return {
    id: record.sourceId || `source:audit-live:${record.collectionName}`,
    type: liveSourceType(record.sourceType),
    label:
      record.sourceLabel ??
      `${record.collectionName} source ${record.sourceId || record.recordId}`,
    providerRecordId: record.providerRecordId ?? record.recordId,
    generatedBy: "live-store-query",
  };
}

function uniqueEvidenceIds(
  records: readonly LiveRecord<Record<string, unknown>>[],
): readonly string[] {
  const evidenceIds = records.flatMap((record) => record.evidenceIds);

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : ["evidence:audit-live-empty"];
}

function hasSource(record: LiveRecord<Record<string, unknown>>): boolean {
  return nonEmptyString(record.sourceId) && nonEmptyString(record.sourceType);
}

function hasProvenance(record: LiveRecord<Record<string, unknown>>): boolean {
  return record.evidenceIds.length > 0 && nonEmptyString(record.providerRecordId);
}

function sourceRefsFor(
  records: readonly LiveRecord<Record<string, unknown>>[],
): readonly SourceConsistencyProvenanceAuditSourceReference[] {
  const byId = new Map<string, SourceConsistencyProvenanceAuditSourceReference>();

  for (const record of records) {
    const source = sourceReferenceFor(record);
    const key = `${source.type}:${source.id}`;

    if (!byId.has(key)) {
      byId.set(key, source);
    }
  }

  return Array.from(byId.values()).slice(0, 8);
}

function collectionViewModel(
  collection: LiveSourceConsistencyAuditCollectionRecords,
): SourceConsistencyAuditedCollection {
  const consistentRecords = collection.records.filter(
    (record) => hasSource(record) && hasProvenance(record),
  );
  const inconsistentCount = collection.records.length - consistentRecords.length;

  return {
    entityKind: collection.entityKind,
    label: collectionLabels[collection.entityKind],
    auditedCount: collection.records.length,
    consistentCount: consistentRecords.length,
    inconsistentCount,
    sourceConsistent: inconsistentCount === 0,
    provenanceComplete: inconsistentCount === 0,
    sourceRefs: sourceRefsFor(collection.records),
    evidenceIds: uniqueEvidenceIds(collection.records),
  };
}

function findingForCollection(
  collection: SourceConsistencyAuditedCollection,
): SourceConsistencyAuditFinding | null {
  if (collection.inconsistentCount === 0) {
    return null;
  }

  return {
    findingId: `finding:live-audit:${collection.entityKind}:source-or-provenance`,
    entityKind: collection.entityKind,
    severity: collection.inconsistentCount > 10 ? "high" : "medium",
    ruleId: `${collection.entityKind}.source_and_provenance.complete`,
    title: `${collection.label} need source or provenance review`,
    detail: `${collection.inconsistentCount} ${collection.label.toLowerCase()} records are missing source or evidence provenance metadata.`,
    remediation:
      "Review the live record envelope and source-backed evidence links before using these records in automated actions.",
    affectedRecordIds: [],
    sourceConsistent: collection.sourceConsistent,
    provenanceComplete: collection.provenanceComplete,
    sourceRefs: collection.sourceRefs,
    evidenceIds: collection.evidenceIds,
  };
}

function provenanceFor(input: {
  collectedAt: string;
  databaseReadExecuted: boolean;
  evidenceIds: readonly string[];
  generationMethod: SourceConsistencyProvenanceAuditProvenance["generationMethod"];
  provider?: LiveSourceConsistencyProvenanceAuditProvider | null;
  sourceLabel?: string;
}): SourceConsistencyProvenanceAuditProvenance {
  return {
    source:
      input.provider?.source ??
      "live-record-store:source-consistency-provenance-audit:unconfigured",
    sourceLabel:
      input.sourceLabel ??
      input.provider?.sourceLabel ??
      "Unconfigured source consistency provenance live store",
    evidenceIds: input.evidenceIds,
    collectedAt: input.collectedAt,
    privacy: "live-source-consistency-provenance-audit",
    generationMethod: input.generationMethod,
    complianceReportingExecuted: false,
    productionAuditStorageWriteExecuted: false,
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

function emptyPayload(input: {
  graph?: LiveSourceConsistencyProvenanceGraph;
  provider?: LiveSourceConsistencyProvenanceAuditProvider | null;
  state: "empty" | "pending";
}): SourceConsistencyProvenanceAuditPayload {
  const evidenceIds =
    input.state === "empty"
      ? ["evidence:audit-live-empty"]
      : ["evidence:audit-live-pending"];

  return {
    state: input.state,
    activeFindingCount: 0,
    auditedCollections: [],
    findings: [],
    summary:
      input.state === "empty"
        ? "No live records are available for source consistency and provenance audit."
        : "Live source consistency and provenance audit is waiting for source review.",
    provenance: provenanceFor({
      collectedAt: input.graph?.generatedAt ?? new Date(0).toISOString(),
      databaseReadExecuted: Boolean(input.graph),
      evidenceIds,
      generationMethod: "live-store-query",
      provider: input.provider,
      sourceLabel:
        input.state === "empty"
          ? "Live source consistency provenance empty state"
          : "Live source consistency provenance pending state",
    }),
    nextAction:
      input.state === "empty"
        ? "Seed source-backed live records before running provenance audit."
        : "Resolve source review before using audit results.",
  };
}

function payloadFor(input: {
  graph: LiveSourceConsistencyProvenanceGraph;
  provider: LiveSourceConsistencyProvenanceAuditProvider;
}): SourceConsistencyProvenanceAuditPayload {
  const auditedCollections = SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ENTITY_KINDS.map(
    (entityKind) => {
      const collection = input.graph.collections.find(
        (item) => item.entityKind === entityKind,
      );

      return collectionViewModel({
        collectionName: collection?.collectionName ?? entityKind,
        entityKind,
        records: collection?.records ?? [],
      });
    },
  );
  const findings = auditedCollections
    .map(findingForCollection)
    .filter((finding): finding is SourceConsistencyAuditFinding => finding !== null);
  const evidenceIds = uniqueEvidenceIds(
    input.graph.collections.flatMap((collection) => collection.records),
  );
  const auditedCount = auditedCollections.reduce(
    (total, collection) => total + collection.auditedCount,
    0,
  );

  if (auditedCount === 0) {
    return emptyPayload({
      graph: input.graph,
      provider: input.provider,
      state: "empty",
    });
  }

  return {
    state: "success",
    activeFindingCount: findings.length,
    auditedCollections,
    findings,
    summary: `${auditedCount} live records were checked for source and provenance completeness.`,
    provenance: provenanceFor({
      collectedAt: input.graph.generatedAt,
      databaseReadExecuted: true,
      evidenceIds,
      generationMethod: "live-store-query",
      provider: input.provider,
    }),
    nextAction:
      findings.length > 0
        ? "Review records with missing source or provenance metadata before automated use."
        : "Use the audit snapshot as a review signal; no compliance report was persisted.",
  };
}

function runPayloadFor(
  snapshot: SourceConsistencyProvenanceAuditPayload,
): SourceConsistencyProvenanceAuditRunPayload {
  return {
    state: snapshot.state,
    runId: `source-consistency-live-run:${snapshot.provenance.collectedAt}`,
    runStartedAt: snapshot.provenance.collectedAt,
    scannedEntityKinds: snapshot.auditedCollections.map(
      (collection) => collection.entityKind,
    ),
    evaluatedRecordCount: snapshot.auditedCollections.reduce(
      (total, collection) => total + collection.auditedCount,
      0,
    ),
    activeFindingCount: snapshot.activeFindingCount,
    generatedFindingIds: snapshot.findings.map((finding) => finding.findingId),
    complianceReportPersisted: false,
    productionAuditStorageWritten: false,
    summary: `${snapshot.activeFindingCount} live source consistency findings were generated for review.`,
    provenance: {
      ...snapshot.provenance,
      generationMethod: "live-audit-run",
    },
    nextAction:
      "Review generated findings inside Orbit before any external compliance or audit workflow.",
  };
}

function auditSuccess(
  data: SourceConsistencyProvenanceAuditPayload,
): SourceConsistencyProvenanceAuditResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function runSuccess(
  data: SourceConsistencyProvenanceAuditRunPayload,
): SourceConsistencyProvenanceAuditRunResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: SourceConsistencyProvenanceAuditErrorCode,
  provenance: SourceConsistencyProvenanceAuditProvenance,
): SourceConsistencyProvenanceAuditFailure {
  const definition = SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function unconfiguredFailure(): SourceConsistencyProvenanceAuditFailure {
  return failure(
    "SOURCE_CONSISTENCY_PROVENANCE_AUDIT_LIVE_STORE_UNCONFIGURED",
    provenanceFor({
      collectedAt: new Date(0).toISOString(),
      databaseReadExecuted: false,
      evidenceIds: ["evidence:audit-live-store-unconfigured"],
      generationMethod: "live-store-query",
    }),
  );
}

async function graphOrFailure(
  provider: LiveSourceConsistencyProvenanceAuditProvider | null,
): Promise<
  SourceConsistencyProvenanceAuditFailure | LiveSourceConsistencyProvenanceGraph
> {
  if (!provider) {
    return unconfiguredFailure();
  }

  return provider.readAuditGraph();
}

function isFailure(
  value:
    | SourceConsistencyProvenanceAuditFailure
    | LiveSourceConsistencyProvenanceGraph,
): value is SourceConsistencyProvenanceAuditFailure {
  return "success" in value && value.success === false;
}

function scenarioAuditResult(input: {
  graph: LiveSourceConsistencyProvenanceGraph;
  provider: LiveSourceConsistencyProvenanceAuditProvider;
  scenario: SourceConsistencyProvenanceAuditScenario;
}): SourceConsistencyProvenanceAuditResult | null {
  if (input.scenario === "empty" || input.scenario === "pending") {
    return auditSuccess(
      emptyPayload({
        graph: input.graph,
        provider: input.provider,
        state: input.scenario,
      }),
    );
  }

  if (input.scenario === "failure") {
    return failure(
      "SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED",
      provenanceFor({
        collectedAt: input.graph.generatedAt,
        databaseReadExecuted: true,
        evidenceIds: ["evidence:audit-live-controlled-failure"],
        generationMethod: "live-store-query",
        provider: input.provider,
        sourceLabel: "Live source consistency provenance controlled failure",
      }),
    );
  }

  return null;
}

export function createLiveSourceConsistencyProvenanceAuditService({
  provider = null,
}: LiveSourceConsistencyProvenanceAuditServiceOptions = {}): SourceConsistencyProvenanceAuditService {
  return {
    async getAuditSnapshot(
      input = {},
    ): Promise<SourceConsistencyProvenanceAuditResult> {
      const graph = await graphOrFailure(provider);

      if (isFailure(graph)) {
        return graph;
      }

      const scenario = scenarioAuditResult({
        graph,
        provider: provider as LiveSourceConsistencyProvenanceAuditProvider,
        scenario: normalizeScenario(input.scenario),
      });

      if (scenario) {
        return scenario;
      }

      return auditSuccess(
        payloadFor({
          graph,
          provider: provider as LiveSourceConsistencyProvenanceAuditProvider,
        }),
      );
    },

    async runAudit(
      input = {},
    ): Promise<SourceConsistencyProvenanceAuditRunResult> {
      const snapshot = await this.getAuditSnapshot(input);

      if (snapshot.success === false) {
        return snapshot;
      }

      return runSuccess(runPayloadFor(snapshot.data));
    },
  };
}
