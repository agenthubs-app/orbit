import { randomUUID } from "node:crypto";

import type {
  EventOperationsPostgresClient,
  EventOperationsSqlExecutor,
} from "../../event-operations/storage/postgres-client";
import {
  EVENT_ADMISSION_APPLICATION_STATUSES,
  EVENT_ADMISSION_MODES,
  EventAdmissionError,
  type ConfigureEventAdmissionPolicyInput,
  type EventAdmissionApplication,
  type EventAdmissionApplicationStatus,
  type EventAdmissionMode,
  type EventAdmissionPolicy,
  type EventAdmissionProfileSnapshot,
  type EventAdmissionReviewBucket,
  type EventAdmissionReviewCursor,
  type EventAdmissionReviewListItem,
  type EventAdmissionReviewPage,
} from "../contract";
import type { EventAdmissionRepository } from "../repository";
import { EVENT_PARTICIPANT_PROFILE_FIELDS } from "../../registration/contract";
import type { EventRegistration } from "../../registration/contract";
import {
  appendCanonicalMembershipVersion,
  canonicalParticipantProfileId,
  canonicalRegistrationId,
} from "../../event-operations/storage/canonical-membership-writer";

type SqlRow = Record<string, unknown>;

function invalid(message: string): never {
  throw new EventAdmissionError("DATA_INVALID", message);
}

function normalizedText(value: string, field: string): string {
  const normalized = value.normalize("NFC").trim();
  return normalized || invalid(`Admission ${field} must not be empty.`);
}

function isoTimestamp(value: unknown, field: string): string {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(parsed)) invalid(`Admission ${field} is invalid.`);
  return new Date(parsed).toISOString();
}

function positiveVersion(value: unknown, field: string): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    invalid(`Admission ${field} is invalid.`);
  }
  return version;
}

