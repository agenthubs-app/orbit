import { createHash } from "node:crypto";

import { readMatchFields } from "../../../profile/match-fields";
import {
  EventOperationsError,
  type EventOperationsCapturedSnapshot,
  type EventOperationsConfiguration,
  type EventOperationsParticipant,
} from "../contract";
import type { EventParticipantProfile } from "../../registration/contract";
import { matchingParticipant, type MatchingAccountProfile } from "../matching-profile";
import { normalizeEventParticipantAnswers } from "../participant";
import type { EventOperationsRepository } from "../repository";
import type {
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "./postgres-client";

type FrozenSnapshotMethods = Pick<
  EventOperationsRepository,
  "captureGenerationSnapshot"
>;

type SqlRow = Record<string, unknown>;

interface ProfilePayload {
  participant: EventOperationsParticipant;
  registrationProfile?: Pick<
    EventParticipantProfile,
    "answers" | "questionSetHash" | "questionSetVersion"
  >;
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function stableHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function snapshotHash(participants: readonly EventOperationsParticipant[]): string {
  return stableHash(participants);
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Frozen event snapshot row is missing ${field}.`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Frozen event snapshot row has an invalid ${field}.`);
  }
  return parsed;
}

function timestamp(value: unknown, field: string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Frozen event snapshot row has an invalid ${field}.`);
  }
  return new Date(parsed).toISOString();
}

function configurationFromRow(row: SqlRow): EventOperationsConfiguration {
  return {
    checkInOpensAt: timestamp(row.check_in_opens_at, "check_in_opens_at"),
    eventEndsAt: timestamp(row.event_ends_at, "event_ends_at"),
    eventId: text(row.event_id, "event_id"),
    eventStartsAt: timestamp(row.event_starts_at, "event_starts_at"),
    maxAttemptsPerTask: positiveInteger(
      row.max_attempts_per_task,
      "max_attempts_per_task",
    ),
    organizerActorId: text(row.organizer_actor_id, "organizer_actor_id"),
    profileEditDeadlineAt: timestamp(
      row.profile_edit_deadline_at,
      "profile_edit_deadline_at",
    ),
    recommendationCount: positiveInteger(
      row.recommendation_count,
      "recommendation_count",
    ),
    registrationCutoffAt: timestamp(
      row.registration_cutoff_at,
      "registration_cutoff_at",
    ),
    resultsAvailableAt: timestamp(
      row.results_available_at,
      "results_available_at",
    ),
    roundOneStartsAt: timestamp(
      row.round_one_starts_at,
      "round_one_starts_at",
    ),
    roundTwoStartsAt: timestamp(
      row.round_two_starts_at,
      "round_two_starts_at",
    ),
    shardSize: positiveInteger(row.shard_size, "shard_size"),
    tableSize: positiveInteger(row.table_size, "table_size"),
    updatedAt: timestamp(row.updated_at, "updated_at"),
  };
}

function profilePayload(value: unknown): ProfilePayload {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Frozen event snapshot has an invalid profile payload.");
  }
  const participant = (parsed as { participant?: unknown }).participant;
  if (!participant || typeof participant !== "object" || Array.isArray(participant)) {
    throw new Error("Frozen event snapshot profile is missing its participant DTO.");
  }
  const payload = clone(parsed) as ProfilePayload;
  if (!payload.participant.profileAnswers && payload.registrationProfile) {
    payload.participant.profileAnswers = normalizeEventParticipantAnswers(
      payload.registrationProfile.answers,
    );
  }
  return payload;
}

const stringList = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : null;

/**
 * The account profile's seeking / offering / topics for the matching card (2026-11-28, see matching-profile.ts).
 * Read in the capture transaction; a database without the shared record table (event-ops-only tests) has none.
 */
async function readMatchingAccountProfiles(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  actorIds: readonly string[],
): Promise<ReadonlyMap<string, MatchingAccountProfile>> {
  if (actorIds.length === 0) return new Map();
  const table = await executor.query<SqlRow>("select to_regclass('orbit_records') is not null as present");
  if (table.rows[0]?.present !== true) return new Map();
  const rows = await executor.query<SqlRow>(
    `
      select distinct on (account_id) account_id, offering, seeking, topics, headline, bio, role, seniority, match_fields
      from (
        select coalesce(payload->>'accountId', user_id) as account_id,
          payload->>'headline' as headline,
          coalesce(payload #>> '{publicProfile,bio}', payload->>'bio') as bio,
          payload->>'role' as role,
          coalesce(payload #>> '{publicProfile,seniorityLevel}', payload->>'seniorityLevel') as seniority,
          coalesce(payload #> '{publicProfile,offering}', payload -> 'offering') as offering,
          coalesce(payload #> '{publicProfile,seeking}', payload -> 'seeking') as seeking,
          coalesce(payload #> '{publicProfile,topics}', payload -> 'topics') as topics,
          payload #> '{publicProfile,matchFields}' as match_fields,
          updated_at
        from orbit_records
        where workspace_id = $1 and collection_name = 'profiles' and lifecycle_state <> 'deleted'
          and (payload->>'accountId' = any($2::text[]) or user_id = any($2::text[]))
      ) profile
      where account_id is not null
      order by account_id, updated_at desc
    `,
    [workspaceId, [...actorIds]],
  );
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  return new Map(rows.rows.map((row) => [String(row.account_id), {
    bio: text(row.bio),
    headline: text(row.headline),
    matchFields: readMatchFields(row.match_fields) ?? null,
    offering: stringList(row.offering),
    role: text(row.role),
    seniority: text(row.seniority),
    seeking: stringList(row.seeking),
    topics: stringList(row.topics),
  }]));
}

export async function readFrozenGenerationSnapshot(input: {
  configurationVersion?: number;
  eventId: string;
  executor: EventOperationsSqlExecutor;
  lockConfiguration?: boolean;
  workspaceId: string;
}): Promise<EventOperationsCapturedSnapshot> {
  const configuration = await input.executor.query<SqlRow>(
    `
      select
        configuration.*,
        event_row.organizer_actor_id,
        configuration_head.configuration_version::text as configuration_version,
        statement_timestamp() >= configuration.registration_cutoff_at
          as cutoff_reached,
        statement_timestamp() as captured_at
      from event_ops_configuration_heads configuration_head
      join event_ops_configurations configuration
        on configuration.workspace_id = configuration_head.workspace_id
        and configuration.event_id = configuration_head.event_id
        and configuration.configuration_version = configuration_head.configuration_version
      join event_ops_events event_row
        on event_row.workspace_id = configuration_head.workspace_id
        and event_row.event_id = configuration_head.event_id
      where configuration_head.workspace_id = $1
        and configuration_head.event_id = $2
        and ($3::bigint is null
          or configuration_head.configuration_version = $3::bigint)
        and event_row.lifecycle_state = 'active'
        and event_row.registration_migration_state = 'canonical'
      ${input.lockConfiguration ? "for share of configuration_head, configuration, event_row" : ""}
    `,
    [
      input.workspaceId,
      input.eventId,
      input.configurationVersion ?? null,
    ],
  );
  const configurationRow = configuration.rows[0];
  if (!configurationRow) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_NOT_CONFIGURED",
      "A canonical event registration snapshot requires one active configuration version.",
    );
  }
  const configurationVersion = positiveInteger(
    configurationRow.configuration_version,
    "configuration_version",
  );
  if (configurationRow.cutoff_reached !== true) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_GENERATION_NOT_READY",
      "The database registration cutoff must pass before snapshot capture.",
    );
  }
  const frozenConfiguration = configurationFromRow(configurationRow);

  const rows = await input.executor.query<SqlRow>(
    `
      with configuration as (
        select profile_edit_deadline_at, registration_cutoff_at
        from event_ops_configurations
        where workspace_id = $1 and event_id = $2
          and configuration_version = $3
      ), membership_at_cutoff as (
        select distinct on (membership.actor_id)
          membership.*
        from event_ops_membership_versions membership
        cross join configuration
        where membership.workspace_id = $1
          and membership.event_id = $2
          and membership.effective_at < configuration.registration_cutoff_at
        order by membership.actor_id, membership.membership_version desc
      )
      select
        membership.actor_id,
        membership.participant_id,
        membership.membership_version::text as membership_version,
        frozen_profile.profile_version::text as profile_version,
        frozen_profile.profile_payload,
        membership.late_registration
      from membership_at_cutoff membership
      cross join configuration
      left join lateral (
        select profile.profile_version, profile.profile_payload
        from event_ops_profile_versions profile
        where profile.workspace_id = membership.workspace_id
          and profile.event_id = membership.event_id
          and profile.participant_id = membership.participant_id
          and (
            (
              membership.late_registration = false
              and profile.effective_at < configuration.profile_edit_deadline_at
            )
            or (
              membership.late_registration = true
              and profile.profile_version = membership.profile_version
            )
          )
        order by profile.profile_version desc
        limit 1
      ) frozen_profile on true
      where membership.status = 'rsvped'
        and membership.late_registration = false
      order by membership.participant_id
    `,
    [input.workspaceId, input.eventId, configurationVersion],
  );

  const participants: EventOperationsParticipant[] = [];
  const frozen: { payload: ProfilePayload; row: SqlRow }[] = [];
  const sourceVersions: EventOperationsCapturedSnapshot["sourceVersions"][number][] = [];
  const actorIds = new Set<string>();
  const participantIds = new Set<string>();
  for (const row of rows.rows) {
    if (row.profile_payload === null || row.profile_payload === undefined) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_CONFIGURATION_INVALID",
        "An active cutoff membership has no eligible frozen profile version.",
      );
    }
    const actorId = text(row.actor_id, "actor_id");
    const participantId = text(row.participant_id, "participant_id");
    const payload = profilePayload(row.profile_payload);
    if (
      payload.participant.actorId !== actorId ||
      payload.participant.participantId !== participantId ||
      actorIds.has(actorId) ||
      participantIds.has(participantId)
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_CONFIGURATION_INVALID",
        "Frozen event registration identities are inconsistent or duplicated.",
      );
    }
    actorIds.add(actorId);
    participantIds.add(participantId);
    frozen.push({ payload, row });
    participants.push({
      ...payload.participant,
      lateRegistration: row.late_registration === true,
    });
    sourceVersions.push({
      actorId,
      membershipVersion: positiveInteger(
        row.membership_version,
        "membership_version",
      ),
      participantId,
      profileVersion: positiveInteger(row.profile_version, "profile_version"),
      ...(payload.registrationProfile?.questionSetHash
        ? { questionSetHash: payload.registrationProfile.questionSetHash }
        : {}),
      ...(payload.registrationProfile?.questionSetVersion
        ? { questionSetVersion: payload.registrationProfile.questionSetVersion }
        : {}),
    });
  }
  // Matching card (2026-11-28): rebuilt from the registration answers and the account profile; identity and the
  // other stored fields are unchanged.
  const accounts = await readMatchingAccountProfiles(input.executor, input.workspaceId, [...actorIds]);
  participants.forEach((participant, index) => {
    participants[index] = matchingParticipant(participant, {
      account: accounts.get(participant.actorId) ?? null,
      answers: frozen[index]!.payload.registrationProfile?.answers ?? null,
    });
  });
  return {
    configuration: frozenConfiguration,
    configurationHash: stableHash(frozenConfiguration),
    configurationVersion,
    snapshot: {
      capturedAt: timestamp(configurationRow.captured_at, "captured_at"),
      hash: snapshotHash(participants),
      participants,
    },
    sourceVersions,
  };
}

export function createPostgresFrozenSnapshotMethods({
  client,
  workspaceId,
}: EventOperationsPostgresRuntime): FrozenSnapshotMethods {
  return {
    captureGenerationSnapshot(eventId) {
      return client.transaction(
        (executor) =>
          readFrozenGenerationSnapshot({
            eventId,
            executor,
            lockConfiguration: true,
            workspaceId,
          }),
        { isolation: "repeatable read" },
      );
    },
  };
}

export const __eventOperationsFrozenSnapshotTestExports = {
  stableHash,
  snapshotHash,
};
