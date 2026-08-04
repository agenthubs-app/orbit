import { createHash } from "node:crypto";

import type { EventRegistration } from "../contract";
import type { EventProfileResponseSnapshot } from "../interview-response-contract";
import { validateCanonicalRegistrationActivationAudit } from "../canonical-migration/activation-audit-contract";
import { validateCanonicalMigrationRegistration } from "../canonical-migration/source-reader";
import {
  isCanonicalMembershipMigrationSnapshot,
  type CanonicalMembershipMigrationSnapshot,
} from "../canonical-migration/snapshot-runner";
import {
  compareUtf16CodeUnits,
  profileRepairHash,
  profileRepairInventoryHash,
  profileRepairInventoryRowFingerprint,
  profileRepairToken,
  stableProfileRepairValue,
  type ProfileContractRepairBlocker,
  type ProfileContractRepairEventEvidence,
  type ProfileContractRepairInventoryRowFact,
  type ProfileContractRepairSource,
  type ProfileContractRepairTargetFact,
} from "./contract";
import { transformCanonicalProfileAnswerMaps } from "./transform";

type SqlRow = Record<string, unknown>;
const trustedProfileContractRepairSources = new WeakMap<
  object,
  CanonicalMembershipMigrationSnapshot
>();

function deepFreeze<TValue>(value: TValue, seen = new WeakSet<object>()): TValue {
  if (!value || typeof value !== "object") return value;
  const objectValue = value as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item, seen);
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      for (const item of Object.values(value as Record<string, unknown>)) {
        deepFreeze(item, seen);
      }
    }
  }
  return Object.freeze(value);
}

export function isTrustedProfileContractRepairSource(value: unknown): boolean {
  const snapshot =
    typeof value === "object" && value !== null
      ? trustedProfileContractRepairSources.get(value)
      : undefined;
  return (
    typeof value === "object" &&
    value !== null &&
    snapshot !== undefined &&
    isCanonicalMembershipMigrationSnapshot(snapshot) &&
    Object.isFrozen(value)
  );
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function dbTimestamp(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function nullableCanonicalText(value: unknown): boolean {
  return value === null || text(value);
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(text) &&
    new Set(value).size === value.length
  );
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function storedPayloadHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableProfileRepairValue(value)))
    .digest("hex");
}

function blocker(input: {
  code: string;
  eventId?: string | null;
  message: string;
  targetToken?: string | null;
}): ProfileContractRepairBlocker {
  return {
    code: input.code,
    eventId: input.eventId ?? null,
    message: input.message,
    targetToken: input.targetToken ?? null,
  };
}

function sortBlockers(values: readonly ProfileContractRepairBlocker[]) {
  return [...values].sort(
    (left, right) =>
      compareUtf16CodeUnits(left.eventId ?? "", right.eventId ?? "") ||
      compareUtf16CodeUnits(left.code, right.code) ||
      compareUtf16CodeUnits(left.targetToken ?? "", right.targetToken ?? "") ||
      compareUtf16CodeUnits(left.message, right.message),
  );
}

function targetToken(workspaceId: string, eventId: string, participantId: unknown) {
  return typeof participantId === "string"
    ? profileRepairToken(
        "profile-target",
        `${workspaceId}\0${eventId}\0${participantId}`,
      )
    : null;
}

