import { parseJsonWithUniqueObjectKeys } from "../operator-json";
import {
  CANONICAL_MEMBERSHIP_MIGRATION_ID,
  CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION,
  canonicalMigrationHash,
  type CanonicalMembershipMigrationAction,
  type CanonicalMembershipAuthority,
  type CanonicalMembershipMigrationPlan,
} from "./contract";

export const CANONICAL_MEMBERSHIP_OPERATOR_REVIEW_INVALID =
  "CANONICAL_MEMBERSHIP_OPERATOR_REVIEW_INVALID" as const;

export class CanonicalMembershipOperatorReviewError extends Error {
  constructor(
    readonly code = CANONICAL_MEMBERSHIP_OPERATOR_REVIEW_INVALID,
  ) {
    super("Canonical membership operator review is invalid.");
    this.name = "CanonicalMembershipOperatorReviewError";
  }
}

export interface CanonicalMembershipOperatorReviewCounts {
  readonly cancelled: number;
  readonly invalid: number;
  readonly raw: number;
  readonly rsvped: number;
  readonly valid: number;
}

export interface CanonicalMembershipOperatorReviewEvent
  extends CanonicalMembershipOperatorReviewCounts {
  readonly action: CanonicalMembershipMigrationAction;
  readonly aggregateHash: string;
  readonly authority: CanonicalMembershipAuthority;
  readonly deadlineSource:
    | "event_operations_configuration"
    | "operator_manifest"
    | null;
  readonly eventId: string;
}

export interface CanonicalMembershipOperatorReview {
  readonly applyEligible: boolean;
  readonly blockerCodes: readonly string[];
  readonly diagnosticHash: string;
  readonly eventCount: number;
  readonly events: readonly CanonicalMembershipOperatorReviewEvent[];
  readonly manifestHash: string;
  readonly migrationId: typeof CANONICAL_MEMBERSHIP_MIGRATION_ID;
  readonly mode: "dry-run";
  readonly planHash: string | null;
  readonly registrationCounts: CanonicalMembershipOperatorReviewCounts;
  readonly schemaVersion: typeof CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION;
  readonly workspaceId: string;
}

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const BLOCKER_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const ROOT_KEYS = [
  "applyEligible",
  "blockerCodes",
  "diagnosticHash",
  "eventCount",
  "events",
  "manifestHash",
  "migrationId",
  "mode",
  "planHash",
  "registrationCounts",
  "schemaVersion",
  "workspaceId",
] as const;
const COUNT_KEYS = ["cancelled", "invalid", "raw", "rsvped", "valid"] as const;
const EVENT_KEYS = [
  "action",
  "aggregateHash",
  "authority",
  "cancelled",
  "deadlineSource",
  "eventId",
  "invalid",
  "raw",
  "rsvped",
  "valid",
] as const;

function failure(): never {
  throw new CanonicalMembershipOperatorReviewError();
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    failure();
  }
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length ||
    !keys.every((key) => actual.includes(key))
  ) {
    failure();
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      failure();
    }
    output[key] = descriptor.value;
  }
  return output;
}

function exactDataArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    failure();
  }
  const actual = Reflect.ownKeys(value);
  const expected = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    "length",
  ];
  if (
    actual.length !== expected.length ||
    !expected.every((key) => actual.includes(key))
  ) {
    failure();
  }
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      failure();
    }
    output.push(descriptor.value);
  }
  return output;
}

function safeCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) failure();
  return Number(value);
}

function parseCounts(value: unknown): CanonicalMembershipOperatorReviewCounts {
  const record = exactDataRecord(value, COUNT_KEYS);
  const counts = {
    cancelled: safeCount(record.cancelled),
    invalid: safeCount(record.invalid),
    raw: safeCount(record.raw),
    rsvped: safeCount(record.rsvped),
    valid: safeCount(record.valid),
  };
  if (
    counts.raw !== counts.valid + counts.invalid ||
    counts.valid !== counts.rsvped + counts.cancelled
  ) {
    failure();
  }
  return Object.freeze(counts);
}

function eventId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 512 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) {
    failure();
  }
  return value;
}

function hash(value: unknown): string {
  if (typeof value !== "string" || !HASH.test(value)) failure();
  return value;
}

function parseEvent(value: unknown): CanonicalMembershipOperatorReviewEvent {
  const record = exactDataRecord(value, EVENT_KEYS);
  const counts = parseCounts({
    cancelled: record.cancelled,
    invalid: record.invalid,
    raw: record.raw,
    rsvped: record.rsvped,
    valid: record.valid,
  });
  const authority = record.authority;
  const action = record.action;
  const deadlineSource = record.deadlineSource;
  if (
    (authority !== "canonical_membership" &&
      authority !== "legacy_registration") ||
    (action !== "activate" &&
      action !== "verify_canonical" &&
      action !== "blocked") ||
    (deadlineSource !== null &&
      deadlineSource !== "event_operations_configuration" &&
      deadlineSource !== "operator_manifest") ||
    (authority === "canonical_membership" &&
      (deadlineSource !== null ||
        (action !== "verify_canonical" && action !== "blocked"))) ||
    (authority === "legacy_registration" &&
      action === "verify_canonical") ||
    (action === "activate" && deadlineSource === null)
  ) {
    failure();
  }
  const normalizedDeadlineSource =
    deadlineSource === "event_operations_configuration" ||
    deadlineSource === "operator_manifest"
      ? deadlineSource
      : null;
  return Object.freeze({
    action,
    aggregateHash: hash(record.aggregateHash),
    authority,
    ...counts,
    deadlineSource: normalizedDeadlineSource,
    eventId: eventId(record.eventId),
  });
}

