import { createHash } from "node:crypto";

import type {
  EventParticipantProfile,
  EventRegistration,
  RegisterForEventInput,
} from "../../registration/contract";
import {
  answersFromProfileResponses,
  type EventProfileResponseSnapshot,
} from "../../registration/interview-response-contract";
import {
  EventRegistrationWindowError,
} from "../../registration/deadline-gated-service";
import type { EventOperationsParticipant } from "../contract";
import {
  eventParticipantAnswersEqual,
  normalizeEventParticipantAnswers,
} from "../participant";
import type { EventOperationsRepository } from "../repository";
import { appendCanonicalMembershipVersion } from "./canonical-membership-writer";
import type {
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "./postgres-client";

type CanonicalRegistrationMethods = Pick<
  EventOperationsRepository,
  | "activateCanonicalRegistrations"
  | "cancelCanonicalRegistration"
  | "getCanonicalRegistration"
  | "listCanonicalRegistrations"
  | "listCanonicalRegistrationsForUser"
  | "registerCanonicalParticipant"
  | "seedCanonicalRegistration"
>;

type SqlRow = Record<string, unknown>;

interface CanonicalProfilePayload {
  participant: EventOperationsParticipant;
  registrationProfile: EventParticipantProfile;
}

interface ConfigurationWindowRow {
  db_now: Date | string;
  profile_edit_deadline_at: Date | string;
  registration_cutoff_at: Date | string;
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function timestamp(value: unknown, field: string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Canonical event registration row has an invalid ${field}.`);
  }
  return new Date(parsed).toISOString();
}

function optionalTimestamp(value: unknown, field: string): string | null {
  return value === null || value === undefined
    ? null
    : timestamp(value, field);
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Canonical event registration row is missing ${field}.`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Canonical event registration row has an invalid ${field}.`);
  }
  return parsed;
}

function jsonValue<TValue>(value: unknown, field: string): TValue {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Canonical event registration row has an invalid ${field}.`);
  }
  return clone(parsed) as TValue;
}

function noSideEffects(): EventRegistration["sideEffects"] {
  return {
    calendarUpdateExecuted: false,
    emailSent: false,
    globalProfileWriteExecuted: false,
    notificationDelivered: false,
    organizerMessageSent: false,
    refundRequested: false,
  };
}

function stableParticipantProfileId(eventId: string, userId: string): string {
  return `event-participant-profile:${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`;
}

function stableRegistrationId(eventId: string, userId: string): string {
  return `event-registration:${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`;
}

function payloadHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
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

function registrationMigrationHash(
  registrations: readonly EventRegistration[],
): string {
  return payloadHash(
    [...registrations].sort(
      (left, right) =>
        left.userId.localeCompare(right.userId) || left.id.localeCompare(right.id),
    ),
  );
}

function legacyMembershipStages(
  registration: EventRegistration,
): readonly { effectiveAt: string; registration: EventRegistration }[] {
  const registeredAt = timestamp(registration.registeredAt, "registered_at");
  const cancelledAt = optionalTimestamp(
    registration.cancelledAt,
    "cancelled_at",
  );
  const reactivatedAt = optionalTimestamp(
    registration.reactivatedAt,
    "reactivated_at",
  );
  if (
    (registration.status === "cancelled" && !cancelledAt) ||
    (reactivatedAt && !cancelledAt) ||
    (cancelledAt && Date.parse(cancelledAt) < Date.parse(registeredAt)) ||
    (reactivatedAt &&
      cancelledAt &&
      Date.parse(reactivatedAt) < Date.parse(cancelledAt)) ||
    (registration.status === "cancelled" && reactivatedAt)
  ) {
    throw new EventRegistrationWindowError(
      "EVENT_REGISTRATION_WINDOW_INVALID",
      "Legacy event registration lifecycle timestamps are inconsistent.",
    );
  }

  const stages: { effectiveAt: string; registration: EventRegistration }[] = [
    {
      effectiveAt: registeredAt,
      registration: {
        ...clone(registration),
        cancelledAt: null,
        reactivatedAt: null,
        status: "rsvped",
        updatedAt: registeredAt,
      },
    },
  ];
  if (cancelledAt) {
    stages.push({
      effectiveAt: cancelledAt,
      registration: {
        ...clone(registration),
        cancelledAt,
        reactivatedAt: null,
        status: "cancelled",
        updatedAt: cancelledAt,
      },
    });
  }
  if (reactivatedAt && registration.status === "rsvped") {
    stages.push({
      effectiveAt: reactivatedAt,
      registration: {
        ...clone(registration),
        cancelledAt,
        reactivatedAt,
        status: "rsvped",
        updatedAt: reactivatedAt,
      },
    });
  }

  const sourceUpdatedAt = timestamp(registration.updatedAt, "updated_at");
  const last = stages[stages.length - 1]!;
  if (Date.parse(sourceUpdatedAt) < Date.parse(last.effectiveAt)) {
    throw new EventRegistrationWindowError(
      "EVENT_REGISTRATION_WINDOW_INVALID",
      "Legacy event registration updatedAt precedes its lifecycle state.",
    );
  }
  if (Date.parse(sourceUpdatedAt) > Date.parse(last.effectiveAt)) {
    stages.push({
      effectiveAt: sourceUpdatedAt,
      registration: {
        ...clone(registration),
        updatedAt: sourceUpdatedAt,
      },
    });
  } else {
    stages[stages.length - 1] = {
      ...last,
      registration: {
        ...last.registration,
        updatedAt: sourceUpdatedAt,
      },
    };
  }
  return stages;
}