function jsonObject(value: unknown, field: string): Readonly<Record<string, unknown>> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    invalid(`Admission ${field} must be an object.`);
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function validateJson(value: unknown, field: string): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJson(item, `${field}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid(`Admission ${field} contains a non-JSON object.`);
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      validateJson(item, `${field}.${key}`);
    }
    return;
  }
  invalid(`Admission ${field} contains a non-JSON value.`);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) invalid(`Admission ${field}.${key} is unsupported.`);
  }
}

function requiredString(value: unknown, field: string): void {
  if (typeof value !== "string" || !value) invalid(`Admission ${field} is invalid.`);
}

function normalizedProfile(
  value: unknown,
): EventAdmissionProfileSnapshot {
  const profile = jsonObject(value, "profilePayload") as Record<string, unknown>;
  validateJson(value, "profilePayload");
  exactKeys(profile, ["answers", "displayName", "interviewResponses"], "profilePayload");
  const answers = jsonObject(profile.answers, "profilePayload.answers") as Record<string, unknown>;
  exactKeys(answers, EVENT_PARTICIPANT_PROFILE_FIELDS, "profilePayload.answers");
  for (const [field, answer] of Object.entries(answers)) {
    requiredString(answer, `profilePayload.answers.${field}`);
  }
  if (profile.displayName !== undefined) {
    requiredString(profile.displayName, "profilePayload.displayName");
  }
  if (profile.interviewResponses !== undefined) {
    if (!Array.isArray(profile.interviewResponses)) {
      invalid("Admission profilePayload.interviewResponses is invalid.");
    }
    const responseIds = new Set<string>();
    const fields = new Set<string>();
    for (const [index, raw] of profile.interviewResponses.entries()) {
      const response = jsonObject(raw, `profilePayload.interviewResponses[${index}]`) as Record<string, unknown>;
      exactKeys(response, [
        "answer", "answerSource", "answeredAt", "field", "generation",
        "question", "questionId", "questionSource", "responseId", "visibility",
      ], `profilePayload.interviewResponses[${index}]`);
      requiredString(response.responseId, `profilePayload.interviewResponses[${index}].responseId`);
      requiredString(response.answeredAt, `profilePayload.interviewResponses[${index}].answeredAt`);
      isoTimestamp(response.answeredAt, `profilePayload.interviewResponses[${index}].answeredAt`);
      if (!EVENT_PARTICIPANT_PROFILE_FIELDS.includes(response.field as never)) {
        invalid(`Admission profilePayload.interviewResponses[${index}].field is invalid.`);
      }
      if (response.answerSource !== "participant") invalid("Admission interview answerSource is invalid.");
      if (!['ai_adaptive', 'legacy_unknown'].includes(String(response.questionSource))) invalid("Admission interview questionSource is invalid.");
      if (!['event_attendees', 'matching_only', 'private'].includes(String(response.visibility))) invalid("Admission interview visibility is invalid.");
      const answer = jsonObject(response.answer, `profilePayload.interviewResponses[${index}].answer`) as Record<string, unknown>;
      exactKeys(answer, ["customText", "displayText", "selectedOptionIds"], `profilePayload.interviewResponses[${index}].answer`);
      requiredString(answer.displayText, `profilePayload.interviewResponses[${index}].answer.displayText`);
      if (answer.customText !== null && typeof answer.customText !== "string") invalid("Admission interview customText is invalid.");
      if (!Array.isArray(answer.selectedOptionIds) || answer.selectedOptionIds.some((item) => typeof item !== "string")) invalid("Admission interview selectedOptionIds is invalid.");
      const responseId = String(response.responseId);
      const field = String(response.field);
      if (answers[field] !== answer.displayText) {
        invalid(`Admission profilePayload.answers.${field} does not match its verified response snapshot.`);
      }
      if (responseIds.has(responseId) || fields.has(field)) invalid("Admission interview responses contain duplicate identity or field.");
      responseIds.add(responseId);
      fields.add(field);
      if ((response.question === null) !== (response.questionSource === "legacy_unknown")) {
        invalid("Admission interview question provenance is inconsistent.");
      }
      if ((response.generation === null) !== (response.questionSource === "legacy_unknown")) {
        invalid("Admission interview generation provenance is inconsistent.");
      }
    }
  }
  return JSON.parse(JSON.stringify(value)) as EventAdmissionProfileSnapshot;
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableJson(item)]),
  );
}

function admissionMode(value: unknown): EventAdmissionMode {
  if (EVENT_ADMISSION_MODES.includes(value as EventAdmissionMode)) {
    return value as EventAdmissionMode;
  }
  return invalid("Admission mode is invalid.");
}

function applicationStatus(value: unknown): EventAdmissionApplicationStatus {
  if (EVENT_ADMISSION_APPLICATION_STATUSES.includes(value as EventAdmissionApplicationStatus)) {
    return value as EventAdmissionApplicationStatus;
  }
  return invalid("Admission application status is invalid.");
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function policyFromRow(row: SqlRow): EventAdmissionPolicy {
  const rawCapacity = row.capacity;
  const capacity = rawCapacity === null || rawCapacity === undefined
    ? null
    : Number(rawCapacity);
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 0)) {
    invalid("Admission capacity is invalid.");
  }
  if (typeof row.waitlist_enabled !== "boolean") {
    invalid("Admission waitlistEnabled is invalid.");
  }
  return {
    admissionMode: admissionMode(row.admission_mode),
    capacity,
    eventId: normalizedText(String(row.event_id ?? ""), "eventId"),
    policyVersion: positiveVersion(row.policy_version, "policyVersion"),
    profileEditDeadlineAt: isoTimestamp(row.profile_edit_deadline_at, "profileEditDeadlineAt"),
    registrationClosesAt: isoTimestamp(row.registration_closes_at, "registrationClosesAt"),
    registrationOpensAt: isoTimestamp(row.registration_opens_at, "registrationOpensAt"),
    updatedAt: isoTimestamp(row.updated_at, "updatedAt"),
    waitlistEnabled: row.waitlist_enabled,
  };
}

function applicationFromRow(row: SqlRow): EventAdmissionApplication {
  return {
    actorId: normalizedText(String(row.actor_id ?? ""), "actorId"),
    applicationVersion: positiveVersion(row.application_version, "applicationVersion"),
    decidedAt: row.decided_at == null ? null : isoTimestamp(row.decided_at, "decidedAt"),
    decisionActorId: nullableText(row.decision_actor_id),
    eventId: normalizedText(String(row.event_id ?? ""), "eventId"),
    policyVersion: positiveVersion(row.policy_version, "policyVersion"),
    profilePayload: normalizedProfile(row.profile_payload),
    status: applicationStatus(row.status),
    submittedAt: isoTimestamp(row.submitted_at, "submittedAt"),
    updatedAt: isoTimestamp(row.updated_at, "updatedAt"),
  };
}

function reviewCursor(
  value: EventAdmissionReviewCursor | null,
): EventAdmissionReviewCursor | null {
  if (value === null) return null;
  return {
    actorId: normalizedText(value.actorId, "review cursor actorId"),
    timestamp: isoTimestamp(value.timestamp, "review cursor timestamp"),
  };
}

function reviewLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    invalid("Admission review limit must be between 1 and 100.");
  }
  return value;
}

function reviewBucket(value: EventAdmissionReviewBucket): EventAdmissionReviewBucket {
  if (value !== "pending" && value !== "processed") {
    invalid("Admission review bucket is invalid.");
  }
  return value;
}

function reviewListItem(
  application: EventAdmissionApplication,
): EventAdmissionReviewListItem {
  return {
    actorId: application.actorId,
    applicationVersion: application.applicationVersion,
    decidedAt: application.decidedAt,
    decisionActorId: application.decisionActorId,
    displayName: application.profilePayload.displayName?.trim() || null,
    status: application.status,
    submittedAt: application.submittedAt,
    updatedAt: application.updatedAt,
  };
}

function idempotentDecision(
  application: EventAdmissionApplication,
  input: {
    decision: "approve" | "reject";
    decisionActorId: string;
    expectedApplicationVersion: number;
  },
): boolean {
  if (
    application.applicationVersion !== input.expectedApplicationVersion + 1 ||
    application.decisionActorId !== input.decisionActorId
  ) return false;
  return input.decision === "reject"
    ? application.status === "rejected"
    : application.status === "admitted" || application.status === "waitlisted";
}

function normalizedPolicy(input: ConfigureEventAdmissionPolicyInput) {
  const eventId = normalizedText(input.eventId, "eventId");
  const opensAt = isoTimestamp(input.registrationOpensAt, "registrationOpensAt");
  const closesAt = isoTimestamp(input.registrationClosesAt, "registrationClosesAt");
  const profileEditDeadlineAt = isoTimestamp(input.profileEditDeadlineAt, "profileEditDeadlineAt");
  if (Date.parse(opensAt) >= Date.parse(closesAt)) {
    invalid("Admission registration window must have positive duration.");
  }
  if (
    Date.parse(profileEditDeadlineAt) < Date.parse(opensAt) ||
    Date.parse(profileEditDeadlineAt) > Date.parse(closesAt)
  ) invalid("Admission profile edit deadline must be within the registration window.");
  if (
    input.capacity !== null &&
    (!Number.isSafeInteger(input.capacity) || input.capacity < 0)
  ) {
    invalid("Admission capacity must be a non-negative integer or null.");
  }
  return {
    admissionMode: admissionMode(input.admissionMode),
    capacity: input.capacity,
    eventId,
    profileEditDeadlineAt,
    registrationClosesAt: closesAt,
    registrationOpensAt: opensAt,
    waitlistEnabled: input.waitlistEnabled,
  };
}

async function databaseNow(executor: EventOperationsSqlExecutor): Promise<string> {
  const result = await executor.query<{ now: unknown }>(
    "select clock_timestamp() as now",
  );
  return isoTimestamp(result.rows[0]?.now, "database clock");
}

async function lockEvent(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  eventId: string,
): Promise<void> {
  const result = await executor.query(
    `select event_id from event_ops_events
     where workspace_id = $1 and event_id = $2
     for update`,
    [workspaceId, eventId],
  );
  if (result.rowCount !== 1) {
    throw new EventAdmissionError(
      "NOT_CONFIGURED",
      `Admission event ${eventId} is not configured.`,
    );
  }
}

async function currentPolicy(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  eventId: string,
): Promise<EventAdmissionPolicy | null> {
  const result = await executor.query<SqlRow>(
    `select policy.*
     from event_ops_admission_policy_heads head
     join event_ops_admission_policy_versions policy
       on policy.workspace_id = head.workspace_id
      and policy.event_id = head.event_id
      and policy.policy_version = head.policy_version
     where head.workspace_id = $1 and head.event_id = $2`,
    [workspaceId, eventId],
  );
  return result.rows[0] ? policyFromRow(result.rows[0]) : null;
}

async function policyAtVersion(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  eventId: string,
  policyVersion: number,
): Promise<EventAdmissionPolicy | null> {
  const result = await executor.query<SqlRow>(
    `select * from event_ops_admission_policy_versions
     where workspace_id = $1 and event_id = $2 and policy_version = $3`,
    [workspaceId, eventId, policyVersion],
  );
  return result.rows[0] ? policyFromRow(result.rows[0]) : null;
}

async function currentPolicyVersion(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  eventId: string,
): Promise<number> {
  const result = await executor.query<{ policy_version: unknown }>(
    `select policy_version from event_ops_admission_policy_heads
     where workspace_id = $1 and event_id = $2`,
    [workspaceId, eventId],
  );
  return result.rows[0]
    ? positiveVersion(result.rows[0].policy_version, "policyVersion")
    : 0;
}

async function admittedCount(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  eventId: string,
): Promise<number> {
  const result = await executor.query<{ count: unknown }>(
    `select count(*)::int as count
     from event_ops_admission_application_heads
     where workspace_id = $1 and event_id = $2 and status = 'admitted'`,
    [workspaceId, eventId],
  );
  const count = Number(result.rows[0]?.count ?? -1);
  if (!Number.isSafeInteger(count) || count < 0) {
    invalid("Admission admitted count is invalid.");
  }
  return count;
}

async function appendApplication(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  application: EventAdmissionApplication,
): Promise<void> {
  await executor.query(
    `insert into event_ops_admission_application_versions (
       workspace_id, event_id, actor_id, application_version, policy_version,
       status, profile_payload, submitted_at, updated_at, decided_at,
       decision_actor_id
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
    [
      workspaceId,
      application.eventId,
      application.actorId,
      application.applicationVersion,
      application.policyVersion,
      application.status,
      JSON.stringify(application.profilePayload),
      application.submittedAt,
      application.updatedAt,
      application.decidedAt,
      application.decisionActorId,
    ],
  );
  await executor.query(
    `insert into event_ops_admission_application_heads (
       workspace_id, event_id, actor_id, application_version, policy_version,
       status, profile_payload, submitted_at, updated_at, decided_at,
       decision_actor_id
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
     on conflict (workspace_id, event_id, actor_id) do update set
       application_version = excluded.application_version,
       policy_version = excluded.policy_version,
       status = excluded.status,
       profile_payload = excluded.profile_payload,
       submitted_at = excluded.submitted_at,
       updated_at = excluded.updated_at,
       decided_at = excluded.decided_at,
       decision_actor_id = excluded.decision_actor_id`,
    [
      workspaceId,
      application.eventId,
      application.actorId,
      application.applicationVersion,
      application.policyVersion,
      application.status,
      JSON.stringify(application.profilePayload),
      application.submittedAt,
      application.updatedAt,
      application.decidedAt,
      application.decisionActorId,
    ],
  );
}

