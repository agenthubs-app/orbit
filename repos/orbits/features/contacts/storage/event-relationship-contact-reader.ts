import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  isRelationshipStage,
  isRelationshipValueType,
  isSourceType,
} from "../../../shared/domain/source-types";
import type { LocalRemoteContactGraph } from "../contact-graph-provider";
import {
  createConfiguredEventOperationsPostgresRuntime,
  type EventOperationsSqlExecutor,
} from "../../events/event-operations/storage/postgres-client";

export interface EventRelationshipContactGraphReader {
  readAcceptedContactGraph(input: {
    actorId: string;
    contactId: string;
  }): Promise<LocalRemoteContactGraph | null>;
}

export interface CreateEventRelationshipContactGraphReaderOptions {
  client: EventOperationsSqlExecutor;
  workspaceId: string;
}

type RelationshipContactRow = {
  accepted_at: Date | string;
  connection_id: string;
  contact_id: string;
  evidence_payload: unknown;
  side_payload: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => nonEmptyString(item))
    : [];
}

function sourceReference(value: unknown): ContactDTO["source"] | null {
  if (!isRecord(value) || !isSourceType(value.type) || !nonEmptyString(value.id)) {
    return null;
  }
  return {
    id: value.id,
    label: nonEmptyString(value.label) ? value.label : undefined,
    type: value.type,
  };
}

function contactFromPayload(value: unknown): ContactDTO | null {
  if (!isRecord(value)) return null;
  const source = sourceReference(value.source);
  const ids = stringArray(value.evidenceIds);
  if (
    !nonEmptyString(value.id) ||
    !nonEmptyString(value.displayName) ||
    !isRelationshipStage(value.stage) ||
    !source ||
    ids.length === 0 ||
    !nonEmptyString(value.createdAt) ||
    !nonEmptyString(value.updatedAt)
  ) {
    return null;
  }
  return value as unknown as ContactDTO;
}

function connectionFromPayload(value: unknown): ConnectionDTO | null {
  if (!isRecord(value)) return null;
  const source = sourceReference(value.source);
  const ids = stringArray(value.evidenceIds);
  const valueTypes = stringArray(value.valueTypes);
  if (
    !nonEmptyString(value.id) ||
    !nonEmptyString(value.accountId) ||
    !nonEmptyString(value.contactId) ||
    !isRelationshipStage(value.stage) ||
    !nonEmptyString(value.summary) ||
    valueTypes.some((item) => !isRelationshipValueType(item)) ||
    !source ||
    ids.length === 0 ||
    !nonEmptyString(value.createdAt) ||
    !nonEmptyString(value.updatedAt)
  ) {
    return null;
  }
  return value as unknown as ConnectionDTO;
}

function evidenceFromPayload(value: unknown): RelationshipEvidenceDTO | null {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.id) ||
    !isSourceType(value.sourceType) ||
    !nonEmptyString(value.sourceId) ||
    !nonEmptyString(value.summary) ||
    !nonEmptyString(value.occurredAt) ||
    typeof value.confidence !== "number" ||
    !nonEmptyString(value.createdBy)
  ) {
    return null;
  }
  return value as unknown as RelationshipEvidenceDTO;
}

export function createEventRelationshipContactGraphReader({
  client,
  workspaceId,
}: CreateEventRelationshipContactGraphReaderOptions): EventRelationshipContactGraphReader {
  return {
    async readAcceptedContactGraph(input) {
      const actorId = input.actorId.trim();
      const contactId = input.contactId.trim();
      if (!actorId || !contactId) return null;

      const result = await client.query<RelationshipContactRow>(
        `
          select side.contact_id, side.connection_id, side.side_payload,
                 evidence.evidence_payload, pair.accepted_at
          from event_ops_relationship_sides side
          join event_ops_relationship_pairs pair
            on pair.workspace_id = side.workspace_id
            and pair.relationship_pair_id = side.relationship_pair_id
          join event_ops_contact_requests request
            on request.workspace_id = pair.workspace_id
            and request.request_id = pair.request_id
            and request.relationship_pair_id = pair.relationship_pair_id
            and request.event_id = pair.event_id
          join event_ops_relationship_evidence evidence
            on evidence.workspace_id = side.workspace_id
            and evidence.relationship_pair_id = side.relationship_pair_id
            and evidence.owner_actor_id = side.owner_actor_id
          where side.workspace_id = $1
            and side.owner_actor_id = $2
            and side.contact_id = $3
            and request.status = 'accepted'
          limit 1
        `,
        [workspaceId, actorId, contactId],
      );
      const row = result.rows[0];
      if (!row || !isRecord(row.side_payload)) return null;
      const contact = contactFromPayload(row.side_payload.contact);
      const connection = connectionFromPayload(row.side_payload.connection);
      const evidence = evidenceFromPayload(row.evidence_payload);
      if (
        !contact ||
        !connection ||
        !evidence ||
        contact.id !== row.contact_id ||
        connection.id !== row.connection_id ||
        connection.contactId !== contact.id
      ) {
        return null;
      }

      const acceptedAt =
        row.accepted_at instanceof Date
          ? row.accepted_at.toISOString()
          : new Date(row.accepted_at).toISOString();
      return {
        connections: [connection],
        contacts: [contact],
        evidence: [evidence],
        generatedAt: acceptedAt,
      };
    },
  };
}

export function createConfiguredEventRelationshipContactGraphReader(): EventRelationshipContactGraphReader | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  return runtime
    ? createEventRelationshipContactGraphReader({
        client: runtime.client,
        workspaceId: runtime.workspaceId,
      })
    : null;
}