function registrationFromRow(row: SqlRow): EventRegistration {
  const profilePayload = jsonValue<CanonicalProfilePayload>(
    row.profile_payload,
    "profile_payload",
  );
  const status = text(row.status, "status");
  if (status !== "rsvped" && status !== "cancelled") {
    throw new Error("Canonical event registration row has an invalid status.");
  }
  return {
    cancelledAt: optionalTimestamp(row.cancelled_at, "cancelled_at"),
    eventId: text(row.event_id, "event_id"),
    id: text(row.source_registration_id, "source_registration_id"),
    participantProfile: clone(profilePayload.registrationProfile),
    participantProfileId: text(row.participant_id, "participant_id"),
    reactivatedAt: optionalTimestamp(row.reactivated_at, "reactivated_at"),
    registeredAt: timestamp(row.registered_at, "registered_at"),
    sideEffects: noSideEffects(),
    status,
    updatedAt: timestamp(row.head_updated_at, "head_updated_at"),
    userId: text(row.actor_id, "actor_id"),
  };
}

function registrationSelect(): string {
  return `
    select
      membership_head.event_id,
      membership_head.actor_id,
      membership_head.participant_id,
      membership_head.profile_version::text as profile_version,
      membership_head.membership_version::text as membership_version,
      membership_head.status,
      membership_head.updated_at as head_updated_at,
      membership_version.registered_at,
      membership_version.cancelled_at,
      membership_version.reactivated_at,
      membership_version.late_registration,
      membership_version.source_registration_id,
      profile_version.profile_payload
    from event_ops_membership_heads membership_head
    join event_ops_membership_versions membership_version
      on membership_version.workspace_id = membership_head.workspace_id
      and membership_version.event_id = membership_head.event_id
      and membership_version.actor_id = membership_head.actor_id
      and membership_version.membership_version = membership_head.membership_version
    join event_ops_profile_versions profile_version
      on profile_version.workspace_id = membership_head.workspace_id
      and profile_version.event_id = membership_head.event_id
      and profile_version.participant_id = membership_head.participant_id
      and profile_version.profile_version = membership_head.profile_version
  `;
}

async function getRegistrationWith(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  eventId: string,
  userId: string,
): Promise<EventRegistration | null> {
  const result = await executor.query<SqlRow>(
    `${registrationSelect()}
     where membership_head.workspace_id = $1
       and membership_head.event_id = $2
       and membership_head.actor_id = $3`,
    [workspaceId, eventId, userId],
  );
  return result.rows[0] ? registrationFromRow(result.rows[0]) : null;
}