async function audit(
  executor: EventOperationsSqlExecutor,
  input: {
    action: string;
    actorId: string;
    after: Readonly<object>;
    aggregateId: string;
    aggregateType: "admission_application" | "admission_policy";
    before: Readonly<object> | null;
    eventId: string;
    occurredAt: string;
    workspaceId: string;
  },
): Promise<void> {
  await executor.query(
    `insert into event_ops_audit_log (
       workspace_id, audit_id, event_id, actor_id, action, aggregate_type,
       aggregate_id, before_payload, after_payload, evidence_ids, occurred_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, '{}', $10)`,
    [
      input.workspaceId,
      `admission:audit:${randomUUID()}`,
      input.eventId,
      input.actorId,
      input.action,
      input.aggregateType,
      input.aggregateId,
      input.before ? JSON.stringify(input.before) : null,
      JSON.stringify(input.after),
      input.occurredAt,
    ],
  );
}

function applicationAuditPayload(application: EventAdmissionApplication) {
  return {
    actorId: application.actorId,
    applicationVersion: application.applicationVersion,
    policyVersion: application.policyVersion,
    status: application.status,
  };
}

function registrationSideEffects(): EventRegistration["sideEffects"] {
  return {
    calendarUpdateExecuted: false,
    emailSent: false,
    globalProfileWriteExecuted: false,
    notificationDelivered: false,
    organizerMessageSent: false,
    refundRequested: false,
  };
}

