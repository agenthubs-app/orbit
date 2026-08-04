import { createHash } from "node:crypto";

import {
  EventOperationsError,
  type EventOperationsCandidate,
  type EventOperationsCheckIn,
  type EventOperationsConfiguration,
  type EventOperationsFailureCode,
  type EventOperationsGeneration,
  type EventOperationsGenerationTask,
  type EventOperationsParticipant,
  type EventOperationsPublishedResult,
  type EventOperationsTaskKind,
  type EventOperationsTaskOutput,
} from "../contract";
import type {
  ClaimEventOperationsTasksInput,
  CompleteEventOperationsTaskInput,
  EventOperationsTaskAttemptTelemetry,
  EventOperationsCatalogueSummary,
  EventOperationsGenerationPublishAuthorization,
  EventOperationsGenerationRunAuthorization,
  EventOperationsRepository,
  FailEventOperationsTaskInput,
  InitializeEventOperationsGenerationInput,
  SaveEventOperationsConfigurationAsOperatorInput,
} from "../repository";
import { canAccessEventCapability } from "../../event-access/capability-policy";
import type {
  EventAccessCapability,
  EventAccessAssignmentState,
  EventAccessRole,
} from "../../event-access/contract";
import { requireEventAccessRepositoryReadiness } from "../../event-access/storage/postgres-repository";
import type {
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "./postgres-client";
import { createPostgresCanonicalRegistrationMethods } from "./canonical-registration-repository";
import {
  createPostgresFrozenSnapshotMethods,
  readFrozenGenerationSnapshot,
} from "./frozen-snapshot-repository";
import { createPostgresOnsiteOperationsMethods } from "./onsite-operations-repository";

type SqlRow = Record<string, unknown>;

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

function payloadHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function text(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Event operations SQL row is missing ${key}.`);
  }
  return value;
}

function optionalText(row: SqlRow, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined ? null : text(row, key);
}

function integer(row: SqlRow, key: string): number {
  const value = row[key];
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Event operations SQL row has an invalid ${key}.`);
  }
  return parsed;
}

function optionalNumber(row: SqlRow, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Event operations SQL row has an invalid ${key}.`);
  }
  return parsed;
}

function timestamp(row: SqlRow, key: string): string {
  const value = row[key];
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Event operations SQL row has an invalid ${key}.`);
  }
  return new Date(parsed).toISOString();
}

function optionalTimestamp(row: SqlRow, key: string): string | null {
  return row[key] === null || row[key] === undefined
    ? null
    : timestamp(row, key);
}

function jsonValue<TValue>(row: SqlRow, key: string): TValue {
  const value = row[key];
  if (typeof value === "string") return JSON.parse(value) as TValue;
  return clone(value) as TValue;
}

