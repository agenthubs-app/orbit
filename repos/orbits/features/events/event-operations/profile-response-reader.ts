import type { EventParticipantProfileAnswers } from "../registration/contract";
import {
  legacyResponsesFromAnswers,
  type EventProfileResponseSnapshot,
} from "../registration/interview-response-contract";
import {
  createConfiguredEventOperationsPostgresRuntime,
  type EventOperationsPostgresRuntime,
  type EventOperationsSqlExecutor,
} from "./storage/postgres-client";

type SqlRow = Record<string, unknown>;

export interface EventProfileResponseVersion {
  profileVersion: number;
  responses: readonly EventProfileResponseSnapshot[];
}

export interface EventProfileResponseReader {
  read(input: {
    eventId: string;
    generationId?: string | null;
    participantId: string;
  }): Promise<EventProfileResponseVersion | null>;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Event profile response row has an invalid ${field}.`);
  }
  return parsed;
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Event profile response row has an invalid ${field}.`);
  }
  return parsed as Record<string, unknown>;
}

function responsesFromRows(
  rows: readonly SqlRow[],
): readonly EventProfileResponseSnapshot[] {
  return rows.flatMap((row) => {
    if (row.response_payload === null || row.response_payload === undefined) {
      return [];
    }
    return [
      objectValue(
        row.response_payload,
        "response_payload",
      ) as unknown as EventProfileResponseSnapshot,
    ];
  });
}

function legacyAnswers(row: SqlRow): EventParticipantProfileAnswers {
  const profilePayload = objectValue(row.profile_payload, "profile_payload");
  const registrationProfile = objectValue(
    profilePayload.registrationProfile,
    "registrationProfile",
  );
  return objectValue(registrationProfile.answers ?? {}, "answers") as EventParticipantProfileAnswers;
}

async function readWith(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  input: {
    eventId: string;
    generationId?: string | null;
    participantId: string;
  },
): Promise<EventProfileResponseVersion | null> {
  const selectedProfile = input.generationId
    ? `
      select participant.profile_version
      from event_ops_generation_participants participant
      where participant.workspace_id = $1
        and participant.generation_id = $4
        and participant.participant_id = $3
    `
    : `
      select profile_head.profile_version
      from event_ops_profile_heads profile_head
      where profile_head.workspace_id = $1
        and profile_head.event_id = $2
        and profile_head.participant_id = $3
    `;
  const result = await executor.query<SqlRow>(
    `
      with selected_profile as (${selectedProfile})
      select
        selected_profile.profile_version::text as profile_version,
        profile.profile_payload,
        response.response_payload,
        response.answered_at
      from selected_profile
      join event_ops_profile_versions profile
        on profile.workspace_id = $1
        and profile.event_id = $2
        and profile.participant_id = $3
        and profile.profile_version = selected_profile.profile_version
      left join event_ops_profile_response_versions response
        on response.workspace_id = profile.workspace_id
        and response.event_id = profile.event_id
        and response.participant_id = profile.participant_id
        and response.profile_version = profile.profile_version
      order by response.answered_at nulls last, response.field_key nulls last
    `,
    [workspaceId, input.eventId, input.participantId, input.generationId ?? null],
  );
  const first = result.rows[0];
  if (!first) return null;
  const profileVersion = positiveInteger(first.profile_version, "profile_version");
  const persisted = responsesFromRows(result.rows);
  return {
    profileVersion,
    responses:
      persisted.length > 0
        ? persisted
        : legacyResponsesFromAnswers(
            legacyAnswers(first),
            new Date(0).toISOString(),
          ),
  };
}

export function createPostgresEventProfileResponseReader({
  client,
  workspaceId,
}: EventOperationsPostgresRuntime): EventProfileResponseReader {
  return {
    read(input) {
      return readWith(client, workspaceId, input);
    },
  };
}

export function createConfiguredEventProfileResponseReader(): EventProfileResponseReader | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  return runtime ? createPostgresEventProfileResponseReader(runtime) : null;
}