async function projectCanonicalMembership(input: {
  application: EventAdmissionApplication;
  executor: EventOperationsSqlExecutor;
  profileEditDeadlineAt: string;
  status: "cancelled" | "rsvped";
  workspaceId: string;
}): Promise<EventRegistration> {
  const currentResult = await input.executor.query<SqlRow>(
    `select head.membership_version, head.profile_version, head.status,
            version.registered_at
     from event_ops_membership_heads head
     join event_ops_membership_versions version
       on version.workspace_id = head.workspace_id
      and version.event_id = head.event_id
      and version.actor_id = head.actor_id
      and version.membership_version = head.membership_version
     where head.workspace_id = $1 and head.event_id = $2 and head.actor_id = $3`,
    [input.workspaceId, input.application.eventId, input.application.actorId],
  );
  const current = currentResult.rows[0];
  if (
    (input.status === "rsvped" && current) ||
    (input.status === "cancelled" && (!current || current.status !== "rsvped"))
  ) invalid("Admission membership projection state is invalid.");
  const membershipVersion = current
    ? positiveVersion(current.membership_version, "membershipVersion") + 1
    : 1;
  const profileVersion = current
    ? positiveVersion(current.profile_version, "profileVersion")
    : 1;
  const participantProfileId = canonicalParticipantProfileId(
    input.application.eventId,
    input.application.actorId,
  );
  const registrationId = canonicalRegistrationId(
    input.application.eventId,
    input.application.actorId,
  );
  const registeredAt = current
    ? isoTimestamp(current.registered_at, "registeredAt")
    : input.application.updatedAt;
  const registration: EventRegistration = {
    cancelledAt: input.status === "cancelled" ? input.application.updatedAt : null,
    eventId: input.application.eventId,
    id: registrationId,
    participantProfile: {
      answers: input.application.profilePayload.answers,
      createdAt: input.application.submittedAt,
      ...(input.application.profilePayload.displayName
        ? { displayName: input.application.profilePayload.displayName }
        : {}),
      eventId: input.application.eventId,
      id: participantProfileId,
      ...(input.application.profilePayload.interviewResponses
        ? { interviewResponses: input.application.profilePayload.interviewResponses }
        : {}),
      updatedAt: input.application.submittedAt,
      userId: input.application.actorId,
    },
    participantProfileId,
    reactivatedAt: null,
    registeredAt,
    sideEffects: registrationSideEffects(),
    status: input.status,
    updatedAt: input.application.updatedAt,
    userId: input.application.actorId,
  };
  return appendCanonicalMembershipVersion({
    admissionApplicationVersion: input.application.applicationVersion,
    executor: input.executor,
    interviewResponses: input.status === "rsvped"
      ? input.application.profilePayload.interviewResponses
      : undefined,
    membershipVersion,
    origin: "admission_application",
    profileChanged: input.status === "rsvped",
    profileEditDeadlineAt: input.profileEditDeadlineAt,
    profileEffectiveAt: input.application.submittedAt,
    profileVersion,
    registration,
    workspaceId: input.workspaceId,
  });
}