function validateParticipant(input: {
  actorId: string;
  lateRegistration: boolean;
  participant: Record<string, unknown>;
  participantId: string;
  registrationId: string;
}): boolean {
  const participant = input.participant;
  const requiredKeys = [
    "actorId",
    "company",
    "displayName",
    "energyStyle",
    "evidenceIds",
    "experienceHighlight",
    "industry",
    "languages",
    "lateRegistration",
    "needs",
    "offers",
    "participantId",
    "profileCompleteness",
    "role",
    "seniority",
    "topics",
  ] as const;
  const hasProfileAnswers = Object.hasOwn(participant, "profileAnswers");
  if (
    !exactKeys(
      participant,
      hasProfileAnswers ? [...requiredKeys, "profileAnswers"] : requiredKeys,
    ) ||
    participant.actorId !== input.actorId ||
    participant.participantId !== input.participantId ||
    participant.lateRegistration !== input.lateRegistration ||
    !text(participant.displayName) ||
    !nullableCanonicalText(participant.company) ||
    !nullableCanonicalText(participant.energyStyle) ||
    !nullableCanonicalText(participant.experienceHighlight) ||
    !nullableCanonicalText(participant.industry) ||
    !nullableCanonicalText(participant.role) ||
    !nullableCanonicalText(participant.seniority) ||
    !["complete", "partial", "minimal"].includes(
      String(participant.profileCompleteness),
    ) ||
    !stringArray(participant.languages) ||
    !stringArray(participant.needs) ||
    !stringArray(participant.offers) ||
    !stringArray(participant.topics) ||
    !Array.isArray(participant.evidenceIds) ||
    participant.evidenceIds.length !== 2 ||
    participant.evidenceIds[0] !==
      `evidence:event-registration:${input.registrationId}` ||
    participant.evidenceIds[1] !==
      `evidence:participant-profile:${input.participantId}`
  ) {
    return false;
  }
  return true;
}

function responsePayloads(input: {
  profile: Record<string, unknown>;
  rows: readonly SqlRow[];
}): { hash: string; responses: readonly EventProfileResponseSnapshot[] } | null {
  const responses: EventProfileResponseSnapshot[] = [];
  const normalizedRows: unknown[] = [];
  const orderedRows = [...input.rows].sort((left, right) =>
    compareUtf16CodeUnits(String(left.response_id), String(right.response_id)),
  );
  for (const row of orderedRows) {
    const payload = object(row.response_payload);
    const answeredAt = dbTimestamp(row.answered_at);
    const createdAt = dbTimestamp(row.response_created_at);
    if (
      !payload ||
      !answeredAt ||
      !createdAt ||
      row.response_id !== payload.responseId ||
      row.field_key !== payload.field ||
      row.visibility !== payload.visibility ||
      row.question_source !== payload.questionSource ||
      answeredAt !== payload.answeredAt
    ) {
      return null;
    }
    responses.push(payload as unknown as EventProfileResponseSnapshot);
    normalizedRows.push({
      answeredAt,
      createdAt,
      field: row.field_key,
      payload,
      questionSource: row.question_source,
      responseId: row.response_id,
      visibility: row.visibility,
    });
  }
  const embedded = Array.isArray(input.profile.interviewResponses)
    ? (input.profile.interviewResponses as unknown[])
    : [];
  const orderedEmbedded = [...embedded].sort((left, right) =>
    compareUtf16CodeUnits(
      String(object(left)?.responseId ?? ""),
      String(object(right)?.responseId ?? ""),
    ),
  );
  const orderedResponses = [...responses].sort((left, right) =>
    compareUtf16CodeUnits(left.responseId, right.responseId),
  );
  if (
    JSON.stringify(stableProfileRepairValue(orderedEmbedded)) !==
    JSON.stringify(stableProfileRepairValue(orderedResponses))
  ) {
    return null;
  }
  return {
    hash: profileRepairHash(
      "canonical-profile-contract-repair:responses:v1",
      normalizedRows,
    ),
    responses: orderedResponses,
  };
}

