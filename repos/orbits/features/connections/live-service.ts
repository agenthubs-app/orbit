import {
  CONNECTION_EVIDENCE_SERVICE_ERROR_DEFINITIONS,
  CONNECTION_EVIDENCE_SOURCE_TYPES,
  type ConnectionAddEvidenceInput,
  type ConnectionEvidenceAddResult,
  type ConnectionEvidenceContribution,
  type ConnectionEvidenceDetailPayload,
  type ConnectionEvidenceDetailResult,
  type ConnectionEvidenceErrorCode,
  type ConnectionEvidenceFailure,
  type ConnectionEvidenceFailureForCode,
  type ConnectionEvidenceInvalidBodyFailure,
  type ConnectionEvidenceListInput,
  type ConnectionEvidenceListPayload,
  type ConnectionEvidenceListResult,
  type ConnectionEvidenceLookupInput,
  type ConnectionEvidenceProvenance,
  type ConnectionEvidenceSourceType,
  type ConnectionEvidenceTimelineItem,
  type ConnectionRecord,
  type ConnectionSourceLink,
} from "./contract";
import type { ConnectionDTO, RelationshipEvidenceDTO } from "../../shared/domain/contracts";
import type { ConnectionEvidenceService } from "./service";
import type { LiveConnectionEvidenceGraph } from "./storage/connection-live-record-provider";

type LiveConnectionEvidenceProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveConnectionEvidenceProvider {
  source: string;
  sourceLabel: string;
  readConnectionEvidenceGraph: () => LiveConnectionEvidenceProviderResult<LiveConnectionEvidenceGraph>;
  readConnectionEvidenceGraphForConnection?: (
    connectionId: string,
  ) => LiveConnectionEvidenceProviderResult<LiveConnectionEvidenceGraph>;
}

export interface LiveConnectionEvidenceServiceOptions {
  provider?: LiveConnectionEvidenceProvider | null;
}