async function runTransaction<TValue>(
  client: EventOperationsPostgresClient,
  operation: (executor: EventOperationsSqlExecutor) => Promise<TValue>,
): Promise<TValue> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await client.transaction(operation);
    } catch (error) {
      if (error instanceof EventAdmissionError) throw error;
      const code = error && typeof error === "object"
        ? String((error as { code?: unknown }).code ?? "")
        : "";
      if ((code === "40001" || code === "40P01") && attempt < 3) continue;
      throw new EventAdmissionError(
        "DATA_INVALID",
        `Admission persistence failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  throw new EventAdmissionError("DATA_INVALID", "Admission transaction retry exhausted.");
}

export function createPostgresEventAdmissionRepository(input: {
  client: EventOperationsPostgresClient;
  workspaceId: string;
}): EventAdmissionRepository {
  const workspaceId = normalizedText(input.workspaceId, "workspaceId");
  const { client } = input;
  return {
    async configurePolicy(raw) {
      const policy = normalizedPolicy(raw);
      const updatedByActorId = normalizedText(raw.updatedByActorId, "updatedByActorId");
      return runTransaction(client, async (executor) => {
        await lockEvent(executor, workspaceId, policy.eventId);
        const previousVersion = await currentPolicyVersion(
          executor,
          workspaceId,
          policy.eventId,
        );
        let previous: EventAdmissionPolicy | null = null;
        try {
          previous = await currentPolicy(executor, workspaceId, policy.eventId);
        } catch (error) {
          if (
            !(error instanceof EventAdmissionError) ||
            error.code !== "DATA_INVALID" ||
            previousVersion === 0
          ) throw error;
        }
        const count = await admittedCount(executor, workspaceId, policy.eventId);
        if (policy.capacity !== null && count > policy.capacity) {
          throw new EventAdmissionError(
            "DATA_INVALID",
            `Admission capacity ${policy.capacity} is below ${count} admitted applications.`,
          );
        }
        const updatedAt = await databaseNow(executor);
        const next: EventAdmissionPolicy = {
          ...policy,
          policyVersion: previousVersion + 1,
          updatedAt,
        };
        await executor.query(
          `insert into event_ops_admission_policy_versions (
             workspace_id, event_id, policy_version, capacity, admission_mode,
             waitlist_enabled, registration_opens_at,
             registration_closes_at, profile_edit_deadline_at, updated_at
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [workspaceId, next.eventId, next.policyVersion, next.capacity,
            next.admissionMode, next.waitlistEnabled, next.registrationOpensAt,
            next.registrationClosesAt, next.profileEditDeadlineAt, next.updatedAt],
        );
        await executor.query(
          `insert into event_ops_admission_policy_heads (
             workspace_id, event_id, policy_version, updated_at
           ) values ($1, $2, $3, $4)
           on conflict (workspace_id, event_id) do update set
             policy_version = excluded.policy_version,
             updated_at = excluded.updated_at`,
          [workspaceId, next.eventId, next.policyVersion, next.updatedAt],
        );
        await audit(executor, {
          action: "admission.policy.configured",
          actorId: updatedByActorId,
          after: next,
          aggregateId: next.eventId,
          aggregateType: "admission_policy",
          before: previous ?? (previousVersion > 0
            ? { legacyPolicyVersion: previousVersion, profileEditDeadlineAt: null }
            : null),
          eventId: next.eventId,
          occurredAt: updatedAt,
          workspaceId,
        });
        return next;
      });
    },

    async decideApplication(raw) {
      const eventId = normalizedText(raw.eventId, "eventId");
      const actorId = normalizedText(raw.actorId, "actorId");
      const decisionActorId = normalizedText(raw.decisionActorId, "decisionActorId");
      const expectedApplicationVersion = positiveVersion(
        raw.expectedApplicationVersion,
        "expectedApplicationVersion",
      );
      if (raw.decision !== "approve" && raw.decision !== "reject") {
        invalid("Admission decision is invalid.");
      }
      return runTransaction(client, async (executor) => {
        await lockEvent(executor, workspaceId, eventId);
        const policy = await currentPolicy(executor, workspaceId, eventId);
        if (!policy) throw new EventAdmissionError("NOT_CONFIGURED", `Admission policy for ${eventId} is not configured.`);
        const currentResult = await executor.query<SqlRow>(
          `select * from event_ops_admission_application_heads
           where workspace_id = $1 and event_id = $2 and actor_id = $3
           for update`,
          [workspaceId, eventId, actorId],
        );
        const current = currentResult.rows[0] ? applicationFromRow(currentResult.rows[0]) : null;
        if (
          current &&
          idempotentDecision(current, {
            decision: raw.decision,
            decisionActorId,
            expectedApplicationVersion,
          })
        ) return current;
        if (current?.applicationVersion !== expectedApplicationVersion) {
          throw new EventAdmissionError(
            "INVALID_TRANSITION",
            `Admission application ${eventId}/${actorId} changed before the decision could commit.`,
          );
        }
        if (!current || current.status !== "pending_review") {
          throw new EventAdmissionError("INVALID_TRANSITION", `Admission application ${eventId}/${actorId} cannot be decided.`);
        }
        // The immutable submission policy proves why this application entered
        // review. The current policy still governs capacity and waitlisting,
        // so a later mode change cannot strand an already-pending application.
        const submissionPolicy = await policyAtVersion(
          executor,
          workspaceId,
          eventId,
          current.policyVersion,
        );
        if (submissionPolicy?.admissionMode !== "approval_required") {
          throw new EventAdmissionError(
            "DATA_INVALID",
            `Admission application ${eventId}/${actorId} has no valid review policy provenance.`,
          );
        }
        const now = await databaseNow(executor);
        let status: EventAdmissionApplicationStatus = "rejected";
        if (raw.decision === "approve") {
          const count = await admittedCount(executor, workspaceId, eventId);
          if (policy.capacity === null || count < policy.capacity) status = "admitted";
          else if (policy.waitlistEnabled) status = "waitlisted";
          else throw new EventAdmissionError("CAPACITY_FULL", `Admission event ${eventId} is full.`);
        }
        const next: EventAdmissionApplication = {
          ...current,
          applicationVersion: current.applicationVersion + 1,
          decidedAt: now,
          decisionActorId,
          policyVersion: policy.policyVersion,
          status,
          updatedAt: now,
        };
        await appendApplication(executor, workspaceId, next);
        if (next.status === "admitted") {
          await projectCanonicalMembership({
            application: next,
            executor,
            profileEditDeadlineAt: policy.profileEditDeadlineAt,
            status: "rsvped",
            workspaceId,
          });
        }
        await audit(executor, {
          action: `admission.application.${status}`,
          actorId: decisionActorId,
          after: applicationAuditPayload(next),
          aggregateId: `${eventId}:${actorId}`,
          aggregateType: "admission_application",
          before: applicationAuditPayload(current),
          eventId,
          occurredAt: now,
          workspaceId,
        });
        return next;
      });
    },

    async getApplication(rawEventId, rawActorId) {
      const eventId = normalizedText(rawEventId, "eventId");
      const actorId = normalizedText(rawActorId, "actorId");
      try {
        const result = await client.query<SqlRow>(
          `select * from event_ops_admission_application_heads
           where workspace_id = $1 and event_id = $2 and actor_id = $3`,
          [workspaceId, eventId, actorId],
        );
        return result.rows[0] ? applicationFromRow(result.rows[0]) : null;
      } catch (error) {
        if (error instanceof EventAdmissionError) throw error;
        throw new EventAdmissionError("DATA_INVALID", "Admission application read failed.");
      }
    },

    async getPolicy(rawEventId) {
      const eventId = normalizedText(rawEventId, "eventId");
      try {
        return await currentPolicy(client, workspaceId, eventId);
      } catch (error) {
        if (error instanceof EventAdmissionError) throw error;
        throw new EventAdmissionError("DATA_INVALID", "Admission policy read failed.");
      }
    },

    async listApplications(raw) {
      const eventId = normalizedText(raw.eventId, "eventId");
      const bucket = reviewBucket(raw.bucket);
      const cursor = reviewCursor(raw.cursor);
      const limit = reviewLimit(raw.limit);
      try {
        return await client.transaction(async (executor) => {
          const predicate = bucket === "pending"
            ? "status = 'pending_review'"
            : "status in ('waitlisted', 'admitted', 'rejected', 'withdrawn')";
          const sortColumn = bucket === "pending" ? "submitted_at" : "updated_at";
          const comparison = bucket === "pending" ? ">" : "<";
          const direction = bucket === "pending" ? "asc" : "desc";
          const countResult = await executor.query<{ count: unknown }>(
            `select count(*)::int as count
             from event_ops_admission_application_heads
             where workspace_id = $1 and event_id = $2 and ${predicate}`,
            [workspaceId, eventId],
          );
          const total = Number(countResult.rows[0]?.count ?? -1);
          if (!Number.isSafeInteger(total) || total < 0) {
            invalid("Admission review total is invalid.");
          }
          const result = await executor.query<SqlRow>(
            `select * from event_ops_admission_application_heads
             where workspace_id = $1 and event_id = $2 and ${predicate}
               and ($3::timestamptz is null or (${sortColumn}, actor_id) ${comparison} ($3::timestamptz, $4::text))
             order by ${sortColumn} ${direction}, actor_id ${direction}
             limit $5`,
            [
              workspaceId,
              eventId,
              cursor?.timestamp ?? null,
              cursor?.actorId ?? "",
              limit + 1,
            ],
          );
          const hasMore = result.rows.length > limit;
          const pageRows = result.rows.slice(0, limit);
          const applications = pageRows.map(applicationFromRow);
          const last = applications.at(-1);
          const nextCursor = hasMore && last
            ? {
                actorId: last.actorId,
                timestamp: bucket === "pending" ? last.submittedAt : last.updatedAt,
              }
            : null;
          return {
            items: applications.map(reviewListItem),
            nextCursor,
            total,
          } satisfies EventAdmissionReviewPage;
        }, { isolation: "repeatable read" });
      } catch (error) {
        if (error instanceof EventAdmissionError) throw error;
        throw new EventAdmissionError(
          "DATA_INVALID",
          "Admission review queue read failed.",
        );
      }
    },

    async submitApplication(raw) {
      const eventId = normalizedText(raw.eventId, "eventId");
      const actorId = normalizedText(raw.actorId, "actorId");
      const profilePayload = normalizedProfile(raw.profilePayload);
      return runTransaction(client, async (executor) => {
        await lockEvent(executor, workspaceId, eventId);
        const existingResult = await executor.query<SqlRow>(
          `select * from event_ops_admission_application_heads
           where workspace_id = $1 and event_id = $2 and actor_id = $3
           for update`,
          [workspaceId, eventId, actorId],
        );
        if (existingResult.rows[0]) {
          const existing = applicationFromRow(existingResult.rows[0]);
          if (
            JSON.stringify(stableJson(existing.profilePayload)) ===
            JSON.stringify(stableJson(profilePayload))
          ) return existing;
          throw new EventAdmissionError(
            "INVALID_TRANSITION",
            `Admission application ${eventId}/${actorId} already exists with different profile content.`,
          );
        }
        const policy = await currentPolicy(executor, workspaceId, eventId);
        if (!policy) throw new EventAdmissionError("NOT_CONFIGURED", `Admission policy for ${eventId} is not configured.`);
        const now = await databaseNow(executor);
        if (
          Date.parse(now) < Date.parse(policy.registrationOpensAt) ||
          Date.parse(now) >= Date.parse(policy.registrationClosesAt)
        ) {
          throw new EventAdmissionError("WINDOW_CLOSED", `Admission window for ${eventId} is closed.`);
        }
        let status: EventAdmissionApplicationStatus = "pending_review";
        if (policy.admissionMode === "instant") {
          const count = await admittedCount(executor, workspaceId, eventId);
          if (policy.capacity === null || count < policy.capacity) status = "admitted";
          else if (policy.waitlistEnabled) status = "waitlisted";
          else throw new EventAdmissionError("CAPACITY_FULL", `Admission event ${eventId} is full.`);
        }
        const application: EventAdmissionApplication = {
          actorId,
          applicationVersion: 1,
          decidedAt: null,
          decisionActorId: null,
          eventId,
          policyVersion: policy.policyVersion,
          profilePayload,
          status,
          submittedAt: now,
          updatedAt: now,
        };
        await appendApplication(executor, workspaceId, application);
        if (application.status === "admitted") {
          await projectCanonicalMembership({
            application,
            executor,
            profileEditDeadlineAt: policy.profileEditDeadlineAt,
            status: "rsvped",
            workspaceId,
          });
        }
        await audit(executor, {
          action: "admission.application.submitted",
          actorId,
          after: applicationAuditPayload(application),
          aggregateId: `${eventId}:${actorId}`,
          aggregateType: "admission_application",
          before: null,
          eventId,
          occurredAt: now,
          workspaceId,
        });
        return application;
      });
    },

    async withdrawApplication(raw) {
      const eventId = normalizedText(raw.eventId, "eventId");
      const actorId = normalizedText(raw.actorId, "actorId");
      return runTransaction(client, async (executor) => {
        await lockEvent(executor, workspaceId, eventId);
        const currentResult = await executor.query<SqlRow>(
          `select * from event_ops_admission_application_heads
           where workspace_id = $1 and event_id = $2 and actor_id = $3
           for update`,
          [workspaceId, eventId, actorId],
        );
        const current = currentResult.rows[0] ? applicationFromRow(currentResult.rows[0]) : null;
        if (!current || !["pending_review", "waitlisted", "admitted"].includes(current.status)) {
          throw new EventAdmissionError("INVALID_TRANSITION", `Admission application ${eventId}/${actorId} cannot be withdrawn.`);
        }
        const policy = await currentPolicy(executor, workspaceId, eventId);
        if (!policy) throw new EventAdmissionError("NOT_CONFIGURED", `Admission policy for ${eventId} is not configured.`);
        const now = await databaseNow(executor);
        const withdrawn: EventAdmissionApplication = {
          ...current,
          applicationVersion: current.applicationVersion + 1,
          policyVersion: policy.policyVersion,
          status: "withdrawn",
          updatedAt: now,
        };
        await appendApplication(executor, workspaceId, withdrawn);
        if (current.status === "admitted") {
          await projectCanonicalMembership({
            application: withdrawn,
            executor,
            profileEditDeadlineAt: policy.profileEditDeadlineAt,
            status: "cancelled",
            workspaceId,
          });
        }
        await audit(executor, {
          action: "admission.application.withdrawn",
          actorId,
          after: applicationAuditPayload(withdrawn),
          aggregateId: `${eventId}:${actorId}`,
          aggregateType: "admission_application",
          before: applicationAuditPayload(current),
          eventId,
          occurredAt: now,
          workspaceId,
        });
        if (current.status === "admitted") {
          const count = await admittedCount(executor, workspaceId, eventId);
          if (policy.capacity === null || count < policy.capacity) {
            const waitingResult = await executor.query<SqlRow>(
              `select * from event_ops_admission_application_heads
               where workspace_id = $1 and event_id = $2 and status = 'waitlisted'
               order by submitted_at, actor_id
               limit 1 for update`,
              [workspaceId, eventId],
            );
            if (waitingResult.rows[0]) {
              const waiting = applicationFromRow(waitingResult.rows[0]);
              const promoted: EventAdmissionApplication = {
                ...waiting,
                applicationVersion: waiting.applicationVersion + 1,
                policyVersion: policy.policyVersion,
                status: "admitted",
                updatedAt: now,
              };
              await appendApplication(executor, workspaceId, promoted);
              await projectCanonicalMembership({
                application: promoted,
                executor,
                profileEditDeadlineAt: policy.profileEditDeadlineAt,
                status: "rsvped",
                workspaceId,
              });
              await audit(executor, {
                action: "admission.application.promoted",
                actorId,
                after: applicationAuditPayload(promoted),
                aggregateId: `${eventId}:${promoted.actorId}`,
                aggregateType: "admission_application",
                before: applicationAuditPayload(waiting),
                eventId,
                occurredAt: now,
                workspaceId,
              });
            }
          }
        }
        return withdrawn;
      });
    },
  };
}