function stringArray(row: SqlRow, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Event operations SQL row has an invalid ${key}.`);
  }
  return [...value];
}

function isPostgresCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function configurationFromRow(row: SqlRow): EventOperationsConfiguration {
  return {
    checkInOpensAt: timestamp(row, "check_in_opens_at"),
    eventEndsAt: timestamp(row, "event_ends_at"),
    eventId: text(row, "event_id"),
    eventStartsAt: timestamp(row, "event_starts_at"),
    maxAttemptsPerTask: integer(row, "max_attempts_per_task"),
    organizerActorId: text(row, "organizer_actor_id"),
    profileEditDeadlineAt: timestamp(row, "profile_edit_deadline_at"),
    recommendationCount: integer(row, "recommendation_count"),
    registrationCutoffAt: timestamp(row, "registration_cutoff_at"),
    resultsAvailableAt: timestamp(row, "results_available_at"),
    roundOneStartsAt: timestamp(row, "round_one_starts_at"),
    roundTwoStartsAt: timestamp(row, "round_two_starts_at"),
    shardSize: integer(row, "shard_size"),
    tableSize: integer(row, "table_size"),
    updatedAt: timestamp(row, "updated_at"),
  };
}

function taskKindFromRow(row: SqlRow): EventOperationsTaskKind {
  const kind = text(row, "task_kind");
  if (
    kind === "recommendation_shard" ||
    kind === "grouping_feature_shard" ||
    kind === "grouping_reduce" ||
    kind === "table_content_shard"
  ) {
    return kind;
  }
  throw new Error(`Unsupported event operations task kind ${kind}.`);
}

function taskKindForDatabase(kind: EventOperationsTaskKind): string {
  return kind;
}

function candidateFromRow(row: SqlRow): EventOperationsCandidate {
  return {
    featurePayload: jsonValue<
      Readonly<Record<string, string | number | boolean>>
    >(row, "feature_payload"),
    generationId: text(row, "generation_id"),
    retrievalRank: integer(row, "retrieval_rank"),
    retrievalScore: Number(row.retrieval_score),
    sourceParticipantId: text(row, "source_participant_id"),
    targetParticipantId: text(row, "target_participant_id"),
  };
}

function taskFromRow(row: SqlRow): EventOperationsGenerationTask {
  return {
    attemptLimit: integer(row, "attempt_limit"),
    attempts: integer(row, "attempts"),
    completedAt: optionalTimestamp(row, "completed_at"),
    createdAt: timestamp(row, "created_at"),
    dependsOnTaskIds: stringArray(row, "depends_on_task_ids"),
    errorCode: optionalText(row, "error_code") as EventOperationsFailureCode | null,
    errorMessage: optionalText(row, "error_message"),
    eventId: text(row, "event_id"),
    generationId: text(row, "generation_id"),
    kind: taskKindFromRow(row),
    leaseEpoch: integer(row, "lease_epoch"),
    leaseExpiresAt: optionalTimestamp(row, "lease_expires_at"),
    leaseToken: optionalText(row, "lease_token"),
    output:
      row.output_payload === null || row.output_payload === undefined
        ? null
        : jsonValue<EventOperationsTaskOutput>(row, "output_payload"),
    participantIds: stringArray(row, "participant_ids"),
    retryRound: integer(row, "retry_round"),
    status: text(row, "status") as EventOperationsGenerationTask["status"],
    taskId: text(row, "task_id"),
    updatedAt: timestamp(row, "updated_at"),
    workerId: optionalText(row, "worker_id"),
  };
}

function taskAttemptFromRow(row: SqlRow): EventOperationsTaskAttemptTelemetry {
  return {
    attempt: integer(row, "attempt"),
    claimedAt: timestamp(row, "claimed_at"),
    dependencyCount: integer(row, "dependency_count"),
    domainValidationDurationMs: optionalNumber(
      row,
      "domain_validation_duration_ms",
    ),
    eligibleAt: timestamp(row, "eligible_at"),
    failureCode: optionalText(
      row,
      "failure_code",
    ) as EventOperationsFailureCode | null,
    finishReason: optionalText(row, "finish_reason"),
    finishedAt: optionalTimestamp(row, "finished_at"),
    generationId: text(row, "generation_id"),
    kind: taskKindFromRow(row),
    leaseEpoch: integer(row, "lease_epoch"),
    model: optionalText(row, "model"),
    outcome: optionalText(row, "outcome") as EventOperationsTaskAttemptTelemetry["outcome"],
    participantCount: integer(row, "participant_count"),
    provider: optionalText(row, "provider"),
    providerAdapterDurationMs: optionalNumber(
      row,
      "provider_adapter_duration_ms",
    ),
    promptTokens: optionalNumber(row, "prompt_tokens"),
    completionTokens: optionalNumber(row, "completion_tokens"),
    reasoningTokens: optionalNumber(row, "reasoning_tokens"),
    cacheHitTokens: optionalNumber(row, "cache_hit_tokens"),
    requestBytes: optionalNumber(row, "request_bytes"),
    responseBytes: optionalNumber(row, "response_bytes"),
    retryRound: integer(row, "retry_round"),
    taskId: text(row, "task_id"),
    workerId: text(row, "worker_id"),
  };
}

function checkInFromRow(row: SqlRow): EventOperationsCheckIn {
  return {
    actorId: text(row, "actor_id"),
    checkedInAt: timestamp(row, "checked_in_at"),
    eventId: text(row, "event_id"),
    evidenceId: text(row, "evidence_id"),
    participantId: text(row, "participant_id"),
  };
}

function generationSelect(): string {
  return `
    select
      generation_id,
      event_id,
      organizer_actor_id,
      idempotency_key,
      snapshot_hash,
      ai_request_fingerprint,
      status,
      expected_task_count,
      completed_at,
      published_at,
      error_code,
      error_message,
      created_at,
      updated_at
    from event_ops_generations
  `;
}

async function participantsForGeneration(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  generationId: string,
): Promise<EventOperationsParticipant[]> {
  const result = await executor.query<SqlRow>(
    `
      select participant_payload
      from event_ops_generation_participants
      where workspace_id = $1 and generation_id = $2
      order by ordinal
    `,
    [workspaceId, generationId],
  );
  return result.rows.map((row) =>
    jsonValue<EventOperationsParticipant>(row, "participant_payload"),
  );
}

async function generationFromRow(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  row: SqlRow,
): Promise<EventOperationsGeneration> {
  const generationId = text(row, "generation_id");
  return {
    aiRequestFingerprint: text(row, "ai_request_fingerprint"),
    completedAt: optionalTimestamp(row, "completed_at"),
    createdAt: timestamp(row, "created_at"),
    errorCode: optionalText(row, "error_code") as EventOperationsFailureCode | null,
    errorMessage: optionalText(row, "error_message"),
    eventId: text(row, "event_id"),
    expectedTaskCount: integer(row, "expected_task_count"),
    generationId,
    idempotencyKey: text(row, "idempotency_key"),
    organizerActorId: text(row, "organizer_actor_id"),
    publishedAt: optionalTimestamp(row, "published_at"),
    snapshot: {
      capturedAt: timestamp(row, "created_at"),
      hash: text(row, "snapshot_hash"),
      participants: await participantsForGeneration(
        executor,
        workspaceId,
        generationId,
      ),
    },
    status: text(row, "status") as EventOperationsGeneration["status"],
    updatedAt: timestamp(row, "updated_at"),
  };
}

function assertGenerationTopology(
  input: InitializeEventOperationsGenerationInput,
): void {
  const { generation, tasks } = input;
  if (
    payloadHash(input.capturedSnapshot.configuration) !==
      input.capturedSnapshot.configurationHash ||
    input.capturedSnapshot.configuration.eventId !== generation.eventId ||
    input.capturedSnapshot.snapshot.hash !== generation.snapshot.hash ||
    payloadHash(input.capturedSnapshot.snapshot.participants) !==
      payloadHash(generation.snapshot.participants) ||
    input.capturedSnapshot.sourceVersions.length !==
      generation.snapshot.participants.length
  ) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONFIGURATION_INVALID",
      "Generation topology must use the captured canonical snapshot unchanged.",
    );
  }
  if (
    generation.expectedTaskCount <= 0 ||
    generation.expectedTaskCount !== tasks.length
  ) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONFIGURATION_INVALID",
      "Generation initialization requires the exact expected task topology.",
    );
  }
  const taskIds = new Set(tasks.map((task) => task.taskId));
  if (taskIds.size !== tasks.length) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONFIGURATION_INVALID",
      "Generation task ids must be unique.",
    );
  }
  for (const task of tasks) {
    if (
      task.eventId !== generation.eventId ||
      task.generationId !== generation.generationId ||
      task.dependsOnTaskIds.some(
        (dependencyId) =>
          dependencyId === task.taskId || !taskIds.has(dependencyId),
      )
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_CONFIGURATION_INVALID",
        "Generation tasks contain an invalid event, generation, or dependency.",
      );
    }
  }
  const participantIds = new Set(
    generation.snapshot.participants.map(
      (participant) => participant.participantId,
    ),
  );
  const candidateKeys = new Set<string>();
  const ranksBySource = new Map<string, number[]>();
  for (const candidate of input.candidates) {
    const key = `${candidate.sourceParticipantId}\u0000${candidate.targetParticipantId}`;
    if (
      candidate.generationId !== generation.generationId ||
      candidate.sourceParticipantId === candidate.targetParticipantId ||
      !participantIds.has(candidate.sourceParticipantId) ||
      !participantIds.has(candidate.targetParticipantId) ||
      !Number.isInteger(candidate.retrievalRank) ||
      candidate.retrievalRank < 1 ||
      !Number.isFinite(candidate.retrievalScore) ||
      candidateKeys.has(key)
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_CONFIGURATION_INVALID",
        "The deterministic candidate topology is invalid.",
      );
    }
    candidateKeys.add(key);
    const ranks = ranksBySource.get(candidate.sourceParticipantId) ?? [];
    ranks.push(candidate.retrievalRank);
    ranksBySource.set(candidate.sourceParticipantId, ranks);
  }
  for (const ranks of ranksBySource.values()) {
    ranks.sort((left, right) => left - right);
    if (ranks.some((rank, index) => rank !== index + 1)) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_CONFIGURATION_INVALID",
        "Candidate retrieval ranks must be contiguous for every source.",
      );
    }
  }
}

export interface CreatePostgresEventOperationsRepositoryOptions
  extends EventOperationsPostgresRuntime {}

export function createPostgresEventOperationsRepository({
  client,
  workspaceId,
}: CreatePostgresEventOperationsRepositoryOptions): EventOperationsRepository {
  const canonicalRegistration = createPostgresCanonicalRegistrationMethods({
    client,
    workspaceId,
  });
  const frozenSnapshots = createPostgresFrozenSnapshotMethods({
    client,
    workspaceId,
  });
  const onsiteOperations = createPostgresOnsiteOperationsMethods({
    client,
    workspaceId,
  });

  async function requireOperatorCapabilityInTransaction(
    transaction: EventOperationsSqlExecutor,
    authorization: {
      actingActorId: string;
      capability: EventAccessCapability;
      eventId: string;
      ownerOrganizerActorId: string;
    },
    denialMessage = "Event operations access is denied.",
  ): Promise<{
    assignmentRevision: number | null;
    ownerOrganizerActorId: string;
    principalRole: "owner" | EventAccessRole;
  }> {
    await requireEventAccessRepositoryReadiness(transaction);
    const actingActorId = authorization.actingActorId.trim();
    const event = await transaction.query<{ organizer_actor_id: string }>(
      `select organizer_actor_id
         from event_ops_events
        where workspace_id = $1 and event_id = $2
        for update`,
      [workspaceId, authorization.eventId],
    );
    const organizerActorId = event.rows[0]?.organizer_actor_id ?? null;
    const assignment = await transaction.query<{
      revision: number | string;
      role: EventAccessRole;
      state: EventAccessAssignmentState;
    }>(
      `select revision, role, state
         from event_ops_event_role_assignment_heads
        where workspace_id = $1
          and event_id = $2
          and subject_actor_id = $3
        for share`,
      [workspaceId, authorization.eventId, actingActorId],
    );
    const assignmentRow = assignment.rows[0] ?? null;
    const owner = organizerActorId === actingActorId;
    const assignmentRevision = assignmentRow
      ? Number(assignmentRow.revision)
      : null;
    if (
      !actingActorId ||
      event.rows.length !== 1 ||
      assignment.rows.length > 1 ||
      organizerActorId !== authorization.ownerOrganizerActorId ||
      (owner && assignmentRow !== null) ||
      (assignmentRow !== null && !Number.isSafeInteger(assignmentRevision)) ||
      !canAccessEventCapability({
        capability: authorization.capability,
        owner,
        role: assignmentRow?.role ?? null,
        state: assignmentRow?.state ?? null,
      })
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_FORBIDDEN",
        denialMessage,
      );
    }
    return {
      assignmentRevision,
      ownerOrganizerActorId: organizerActorId,
      principalRole: owner ? "owner" : assignmentRow!.role,
    };
  }

  async function getGenerationWith(
    executor: EventOperationsSqlExecutor,
    generationId: string,
  ): Promise<EventOperationsGeneration | null> {
    const result = await executor.query<SqlRow>(
      `${generationSelect()} where workspace_id = $1 and generation_id = $2`,
      [workspaceId, generationId],
    );
    const row = result.rows[0];
    return row ? generationFromRow(executor, workspaceId, row) : null;
  }

  async function existingGenerationForInitialization(
    executor: EventOperationsSqlExecutor,
    input: InitializeEventOperationsGenerationInput,
  ): Promise<EventOperationsGeneration | null> {
    const result = await executor.query<SqlRow>(
      `
        ${generationSelect()}
        where workspace_id = $1 and event_id = $2 and idempotency_key = $3
        for update
      `,
      [workspaceId, input.generation.eventId, input.generation.idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    const existing = await generationFromRow(executor, workspaceId, row);
    const taskCount = await executor.query<{ count: string }>(
      `
        select count(*)::text as count
        from event_ops_tasks
        where workspace_id = $1 and generation_id = $2
      `,
      [workspaceId, existing.generationId],
    );
    const candidateCount = await executor.query<{ count: string }>(
      `
        select count(*)::text as count
        from event_ops_candidates
        where workspace_id = $1 and generation_id = $2
      `,
      [workspaceId, existing.generationId],
    );
    if (
      existing.aiRequestFingerprint !== input.generation.aiRequestFingerprint ||
      existing.snapshot.hash !== input.generation.snapshot.hash ||
      existing.expectedTaskCount !== input.generation.expectedTaskCount ||
      Number(taskCount.rows[0]?.count ?? -1) !== existing.expectedTaskCount ||
      Number(candidateCount.rows[0]?.count ?? -1) !== input.candidates.length
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_CONFIGURATION_INVALID",
        "The idempotency key belongs to a different or incomplete generation topology.",
      );
    }
    return existing;
  }

  async function requireGenerationInitializationAuthorization(
    transaction: EventOperationsSqlExecutor,
    input: InitializeEventOperationsGenerationInput,
  ) {
    const validatedAuthorization =
      await requireOperatorCapabilityInTransaction(
        transaction,
        input.authorization,
      );
    if (
      input.authorization.eventId !== input.generation.eventId ||
      input.authorization.ownerOrganizerActorId !==
        input.generation.organizerActorId ||
      validatedAuthorization.ownerOrganizerActorId !==
        input.generation.organizerActorId
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_FORBIDDEN",
        "The generation authorization does not match its event owner.",
      );
    }
    return validatedAuthorization;
  }

  async function initializeGeneration(
    input: InitializeEventOperationsGenerationInput,
    retryAfterSerializationFailure = true,
  ): Promise<EventOperationsGeneration> {
    assertGenerationTopology(input);
    try {
      return await client.transaction(async (transaction) => {
        const validatedAuthorization =
          await requireGenerationInitializationAuthorization(
            transaction,
            input,
          );
        const existing = await existingGenerationForInitialization(
          transaction,
          input,
        );
        if (existing) return existing;

        const configuration = await transaction.query<{
          configuration_version: string;
          organizer_actor_id: string;
        }>(
          `
            select h.configuration_version::text, e.organizer_actor_id
            from event_ops_configuration_heads h
            join event_ops_events e
              on e.workspace_id = h.workspace_id and e.event_id = h.event_id
            where h.workspace_id = $1 and h.event_id = $2
            for update of h, e
          `,
          [workspaceId, input.generation.eventId],
        );
        const configurationRow = configuration.rows[0];
        if (!configurationRow) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_NOT_CONFIGURED",
            "Event operations must be configured before generation initialization.",
          );
        }
        if (
          configurationRow.organizer_actor_id !==
          input.generation.organizerActorId
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_FORBIDDEN",
            "The generation organizer does not own this event configuration.",
          );
        }
        const configurationVersion = Number(
          configurationRow.configuration_version,
        );
        if (
          configurationVersion !== input.capturedSnapshot.configurationVersion
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_CONFIGURATION_INVALID",
            "The event configuration changed after its participant snapshot was captured.",
          );
        }
        const verifiedSnapshot = await readFrozenGenerationSnapshot({
          configurationVersion,
          eventId: input.generation.eventId,
          executor: transaction,
          lockConfiguration: true,
          workspaceId,
        });
        if (
          verifiedSnapshot.configurationHash !==
            input.capturedSnapshot.configurationHash ||
          verifiedSnapshot.snapshot.hash !== input.generation.snapshot.hash ||
          payloadHash(verifiedSnapshot.sourceVersions) !==
            payloadHash(input.capturedSnapshot.sourceVersions)
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_CONFIGURATION_INVALID",
            "Canonical registration versions changed after snapshot capture.",
          );
        }

        await transaction.query(
          `
            insert into event_ops_generations (
              workspace_id, generation_id, event_id, organizer_actor_id,
              idempotency_key, configuration_version, snapshot_hash,
              ai_request_fingerprint, status,
              expected_task_count, completed_at, published_at, error_code,
              error_message, created_at, updated_at
            ) values (
              $1, $2, $3, $4, $5, $6, $7, $8, 'initializing', $9,
              null, null, null, null, $10, $10
            )
          `,
          [
            workspaceId,
            input.generation.generationId,
            input.generation.eventId,
            input.generation.organizerActorId,
            input.generation.idempotencyKey,
            configurationVersion,
            input.generation.snapshot.hash,
            input.generation.aiRequestFingerprint,
            input.generation.expectedTaskCount,
            input.generation.createdAt,
          ],
        );

        await transaction.query(
          `
            with configuration as (
              select profile_edit_deadline_at, registration_cutoff_at
              from event_ops_configurations
              where workspace_id = $1 and event_id = $3
                and configuration_version = $4
            ), membership_at_cutoff as (
              select distinct on (membership.actor_id)
                membership.*
              from event_ops_membership_versions membership
              cross join configuration
              where membership.workspace_id = $1
                and membership.event_id = $3
                and membership.effective_at < configuration.registration_cutoff_at
              order by membership.actor_id, membership.membership_version desc
            ), frozen_participants as (
              select
                membership.participant_id,
                membership.actor_id,
                membership.membership_version,
                frozen_profile.profile_version,
                frozen_profile.profile_payload -> 'participant'
                  || jsonb_build_object(
                    'lateRegistration', membership.late_registration
                  ) as participant_payload
              from membership_at_cutoff membership
              cross join configuration
              join lateral (
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
            )
            insert into event_ops_generation_participants (
              workspace_id, generation_id, participant_id, actor_id,
              profile_version, membership_version, ordinal,
              participant_payload
            )
            select
              $1, $2, participant_id, actor_id, profile_version,
              membership_version,
              row_number() over (order by participant_id) - 1,
              participant_payload
            from frozen_participants
            order by participant_id
          `,
          [
            workspaceId,
            input.generation.generationId,
            input.generation.eventId,
            configurationVersion,
          ],
        );
        const persistedParticipants = await transaction.query<{ count: string }>(
          `
            select count(*)::text as count
            from event_ops_generation_participants
            where workspace_id = $1 and generation_id = $2
          `,
          [workspaceId, input.generation.generationId],
        );
        if (
          Number(persistedParticipants.rows[0]?.count ?? -1) !==
          verifiedSnapshot.snapshot.participants.length
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_CONFIGURATION_INVALID",
            "Frozen generation participant persistence was incomplete.",
          );
        }

        const candidateChunkSize = 500;
        for (
          let start = 0;
          start < input.candidates.length;
          start += candidateChunkSize
        ) {
          const candidateValues: unknown[] = [];
          const candidateTuples = input.candidates
            .slice(start, start + candidateChunkSize)
            .map((candidate) => {
              const offset = candidateValues.length;
              candidateValues.push(
                workspaceId,
                candidate.generationId,
                candidate.sourceParticipantId,
                candidate.targetParticipantId,
                candidate.retrievalRank,
                candidate.retrievalScore,
                JSON.stringify(candidate.featurePayload),
                input.generation.createdAt,
              );
              return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb, $${offset + 8})`;
            });
          await transaction.query(
            `
              insert into event_ops_candidates (
                workspace_id, generation_id, source_participant_id,
                target_participant_id, retrieval_rank, retrieval_score,
                feature_payload, created_at
              ) values ${candidateTuples.join(", ")}
            `,
            candidateValues,
          );
        }

        const taskValues: unknown[] = [];
        const taskTuples = input.tasks.map((task) => {
          const offset = taskValues.length;
          taskValues.push(
            workspaceId,
            task.taskId,
            task.generationId,
            taskKindForDatabase(task.kind),
            task.status,
            [...task.participantIds],
            [...task.dependsOnTaskIds],
            task.attemptLimit,
            task.attempts,
            task.retryRound,
            task.leaseEpoch,
          );
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::text[], $${offset + 7}::text[], $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, statement_timestamp(), statement_timestamp())`;
        });
        await transaction.query(
          `
            insert into event_ops_tasks (
              workspace_id, task_id, generation_id, task_kind, status,
              participant_ids, depends_on_task_ids, attempt_limit, attempts,
              retry_round, lease_epoch, created_at, updated_at
            ) values ${taskTuples.join(", ")}
          `,
          taskValues,
        );
        const activated = await transaction.query<SqlRow>(
          `
            update event_ops_generations
            set status = 'queued', revision = revision + 1, updated_at = $3
            where workspace_id = $1 and generation_id = $2
              and status = 'initializing'
              and expected_task_count = (
                select count(*)
                from event_ops_tasks
                where workspace_id = $1 and generation_id = $2
              )
            returning *
          `,
          [workspaceId, input.generation.generationId, input.generation.updatedAt],
        );
        if (activated.rowCount !== 1) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_GENERATION_NOT_READY",
            "Generation task initialization did not reach its expected topology.",
          );
        }
        await transaction.query(
          `
            insert into event_ops_audit_log (
              workspace_id, audit_id, event_id, actor_id, action,
              aggregate_type, aggregate_id, before_payload, after_payload,
              evidence_ids, occurred_at
            ) values ($1, $2, $3, $4, 'generation_initialized', 'generation', $5,
              null, $6::jsonb, $7::text[], $8)
          `,
          [
            workspaceId,
            `audit:generation-initialized:${input.generation.generationId}`,
            input.generation.eventId,
            input.authorization.actingActorId,
            input.generation.generationId,
            JSON.stringify({
              actingRole: validatedAuthorization.principalRole,
              assignmentRevision:
                validatedAuthorization.assignmentRevision,
              expectedTaskCount: input.generation.expectedTaskCount,
              ownerOrganizerActorId:
                validatedAuthorization.ownerOrganizerActorId,
              snapshotHash: input.generation.snapshot.hash,
            }),
            input.generation.snapshot.participants.flatMap(
              (participant) => participant.evidenceIds,
            ),
            input.generation.createdAt,
          ],
        );
        return clone(input.generation);
      });
    } catch (error) {
      if (
        retryAfterSerializationFailure &&
        (isPostgresCode(error, "23505") || isPostgresCode(error, "40001"))
      ) {
        // The fresh SERIALIZABLE transaction repeats capability, owner, and
        // topology checks before returning an idempotent winner. Never read
        // an existing generation outside that authorization boundary.
        return initializeGeneration(input, false);
      }
      throw error;
    }
  }

  async function persistConfiguration(
    value: EventOperationsConfiguration,
    authorization?: Omit<
      SaveEventOperationsConfigurationAsOperatorInput,
      "configuration"
    >,
  ): Promise<EventOperationsConfiguration> {
    return client.transaction(async (transaction) => {
      if (authorization) {
        const validated = await requireOperatorCapabilityInTransaction(
          transaction,
          {
            actingActorId: authorization.actorId,
            capability: authorization.capability,
            eventId: value.eventId,
            ownerOrganizerActorId: value.organizerActorId,
          },
          "Event configuration access is denied.",
        );
        const configurationHead = await transaction.query<{
          configuration_version: number | string;
        }>(
          `select configuration_version
             from event_ops_configuration_heads
            where workspace_id = $1 and event_id = $2
            for update`,
          [workspaceId, value.eventId],
        );
        if (
          (configurationHead.rows.length === 0 &&
            validated.principalRole !== "owner") ||
          configurationHead.rows.length > 1 ||
          value.organizerActorId !== validated.ownerOrganizerActorId
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_FORBIDDEN",
            "Event configuration access is denied.",
          );
        }
      }

      const event = await transaction.query(
        `
          insert into event_ops_events (
            workspace_id, event_id, organizer_actor_id, lifecycle_state,
            registration_migration_state, revision, created_at, updated_at
          ) values ($1, $2, $3, 'active', 'importing', 1, $4, $4)
          on conflict (workspace_id, event_id) do update
          set revision = event_ops_events.revision + 1,
            updated_at = excluded.updated_at
          where event_ops_events.organizer_actor_id = excluded.organizer_actor_id
        `,
        [workspaceId, value.eventId, value.organizerActorId, value.updatedAt],
      );
      if (event.rowCount !== 1) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "The configured organizer cannot replace another event owner.",
        );
      }
      const head = await transaction.query<{ configuration_version: string }>(
        `
          select configuration_version::text
          from event_ops_configuration_heads
          where workspace_id = $1 and event_id = $2
          for update
        `,
        [workspaceId, value.eventId],
      );
      const version = Number(head.rows[0]?.configuration_version ?? 0) + 1;
      await transaction.query(
        `
          insert into event_ops_configurations (
            workspace_id, event_id, configuration_version,
            check_in_opens_at, event_starts_at, event_ends_at,
            profile_edit_deadline_at, registration_cutoff_at,
            results_available_at, round_one_starts_at, round_two_starts_at,
            recommendation_count, table_size, shard_size,
            max_attempts_per_task, created_at, updated_at
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $16
          )
        `,
        [
          workspaceId,
          value.eventId,
          version,
          value.checkInOpensAt,
          value.eventStartsAt,
          value.eventEndsAt,
          value.profileEditDeadlineAt,
          value.registrationCutoffAt,
          value.resultsAvailableAt,
          value.roundOneStartsAt,
          value.roundTwoStartsAt,
          value.recommendationCount,
          value.tableSize,
          value.shardSize,
          value.maxAttemptsPerTask,
          value.updatedAt,
        ],
      );
      await transaction.query(
        `
          insert into event_ops_configuration_heads (
            workspace_id, event_id, configuration_version, revision,
            updated_at
          ) values ($1, $2, $3, 1, $4)
          on conflict (workspace_id,event_id) do update
          set configuration_version = excluded.configuration_version,
            revision = event_ops_configuration_heads.revision + 1,
            updated_at = excluded.updated_at
        `,
        [workspaceId, value.eventId, version, value.updatedAt],
      );
      if (authorization) {
        await transaction.query(
          `insert into event_ops_audit_log (
             workspace_id, audit_id, event_id, actor_id, action,
             aggregate_type, aggregate_id, before_payload, after_payload,
             evidence_ids, occurred_at
           ) values (
             $1,$2,$3,$4,$7,
             'event_configuration',$3,$5::jsonb,$6::jsonb,'{}',
             statement_timestamp()
           )`,
          [
            workspaceId,
            `audit:event-configuration:${payloadHash({
              actorId: authorization.actorId,
              eventId: value.eventId,
              version,
              workspaceId,
            })}`,
            value.eventId,
            authorization.actorId,
            JSON.stringify({ configurationVersion: version - 1 }),
            JSON.stringify({
              configurationVersion: version,
              maxAttemptsPerTask: value.maxAttemptsPerTask,
              recommendationCount: value.recommendationCount,
              shardSize: value.shardSize,
              tableSize: value.tableSize,
            }),
            version === 1
              ? "event_configuration_created"
              : "event_configuration_updated",
          ],
        );
      }
      return clone(value);
    });
  }

  const repository: EventOperationsRepository = {
    ...canonicalRegistration,
    ...frozenSnapshots,
    ...onsiteOperations,
    async captureGenerationSnapshotAsOperator(authorization) {
      return client.transaction(
        async (transaction) => {
          await requireOperatorCapabilityInTransaction(
            transaction,
            authorization,
          );
          const captured = await readFrozenGenerationSnapshot({
            eventId: authorization.eventId,
            executor: transaction,
            lockConfiguration: true,
            workspaceId,
          });
          if (
            captured.configuration.organizerActorId !==
            authorization.ownerOrganizerActorId
          ) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_FORBIDDEN",
              "The frozen event owner changed during snapshot capture.",
            );
          }
          return captured;
        },
        { isolation: "repeatable read" },
      );
    },
    async claimTasks(input: ClaimEventOperationsTasksInput) {
      const limit = Math.max(1, Math.min(32, Math.floor(input.limit)));
      return client.transaction(
        async (transaction) => {
          await transaction.query(
            `
              with expired as (
                select task.*
                from event_ops_tasks task
                where task.workspace_id = $1 and task.generation_id = $2
                  and task.status = 'running'
                  and (
                    task.lease_expires_at is null
                    or task.lease_expires_at <= statement_timestamp()
                  )
                  and exists (
                    select 1
                    from event_ops_generations generation
                    where generation.workspace_id = task.workspace_id
                      and generation.generation_id = task.generation_id
                      and generation.ai_request_fingerprint = $3
                  )
                for update
              ),
              closed_attempts as (
                update event_ops_task_attempts attempt
                set finished_at = statement_timestamp(),
                  outcome = 'lease_lost',
                  failure_code = 'EVENT_OPERATIONS_LEASE_LOST'
                from expired
                where attempt.workspace_id = expired.workspace_id
                  and attempt.task_id = expired.task_id
                  and attempt.attempt = expired.attempts
                  and attempt.lease_epoch = expired.lease_epoch
                  and attempt.outcome is null
                returning attempt.task_id
              )
              update event_ops_tasks task
              set status = case
                  when task.attempts >= task.attempt_limit then 'failed'
                  else 'queued'
                end,
                error_code = case
                  when task.attempts >= task.attempt_limit then 'EVENT_OPERATIONS_LEASE_LOST'
                  else null
                end,
                error_message = case
                  when task.attempts >= task.attempt_limit
                    then 'The worker lease expired after its retry budget was exhausted.'
                  else null
                end,
                lease_token = null,
                lease_expires_at = null,
                worker_id = null,
                revision = task.revision + 1,
                updated_at = statement_timestamp()
              from expired
              where task.workspace_id = expired.workspace_id
                and task.task_id = expired.task_id
            `,
            [workspaceId, input.generationId, input.aiRequestFingerprint],
          );
          const claimed = await transaction.query<SqlRow>(
            `
              with eligible as (
                select candidate.task_id,
                  case
                    when candidate.retry_round > 0 or candidate.attempts > 0
                      then candidate.updated_at
                    when cardinality(candidate.depends_on_task_ids) = 0
                      then candidate.created_at
                    else (
                      select max(dependency.completed_at)
                      from unnest(candidate.depends_on_task_ids) dependency_id
                      join event_ops_tasks dependency
                        on dependency.workspace_id = candidate.workspace_id
                        and dependency.generation_id = candidate.generation_id
                        and dependency.task_id = dependency_id
                    )
                  end as eligible_at
                from event_ops_tasks candidate
                where candidate.workspace_id = $1
                  and candidate.generation_id = $2
                  and (
                    candidate.status = 'queued'
                    or (
                      candidate.status = 'failed'
                      and candidate.attempts < candidate.attempt_limit
                    )
                  )
                  and exists (
                    select 1
                    from event_ops_generations generation
                    where generation.workspace_id = candidate.workspace_id
                      and generation.generation_id = candidate.generation_id
                      and generation.status in ('queued', 'running')
                      and generation.ai_request_fingerprint = $3
                  )
                  and not exists (
                    select 1
                    from unnest(candidate.depends_on_task_ids) dependency_id
                    left join event_ops_tasks dependency
                      on dependency.workspace_id = candidate.workspace_id
                      and dependency.generation_id = candidate.generation_id
                      and dependency.task_id = dependency_id
                    where dependency.status is distinct from 'completed'
                  )
                order by
                  case candidate.task_kind
                    when 'candidate_retrieval' then 1
                    when 'recommendation_shard' then 2
                    when 'grouping_feature_shard' then 3
                    when 'grouping_reduce' then 4
                    else 5
                  end,
                  candidate.created_at,
                  candidate.task_id
                for update of candidate skip locked
                limit $4
              ),
              claimed as (
                update event_ops_tasks task
                set status = 'running',
                  attempts = task.attempts + 1,
                  lease_epoch = task.lease_epoch + 1,
                  lease_token = concat($5::text, ':', task.task_id, ':', task.lease_epoch + 1),
                  lease_expires_at = statement_timestamp()
                    + ($6::double precision * interval '1 millisecond'),
                  worker_id = $7,
                  error_code = null,
                  error_message = null,
                  revision = task.revision + 1,
                  updated_at = statement_timestamp()
                from eligible
                where task.workspace_id = $1 and task.task_id = eligible.task_id
                returning task.*, eligible.eligible_at
              ),
              inserted_attempts as (
                insert into event_ops_task_attempts (
                  workspace_id, generation_id, task_id, task_kind, attempt,
                  retry_round, lease_epoch, worker_id, participant_count,
                  dependency_count, eligible_at, claimed_at
                )
                select workspace_id, generation_id, task_id, task_kind, attempts,
                  retry_round, lease_epoch, worker_id,
                  cardinality(participant_ids), cardinality(depends_on_task_ids),
                  eligible_at, statement_timestamp()
                from claimed
                returning task_id
              )
              select claimed.*,
                (select event_id from event_ops_generations generation
                 where generation.workspace_id = claimed.workspace_id
                   and generation.generation_id = claimed.generation_id) as event_id
              from claimed
            `,
            [
              workspaceId,
              input.generationId,
              input.aiRequestFingerprint,
              limit,
              input.leaseTokenPrefix,
              input.leaseMs,
              input.workerId,
            ],
          );
          if (claimed.rowCount > 0) {
            await transaction.query(
              `
                update event_ops_generations
                set status = 'running', revision = revision + 1,
                  updated_at = statement_timestamp()
                where workspace_id = $1 and generation_id = $2
                  and status = 'queued'
              `,
              [workspaceId, input.generationId],
            );
          }
          return claimed.rows.map(taskFromRow);
        },
        { isolation: "read committed" },
      );
    },

    async completeTask(input: CompleteEventOperationsTaskInput) {
      return client.transaction(async (transaction) => {
        const updated = await transaction.query<SqlRow>(
          `
            update event_ops_tasks
            set status = 'completed', output_payload = $5::jsonb,
              output_hash = $6, error_code = null, error_message = null,
              lease_token = null, lease_expires_at = null, worker_id = null,
              completed_at = statement_timestamp(), revision = revision + 1,
              updated_at = statement_timestamp()
            where workspace_id = $1 and task_id = $2 and status = 'running'
              and lease_token = $3 and lease_epoch = $4
              and lease_expires_at > statement_timestamp()
            returning generation_id, attempts
          `,
          [
            workspaceId,
            input.taskId,
            input.leaseToken,
            input.leaseEpoch,
            JSON.stringify(input.output),
            input.artifact.responseHash,
          ],
        );
        const task = updated.rows[0];
        if (!task) return false;
        const telemetry = input.telemetry;
        const closedAttempt = await transaction.query(
          `
            update event_ops_task_attempts
            set finished_at = statement_timestamp(),
              provider_adapter_duration_ms = $5,
              domain_validation_duration_ms = $6,
              request_bytes = $7,
              response_bytes = $8,
              provider = $9,
              model = $10,
              finish_reason = $11,
              prompt_tokens = $12,
              completion_tokens = $13,
              reasoning_tokens = $14,
              cache_hit_tokens = $15,
              outcome = 'completed',
              failure_code = null
            where workspace_id = $1 and task_id = $2 and attempt = $3
              and lease_epoch = $4 and outcome is null
          `,
          [
            workspaceId,
            input.taskId,
            integer(task, "attempts"),
            input.leaseEpoch,
            telemetry?.providerAdapterDurationMs ?? null,
            telemetry?.domainValidationDurationMs ?? null,
            telemetry?.requestBytes ?? null,
            telemetry?.responseBytes ?? null,
            telemetry?.provider ?? null,
            telemetry?.model ?? null,
            telemetry?.responseMetadata?.finishReason ?? null,
            telemetry?.responseMetadata?.usage?.promptTokens ?? null,
            telemetry?.responseMetadata?.usage?.completionTokens ?? null,
            telemetry?.responseMetadata?.usage?.reasoningTokens ?? null,
            telemetry?.responseMetadata?.usage?.cacheHitTokens ?? null,
          ],
        );
        if (closedAttempt.rowCount !== 1) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_LEASE_LOST",
            "The task attempt telemetry row was not owned by this completed lease.",
          );
        }
        await transaction.query(
          `
            insert into event_ops_ai_artifacts (
              workspace_id, artifact_id, generation_id, task_id, attempt,
              artifact_kind, provider, model, request_hash, response_hash,
              schema_version, evidence_metadata, validated_payload, created_at
            ) values (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
              $12::jsonb, $13::jsonb, statement_timestamp()
            )
          `,
          [
            workspaceId,
            `artifact:${input.taskId}:attempt:${integer(task, "attempts")}`,
            text(task, "generation_id"),
            input.taskId,
            integer(task, "attempts"),
            input.artifact.kind,
            input.artifact.provider,
            input.artifact.model,
            input.artifact.requestHash,
            input.artifact.responseHash,
            input.artifact.schemaVersion,
            JSON.stringify(input.artifact.evidenceMetadata),
            JSON.stringify(input.output),
          ],
        );
        return true;
      }, { isolation: "read committed" });
    },

    async failTask(input: FailEventOperationsTaskInput) {
      return client.transaction(async (transaction) => {
        const current = await transaction.query<SqlRow>(
          `
            select attempts, attempt_limit
            from event_ops_tasks
            where workspace_id = $1 and task_id = $2 and status = 'running'
              and lease_token = $3 and lease_epoch = $4
              and lease_expires_at > statement_timestamp()
            for update
          `,
          [workspaceId, input.taskId, input.leaseToken, input.leaseEpoch],
        );
        const task = current.rows[0];
        if (!task) return false;
        const attempt = integer(task, "attempts");
        const retryable = input.retryable && attempt < integer(task, "attempt_limit");
        const updated = await transaction.query(
          `
            update event_ops_tasks
            set status = 'failed',
              attempts = case when $7::boolean then attempts else attempt_limit end,
              output_payload = null, output_hash = null,
              error_code = $5, error_message = $6, lease_token = null,
              lease_expires_at = null, worker_id = null, completed_at = null,
              revision = revision + 1, updated_at = statement_timestamp()
            where workspace_id = $1 and task_id = $2 and status = 'running'
              and lease_token = $3 and lease_epoch = $4
          `,
          [
            workspaceId,
            input.taskId,
            input.leaseToken,
            input.leaseEpoch,
            input.code,
            input.message,
            input.retryable,
          ],
        );
        if (updated.rowCount !== 1) return false;
        const telemetry = input.telemetry;
        const closedAttempt = await transaction.query(
          `
            update event_ops_task_attempts
            set finished_at = statement_timestamp(),
              provider_adapter_duration_ms = $5,
              domain_validation_duration_ms = $6,
              request_bytes = $7,
              response_bytes = $8,
              provider = $9,
              model = $10,
              finish_reason = $11,
              prompt_tokens = $12,
              completion_tokens = $13,
              reasoning_tokens = $14,
              cache_hit_tokens = $15,
              outcome = $16,
              failure_code = $17
            where workspace_id = $1 and task_id = $2 and attempt = $3
              and lease_epoch = $4 and outcome is null
          `,
          [
            workspaceId,
            input.taskId,
            attempt,
            input.leaseEpoch,
            telemetry?.providerAdapterDurationMs ?? null,
            telemetry?.domainValidationDurationMs ?? null,
            telemetry?.requestBytes ?? null,
            telemetry?.responseBytes ?? null,
            telemetry?.provider ?? null,
            telemetry?.model ?? null,
            telemetry?.responseMetadata?.finishReason ?? null,
            telemetry?.responseMetadata?.usage?.promptTokens ?? null,
            telemetry?.responseMetadata?.usage?.completionTokens ?? null,
            telemetry?.responseMetadata?.usage?.reasoningTokens ?? null,
            telemetry?.responseMetadata?.usage?.cacheHitTokens ?? null,
            retryable ? "retryable_failed" : "terminal_failed",
            input.code,
          ],
        );
        if (closedAttempt.rowCount !== 1) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_LEASE_LOST",
            "The task attempt telemetry row was not owned by this failed lease.",
          );
        }
        return true;
      }, { isolation: "read committed" });
    },

    async heartbeatTask(input) {
      const result = await client.query(
        `
          update event_ops_tasks
          set lease_expires_at = statement_timestamp()
                + ($6::double precision * interval '1 millisecond'),
            revision = revision + 1, updated_at = statement_timestamp()
          where workspace_id = $1 and task_id = $2 and status = 'running'
            and lease_token = $3 and lease_epoch = $4 and worker_id = $5
            and lease_expires_at > statement_timestamp()
        `,
        [
          workspaceId,
          input.taskId,
          input.leaseToken,
          input.leaseEpoch,
          input.workerId,
          input.leaseMs,
        ],
      );
      return result.rowCount === 1;
    },

    async finalizeGeneration(generationId, finalizedAt) {
      return client.transaction(async (transaction) => {
        const generationResult = await transaction.query<SqlRow>(
          `
            ${generationSelect()}
            where workspace_id = $1 and generation_id = $2
            for update
          `,
          [workspaceId, generationId],
        );
        const generationRow = generationResult.rows[0];
        if (!generationRow) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_GENERATION_NOT_FOUND",
            "The event operations generation does not exist.",
          );
        }
        const currentStatus = text(generationRow, "status");
        if (currentStatus === "published") {
          return generationFromRow(transaction, workspaceId, generationRow);
        }
        const counts = await transaction.query<SqlRow>(
          `
            select
              count(*)::text as total,
              count(*) filter (where status = 'completed')::text as completed,
              count(*) filter (
                where status = 'failed' and attempts >= attempt_limit
              )::text as exhausted
            from event_ops_tasks
            where workspace_id = $1 and generation_id = $2
          `,
          [workspaceId, generationId],
        );
        const countRow = counts.rows[0] ?? {};
        const total = Number(countRow.total ?? 0);
        const completed = Number(countRow.completed ?? 0);
        const exhausted = Number(countRow.exhausted ?? 0);
        const expected = integer(generationRow, "expected_task_count");
        let status: EventOperationsGeneration["status"] = "running";
        let errorCode: EventOperationsFailureCode | null = null;
        let errorMessage: string | null = null;
        let completedAt: string | null = null;
        if (total !== expected) {
          status = "failed";
          errorCode = "EVENT_OPERATIONS_SHARD_FAILED";
          errorMessage = "The persisted generation task topology is incomplete.";
        } else if (completed === expected) {
          status = "completed";
          completedAt = finalizedAt;
        } else if (exhausted > 0) {
          const failure = await transaction.query<SqlRow>(
            `
              select error_code, error_message
              from event_ops_tasks
              where workspace_id = $1 and generation_id = $2
                and status = 'failed' and attempts >= attempt_limit
              order by updated_at, task_id
              limit 1
            `,
            [workspaceId, generationId],
          );
          status = "failed";
          errorCode =
            (optionalText(failure.rows[0] ?? {}, "error_code") as EventOperationsFailureCode | null) ??
            "EVENT_OPERATIONS_SHARD_FAILED";
          errorMessage =
            optionalText(failure.rows[0] ?? {}, "error_message") ??
            "At least one AI task exhausted its retry budget.";
        }
        const updated = await transaction.query<SqlRow>(
          `
            update event_ops_generations
            set status = $3, completed_at = $4, error_code = $5,
              error_message = $6, revision = revision + 1, updated_at = $7
            where workspace_id = $1 and generation_id = $2
            returning *
          `,
          [
            workspaceId,
            generationId,
            status,
            completedAt,
            errorCode,
            errorMessage,
            finalizedAt,
          ],
        );
        return generationFromRow(transaction, workspaceId, updated.rows[0]!);
      });
    },

    async findGenerationByIdempotencyKey(eventId, idempotencyKey) {
      const result = await client.query<SqlRow>(
        `
          ${generationSelect()}
          where workspace_id = $1 and event_id = $2 and idempotency_key = $3
        `,
        [workspaceId, eventId, idempotencyKey],
      );
      const row = result.rows[0];
      return row ? generationFromRow(client, workspaceId, row) : null;
    },

    async getCheckIn(eventId, actorId) {
      const result = await client.query<SqlRow>(
        `
          select * from event_ops_checkins
          where workspace_id = $1 and event_id = $2 and actor_id = $3
        `,
        [workspaceId, eventId, actorId],
      );
      return result.rows[0] ? checkInFromRow(result.rows[0]) : null;
    },

    async getConfiguration(eventId) {
      const result = await client.query<SqlRow>(
        `
          select configuration.*, event.organizer_actor_id
          from event_ops_configuration_heads head
          join event_ops_configurations configuration
            on configuration.workspace_id = head.workspace_id
            and configuration.event_id = head.event_id
            and configuration.configuration_version = head.configuration_version
          join event_ops_events event
            on event.workspace_id = head.workspace_id
            and event.event_id = head.event_id
          where head.workspace_id = $1 and head.event_id = $2
        `,
        [workspaceId, eventId],
      );
      return result.rows[0] ? configurationFromRow(result.rows[0]) : null;
    },

    getGeneration(generationId) {
      return getGenerationWith(client, generationId);
    },

    async getGenerationConfiguration(generationId) {
      const result = await client.query<SqlRow>(
        `
          select configuration.*, generation.organizer_actor_id
          from event_ops_generations generation
          join event_ops_configurations configuration
            on configuration.workspace_id = generation.workspace_id
            and configuration.event_id = generation.event_id
            and configuration.configuration_version = generation.configuration_version
          where generation.workspace_id = $1 and generation.generation_id = $2
        `,
        [workspaceId, generationId],
      );
      return result.rows[0] ? configurationFromRow(result.rows[0]) : null;
    },

    async getPublishedResult(eventId) {
      const result = await client.query<SqlRow>(
        `
          select publication.published_dto
          from event_ops_publication_heads head
          join event_ops_publications publication
            on publication.workspace_id = head.workspace_id
            and publication.publication_id = head.publication_id
          where head.workspace_id = $1 and head.event_id = $2
        `,
        [workspaceId, eventId],
      );
      return result.rows[0]
        ? jsonValue<EventOperationsPublishedResult>(
            result.rows[0],
            "published_dto",
          )
        : null;
    },

    async getPublishedResultForAttendee(eventId) {
      const result = await client.query<SqlRow>(
        `
          select publication.published_dto
          from event_ops_publication_heads head
          join event_ops_publications publication
            on publication.workspace_id = head.workspace_id
            and publication.publication_id = head.publication_id
          where head.workspace_id = $1 and head.event_id = $2
            and (publication.published_dto ->> 'resultsAvailableAt')::timestamptz
              <= statement_timestamp()
        `,
        [workspaceId, eventId],
      );
      return result.rows[0]
        ? jsonValue<EventOperationsPublishedResult>(
            result.rows[0],
            "published_dto",
          )
        : null;
    },

    async getTask(taskId) {
      const result = await client.query<SqlRow>(
        `
          select task.*, generation.event_id
          from event_ops_tasks task
          join event_ops_generations generation
            on generation.workspace_id = task.workspace_id
            and generation.generation_id = task.generation_id
          where task.workspace_id = $1 and task.task_id = $2
        `,
        [workspaceId, taskId],
      );
      return result.rows[0] ? taskFromRow(result.rows[0]) : null;
    },

    initializeGeneration,

    async listCheckIns(eventId) {
      const result = await client.query<SqlRow>(
        `
          select * from event_ops_checkins
          where workspace_id = $1 and event_id = $2
          order by checked_in_at, participant_id
        `,
        [workspaceId, eventId],
      );
      return result.rows.map(checkInFromRow);
    },

    async listCatalogueSummaries(eventIds) {
      const normalizedEventIds = [...new Set(eventIds.filter(Boolean))];
      if (normalizedEventIds.length === 0) return [];
      const result = await client.query<SqlRow>(
        `
          select
            event_row.event_id,
            count(membership_head.actor_id) filter (
              where membership_head.status = 'rsvped'
            )::text as active_registration_count,
            (publication.publication_id is not null) as has_published_results,
            (
              publication.publication_id is not null
              and (publication.published_dto ->> 'resultsAvailableAt')::timestamptz
                <= statement_timestamp()
            ) as attendee_results_available
          from event_ops_events event_row
          left join event_ops_membership_heads membership_head
            on membership_head.workspace_id = event_row.workspace_id
            and membership_head.event_id = event_row.event_id
          left join event_ops_publication_heads publication_head
            on publication_head.workspace_id = event_row.workspace_id
            and publication_head.event_id = event_row.event_id
          left join event_ops_publications publication
            on publication.workspace_id = publication_head.workspace_id
            and publication.publication_id = publication_head.publication_id
          where event_row.workspace_id = $1
            and event_row.event_id = any($2::text[])
            and (
              event_row.lifecycle_state_v2 = 'published'
              or (
                event_row.lifecycle_state_v2 is null
                and event_row.lifecycle_state = 'active'
              )
            )
            and event_row.registration_migration_state = 'canonical'
          group by
            event_row.event_id,
            publication.publication_id,
            publication.published_dto
          order by event_row.event_id
        `,
        [workspaceId, normalizedEventIds],
      );
      return result.rows.map(
        (row): EventOperationsCatalogueSummary => ({
          activeRegistrationCount: integer(row, "active_registration_count"),
          attendeeResultsAvailable: row.attendee_results_available === true,
          eventId: text(row, "event_id"),
          hasPublishedResults: row.has_published_results === true,
        }),
      );
    },

    async listCandidates(generationId, sourceParticipantIds) {
      if (sourceParticipantIds.length === 0) return [];
      const result = await client.query<SqlRow>(
        `
          select *
          from event_ops_candidates
          where workspace_id = $1 and generation_id = $2
            and source_participant_id = any($3::text[])
          order by source_participant_id, retrieval_rank
        `,
        [workspaceId, generationId, [...sourceParticipantIds]],
      );
      return result.rows.map(candidateFromRow);
    },

    async listGenerations(eventId) {
      const result = await client.query<SqlRow>(
        `
          ${generationSelect()}
          where workspace_id = $1 and event_id = $2
          order by created_at desc, generation_id desc
        `,
        [workspaceId, eventId],
      );
      return Promise.all(
        result.rows.map((row) => generationFromRow(client, workspaceId, row)),
      );
    },

    async listTasks(generationId) {
      const result = await client.query<SqlRow>(
        `
          select task.*, generation.event_id
          from event_ops_tasks task
          join event_ops_generations generation
            on generation.workspace_id = task.workspace_id
            and generation.generation_id = task.generation_id
          where task.workspace_id = $1 and task.generation_id = $2
          order by task.task_id
        `,
        [workspaceId, generationId],
      );
      return result.rows.map(taskFromRow);
    },

    async listTaskAttempts(generationId) {
      const result = await client.query<SqlRow>(
        `
          select *
          from event_ops_task_attempts
          where workspace_id = $1 and generation_id = $2
          order by claimed_at, task_id, attempt, lease_epoch
        `,
        [workspaceId, generationId],
      );
      return result.rows.map(taskAttemptFromRow);
    },

    async publishGenerationAtomically(
      value,
      organizerActorId,
      authorization,
    ) {
      const dtoHash = payloadHash(value);
      const publicationId = `event-operations-publication:${payloadHash(
        value.generationId,
      ).slice(0, 32)}`;
      return client.transaction(async (transaction) => {
        const validatedAuthorization =
          await requireOperatorCapabilityInTransaction(
            transaction,
            authorization,
          );
        if (
          authorization.eventId !== value.eventId ||
          authorization.ownerOrganizerActorId !== organizerActorId ||
          validatedAuthorization.ownerOrganizerActorId !== organizerActorId
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_FORBIDDEN",
            "The publication authorization does not match its event owner.",
          );
        }
        await transaction.query(
          `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`event-operations-publication-head:${workspaceId}:${value.eventId}`],
        );
        const generation = await transaction.query<SqlRow>(
          `
            ${generationSelect()}
            where workspace_id = $1 and generation_id = $2
            for update
          `,
          [workspaceId, value.generationId],
        );
        const generationRow = generation.rows[0];
        if (!generationRow) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_GENERATION_NOT_FOUND",
            "The event operations generation does not exist.",
          );
        }
        if (
          text(generationRow, "event_id") !== value.eventId ||
          text(generationRow, "organizer_actor_id") !== organizerActorId ||
          text(generationRow, "organizer_actor_id") !==
            validatedAuthorization.ownerOrganizerActorId
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_FORBIDDEN",
            "This actor cannot publish this event generation.",
          );
        }
        const existing = await transaction.query<SqlRow>(
          `
            select published_dto
            from event_ops_publications
            where workspace_id = $1 and generation_id = $2
          `,
          [workspaceId, value.generationId],
        );
        if (existing.rows[0]) {
          return jsonValue<EventOperationsPublishedResult>(
            existing.rows[0],
            "published_dto",
          );
        }
        if (text(generationRow, "status") !== "completed") {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_GENERATION_NOT_READY",
            "Only a fully completed AI generation can be published.",
          );
        }
        const tasks = await transaction.query<SqlRow>(
          `
            select count(*)::text as total,
              count(*) filter (where task.status = 'completed')::text as completed,
              count(*) filter (
                where exists (
                  select 1
                  from event_ops_ai_artifacts artifact
                  where artifact.workspace_id = task.workspace_id
                    and artifact.generation_id = task.generation_id
                    and artifact.task_id = task.task_id
                    and artifact.evidence_metadata ->> 'aiRequestFingerprint' = $3
                )
              )::text as fingerprinted
            from event_ops_tasks task
            where task.workspace_id = $1 and task.generation_id = $2
          `,
          [
            workspaceId,
            value.generationId,
            text(generationRow, "ai_request_fingerprint"),
          ],
        );
        const expected = integer(generationRow, "expected_task_count");
        if (
          Number(tasks.rows[0]?.total ?? 0) !== expected ||
          Number(tasks.rows[0]?.completed ?? 0) !== expected ||
          Number(tasks.rows[0]?.fingerprinted ?? 0) !== expected
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_GENERATION_NOT_READY",
            "Every expected generation task must complete with the frozen AI request fingerprint before publication.",
          );
        }
        const previousHead = await transaction.query<SqlRow>(
          `
            select head.generation_id
            from event_ops_publication_heads head
            join event_ops_generations previous
              on previous.workspace_id = head.workspace_id
              and previous.generation_id = head.generation_id
            where head.workspace_id = $1 and head.event_id = $2
            for update of head, previous
          `,
          [workspaceId, value.eventId],
        );
        const previousGenerationId = previousHead.rows[0]
          ? text(previousHead.rows[0], "generation_id")
          : null;
        await transaction.query(
          `
            insert into event_ops_publications (
              workspace_id, publication_id, event_id, generation_id,
              snapshot_hash, dto_hash, published_dto, published_by_actor_id,
              published_at
            ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
          `,
          [
            workspaceId,
            publicationId,
            value.eventId,
            value.generationId,
            value.snapshotHash,
            dtoHash,
            JSON.stringify(value),
            authorization.actingActorId,
            value.publishedAt,
          ],
        );
        if (
          previousGenerationId &&
          previousGenerationId !== value.generationId
        ) {
          const superseded = await transaction.query(
            `
              update event_ops_generations
              set status = 'superseded', revision = revision + 1,
                updated_at = $3
              where workspace_id = $1 and generation_id = $2
                and status = 'published'
            `,
            [workspaceId, previousGenerationId, value.publishedAt],
          );
          if (superseded.rowCount !== 1) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_GENERATION_NOT_READY",
              "The previous publication head did not reference one published generation.",
            );
          }
        }
        await transaction.query(
          `
            insert into event_ops_publication_heads (
              workspace_id, event_id, publication_id, generation_id,
              revision, updated_at
            ) values ($1, $2, $3, $4, 1, $5)
            on conflict (workspace_id, event_id) do update
            set publication_id = excluded.publication_id,
              generation_id = excluded.generation_id,
              revision = event_ops_publication_heads.revision + 1,
              updated_at = excluded.updated_at
          `,
          [
            workspaceId,
            value.eventId,
            publicationId,
            value.generationId,
            value.publishedAt,
          ],
        );
        const published = await transaction.query(
          `
            update event_ops_generations
            set status = 'published', published_at = $3,
              revision = revision + 1, updated_at = $3
            where workspace_id = $1 and generation_id = $2
              and status = 'completed'
          `,
          [workspaceId, value.generationId, value.publishedAt],
        );
        if (published.rowCount !== 1) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_GENERATION_NOT_READY",
            "The completed generation changed before publication committed.",
          );
        }
        await transaction.query(
          `
            insert into event_ops_audit_log (
              workspace_id, audit_id, event_id, actor_id, action,
              aggregate_type, aggregate_id, before_payload, after_payload,
              evidence_ids, occurred_at
            ) values ($1, $2, $3, $4, 'generation_published', 'publication',
              $5, null, $6::jsonb, '{}', $7)
          `,
          [
            workspaceId,
            `audit:generation-published:${value.generationId}`,
            value.eventId,
            authorization.actingActorId,
            publicationId,
            JSON.stringify({
              actingRole: validatedAuthorization.principalRole,
              assignmentRevision:
                validatedAuthorization.assignmentRevision,
              dtoHash,
              generationId: value.generationId,
              ownerOrganizerActorId:
                validatedAuthorization.ownerOrganizerActorId,
            }),
            value.publishedAt,
          ],
        );
        return clone(value);
      });
    },

    async resetEventForSeed(eventId) {
      await client.transaction(async (transaction) => {
        await transaction.query(
          `
            update event_ops_contact_requests
            set relationship_pair_id = null
            where workspace_id = $1 and event_id = $2
          `,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_relationship_pairs where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_contact_requests where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_checkins where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_publication_heads where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_publications where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_generations where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_membership_heads where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_membership_versions where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_profile_heads where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_profile_versions where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_configuration_heads where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_configurations where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_outbox where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_audit_log where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
        await transaction.query(
          `delete from event_ops_events where workspace_id = $1 and event_id = $2`,
          [workspaceId, eventId],
        );
      });
    },

    async retryFailedGeneration(generationId, retriedAt, authorization) {
      return client.transaction(async (transaction) => {
        const validatedAuthorization =
          await requireOperatorCapabilityInTransaction(
            transaction,
            authorization,
          );
        await transaction.query(
          `select generation_id
             from event_ops_generations
            where workspace_id = $1 and generation_id = $2
            for update`,
          [workspaceId, generationId],
        );
        const current = await getGenerationWith(transaction, generationId);
        if (!current) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_GENERATION_NOT_FOUND",
            "The event operations generation does not exist.",
          );
        }
        if (
          current.eventId !== authorization.eventId ||
          current.organizerActorId !==
            authorization.ownerOrganizerActorId ||
          current.organizerActorId !==
            validatedAuthorization.ownerOrganizerActorId
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_FORBIDDEN",
            "The retry authorization does not match this event generation.",
          );
        }
        if (current.status !== "failed") return current;
        const inFlight = await transaction.query<{ count: string }>(
          `
            select count(*)::text as count
            from event_ops_tasks
            where workspace_id = $1 and generation_id = $2
              and status = 'running'
          `,
          [workspaceId, generationId],
        );
        if (Number(inFlight.rows[0]?.count ?? 0) > 0) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_GENERATION_NOT_READY",
            "Retry is unavailable until every in-flight task from the failed run has settled.",
          );
        }
        await transaction.query(
          `
            update event_ops_tasks
            set status = 'queued', attempts = 0, retry_round = retry_round + 1,
              lease_token = null, lease_expires_at = null, worker_id = null,
              output_payload = null, output_hash = null, error_code = null,
              error_message = null, completed_at = null,
              revision = revision + 1, updated_at = statement_timestamp()
            where workspace_id = $1 and generation_id = $2 and status = 'failed'
          `,
          [workspaceId, generationId],
        );
        const updated = await transaction.query<SqlRow>(
          `
            update event_ops_generations
            set status = 'queued', completed_at = null, error_code = null,
              error_message = null, revision = revision + 1,
              updated_at = statement_timestamp()
            where workspace_id = $1 and generation_id = $2 and status = 'failed'
            returning *
          `,
          [workspaceId, generationId],
        );
        await transaction.query(
          `insert into event_ops_audit_log (
             workspace_id, audit_id, event_id, actor_id, action,
             aggregate_type, aggregate_id, before_payload, after_payload,
             evidence_ids, occurred_at
           ) values (
             $1,$2,$3,$4,'generation_retried','generation',$5,
             $6::jsonb,$7::jsonb,'{}',$8
           )`,
          [
            workspaceId,
            `audit:generation-retried:${payloadHash({
              generationId,
              retriedAt,
              workspaceId,
            })}`,
            current.eventId,
            authorization.actingActorId,
            generationId,
            JSON.stringify({ status: current.status }),
            JSON.stringify({
              actingRole: validatedAuthorization.principalRole,
              assignmentRevision:
                validatedAuthorization.assignmentRevision,
              ownerOrganizerActorId:
                validatedAuthorization.ownerOrganizerActorId,
              status: "queued",
            }),
            retriedAt,
          ],
        );
        return generationFromRow(transaction, workspaceId, updated.rows[0]!);
      });
    },

    async saveConfiguration(value) {
      return persistConfiguration(value);
    },

    async saveConfigurationAsOperator(input) {
      return persistConfiguration(input.configuration, {
        actorId: input.actorId,
        capability: input.capability,
      });
    },

  };

  return repository;
}

export const __eventOperationsPostgresRepositoryTestExports = {
  payloadHash,
};
