type AuditRow = Record<string, unknown>;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function canonicalIso(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? value
    : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

export function validateCanonicalRegistrationActivationAudit(input: {
  audit: AuditRow;
  count: number;
  eventId: string;
  hash: string;
  migratedAt: unknown;
}): boolean {
  const payload = object(input.audit.after_payload);
  const evidenceIds = Array.isArray(input.audit.evidence_ids)
    ? input.audit.evidence_ids
    : null;
  const migratedAt = canonicalIso(input.migratedAt);
  if (
    !payload ||
    !evidenceIds ||
    !migratedAt ||
    !Number.isSafeInteger(input.count) ||
    input.count < 0 ||
    !/^[a-f0-9]{64}$/u.test(input.hash) ||
    input.audit.audit_id !==
      `audit:registration-migration:${encodeURIComponent(input.eventId)}:${input.hash}` ||
    input.audit.actor_id !== null ||
    input.audit.aggregate_type !== "event" ||
    input.audit.aggregate_id !== input.eventId ||
    canonicalIso(input.audit.occurred_at) !== migratedAt
  ) {
    return false;
  }
  if (exactKeys(payload, ["count", "hash"])) {
    return (
      evidenceIds.length === 0 &&
      payload.count === input.count &&
      payload.hash === input.hash
    );
  }
  if (
    !exactKeys(payload, [
      "contractVersion",
      "count",
      "hash",
      "profileDeadlineAt",
      "profileDeadlineEvidenceId",
      "profileDeadlineReason",
      "profileDeadlineSource",
    ]) ||
    payload.contractVersion !== 2 ||
    payload.count !== input.count ||
    payload.hash !== input.hash ||
    !canonicalIso(payload.profileDeadlineAt) ||
    !nonEmptyText(payload.profileDeadlineEvidenceId) ||
    evidenceIds.length !== 1 ||
    evidenceIds[0] !== payload.profileDeadlineEvidenceId
  ) {
    return false;
  }
  if (payload.profileDeadlineSource === "operator_manifest") {
    return payload.profileDeadlineReason === "OPERATOR_MANIFEST_PROFILE_DEADLINE";
  }
  if (payload.profileDeadlineSource !== "event_operations_configuration") {
    return false;
  }
  const prefix = `event-operations-configuration:${encodeURIComponent(input.eventId)}:`;
  return (
    payload.profileDeadlineReason === "EXISTING_EVENT_OPERATIONS_CONFIGURATION" &&
    String(payload.profileDeadlineEvidenceId).startsWith(prefix) &&
    positiveInteger(String(payload.profileDeadlineEvidenceId).slice(prefix.length)) !== null
  );
}
