import { createHash } from "node:crypto";

import type { EventRegistration } from "../../registration/contract";
import type { EventProfileResponseSnapshot } from "../../registration/interview-response-contract";
import { eventOperationsParticipantFromRegistration } from "../participant";
import { normalizeProfileResponseForStorage } from "../profile-response-policy";
import type { EventOperationsSqlExecutor } from "./postgres-client";

export type CanonicalMembershipOrigin =
  | "legacy_registration"
  | "admission_application";

export interface AppendCanonicalMembershipVersionInput {
  admissionApplicationVersion: number | null;
  copyResponsesFromProfileVersion?: number;
  effectiveAt?: string;
  executor: EventOperationsSqlExecutor;
  interviewResponses?: readonly EventProfileResponseSnapshot[];
  membershipVersion: number;
  observedAt?: string;
  origin: CanonicalMembershipOrigin;
  profileChanged: boolean;
  profileEditDeadlineAt: string;
  profileEffectiveAt?: string;
  profileVersion: number;
  registration: EventRegistration;
  workspaceId: string;
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

function payloadHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function canonicalParticipantProfileId(
  eventId: string,
  actorId: string,
): string {
  return `event-participant-profile:${encodeURIComponent(eventId)}:${encodeURIComponent(actorId)}`;
}

export function canonicalRegistrationId(
  eventId: string,
  actorId: string,
): string {
  return `event-registration:${encodeURIComponent(eventId)}:${encodeURIComponent(actorId)}`;
}

export async function appendCanonicalMembershipVersion(
  input: AppendCanonicalMembershipVersionInput,
): Promise<EventRegistration> {
  if (
    (input.origin === "admission_application" &&
      (!Number.isSafeInteger(input.admissionApplicationVersion) ||
        (input.admissionApplicationVersion ?? 0) < 1)) ||
    (input.origin === "legacy_registration" &&
      input.admissionApplicationVersion !== null)
  ) {
    throw new Error("Canonical membership origin/version is invalid.");
  }
  const effectiveAt = input.effectiveAt ?? input.registration.updatedAt;
  const observedAt = input.observedAt ?? input.registration.updatedAt;
  const participant = eventOperationsParticipantFromRegistration(
    input.registration,
    { profileEditDeadlineAt: input.profileEditDeadlineAt },
  );
  const profilePayload = {
    participant,
    registrationProfile: clone(input.registration.participantProfile),
  };
  if (input.profileChanged) {
    await input.executor.query(
      `insert into event_ops_profile_versions (
         workspace_id, event_id, participant_id, profile_version, actor_id,
         profile_payload, profile_hash, source_registration_id, effective_at,
         created_at
       ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
      [input.workspaceId, input.registration.eventId,
        input.registration.participantProfileId, input.profileVersion,
        input.registration.userId, JSON.stringify(profilePayload),
        payloadHash(profilePayload), input.registration.id,
        input.profileEffectiveAt ?? effectiveAt, observedAt],
    );
    await input.executor.query(
      `insert into event_ops_profile_heads (
         workspace_id, event_id, participant_id, actor_id, profile_version,
         revision, updated_at
       ) values ($1, $2, $3, $4, $5, 1, $6)
       on conflict (workspace_id, event_id, participant_id) do update
       set profile_version = excluded.profile_version,
         revision = event_ops_profile_heads.revision + 1,
         updated_at = excluded.updated_at
       where event_ops_profile_heads.actor_id = excluded.actor_id`,
      [input.workspaceId, input.registration.eventId,
        input.registration.participantProfileId, input.registration.userId,
        input.profileVersion, input.registration.participantProfile.updatedAt],
    );
    if (input.interviewResponses?.length) {
      const values: unknown[] = [];
      const rows = input.interviewResponses.map((rawResponse, index) => {
        const response = normalizeProfileResponseForStorage(rawResponse);
        const offset = index * 11;
        values.push(
          input.workspaceId, input.registration.eventId,
          input.registration.participantProfileId, input.profileVersion,
          response.responseId, response.field, response.visibility,
          response.questionSource, JSON.stringify(response), response.answeredAt,
          observedAt,
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}::jsonb, $${offset + 10}, $${offset + 11})`;
      });
      await input.executor.query(
        `insert into event_ops_profile_response_versions (
           workspace_id, event_id, participant_id, profile_version,
           response_id, field_key, visibility, question_source,
           response_payload, answered_at, created_at
         ) values ${rows.join(", ")}`,
        values,
      );
    } else if (input.copyResponsesFromProfileVersion) {
      await input.executor.query(
        `insert into event_ops_profile_response_versions (
           workspace_id, event_id, participant_id, profile_version,
           response_id, field_key, visibility, question_source,
           response_payload, answered_at, created_at
         ) select workspace_id, event_id, participant_id, $4, response_id,
           field_key, visibility, question_source, response_payload,
           answered_at, $5
         from event_ops_profile_response_versions
         where workspace_id = $1 and event_id = $2 and participant_id = $3
           and profile_version = $6`,
        [input.workspaceId, input.registration.eventId,
          input.registration.participantProfileId, input.profileVersion,
          observedAt, input.copyResponsesFromProfileVersion],
      );
    }
  }

  await input.executor.query(
    `insert into event_ops_membership_versions (
       workspace_id, event_id, actor_id, membership_version, participant_id,
       profile_version, status, registered_at, cancelled_at, reactivated_at,
       late_registration, source_registration_id, effective_at, created_at,
       origin, admission_application_version
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16
     )`,
    [input.workspaceId, input.registration.eventId, input.registration.userId,
      input.membershipVersion, input.registration.participantProfileId,
      input.profileVersion, input.registration.status,
      input.registration.registeredAt, input.registration.cancelledAt,
      input.registration.reactivatedAt, participant.lateRegistration,
      input.registration.id, effectiveAt, observedAt, input.origin,
      input.admissionApplicationVersion],
  );
  await input.executor.query(
    `insert into event_ops_membership_heads (
       workspace_id, event_id, actor_id, membership_version, participant_id,
       profile_version, status, revision, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, 1, $8)
     on conflict (workspace_id, event_id, actor_id) do update
     set membership_version = excluded.membership_version,
       participant_id = excluded.participant_id,
       profile_version = excluded.profile_version,
       status = excluded.status,
       revision = event_ops_membership_heads.revision + 1,
       updated_at = excluded.updated_at`,
    [input.workspaceId, input.registration.eventId, input.registration.userId,
      input.membershipVersion, input.registration.participantProfileId,
      input.profileVersion, input.registration.status,
      input.registration.updatedAt],
  );

  const eventType = input.registration.status === "cancelled"
    ? "event.registration.cancelled"
    : "event.registration.upserted";
  const suffix = `${encodeURIComponent(input.registration.eventId)}:${encodeURIComponent(input.registration.userId)}:${input.membershipVersion}`;
  await input.executor.query(
    `insert into event_ops_outbox (
       workspace_id, outbox_id, event_id, aggregate_type, aggregate_id,
       event_type, payload, status, attempts, available_at, created_at,
       updated_at
     ) values ($1, $2, $3, 'event_registration', $4, $5, $6::jsonb,
       'pending', 0, $7, $7, $7)`,
    [input.workspaceId, `outbox:event-registration:${suffix}`,
      input.registration.eventId, input.registration.id, eventType,
      JSON.stringify(input.registration), observedAt],
  );
  await input.executor.query(
    `insert into event_ops_audit_log (
       workspace_id, audit_id, event_id, actor_id, action, aggregate_type,
       aggregate_id, before_payload, after_payload, evidence_ids, occurred_at
     ) values ($1, $2, $3, $4, $5, 'event_registration', $6, null,
       $7::jsonb, $8::text[], $9)`,
    [input.workspaceId, `audit:event-registration:${suffix}`,
      input.registration.eventId, input.registration.userId, eventType,
      input.registration.id, JSON.stringify(input.registration),
      participant.evidenceIds, observedAt],
  );
  return clone(input.registration);
}