function addCounts(
  left: CanonicalMembershipOperatorReviewCounts,
  right: CanonicalMembershipOperatorReviewCounts,
): CanonicalMembershipOperatorReviewCounts {
  const output = {
    cancelled: left.cancelled + right.cancelled,
    invalid: left.invalid + right.invalid,
    raw: left.raw + right.raw,
    rsvped: left.rsvped + right.rsvped,
    valid: left.valid + right.valid,
  };
  if (!Object.values(output).every(Number.isSafeInteger)) failure();
  return output;
}

function sameCounts(
  left: CanonicalMembershipOperatorReviewCounts,
  right: CanonicalMembershipOperatorReviewCounts,
): boolean {
  return COUNT_KEYS.every((key) => left[key] === right[key]);
}

export function parseCanonicalMembershipOperatorReview(
  input: unknown,
): CanonicalMembershipOperatorReview {
  try {
    const record = exactDataRecord(input, ROOT_KEYS);
    const events = exactDataArray(record.events).map(parseEvent);
    if (
      events.some(
        (event, index) =>
          index > 0 &&
          compareText(events[index - 1]!.eventId, event.eventId) >= 0,
      )
    ) {
      failure();
    }
    const blockerCodes = exactDataArray(record.blockerCodes).map((value) => {
      if (typeof value !== "string" || !BLOCKER_CODE.test(value)) failure();
      return value;
    });
    if (
      blockerCodes.some(
        (code, index) =>
          index > 0 && compareText(blockerCodes[index - 1]!, code) >= 0,
      )
    ) {
      failure();
    }
    const registrationCounts = parseCounts(record.registrationCounts);
    const calculatedCounts = events.reduce(
      addCounts,
      { cancelled: 0, invalid: 0, raw: 0, rsvped: 0, valid: 0 },
    );
    const applyEligible = record.applyEligible;
    const planHash = record.planHash;
    if (
      record.mode !== "dry-run" ||
      record.migrationId !== CANONICAL_MEMBERSHIP_MIGRATION_ID ||
      record.schemaVersion !== CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION ||
      typeof record.workspaceId !== "string" ||
      !ID.test(record.workspaceId) ||
      typeof applyEligible !== "boolean" ||
      (!applyEligible && planHash !== null) ||
      (applyEligible && (typeof planHash !== "string" || !HASH.test(planHash))) ||
      (applyEligible &&
        (blockerCodes.length !== 0 ||
          registrationCounts.invalid !== 0 ||
          events.some((event) => event.action === "blocked"))) ||
      safeCount(record.eventCount) !== events.length ||
      !sameCounts(registrationCounts, calculatedCounts)
    ) {
      failure();
    }
    return Object.freeze({
      applyEligible,
      blockerCodes: Object.freeze(blockerCodes),
      diagnosticHash: hash(record.diagnosticHash),
      eventCount: events.length,
      events: Object.freeze(events),
      manifestHash: hash(record.manifestHash),
      migrationId: CANONICAL_MEMBERSHIP_MIGRATION_ID,
      mode: "dry-run" as const,
      planHash: planHash as string | null,
      registrationCounts,
      schemaVersion: CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION,
      workspaceId: record.workspaceId,
    });
  } catch (error) {
    if (error instanceof CanonicalMembershipOperatorReviewError) throw error;
    failure();
  }
}

export function parseCanonicalMembershipOperatorReviewJson(
  input: unknown,
): CanonicalMembershipOperatorReview {
  try {
    return parseCanonicalMembershipOperatorReview(
      parseJsonWithUniqueObjectKeys(input),
    );
  } catch {
    failure();
  }
}

export function buildCanonicalMembershipOperatorReview(input: {
  plan: CanonicalMembershipMigrationPlan;
  workspaceId: string;
}): CanonicalMembershipOperatorReview {
  const events = [...input.plan.events]
    .sort((left, right) => compareText(left.eventId, right.eventId))
    .map((event) => {
      const counts = {
        cancelled: event.source.cancelled,
        invalid: event.source.invalidCount,
        raw: event.source.rawCount,
        rsvped: event.source.rsvped,
        valid: event.source.validCount,
      };
      return {
        action: event.action,
        aggregateHash: canonicalMigrationHash({
          domain: "canonical-membership-operator-review-event:v1",
          event: {
            action: event.action,
            authority: event.authority,
            deadline: event.deadline,
            eventId: event.eventId,
            source: event.source,
          },
        }),
        authority: event.authority,
        ...counts,
        deadlineSource: event.deadline?.source ?? null,
        eventId: event.eventId,
      };
    });
  return parseCanonicalMembershipOperatorReview({
    applyEligible: input.plan.applyEligible,
    blockerCodes: [...new Set(input.plan.blockers.map((value) => value.code))].sort(
      compareText,
    ),
    diagnosticHash: input.plan.diagnosticHash,
    eventCount: input.plan.eventCount,
    events,
    manifestHash: input.plan.manifestHash,
    migrationId: input.plan.migrationId,
    mode: "dry-run",
    planHash: input.plan.applyPlanHash,
    registrationCounts: {
      cancelled: input.plan.total.cancelled,
      invalid: input.plan.total.invalidRegistrations,
      raw: input.plan.total.registrations,
      rsvped: input.plan.total.rsvped,
      valid: input.plan.total.validRegistrations,
    },
    schemaVersion: input.plan.schemaVersion,
    workspaceId: input.workspaceId,
  });
}