const supportedSourceTypes = new Set<ConnectionEvidenceSourceType>(
  CONNECTION_EVIDENCE_SOURCE_TYPES,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function sourceTypeFor(sourceType: string): ConnectionEvidenceSourceType {
  return supportedSourceTypes.has(sourceType as ConnectionEvidenceSourceType)
    ? (sourceType as ConnectionEvidenceSourceType)
    : "manual";
}

function evidenceById(
  evidence: readonly RelationshipEvidenceDTO[],
): Map<string, RelationshipEvidenceDTO> {
  return new Map(evidence.map((item) => [item.id, item]));
}

function contactById(graph: LiveConnectionEvidenceGraph) {
  return new Map(graph.contacts.map((contact) => [contact.id, contact]));
}

function sourceLinkFor(input: {
  connection: ConnectionDTO;
  evidence: RelationshipEvidenceDTO | null;
  evidenceId: string;
}): ConnectionSourceLink {
  const sourceType = sourceTypeFor(
    input.evidence?.sourceType ?? input.connection.source.type,
  );

  return {
    type: sourceType,
    id: input.evidence?.sourceId ?? input.connection.source.id,
    label:
      input.connection.source.label ??
      input.evidence?.sourceId ??
      "Live connection evidence",
    evidenceId: input.evidenceId,
    capturedAt: input.evidence?.occurredAt ?? input.connection.updatedAt,
    confidence: input.evidence ? "explicit" : "inferred_from_fixture",
  };
}

function timelineItemFor(input: {
  connection: ConnectionDTO;
  evidence: RelationshipEvidenceDTO | null;
  evidenceId: string;
  index: number;
}): ConnectionEvidenceTimelineItem {
  const sourceLink = sourceLinkFor(input);
  const contribution: ConnectionEvidenceContribution =
    input.index === 0 ? "origin" : "context";

  return {
    evidenceId: input.evidenceId,
    sourceLink,
    contribution,
    occurredAt: input.evidence?.occurredAt ?? input.connection.updatedAt,
    capturedAt: sourceLink.capturedAt,
    title: `Live evidence for ${input.connection.id}`,
    excerpt:
      input.evidence?.summary ??
      input.connection.summary ??
      "Live connection evidence is present but has no summary.",
    createdBy: "connection-evidence-live",
  };
}

function connectionRecordFor(input: {
  connection: ConnectionDTO;
  graph: LiveConnectionEvidenceGraph;
}): ConnectionRecord {
  const contactsById = contactById(input.graph);
  const contact = contactsById.get(input.connection.contactId);
  const evidenceMap = evidenceById(input.graph.evidence);
  const evidenceTimeline = input.connection.evidenceIds.map(
    (evidenceId, index) =>
      timelineItemFor({
        connection: input.connection,
        evidence: evidenceMap.get(evidenceId) ?? null,
        evidenceId,
        index,
      }),
  );
  const sourceLinks = evidenceTimeline.map((item) => item.sourceLink);
  const strengthScore =
    input.connection.relationshipStrength ??
    input.connection.businessRelevanceScore ??
    50;

  return {
    id: input.connection.id,
    contactId: input.connection.contactId,
    displayName: contact?.displayName ?? input.connection.contactId,
    role: contact?.role ?? "",
    organization: contact?.organization ?? "",
    location: contact?.location ?? "",
    connectionReason: input.connection.summary,
    relationshipStage: input.connection.stage,
    strengthScore,
    lastTouchedAt: input.connection.updatedAt,
    nextAction:
      input.connection.suggestedActions?.[0] ??
      "Review live connection evidence before taking action.",
    sourceLinks,
    evidenceTimeline,
    databaseReadExecuted: true,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function connectionRecords(graph: LiveConnectionEvidenceGraph): ConnectionRecord[] {
  return graph.connections.map((connection) =>
    connectionRecordFor({
      connection,
      graph,
    }),
  );
}

function evidenceIdsFor(records: readonly ConnectionRecord[]): readonly string[] {
  const ids = records.flatMap((record) =>
    record.evidenceTimeline.map((item) => item.evidenceId),
  );

  return ids.length > 0
    ? [...new Set(ids)]
    : ["evidence:connections-live-store-empty"];
}

function provenanceFor(input: {
  databaseReadExecuted: boolean;
  evidenceIds: readonly string[];
  graphGeneratedAt?: string;
  provider?: LiveConnectionEvidenceProvider;
}): ConnectionEvidenceProvenance {
  return {
    source: input.provider?.source ?? "live-record-store:connections:unconfigured",
    sourceLabel:
      input.provider?.sourceLabel ?? "Unconfigured Connections live store",
    evidenceIds:
      input.evidenceIds.length > 0
        ? input.evidenceIds
        : ["evidence:connections-live-store-unconfigured"],
    collectedAt: input.graphGeneratedAt ?? new Date(0).toISOString(),
    privacy: "live-connection-evidence",
    generationMethod: "live-store-query",
    databaseReadExecuted: input.databaseReadExecuted,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function failure(
  code: ConnectionEvidenceErrorCode,
  provenance: ConnectionEvidenceProvenance,
): ConnectionEvidenceFailure {
  const definition = CONNECTION_EVIDENCE_SERVICE_ERROR_DEFINITIONS[code];

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

function typedFailure<TCode extends ConnectionEvidenceErrorCode>(
  code: TCode,
  provenance: ConnectionEvidenceProvenance,
): ConnectionEvidenceFailureForCode<TCode> {
  return failure(code, provenance) as ConnectionEvidenceFailureForCode<TCode>;
}

function success<TData>(data: TData): { success: true; data: TData } {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function unconfiguredFailure(): ConnectionEvidenceFailure {
  return failure(
    "CONNECTION_LIVE_STORE_UNCONFIGURED",
    provenanceFor({
      databaseReadExecuted: false,
      evidenceIds: [],
    }),
  );
}

function listPayload(input: {
  graph: LiveConnectionEvidenceGraph;
  provider: LiveConnectionEvidenceProvider;
}): ConnectionEvidenceListPayload {
  const records = connectionRecords(input.graph);

  return {
    state: records.length > 0 ? "success" : "empty",
    connections: records,
    summary:
      records.length > 0
        ? `${records.length} connections were loaded from the live connection store.`
        : "No connections were available from the live connection store.",
    provenance: provenanceFor({
      databaseReadExecuted: true,
      evidenceIds: evidenceIdsFor(records),
      graphGeneratedAt: input.graph.generatedAt,
      provider: input.provider,
    }),
    nextAction:
      records.length > 0
        ? "Review live connection evidence before relationship actions."
        : "Add source-backed relationship records before reviewing connections.",
  };
}

function detailPayload(input: {
  graph: LiveConnectionEvidenceGraph;
  provider: LiveConnectionEvidenceProvider;
  record: ConnectionRecord;
}): ConnectionEvidenceDetailPayload {
  return {
    state: "success",
    connection: input.record,
    sourceLinks: input.record.sourceLinks,
    evidenceTimeline: input.record.evidenceTimeline,
    summary: `${input.record.displayName} is available from the live connection store.`,
    provenance: provenanceFor({
      databaseReadExecuted: true,
      evidenceIds: evidenceIdsFor([input.record]),
      graphGeneratedAt: input.graph.generatedAt,
      provider: input.provider,
    }),
    nextAction: input.record.nextAction,
  };
}

async function graphOrFailure(
  provider: LiveConnectionEvidenceProvider | null,
  connectionId?: string,
): Promise<LiveConnectionEvidenceGraph | ConnectionEvidenceFailure> {
  if (!provider) {
    return unconfiguredFailure();
  }

  if (connectionId && provider.readConnectionEvidenceGraphForConnection) {
    return provider.readConnectionEvidenceGraphForConnection(connectionId);
  }

  return provider.readConnectionEvidenceGraph();
}

function isFailure(
  value: LiveConnectionEvidenceGraph | ConnectionEvidenceFailure,
): value is ConnectionEvidenceFailure {
  return "success" in value && value.success === false;
}

export function createLiveConnectionEvidenceService({
  provider = null,
}: LiveConnectionEvidenceServiceOptions = {}): ConnectionEvidenceService {
  return {
    async listConnections(_input: ConnectionEvidenceListInput = {}): Promise<ConnectionEvidenceListResult> {
      const graph = await graphOrFailure(provider);

      if (isFailure(graph)) {
        return graph;
      }

      return success(listPayload({ graph, provider: provider as LiveConnectionEvidenceProvider }));
    },

    async getConnection(
      input: ConnectionEvidenceLookupInput,
    ): Promise<ConnectionEvidenceDetailResult> {
      const graph = await graphOrFailure(provider, input.connectionId.trim());

      if (isFailure(graph)) {
        return graph;
      }

      const record = connectionRecords(graph).find(
        (connection) => connection.id === input.connectionId.trim(),
      );

      if (!record) {
        return failure(
          "CONNECTION_NOT_FOUND",
          provenanceFor({
            databaseReadExecuted: true,
            evidenceIds: [],
            graphGeneratedAt: graph.generatedAt,
            provider: provider as LiveConnectionEvidenceProvider,
          }),
        );
      }

      return success(
        detailPayload({
          graph,
          provider: provider as LiveConnectionEvidenceProvider,
          record,
        }),
      );
    },

    async addEvidence(_input: ConnectionAddEvidenceInput): Promise<ConnectionEvidenceAddResult> {
      const graph = await graphOrFailure(provider);

      if (isFailure(graph)) {
        return graph;
      }

      return failure(
        "CONNECTION_EVIDENCE_ADD_PENDING",
        provenanceFor({
          databaseReadExecuted: true,
          evidenceIds: [],
          graphGeneratedAt: graph.generatedAt,
          provider: provider as LiveConnectionEvidenceProvider,
        }),
      );
    },

    invalidAddEvidenceBody(): ConnectionEvidenceInvalidBodyFailure {
      return typedFailure(
        "CONNECTION_EVIDENCE_INVALID_BODY",
        provenanceFor({
          databaseReadExecuted: false,
          evidenceIds: [],
          provider: provider ?? undefined,
        }),
      );
    },
  };
}