export async function readProfileContractRepairSource(input: {
  snapshot: CanonicalMembershipMigrationSnapshot;
  workspaceId: string;
}): Promise<ProfileContractRepairSource> {
  if (!isCanonicalMembershipMigrationSnapshot(input.snapshot)) {
    throw new Error("Canonical profile repair requires a runtime-attested database snapshot.");
  }
  const executor = input.snapshot.executor;
  const eventResult = await executor.query<SqlRow>(
    `select
       event_row.event_id, event_row.event_version, event_row.revision,
       current_version.content_hash,
       event_row.registration_migration_count,
       event_row.registration_migration_hash,
       event_row.registration_migrated_at,
       configuration_head.configuration_version as configuration_head_version,
       configuration_head.revision as configuration_head_revision,
       configuration.configuration_version,
       configuration.profile_edit_deadline_at,
       (select count(*)::text from event_ops_membership_heads membership_head
         where membership_head.workspace_id = event_row.workspace_id
           and membership_head.event_id = event_row.event_id) as membership_head_count,
       (select count(*)::text from event_ops_profile_heads profile_head
         where profile_head.workspace_id = event_row.workspace_id
           and profile_head.event_id = event_row.event_id) as profile_head_count
     from event_ops_events event_row
     left join event_event_versions current_version
       on current_version.workspace_id = event_row.workspace_id
      and current_version.event_id = event_row.event_id
      and current_version.event_version = event_row.event_version
     left join event_ops_configuration_heads configuration_head
       on configuration_head.workspace_id = event_row.workspace_id
      and configuration_head.event_id = event_row.event_id
     left join event_ops_configurations configuration
       on configuration.workspace_id = configuration_head.workspace_id
      and configuration.event_id = configuration_head.event_id
      and configuration.configuration_version = configuration_head.configuration_version
     where event_row.workspace_id = $1
       and event_row.registration_migration_state = 'canonical'
     order by event_row.event_id`,
    [input.workspaceId],
  );
  const auditResult = await executor.query<SqlRow>(
    `select event_id, audit_id, actor_id, aggregate_type, aggregate_id,
            after_payload, evidence_ids, occurred_at
     from event_ops_audit_log
     where workspace_id = $1 and action = 'registration_migration_activated'
     order by event_id, audit_id`,
    [input.workspaceId],
  );
  const profileResult = await executor.query<SqlRow>(
    `select
       membership_head.event_id,
       membership_head.actor_id,
       membership_head.participant_id,
       membership_head.membership_version,
       membership_head.profile_version,
       membership_head.status as membership_head_status,
       membership_head.revision as membership_head_revision,
       membership_head.updated_at as membership_head_updated_at,
       membership_version_row.participant_id as membership_version_participant_id,
       membership_version_row.profile_version as membership_version_profile_version,
       membership_version_row.status as membership_version_status,
       membership_version_row.registered_at,
       membership_version_row.cancelled_at,
       membership_version_row.reactivated_at,
       membership_version_row.late_registration,
       membership_version_row.source_registration_id,
       case
         when to_jsonb(membership_version_row) ? 'origin'
           then to_jsonb(membership_version_row) ->> 'origin'
         else 'legacy_registration'
       end as membership_origin,
       case
         when to_jsonb(membership_version_row) ? 'admission_application_version'
           then to_jsonb(membership_version_row) ->> 'admission_application_version'
         else null
       end as admission_application_version,
       membership_version_row.effective_at as membership_effective_at,
       membership_version_row.created_at as membership_created_at,
       profile_head.actor_id as profile_head_actor_id,
       profile_head.profile_version as profile_head_profile_version,
       profile_head.revision as profile_head_revision,
       profile_head.updated_at as profile_head_updated_at,
       profile_version.actor_id as profile_version_actor_id,
       profile_version.profile_payload,
       profile_version.profile_hash,
       profile_version.source_registration_id as profile_source_registration_id,
       profile_version.effective_at as profile_effective_at,
       profile_version.created_at as profile_created_at
     from event_ops_membership_heads membership_head
     join event_ops_events event_row
       on event_row.workspace_id = membership_head.workspace_id
      and event_row.event_id = membership_head.event_id
      and event_row.registration_migration_state = 'canonical'
     join event_ops_membership_versions membership_version_row
       on membership_version_row.workspace_id = membership_head.workspace_id
      and membership_version_row.event_id = membership_head.event_id
      and membership_version_row.actor_id = membership_head.actor_id
      and membership_version_row.membership_version = membership_head.membership_version
     join event_ops_profile_heads profile_head
       on profile_head.workspace_id = membership_head.workspace_id
      and profile_head.event_id = membership_head.event_id
      and profile_head.participant_id = membership_head.participant_id
     join event_ops_profile_versions profile_version
       on profile_version.workspace_id = profile_head.workspace_id
      and profile_version.event_id = profile_head.event_id
      and profile_version.participant_id = profile_head.participant_id
      and profile_version.profile_version = profile_head.profile_version
     where membership_head.workspace_id = $1
     order by membership_head.event_id, membership_head.participant_id`,
    [input.workspaceId],
  );
  const responseResult = await executor.query<SqlRow>(
    `select response.workspace_id, response.event_id, response.participant_id,
            response.profile_version, response.response_id, response.field_key,
            response.visibility, response.question_source,
            response.response_payload, response.answered_at,
            response.created_at as response_created_at
     from event_ops_profile_response_versions response
     join event_ops_profile_heads profile_head
       on profile_head.workspace_id = response.workspace_id
      and profile_head.event_id = response.event_id
      and profile_head.participant_id = response.participant_id
      and profile_head.profile_version = response.profile_version
     join event_ops_events event_row
       on event_row.workspace_id = response.workspace_id
      and event_row.event_id = response.event_id
      and event_row.registration_migration_state = 'canonical'
     where response.workspace_id = $1
     order by response.event_id, response.participant_id, response.response_id`,
    [input.workspaceId],
  );

  const blockers: ProfileContractRepairBlocker[] = [];
  if (eventResult.rows.length === 0) {
    blockers.push(
      blocker({
        code: "REPAIR_CANONICAL_SCOPE_EMPTY",
        message: "Canonical profile repair requires at least one canonical event.",
      }),
    );
  }
  const canonicalEventIds = new Set(
    eventResult.rows.flatMap((row) =>
      typeof row.event_id === "string" ? [row.event_id] : [],
    ),
  );
  const auditsByEvent = new Map<string, SqlRow[]>();
  for (const audit of auditResult.rows) {
    const eventId = typeof audit.event_id === "string" ? audit.event_id : "";
    if (!canonicalEventIds.has(eventId)) {
      blockers.push(
        blocker({
          code: "REPAIR_ACTIVATION_AUDIT_ORPHAN",
          message: "Registration activation audit does not belong to the current canonical event inventory.",
          targetToken:
            typeof audit.audit_id === "string"
              ? profileRepairToken(
                  "activation-audit",
                  `${input.workspaceId}\0${audit.audit_id}`,
                )
              : null,
        }),
      );
      continue;
    }
    auditsByEvent.set(eventId, [...(auditsByEvent.get(eventId) ?? []), audit]);
  }
  const profileRowsByEvent = new Map<string, SqlRow[]>();
  for (const row of profileResult.rows) {
    const eventId = typeof row.event_id === "string" ? row.event_id : "";
    profileRowsByEvent.set(eventId, [...(profileRowsByEvent.get(eventId) ?? []), row]);
  }
  const responsesByTarget = new Map<string, SqlRow[]>();
  for (const row of responseResult.rows) {
    const key = `${String(row.event_id)}\0${String(row.participant_id)}`;
    responsesByTarget.set(key, [...(responsesByTarget.get(key) ?? []), row]);
  }

  const events: ProfileContractRepairEventEvidence[] = [];
  const validEventIds = new Set<string>();
  for (const row of eventResult.rows) {
    const eventId = typeof row.event_id === "string" ? row.event_id : "";
    const eventVersion = positiveInteger(row.event_version);
    const eventRevision = positiveInteger(row.revision);
    const contentHash =
      typeof row.content_hash === "string" && /^[a-f0-9]{64}$/u.test(row.content_hash)
        ? row.content_hash
        : null;
    const configurationVersion = positiveInteger(row.configuration_version);
    const configurationHeadVersion = positiveInteger(row.configuration_head_version);
    const configurationHeadRevision = positiveInteger(row.configuration_head_revision);
    const profileEditDeadlineAt = dbTimestamp(row.profile_edit_deadline_at);
    const migrationCount = nonNegativeInteger(row.registration_migration_count);
    const migrationHash =
      typeof row.registration_migration_hash === "string" &&
      /^[a-f0-9]{64}$/u.test(row.registration_migration_hash)
        ? row.registration_migration_hash
        : null;
    const audits = auditsByEvent.get(eventId) ?? [];
    const membershipHeadCount = nonNegativeInteger(row.membership_head_count);
    const profileHeadCount = nonNegativeInteger(row.profile_head_count);
    const joinedCount = profileRowsByEvent.get(eventId)?.length ?? 0;
    const valid = Boolean(
      eventId &&
        eventVersion &&
        eventRevision &&
        contentHash &&
        configurationVersion &&
        configurationHeadVersion === configurationVersion &&
        configurationHeadRevision &&
        profileEditDeadlineAt &&
        migrationCount !== null &&
        migrationHash &&
        audits.length === 1 &&
        validateCanonicalRegistrationActivationAudit({
          audit: audits[0]!,
          count: migrationCount!,
          eventId,
          hash: migrationHash!,
          migratedAt: row.registration_migrated_at,
        }) &&
        membershipHeadCount !== null &&
        membershipHeadCount === profileHeadCount &&
        membershipHeadCount === joinedCount,
    );
    if (!valid) {
      blockers.push(
        blocker({
          code: "REPAIR_EVENT_SOURCE_INVALID",
          eventId: eventId || null,
          message: "Canonical event/configuration/activation/head evidence is incomplete or inconsistent.",
        }),
      );
      continue;
    }
    const activationAuditFingerprint = profileRepairHash(
      "canonical-profile-contract-repair:activation-audit:v1",
      {
        audit: {
          ...audits[0],
          occurred_at: dbTimestamp(audits[0]!.occurred_at),
        },
        count: migrationCount,
        hash: migrationHash,
        migratedAt: dbTimestamp(row.registration_migrated_at),
      },
    );
    events.push({
      activationAuditFingerprint,
      configurationHeadRevision: configurationHeadRevision!,
      configurationVersion: configurationVersion!,
      contentHash: contentHash!,
      eventId,
      eventRevision: eventRevision!,
      eventVersion: eventVersion!,
      inventoryCount: 0,
      inventoryHash: profileRepairInventoryHash([]),
      profileEditDeadlineAt: profileEditDeadlineAt!,
      sourceAuthority: "canonical",
    });
    validEventIds.add(eventId);
  }

  const inventory: ProfileContractRepairInventoryRowFact[] = [];
  const targets: ProfileContractRepairTargetFact[] = [];
  for (const row of profileResult.rows) {
    const eventId = typeof row.event_id === "string" ? row.event_id : "";
    const token = targetToken(input.workspaceId, eventId, row.participant_id);
    if (!validEventIds.has(eventId)) continue;
    const actorId = typeof row.actor_id === "string" ? row.actor_id : "";
    const participantId = typeof row.participant_id === "string" ? row.participant_id : "";
    const expectedParticipantId = `event-participant-profile:${encodeURIComponent(eventId)}:${encodeURIComponent(actorId)}`;
    const expectedRegistrationId = `event-registration:${encodeURIComponent(eventId)}:${encodeURIComponent(actorId)}`;
    const membershipVersion = positiveInteger(row.membership_version);
    const profileVersion = positiveInteger(row.profile_version);
    const membershipHeadRevision = positiveInteger(row.membership_head_revision);
    const profileHeadRevision = positiveInteger(row.profile_head_revision);
    const payload = object(row.profile_payload);
    const participant = object(payload?.participant);
    const registrationProfile = object(payload?.registrationProfile);
    const lateRegistration = row.late_registration;
    const membershipOrigin = row.membership_origin;
    const admissionApplicationVersion =
      row.admission_application_version === null
        ? null
        : positiveInteger(row.admission_application_version);
    const membershipProvenanceValid =
      (membershipOrigin === "legacy_registration" &&
        row.admission_application_version === null) ||
      (membershipOrigin === "admission_application" &&
        admissionApplicationVersion !== null);
    const sourceIdentityValid = Boolean(
      token &&
        actorId &&
        participantId === expectedParticipantId &&
        row.membership_version_participant_id === participantId &&
        row.profile_head_actor_id === actorId &&
        row.profile_version_actor_id === actorId &&
        positiveInteger(row.membership_version_profile_version) === profileVersion &&
        positiveInteger(row.profile_head_profile_version) === profileVersion &&
        row.membership_head_status === row.membership_version_status &&
        row.source_registration_id === expectedRegistrationId &&
        row.profile_source_registration_id === expectedRegistrationId &&
        membershipVersion &&
        profileVersion &&
        membershipHeadRevision &&
        profileHeadRevision &&
        membershipProvenanceValid &&
        typeof lateRegistration === "boolean" &&
        dbTimestamp(row.membership_head_updated_at) &&
        dbTimestamp(row.profile_head_updated_at) &&
        dbTimestamp(row.membership_effective_at) &&
        dbTimestamp(row.membership_created_at) &&
        dbTimestamp(row.profile_effective_at) &&
        dbTimestamp(row.profile_created_at) &&
        payload &&
        exactKeys(payload, ["participant", "registrationProfile"]) &&
        participant &&
        registrationProfile &&
        validateParticipant({
          actorId,
          lateRegistration: lateRegistration as boolean,
          participant,
          participantId,
          registrationId: expectedRegistrationId,
        }) &&
        typeof row.profile_hash === "string" &&
        row.profile_hash === storedPayloadHash(payload),
    );
    if (!sourceIdentityValid || !payload || !participant || !registrationProfile) {
      blockers.push(
        blocker({
          code: "REPAIR_PROFILE_SOURCE_INVALID",
          eventId,
          message: "Canonical profile/membership head, version, identity, or payload is inconsistent.",
          targetToken: token,
        }),
      );
      continue;
    }
    const transformed = transformCanonicalProfileAnswerMaps({
      participantAnswers: participant.profileAnswers,
      registrationAnswers: registrationProfile.answers,
    });
    if (transformed.kind === "invalid") {
      blockers.push(
        blocker({
          code: transformed.code,
          eventId,
          message: transformed.message,
          targetToken: token,
        }),
      );
      continue;
    }
    const responseEvidence = responsePayloads({
      profile: registrationProfile,
      rows: responsesByTarget.get(`${eventId}\0${participantId}`) ?? [],
    });
    if (!responseEvidence) {
      blockers.push(
        blocker({
          code: "REPAIR_RESPONSE_SOURCE_INVALID",
          eventId,
          message: "Canonical profile response rows do not match the immutable profile snapshot.",
          targetToken: token,
        }),
      );
      continue;
    }
    const afterPayload = clone(payload);
    if (transformed.afterParticipantAnswers !== null) {
      (afterPayload.participant as Record<string, unknown>).profileAnswers =
        transformed.afterParticipantAnswers;
    }
    (afterPayload.registrationProfile as Record<string, unknown>).answers =
      transformed.afterRegistrationAnswers;
    const registration: EventRegistration = {
      cancelledAt: dbTimestamp(row.cancelled_at),
      eventId,
      id: expectedRegistrationId,
      participantProfile: {
        ...(afterPayload.registrationProfile as unknown as EventRegistration["participantProfile"]),
        ...(responseEvidence.responses.length > 0
          ? { interviewResponses: responseEvidence.responses }
          : {}),
      },
      participantProfileId: participantId,
      reactivatedAt: dbTimestamp(row.reactivated_at),
      registeredAt: dbTimestamp(row.registered_at) ?? "",
      sideEffects: {
        calendarUpdateExecuted: false,
        emailSent: false,
        globalProfileWriteExecuted: false,
        notificationDelivered: false,
        organizerMessageSent: false,
        refundRequested: false,
      },
      status: row.membership_version_status as EventRegistration["status"],
      updatedAt: dbTimestamp(row.membership_head_updated_at) ?? "",
      userId: actorId,
    };
    if (
      !validateCanonicalMigrationRegistration({
        eventId,
        recordId: `repair-validation:${token}`,
        value: registration,
      }).registration
    ) {
      blockers.push(
        blocker({
          code: "REPAIR_REGISTRATION_CONTRACT_INVALID",
          eventId,
          message: "Canonical registration/profile lifecycle or response contract is invalid after the allowed deletion-only transform.",
          targetToken: token,
        }),
      );
      continue;
    }
    const beforeProfilePayloadHash = profileRepairHash(
      "canonical-profile-contract-repair:profile-payload-before:v1",
      payload,
    );
    const afterProfilePayloadHash =
      transformed.kind === "candidate"
        ? profileRepairHash(
            "canonical-profile-contract-repair:profile-payload-after:v1",
            afterPayload,
          )
        : null;
    const lifecycleHash = profileRepairHash(
      "canonical-profile-contract-repair:lifecycle:v2",
      {
        admissionApplicationVersion,
        cancelledAt: dbTimestamp(row.cancelled_at),
        effectiveAt: dbTimestamp(row.membership_effective_at),
        lateRegistration,
        origin: membershipOrigin,
        reactivatedAt: dbTimestamp(row.reactivated_at),
        registeredAt: dbTimestamp(row.registered_at),
        sourceRegistrationId: row.source_registration_id,
        status: row.membership_version_status,
      },
    );
    const inventoryFingerprintInput: Omit<
      ProfileContractRepairInventoryRowFact,
      "rowFingerprint"
    > = {
      afterProfilePayloadHash,
      beforeProfilePayloadHash,
      candidateState: transformed.kind,
      deletionPaths: transformed.deletionPaths,
      eventId,
      lateRegistration: lateRegistration as boolean,
      lifecycleHash,
      membershipHeadRevision: membershipHeadRevision!,
      membershipStatus: row.membership_version_status as "cancelled" | "rsvped",
      membershipVersion: membershipVersion!,
      profileHeadRevision: profileHeadRevision!,
      profileVersion: profileVersion!,
      responsesHash: responseEvidence.hash,
      sourceAuthority: "canonical",
      targetToken: token!,
    };
    inventory.push({
      ...inventoryFingerprintInput,
      rowFingerprint: profileRepairInventoryRowFingerprint(
        inventoryFingerprintInput,
      ),
    });
    if (transformed.kind === "unchanged") continue;
    targets.push({
      afterProfilePayloadHash: afterProfilePayloadHash!,
      beforeProfilePayloadHash,
      deletionPaths: transformed.deletionPaths,
      eventId,
      lifecycleHash,
      membershipHeadRevision: membershipHeadRevision!,
      membershipVersion: membershipVersion!,
      profileHeadRevision: profileHeadRevision!,
      profileVersion: profileVersion!,
      responsesHash: responseEvidence.hash,
      sourceAuthority: "canonical",
      targetToken: token!,
    });
  }
  inventory.sort(
    (left, right) =>
      compareUtf16CodeUnits(left.eventId, right.eventId) ||
      compareUtf16CodeUnits(left.targetToken, right.targetToken),
  );
  const finalizedEvents = events
    .map((event) => {
      const eventInventory = inventory.filter(
        (value) => value.eventId === event.eventId,
      );
      return {
        ...event,
        inventoryCount: eventInventory.length,
        inventoryHash: profileRepairInventoryHash(eventInventory),
      };
    })
    .sort((left, right) => compareUtf16CodeUnits(left.eventId, right.eventId));
  targets.sort(
    (left, right) =>
      compareUtf16CodeUnits(left.eventId, right.eventId) ||
      compareUtf16CodeUnits(left.targetToken, right.targetToken),
  );
  if (!isCanonicalMembershipMigrationSnapshot(input.snapshot)) {
    throw new Error("Canonical profile repair requires a runtime-attested database snapshot.");
  }
  const source = deepFreeze({
    blockers: sortBlockers(blockers),
    events: finalizedEvents,
    inventory,
    targets,
  } satisfies ProfileContractRepairSource);
  trustedProfileContractRepairSources.set(source, input.snapshot);
  return source;
}