async function lockRegistrationScope(
  transaction: EventOperationsSqlExecutor,
  workspaceId: string,
  eventId: string,
  userId: string,
): Promise<ConfigurationWindowRow> {
  await transaction.query(
    `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`event-operations-registration:${workspaceId}:${eventId}:${userId}`],
  );
  const result = await transaction.query<ConfigurationWindowRow>(
    `
      select
        statement_timestamp() as db_now,
        configuration.profile_edit_deadline_at,
        configuration.registration_cutoff_at
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
        and event_row.lifecycle_state = 'active'
        and event_row.registration_migration_state = 'canonical'
      for share of configuration_head, configuration, event_row
    `,
    [workspaceId, eventId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new EventRegistrationWindowError(
      "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
      "The enrolled event registration window is not configured; registration writes are unavailable.",
    );
  }
  return row;
}

async function currentVersions(
  transaction: EventOperationsSqlExecutor,
  workspaceId: string,
  eventId: string,
  userId: string,
): Promise<{ membershipVersion: number; profileVersion: number }> {
  const result = await transaction.query<SqlRow>(
    `
      select membership_version::text, profile_version::text
      from event_ops_membership_heads
      where workspace_id = $1 and event_id = $2 and actor_id = $3
    `,
    [workspaceId, eventId, userId],
  );
  if (!result.rows[0]) return { membershipVersion: 0, profileVersion: 0 };
  return {
    membershipVersion: positiveInteger(
      result.rows[0].membership_version,
      "membership_version",
    ),
    profileVersion: positiveInteger(
      result.rows[0].profile_version,
      "profile_version",
    ),
  };
}

async function appendRegistrationVersion(input: {
  copyResponsesFromProfileVersion?: number;
  effectiveAt?: string;
  eventId: string;
  membershipVersion: number;
  profileChanged: boolean;
  interviewResponses?: readonly EventProfileResponseSnapshot[];
  profileEffectiveAt?: string;
  profileVersion: number;
  registration: EventRegistration;
  transaction: EventOperationsSqlExecutor;
  workspaceId: string;
  window: Pick<ConfigurationWindowRow, "profile_edit_deadline_at">;
  observedAt?: string;
}): Promise<EventRegistration> {
  return appendCanonicalMembershipVersion({
    admissionApplicationVersion: null,
    copyResponsesFromProfileVersion: input.copyResponsesFromProfileVersion,
    effectiveAt: input.effectiveAt,
    executor: input.transaction,
    interviewResponses: input.interviewResponses,
    membershipVersion: input.membershipVersion,
    observedAt: input.observedAt,
    origin: "legacy_registration",
    profileChanged: input.profileChanged,
    profileEditDeadlineAt: timestamp(
      input.window.profile_edit_deadline_at,
      "profile_edit_deadline_at",
    ),
    profileEffectiveAt: input.profileEffectiveAt,
    profileVersion: input.profileVersion,
    registration: input.registration,
    workspaceId: input.workspaceId,
  });
}

export function createPostgresCanonicalRegistrationMethods({
  client,
  workspaceId,
}: EventOperationsPostgresRuntime): CanonicalRegistrationMethods {
  return {
    async activateCanonicalRegistrations(eventId, registrations) {
      const ordered = [...registrations].sort(
        (left, right) =>
          left.userId.localeCompare(right.userId) || left.id.localeCompare(right.id),
      );
      const actorIds = new Set<string>();
      const participantIds = new Set<string>();
      const registrationIds = new Set<string>();
      for (const registration of ordered) {
        if (
          registration.eventId !== eventId ||
          !registration.userId.trim() ||
          !registration.participantProfileId.trim() ||
          registration.participantProfile.eventId !== eventId ||
          registration.participantProfile.userId !== registration.userId ||
          actorIds.has(registration.userId) ||
          participantIds.has(registration.participantProfileId) ||
          registrationIds.has(registration.id)
        ) {
          throw new EventRegistrationWindowError(
            "EVENT_REGISTRATION_WINDOW_INVALID",
            "Legacy event registrations contain mismatched or duplicate migration identities.",
          );
        }
        actorIds.add(registration.userId);
        participantIds.add(registration.participantProfileId);
        registrationIds.add(registration.id);
      }
      const migrationHash = registrationMigrationHash(ordered);

      return client.transaction(async (transaction) => {
        const event = await transaction.query<SqlRow>(
          `
            select
              event_row.registration_migration_state,
              event_row.registration_migration_count,
              event_row.registration_migration_hash,
              configuration.profile_edit_deadline_at,
              statement_timestamp() as db_now
            from event_ops_events event_row
            join event_ops_configuration_heads configuration_head
              on configuration_head.workspace_id = event_row.workspace_id
              and configuration_head.event_id = event_row.event_id
            join event_ops_configurations configuration
              on configuration.workspace_id = configuration_head.workspace_id
              and configuration.event_id = configuration_head.event_id
              and configuration.configuration_version = configuration_head.configuration_version
            where event_row.workspace_id = $1 and event_row.event_id = $2
            for update of event_row, configuration_head, configuration
          `,
          [workspaceId, eventId],
        );
        const eventRow = event.rows[0];
        if (!eventRow) {
          throw new EventRegistrationWindowError(
            "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
            "Event operations must be configured before canonical registration activation.",
          );
        }
        if (eventRow.registration_migration_state === "canonical") {
          const storedCount = Number(eventRow.registration_migration_count);
          const storedHash = eventRow.registration_migration_hash;
          if (
            !Number.isSafeInteger(storedCount) ||
            storedCount < 0 ||
            typeof storedHash !== "string" ||
            !storedHash
          ) {
            throw new EventRegistrationWindowError(
              "EVENT_REGISTRATION_WINDOW_INVALID",
              "Canonical registration activation metadata is incomplete.",
            );
          }
          return { count: storedCount, hash: storedHash, state: "canonical" };
        }

        await transaction.query(
          `
            update event_ops_events
            set registration_migration_state = 'importing',
              revision = revision + 1,
              updated_at = statement_timestamp()
            where workspace_id = $1 and event_id = $2
          `,
          [workspaceId, eventId],
        );
        const existing = await transaction.query<{ count: string }>(
          `
            select count(*)::text as count
            from event_ops_membership_heads
            where workspace_id = $1 and event_id = $2
          `,
          [workspaceId, eventId],
        );
        if (Number(existing.rows[0]?.count ?? -1) !== 0) {
          throw new EventRegistrationWindowError(
            "EVENT_REGISTRATION_WINDOW_INVALID",
            "Canonical registration activation found unverified shadow records.",
          );
        }

        const window = {
          profile_edit_deadline_at: eventRow.profile_edit_deadline_at as
            | Date
            | string,
        };
        const migratedAt = timestamp(eventRow.db_now, "db_now");
        for (const registration of ordered) {
          const stages = legacyMembershipStages(registration);
          for (const [index, stage] of stages.entries()) {
            await appendRegistrationVersion({
              effectiveAt: stage.effectiveAt,
              eventId,
              interviewResponses:
                index === 0
                  ? registration.participantProfile.interviewResponses
                  : undefined,
              membershipVersion: index + 1,
              observedAt: migratedAt,
              profileChanged: index === 0,
              profileEffectiveAt: registration.participantProfile.updatedAt,
              profileVersion: 1,
              registration: stage.registration,
              transaction,
              window,
              workspaceId,
            });
          }
        }

        const verification = await transaction.query<{
          head_count: string;
          orphan_count: string;
        }>(
          `
            select
              count(*)::text as head_count,
              count(*) filter (
                where membership_version.actor_id is null
                  or profile_version.participant_id is null
              )::text as orphan_count
            from event_ops_membership_heads membership_head
            left join event_ops_membership_versions membership_version
              on membership_version.workspace_id = membership_head.workspace_id
              and membership_version.event_id = membership_head.event_id
              and membership_version.actor_id = membership_head.actor_id
              and membership_version.membership_version = membership_head.membership_version
            left join event_ops_profile_versions profile_version
              on profile_version.workspace_id = membership_head.workspace_id
              and profile_version.event_id = membership_head.event_id
              and profile_version.participant_id = membership_head.participant_id
              and profile_version.profile_version = membership_head.profile_version
            where membership_head.workspace_id = $1
              and membership_head.event_id = $2
          `,
          [workspaceId, eventId],
        );
        if (
          Number(verification.rows[0]?.head_count ?? -1) !== ordered.length ||
          Number(verification.rows[0]?.orphan_count ?? -1) !== 0
        ) {
          throw new EventRegistrationWindowError(
            "EVENT_REGISTRATION_WINDOW_INVALID",
            "Canonical registration activation failed count or orphan verification.",
          );
        }
        await transaction.query(
          `
            update event_ops_events
            set registration_migration_state = 'canonical',
              registration_migration_count = $3,
              registration_migration_hash = $4,
              registration_migrated_at = $5,
              revision = revision + 1,
              updated_at = $5
            where workspace_id = $1 and event_id = $2
              and registration_migration_state = 'importing'
          `,
          [workspaceId, eventId, ordered.length, migrationHash, migratedAt],
        );
        await transaction.query(
          `
            insert into event_ops_audit_log (
              workspace_id, audit_id, event_id, actor_id, action,
              aggregate_type, aggregate_id, before_payload, after_payload,
              evidence_ids, occurred_at
            ) values (
              $1, $2, $3, null, 'registration_migration_activated',
              'event', $3, null, $4::jsonb, '{}', $5
            )
          `,
          [
            workspaceId,
            `audit:registration-migration:${encodeURIComponent(eventId)}:${migrationHash}`,
            eventId,
            JSON.stringify({ count: ordered.length, hash: migrationHash }),
            migratedAt,
          ],
        );
        return {
          count: ordered.length,
          hash: migrationHash,
          state: "canonical" as const,
        };
      });
    },

    async cancelCanonicalRegistration({ eventId, userId }) {
      return client.transaction(async (transaction) => {
        const window = await lockRegistrationScope(
          transaction,
          workspaceId,
          eventId,
          userId,
        );
        const existing = await getRegistrationWith(
          transaction,
          workspaceId,
          eventId,
          userId,
        );
        if (!existing || existing.status === "cancelled") return existing;
        const versions = await currentVersions(
          transaction,
          workspaceId,
          eventId,
          userId,
        );
        const updatedAt = timestamp(window.db_now, "db_now");
        return appendRegistrationVersion({
          eventId,
          membershipVersion: versions.membershipVersion + 1,
          profileChanged: false,
          profileVersion: versions.profileVersion,
          registration: {
            ...existing,
            cancelledAt: updatedAt,
            sideEffects: noSideEffects(),
            status: "cancelled",
            updatedAt,
          },
          transaction,
          window,
          workspaceId,
        });
      });
    },

    getCanonicalRegistration(eventId, userId) {
      return getRegistrationWith(client, workspaceId, eventId, userId);
    },

    async listCanonicalRegistrations(eventId) {
      const result = await client.query<SqlRow>(
        `${registrationSelect()}
         where membership_head.workspace_id = $1
           and membership_head.event_id = $2
         order by membership_head.participant_id`,
        [workspaceId, eventId],
      );
      return result.rows.map(registrationFromRow);
    },

    async listCanonicalRegistrationsForUser(userId, eventIds) {
      if (eventIds.length === 0) return [];
      const result = await client.query<SqlRow>(
        `${registrationSelect()}
         where membership_head.workspace_id = $1
           and membership_head.actor_id = $2
           and membership_head.event_id = any($3::text[])
         order by membership_head.event_id`,
        [workspaceId, userId, [...new Set(eventIds)]],
      );
      return result.rows.map(registrationFromRow);
    },

    async registerCanonicalParticipant({
      answers,
      displayName,
      eventId,
      interviewResponses,
      userId,
    }: RegisterForEventInput) {
      return client.transaction(async (transaction) => {
        const window = await lockRegistrationScope(
          transaction,
          workspaceId,
          eventId,
          userId,
        );
        const existing = await getRegistrationWith(
          transaction,
          workspaceId,
          eventId,
          userId,
        );
        const normalizedAnswers = normalizeEventParticipantAnswers(answers);
        const normalizedResponseAnswers = interviewResponses?.length
          ? normalizeEventParticipantAnswers(
              answersFromProfileResponses(interviewResponses),
            )
          : null;
        if (
          normalizedResponseAnswers &&
          !eventParticipantAnswersEqual(
            normalizedAnswers,
            normalizedResponseAnswers,
          )
        ) {
          throw new EventRegistrationWindowError(
            "EVENT_REGISTRATION_WINDOW_INVALID",
            "Verified interview responses do not match the submitted participant answers.",
          );
        }
        const normalizedDisplayName = displayName?.trim() || undefined;
        const responseSnapshotUpgrade = Boolean(
          interviewResponses?.length &&
            !existing?.participantProfile.interviewResponses?.length,
        );
        const profileChanged = existing
          ? !eventParticipantAnswersEqual(
              existing.participantProfile.answers,
              normalizedAnswers,
            ) ||
            Boolean(
              normalizedDisplayName &&
                normalizedDisplayName !== existing.participantProfile.displayName,
            ) ||
            responseSnapshotUpgrade
          : Object.keys(normalizedAnswers).length > 0 ||
            Boolean(normalizedDisplayName);
        if (
          existing?.status === "rsvped" &&
          !profileChanged
        ) {
          return existing;
        }

        const dbNow = timestamp(window.db_now, "db_now");
        const profileDeadline = timestamp(
          window.profile_edit_deadline_at,
          "profile_edit_deadline_at",
        );
        const registrationCutoff = timestamp(
          window.registration_cutoff_at,
          "registration_cutoff_at",
        );
        if (Date.parse(dbNow) >= Date.parse(profileDeadline) && profileChanged) {
          throw new EventRegistrationWindowError(
            "EVENT_REGISTRATION_PROFILE_EDIT_DEADLINE_PASSED",
            "The event profile editing deadline has passed; matching-profile answers can no longer be changed.",
          );
        }
        if (Date.parse(dbNow) >= Date.parse(registrationCutoff)) {
          throw new EventRegistrationWindowError(
            "EVENT_REGISTRATION_CUTOFF_PASSED",
            "The event registration cutoff has passed; new registrations and reactivations are closed.",
          );
        }

        const versions = await currentVersions(
          transaction,
          workspaceId,
          eventId,
          userId,
        );
        const participantProfileId =
          existing?.participantProfileId ??
          stableParticipantProfileId(eventId, userId);
        const registration: EventRegistration = existing
          ? {
              ...existing,
              cancelledAt: null,
              participantProfile: profileChanged
                ? {
                    ...existing.participantProfile,
                    answers: normalizedAnswers,
                    displayName:
                      normalizedDisplayName ??
                      existing.participantProfile.displayName,
                    interviewResponses:
                      interviewResponses?.length
                        ? clone(interviewResponses)
                        : eventParticipantAnswersEqual(
                              existing.participantProfile.answers,
                              normalizedAnswers,
                            )
                          ? existing.participantProfile.interviewResponses
                          : undefined,
                    updatedAt: dbNow,
                  }
                : existing.participantProfile,
              reactivatedAt:
                existing.status === "cancelled"
                  ? dbNow
                  : existing.reactivatedAt,
              sideEffects: noSideEffects(),
              status: "rsvped",
              updatedAt: dbNow,
            }
          : {
              cancelledAt: null,
              eventId,
              id: stableRegistrationId(eventId, userId),
              participantProfile: {
                answers: normalizedAnswers,
                createdAt: dbNow,
                displayName: normalizedDisplayName,
                eventId,
                id: participantProfileId,
                interviewResponses: interviewResponses?.length
                  ? clone(interviewResponses)
                  : undefined,
                updatedAt: dbNow,
                userId,
              },
              participantProfileId,
              reactivatedAt: null,
              registeredAt: dbNow,
              sideEffects: noSideEffects(),
              status: "rsvped",
              updatedAt: dbNow,
              userId,
            };
        const shouldAppendProfile = !existing || profileChanged;
        const answersUnchanged = existing
          ? eventParticipantAnswersEqual(
              existing.participantProfile.answers,
              normalizedAnswers,
            )
          : false;
        return appendRegistrationVersion({
          copyResponsesFromProfileVersion:
            shouldAppendProfile &&
            answersUnchanged &&
            !interviewResponses?.length
              ? versions.profileVersion
              : undefined,
          eventId,
          interviewResponses: interviewResponses ?? undefined,
          membershipVersion: versions.membershipVersion + 1,
          profileChanged: shouldAppendProfile,
          profileVersion: shouldAppendProfile
            ? versions.profileVersion + 1
            : versions.profileVersion,
          registration,
          transaction,
          window,
          workspaceId,
        });
      });
    },

    async seedCanonicalRegistration(value) {
      return client.transaction(async (transaction) => {
        const window = await lockRegistrationScope(
          transaction,
          workspaceId,
          value.eventId,
          value.userId,
        );
        const existing = await getRegistrationWith(
          transaction,
          workspaceId,
          value.eventId,
          value.userId,
        );
        if (existing) return existing;
        return appendRegistrationVersion({
          eventId: value.eventId,
          interviewResponses: value.participantProfile.interviewResponses,
          membershipVersion: 1,
          profileChanged: true,
          profileVersion: 1,
          registration: clone(value),
          transaction,
          window,
          workspaceId,
        });
      });
    },
  };
}
