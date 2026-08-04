import { createHash } from "node:crypto";

import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileAnswers,
  type EventParticipantProfileField,
  type EventRegistration,
} from "../contract";
import {
  answersFromProfileResponses,
  type EventProfileResponseSnapshot,
} from "../interview-response-contract";
import { readCanonicalRegistrationInventoryWithExecutor } from "../../event-operations/storage/canonical-registration-repository";
import type {
  CanonicalMembershipMigrationBlocker,
  CanonicalMembershipMigrationEventFact,
} from "./contract";
import { validateCanonicalRegistrationActivationAudit } from "./activation-audit-contract";
import type { CanonicalMembershipMigrationSnapshot } from "./snapshot-runner";

type SqlRow = Record<string, unknown>;

export interface CanonicalMembershipMigrationSourceReadResult {
  blockers: readonly CanonicalMembershipMigrationBlocker[];
  facts: readonly CanonicalMembershipMigrationEventFact[];
}

function blocker(input: {
  code: string;
  eventId?: string | null;
  message: string;
  recordId?: string | null;
}): CanonicalMembershipMigrationBlocker {
  const recordToken =
    typeof input.recordId === "string" && input.recordId.length > 0
      ? `record-sha256:${createHash("sha256")
          .update(`canonical-membership-migration:record-id\0${input.recordId}`)
          .digest("hex")}`
      : null;
  return {
    code: input.code,
    eventId: input.eventId ?? null,
    message: input.message,
    recordId: recordToken,
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function timestamp(value: unknown): value is string {
  if (!nonEmptyText(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || timestamp(value);
}

function integer(value: unknown): number | null {
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

function validateAnswers(value: unknown): value is EventParticipantProfileAnswers {
  const answers = object(value);
  return Boolean(
    answers &&
      Object.entries(answers).every(
        ([field, answer]) =>
          EVENT_PARTICIPANT_PROFILE_FIELDS.includes(
            field as EventParticipantProfileField,
          ) &&
          typeof answer === "string" &&
          answer.trim() === answer &&
          answer.length > 0 &&
          answer.length <= 1_000,
      ),
  );
}

function validateResponse(value: unknown): value is EventProfileResponseSnapshot {
  const response = object(value);
  if (
    !response ||
    !exactKeys(response, [
      "answer",
      "answerSource",
      "answeredAt",
      "field",
      "generation",
      "question",
      "questionId",
      "questionSource",
      "responseId",
      "visibility",
    ]) ||
    response.answerSource !== "participant" ||
    !timestamp(response.answeredAt) ||
    !EVENT_PARTICIPANT_PROFILE_FIELDS.includes(
      response.field as EventParticipantProfileField,
    ) ||
    !nonEmptyText(response.responseId) ||
    !["event_attendees", "matching_only"].includes(
      String(response.visibility),
    ) ||
    !["ai_adaptive", "legacy_unknown"].includes(String(response.questionSource))
  ) {
    return false;
  }
  const answer = object(response.answer);
  if (
    !answer ||
    !exactKeys(answer, ["customText", "displayText", "selectedOptionIds"]) ||
    !nonEmptyText(answer.displayText) ||
    answer.displayText.length > 1_000 ||
    !(
      answer.customText === null ||
      (nonEmptyText(answer.customText) && answer.customText.length <= 1_000)
    ) ||
    !Array.isArray(answer.selectedOptionIds) ||
    !answer.selectedOptionIds.every(nonEmptyText) ||
    new Set(answer.selectedOptionIds).size !== answer.selectedOptionIds.length
  ) {
    return false;
  }
  if (response.questionSource === "legacy_unknown") {
    return (
      response.generation === null &&
      response.question === null &&
      response.questionId === null &&
      answer.customText === answer.displayText &&
      answer.selectedOptionIds.length === 0 &&
      response.responseId === `legacy:${String(response.field)}` &&
      response.visibility === "event_attendees"
    );
  }
  const generation = object(response.generation);
  const question = object(response.question);
  if (
    !generation ||
    !exactKeys(generation, ["method", "model", "promptVersion", "provider"]) ||
    generation.method !== "orbit-agent-model-adaptive" ||
    !nonEmptyText(generation.model) ||
    !Number.isSafeInteger(generation.promptVersion) ||
    Number(generation.promptVersion) < 1 ||
    !nonEmptyText(generation.provider) ||
    !nonEmptyText(response.questionId) ||
    !question ||
    !exactKeys(question, [
      "fieldLabel",
      "inputKind",
      "language",
      "options",
      "prompt",
    ]) ||
    question.inputKind !== "single_choice_with_custom" ||
    !["en", "zh"].includes(String(question.language)) ||
    !nonEmptyText(question.prompt) ||
    !Array.isArray(question.options)
  ) {
    return false;
  }
  const label = object(question.fieldLabel);
  if (
    !label ||
    !exactKeys(label, ["en", "zh"]) ||
    !nonEmptyText(label.en) ||
    !nonEmptyText(label.zh)
  ) {
    return false;
  }
  const optionIds = new Set<string>();
  const optionLabels = new Map<string, string>();
  for (const rawOption of question.options) {
    const option = object(rawOption);
    if (
      !option ||
      !exactKeys(option, ["id", "label"]) ||
      !nonEmptyText(option.id) ||
      !nonEmptyText(option.label) ||
      optionIds.has(option.id)
    ) {
      return false;
    }
    optionIds.add(option.id);
    optionLabels.set(option.id, option.label);
  }
  if (response.responseId !== `response:${String(response.questionId)}`) {
    return false;
  }
  if (answer.selectedOptionIds.length === 1) {
    const selectedLabel = optionLabels.get(answer.selectedOptionIds[0]!);
    return (
      selectedLabel !== undefined &&
      answer.customText === null &&
      answer.displayText === selectedLabel
    );
  }
  return (
    answer.selectedOptionIds.length === 0 &&
    answer.customText === answer.displayText
  );
}

function sameAnswers(
  left: EventParticipantProfileAnswers,
  right: EventParticipantProfileAnswers,
): boolean {
  return EVENT_PARTICIPANT_PROFILE_FIELDS.every(
    (field) => left[field] === right[field],
  );
}

export function validateCanonicalMigrationRegistration(input: {
  eventId: string;
  legacyRecordIdentity?: {
    providerRecordId: unknown;
    sourceId: unknown;
    targetType: unknown;
    userId: unknown;
  };
  recordId: string;
  value: unknown;
  wrapperRegistrationId?: unknown;
}): { blockers: readonly CanonicalMembershipMigrationBlocker[]; registration: EventRegistration | null } {
  const invalid = (message: string) => ({
    blockers: [
      blocker({
        code: "REGISTRATION_SOURCE_INVALID",
        eventId: input.eventId,
        message,
        recordId: input.recordId,
      }),
    ],
    registration: null,
  });
  const registration = object(input.value);
  const expectedRegistrationId =
    registration && nonEmptyText(registration.userId)
      ? `event-registration:${encodeURIComponent(input.eventId)}:${encodeURIComponent(registration.userId)}`
      : null;
  const expectedParticipantProfileId =
    registration && nonEmptyText(registration.userId)
      ? `event-participant-profile:${encodeURIComponent(input.eventId)}:${encodeURIComponent(registration.userId)}`
      : null;
  const recordIdentity = input.legacyRecordIdentity;
  if (
    !registration ||
    !exactKeys(registration, [
      "cancelledAt",
      "eventId",
      "id",
      "participantProfile",
      "participantProfileId",
      "reactivatedAt",
      "registeredAt",
      "sideEffects",
      "status",
      "updatedAt",
      "userId",
    ]) ||
    !nonEmptyText(registration.id) ||
    !nonEmptyText(registration.eventId) ||
    registration.eventId !== input.eventId ||
    !nonEmptyText(registration.userId) ||
    !nonEmptyText(registration.participantProfileId) ||
    registration.id !== expectedRegistrationId ||
    registration.participantProfileId !== expectedParticipantProfileId ||
    (recordIdentity !== undefined &&
      (input.recordId !== registration.id ||
        recordIdentity.userId !== registration.userId ||
        recordIdentity.targetType !== "event" ||
        recordIdentity.providerRecordId !== registration.id ||
        recordIdentity.sourceId !== `source:${registration.id}`)) ||
    (input.wrapperRegistrationId !== undefined &&
      input.wrapperRegistrationId !== registration.id) ||
    !timestamp(registration.registeredAt) ||
    !timestamp(registration.updatedAt) ||
    !nullableTimestamp(registration.cancelledAt) ||
    !nullableTimestamp(registration.reactivatedAt) ||
    !["rsvped", "cancelled"].includes(String(registration.status))
  ) {
    return invalid("Event registration identity, shape, status, or timestamps are invalid.");
  }
  const profile = object(registration.participantProfile);
  if (
    !profile ||
    !exactKeys(
      profile,
      ["answers", "createdAt", "eventId", "id", "updatedAt", "userId"],
      ["displayName", "interviewResponses"],
    ) ||
    !validateAnswers(profile.answers) ||
    !timestamp(profile.createdAt) ||
    !timestamp(profile.updatedAt) ||
    profile.eventId !== registration.eventId ||
    profile.userId !== registration.userId ||
    profile.id !== registration.participantProfileId ||
    ("displayName" in profile && !nonEmptyText(profile.displayName)) ||
    Date.parse(profile.createdAt as string) > Date.parse(profile.updatedAt as string) ||
    Date.parse(profile.updatedAt as string) > Date.parse(registration.updatedAt as string)
  ) {
    return invalid("Event participant profile is invalid or inconsistent.");
  }
  const sideEffects = object(registration.sideEffects);
  const sideEffectKeys = [
    "calendarUpdateExecuted",
    "emailSent",
    "globalProfileWriteExecuted",
    "notificationDelivered",
    "organizerMessageSent",
    "refundRequested",
  ];
  if (
    !sideEffects ||
    !exactKeys(sideEffects, sideEffectKeys) ||
    !sideEffectKeys.every((key) => sideEffects[key] === false)
  ) {
    return invalid("Event registration side effects must be the exact all-false contract.");
  }
  const registeredAt = Date.parse(registration.registeredAt as string);
  const updatedAt = Date.parse(registration.updatedAt as string);
  const cancelledAt = registration.cancelledAt
    ? Date.parse(registration.cancelledAt as string)
    : null;
  const reactivatedAt = registration.reactivatedAt
    ? Date.parse(registration.reactivatedAt as string)
    : null;
  if (
    registeredAt > updatedAt ||
    (registration.status === "cancelled" && cancelledAt === null) ||
    (registration.status === "rsvped" &&
      ((cancelledAt === null) !== (reactivatedAt === null))) ||
    (cancelledAt !== null && cancelledAt < registeredAt) ||
    (registration.status === "rsvped" &&
      reactivatedAt !== null &&
      cancelledAt !== null &&
      reactivatedAt < cancelledAt) ||
    (registration.status === "cancelled" &&
      reactivatedAt !== null &&
      (reactivatedAt < registeredAt ||
        cancelledAt === null ||
        reactivatedAt >= cancelledAt)) ||
    (cancelledAt !== null && cancelledAt > updatedAt) ||
    (reactivatedAt !== null && reactivatedAt > updatedAt)
  ) {
    return invalid("Event registration lifecycle timestamps are inconsistent.");
  }
  if ("interviewResponses" in profile) {
    if (!Array.isArray(profile.interviewResponses)) {
      return invalid("Event interview responses must be an array when present.");
    }
    const responses = profile.interviewResponses;
    if (!responses.every(validateResponse)) {
      return invalid("Event interview response snapshots are invalid.");
    }
    const ids = new Set<string>();
    const fields = new Set<string>();
    const questionIds = new Set<string>();
    const profileUpdatedAt = Date.parse(profile.updatedAt as string);
    for (const response of responses as EventProfileResponseSnapshot[]) {
      if (
        ids.has(response.responseId) ||
        fields.has(response.field) ||
        (response.questionId !== null && questionIds.has(response.questionId)) ||
        Date.parse(response.answeredAt) > profileUpdatedAt
      ) {
        return invalid("Event interview response identity or profile timeline is inconsistent.");
      }
      ids.add(response.responseId);
      fields.add(response.field);
      if (response.questionId !== null) questionIds.add(response.questionId);
    }
    if (
      !sameAnswers(
        profile.answers as EventParticipantProfileAnswers,
        answersFromProfileResponses(responses as EventProfileResponseSnapshot[]),
      )
    ) {
      return invalid("Event interview responses do not exactly match profile answers.");
    }
  }
  return { blockers: [], registration: registration as unknown as EventRegistration };
}

function validateBaseline(input: {
  audits: readonly SqlRow[];
  count: unknown;
  eventId: string;
  hash: unknown;
  migratedAt: unknown;
}): boolean {
  const count = typeof input.count === "number" ? input.count : Number(input.count);
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    typeof input.hash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(input.hash) ||
    input.audits.length !== 1
  ) {
    return false;
  }
  return validateCanonicalRegistrationActivationAudit({
    audit: input.audits[0]!,
    count,
    eventId: input.eventId,
    hash: input.hash,
    migratedAt: input.migratedAt,
  });
}

function sortBlockers(
  values: readonly CanonicalMembershipMigrationBlocker[],
): readonly CanonicalMembershipMigrationBlocker[] {
  return [...values].sort(
    (left, right) =>
      (left.eventId ?? "").localeCompare(right.eventId ?? "") ||
      left.code.localeCompare(right.code) ||
      (left.recordId ?? "").localeCompare(right.recordId ?? "") ||
      left.message.localeCompare(right.message),
  );
}

export async function readCanonicalMembershipMigrationSource(input: {
  snapshot: CanonicalMembershipMigrationSnapshot;
  workspaceId: string;
}): Promise<CanonicalMembershipMigrationSourceReadResult> {
  const executor = input.snapshot.executor;
  const eventResult = await executor.query<SqlRow>(
      `select
         event_row.event_id, event_row.event_version,
         current_version.content_hash, event_row.registration_migration_state,
         event_row.registration_migration_count,
         event_row.registration_migration_hash,
         event_row.registration_migrated_at,
         (select count(*)::text
            from event_ops_membership_heads membership_head
           where membership_head.workspace_id = event_row.workspace_id
             and membership_head.event_id = event_row.event_id) as canonical_head_count,
         configuration_head.configuration_version as configuration_head_version,
         configuration.configuration_version,
         configuration.profile_edit_deadline_at
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
         and event_row.lifecycle_state_v2 is not null
       order by event_row.event_id`,
      [input.workspaceId],
    );
  const auditResult = await executor.query<SqlRow>(
      `select event_id, audit_id, actor_id, aggregate_type, aggregate_id,
              after_payload, evidence_ids, occurred_at
       from event_ops_audit_log
       where workspace_id = $1
         and action = 'registration_migration_activated'
       order by event_id, audit_id`,
      [input.workspaceId],
    );
  const recordResult = await executor.query<SqlRow>(
      `select record_id, provider_record_id, source_id, target_id, target_type,
              user_id, payload
       from orbit_records
       where workspace_id = $1
         and collection_name = 'event_registrations'
         and deleted_at is null
         and lifecycle_state <> 'deleted'
       order by record_id`,
      [input.workspaceId],
    );
  const blockers: CanonicalMembershipMigrationBlocker[] = [];
  const eventRows = new Map<string, SqlRow>();
  for (const row of eventResult.rows) {
    const eventId = typeof row.event_id === "string" ? row.event_id : "";
    if (!eventId || eventRows.has(eventId)) {
      blockers.push(
        blocker({
          code: "EVENT_CORE_SOURCE_INVALID",
          eventId: eventId || null,
          message: "Canonical Event Core current rows are missing or duplicated.",
        }),
      );
      continue;
    }
    eventRows.set(eventId, row);
  }
  const auditsByEvent = new Map<string, SqlRow[]>();
  for (const audit of auditResult.rows) {
    const eventId = typeof audit.event_id === "string" ? audit.event_id : "";
    if (!eventId || !eventRows.has(eventId)) {
      blockers.push(
        blocker({
          code: "CANONICAL_ACTIVATION_AUDIT_EVENT_UNKNOWN",
          eventId: eventId || null,
          message: "Canonical activation audit targets an unknown Event Core event.",
        }),
      );
      continue;
    }
    if (eventRows.get(eventId)?.registration_migration_state !== "canonical") {
      blockers.push(
        blocker({
          code: "CANONICAL_ACTIVATION_AUDIT_STATE_INVALID",
          eventId,
          message: "Canonical activation audit exists for a non-canonical registration state.",
        }),
      );
      continue;
    }
    auditsByEvent.set(eventId, [...(auditsByEvent.get(eventId) ?? []), audit]);
  }
  const canonicalEventIds = new Set(
    [...eventRows.entries()]
      .filter(([, row]) => row.registration_migration_state === "canonical")
      .map(([eventId]) => eventId),
  );
  const registrationsByLegacyEvent = new Map<string, EventRegistration[]>();
  const rawLegacyCounts = new Map<string, number>();
  for (const row of recordResult.rows) {
    const targetEventId = typeof row.target_id === "string" ? row.target_id : null;
    if (targetEventId && canonicalEventIds.has(targetEventId)) continue;
    const recordId = typeof row.record_id === "string" ? row.record_id : "";
    if (!targetEventId || !eventRows.has(targetEventId)) {
      blockers.push(
        blocker({
          code: "LEGACY_REGISTRATION_EVENT_UNKNOWN",
          eventId: targetEventId,
          message: "Legacy registration targets an unknown canonical Event Core event.",
          recordId: recordId || null,
        }),
      );
      continue;
    }
    rawLegacyCounts.set(
      targetEventId,
      (rawLegacyCounts.get(targetEventId) ?? 0) + 1,
    );
    const wrapper = object(row.payload);
    if (!wrapper || !exactKeys(wrapper, ["registration", "registrationId"])) {
      blockers.push(
        blocker({
          code: "REGISTRATION_SOURCE_INVALID",
          eventId: targetEventId,
          message: "Legacy registration wrapper is invalid.",
          recordId,
        }),
      );
      continue;
    }
    const validated = validateCanonicalMigrationRegistration({
      eventId: targetEventId,
      legacyRecordIdentity: {
        providerRecordId: row.provider_record_id,
        sourceId: row.source_id,
        targetType: row.target_type,
        userId: row.user_id,
      },
      recordId,
      value: wrapper.registration,
      wrapperRegistrationId: wrapper.registrationId,
    });
    blockers.push(...validated.blockers);
    if (validated.registration) {
      registrationsByLegacyEvent.set(targetEventId, [
        ...(registrationsByLegacyEvent.get(targetEventId) ?? []),
        validated.registration,
      ]);
    }
  }

  const facts: CanonicalMembershipMigrationEventFact[] = [];
  for (const [eventId, row] of eventRows) {
    const eventVersion = integer(row.event_version);
    const contentHash =
      typeof row.content_hash === "string" &&
      /^[a-f0-9]{64}$/u.test(row.content_hash)
        ? row.content_hash
        : "";
    if (!eventVersion || !contentHash) {
      blockers.push(
        blocker({
          code: "EVENT_CORE_CURRENT_VERSION_INVALID",
          eventId,
          message: "Canonical Event Core current version/contentHash is missing.",
        }),
      );
    }
    let configurationDeadline = null;
    if (
      row.registration_migration_state !== "canonical" &&
      row.configuration_head_version !== null &&
      row.configuration_head_version !== undefined
    ) {
      const configurationHeadVersion = integer(row.configuration_head_version);
      const configurationVersion = integer(row.configuration_version);
      const profileEditDeadlineAt = dbTimestamp(row.profile_edit_deadline_at);
      if (
        !configurationHeadVersion ||
        !configurationVersion ||
        configurationVersion !== configurationHeadVersion ||
        !profileEditDeadlineAt
      ) {
        blockers.push(
          blocker({
            code: "CONFIGURATION_DEADLINE_INVALID",
            eventId,
            message: "Event operations configuration deadline is invalid.",
          }),
        );
      } else {
        configurationDeadline = {
          configurationVersion,
          profileEditDeadlineAt,
        };
      }
    }
    if (row.registration_migration_state === "canonical") {
      const rawRegistrationCount = nonNegativeInteger(row.canonical_head_count) ?? 0;
      let activationBaselineValid = validateBaseline({
        audits: auditsByEvent.get(eventId) ?? [],
        count: row.registration_migration_count,
        eventId,
        hash: row.registration_migration_hash,
        migratedAt: row.registration_migrated_at,
      });
      activationBaselineValid =
        activationBaselineValid &&
        nonNegativeInteger(row.canonical_head_count) !== null;
      if (!activationBaselineValid) {
        blockers.push(
          blocker({
            code: "CANONICAL_ACTIVATION_BASELINE_INVALID",
            eventId,
            message: "Canonical activation metadata/audit baseline is invalid.",
          }),
        );
      }
      const registrations: EventRegistration[] = [];
      try {
        const inventory = await readCanonicalRegistrationInventoryWithExecutor({
          eventId,
          executor,
          workspaceId: input.workspaceId,
        });
        if (inventory.rawCount !== rawRegistrationCount) {
          activationBaselineValid = false;
          blockers.push(
            blocker({
              code: "CANONICAL_REGISTRATION_INVENTORY_MISMATCH",
              eventId,
              message: "Canonical membership physical head inventory changed within the source snapshot.",
            }),
          );
        }
        for (let index = 0; index < inventory.invalidCount; index += 1) {
          activationBaselineValid = false;
          blockers.push(
            blocker({
              code: "CANONICAL_REGISTRATION_ROW_INVALID",
              eventId,
              message: "Canonical membership row could not be decoded.",
              recordId: `canonical-decode:${eventId}:${index}`,
            }),
          );
        }
        inventory.registrations.forEach((value, index) => {
          const validated = validateCanonicalMigrationRegistration({
            eventId,
            recordId: `canonical:${eventId}:${index}`,
            value,
          });
          blockers.push(...validated.blockers);
          if (validated.registration) {
            registrations.push(validated.registration);
          } else {
            activationBaselineValid = false;
          }
        });
      } catch {
        activationBaselineValid = false;
        blockers.push(
          blocker({
            code: "CANONICAL_REGISTRATION_SOURCE_INVALID",
            eventId,
            message: "Canonical membership registrations could not be read or decoded.",
          }),
        );
      }
      const invalidRegistrationCount = Math.max(
        rawRegistrationCount - registrations.length,
        0,
      );
      if (invalidRegistrationCount > 0) activationBaselineValid = false;
      facts.push({
        activationBaselineValid,
        authority: "canonical_membership",
        configurationDeadline,
        contentHash,
        eventId,
        eventVersion: eventVersion ?? 0,
        invalidRegistrationCount,
        rawRegistrationCount,
        registrations,
        validRegistrationCount: registrations.length,
      });
      continue;
    }
    if (
      row.registration_migration_state !== "legacy" ||
      row.registration_migration_count !== null ||
      row.registration_migration_hash !== null ||
      row.registration_migrated_at !== null ||
      nonNegativeInteger(row.canonical_head_count) !== 0
    ) {
      blockers.push(
        blocker({
          code: "REGISTRATION_MIGRATION_STATE_INVALID",
          eventId,
          message: "Legacy registration state has importing/canonical residue or shadow membership heads.",
        }),
      );
    }
    const structurallyValid = registrationsByLegacyEvent.get(eventId) ?? [];
    const duplicateValues = {
      actors: new Set<string>(),
      profiles: new Set<string>(),
      registrations: new Set<string>(),
    };
    for (const [kind, values, duplicates] of [
      ["actor", structurallyValid.map((value) => value.userId), duplicateValues.actors],
      [
        "profile",
        structurallyValid.map((value) => value.participantProfileId),
        duplicateValues.profiles,
      ],
      ["registration", structurallyValid.map((value) => value.id), duplicateValues.registrations],
    ] as const) {
      const seen = new Set<string>();
      for (const value of values) {
        if (seen.has(value)) duplicates.add(value);
        seen.add(value);
      }
      if (duplicates.size > 0) {
        blockers.push(
          blocker({
            code: "REGISTRATION_SOURCE_DUPLICATE_IDENTITY",
            eventId,
            message: `Legacy ${kind} identity is duplicated.`,
          }),
        );
      }
    }
    const registrations = structurallyValid.filter(
      (registration) =>
        !duplicateValues.actors.has(registration.userId) &&
        !duplicateValues.profiles.has(registration.participantProfileId) &&
        !duplicateValues.registrations.has(registration.id),
    );
    const rawRegistrationCount = rawLegacyCounts.get(eventId) ?? 0;
    facts.push({
      authority: "legacy_registration",
      configurationDeadline,
      contentHash,
      eventId,
      eventVersion: eventVersion ?? 0,
      invalidRegistrationCount: rawRegistrationCount - registrations.length,
      rawRegistrationCount,
      registrations,
      validRegistrationCount: registrations.length,
    });
  }
  facts.sort((left, right) => left.eventId.localeCompare(right.eventId));
  return { blockers: sortBlockers(blockers), facts };
}
