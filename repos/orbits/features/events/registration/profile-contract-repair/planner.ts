import { EVENT_PARTICIPANT_PROFILE_FIELDS } from "../contract";
import { isTrustedProfileContractRepairSource } from "./source-reader";
import {
  PROFILE_CONTRACT_REPAIR_ID,
  PROFILE_CONTRACT_REPAIR_SCHEMA_VERSION,
  compareUtf16CodeUnits,
  profileRepairHash,
  profileRepairInventoryHash,
  profileRepairInventoryRowFingerprint,
  profileRepairToken,
  type ProfileContractRepairBlocker,
  type ProfileContractRepairEventEvidence,
  type ProfileContractRepairEventPlan,
  type ProfileContractRepairInventoryRowFact,
  type ProfileContractRepairPlan,
  type ProfileContractRepairSource,
  type ProfileContractRepairTargetFact,
} from "./contract";

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const PROFILE_TARGET_TOKEN_PATTERN = /^profile-target-sha256:[a-f0-9]{64}$/u;
const SAFE_SOURCE_TOKEN_PATTERN = /^(?:activation-audit|profile-target)-sha256:[a-f0-9]{64}$/u;
const CANONICAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CANONICAL_EVENT_ID_PATTERN = /^[\p{L}\p{M}\p{N}\p{S}._:-]+$/u;
const SAFE_PUBLIC_EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;

const SOURCE_BLOCKER_MESSAGES: Readonly<Record<string, readonly string[]>> = {
  ANSWER_MAP_INVALID: [
    "Canonical profile answers must be an object.",
    "Canonical profile answers contain an unknown field.",
  ],
  ANSWER_MAP_MISMATCH: [
    "Canonical participant and registration answer maps do not agree.",
  ],
  ANSWER_VALUE_INVALID: [
    "Canonical profile answer values must be strings.",
    "Non-empty canonical profile answers must already be normalized.",
  ],
  REPAIR_ACTIVATION_AUDIT_ORPHAN: [
    "Registration activation audit does not belong to the current canonical event inventory.",
  ],
  REPAIR_CANONICAL_SCOPE_EMPTY: [
    "Canonical profile repair requires at least one canonical event.",
  ],
  REPAIR_EVENT_SOURCE_INVALID: [
    "Canonical event/configuration/activation/head evidence is incomplete or inconsistent.",
  ],
  REPAIR_PROFILE_SOURCE_INVALID: [
    "Canonical profile/membership head, version, identity, or payload is inconsistent.",
  ],
  REPAIR_REGISTRATION_CONTRACT_INVALID: [
    "Canonical registration/profile lifecycle or response contract is invalid after the allowed deletion-only transform.",
  ],
  REPAIR_RESPONSE_SOURCE_INVALID: [
    "Canonical profile response rows do not match the immutable profile snapshot.",
  ],
};

const EVENT_KEYS = [
  "activationAuditFingerprint",
  "configurationHeadRevision",
  "configurationVersion",
  "contentHash",
  "eventId",
  "eventRevision",
  "eventVersion",
  "inventoryCount",
  "inventoryHash",
  "profileEditDeadlineAt",
  "sourceAuthority",
] as const;

const INVENTORY_KEYS = [
  "afterProfilePayloadHash",
  "beforeProfilePayloadHash",
  "candidateState",
  "deletionPaths",
  "eventId",
  "lateRegistration",
  "lifecycleHash",
  "membershipHeadRevision",
  "membershipStatus",
  "membershipVersion",
  "profileHeadRevision",
  "profileVersion",
  "responsesHash",
  "rowFingerprint",
  "sourceAuthority",
  "targetToken",
] as const;

const TARGET_KEYS = [
  "afterProfilePayloadHash",
  "beforeProfilePayloadHash",
  "deletionPaths",
  "eventId",
  "lifecycleHash",
  "membershipHeadRevision",
  "membershipVersion",
  "profileHeadRevision",
  "profileVersion",
  "responsesHash",
  "sourceAuthority",
  "targetToken",
] as const;

const BLOCKER_KEYS = ["code", "eventId", "message", "targetToken"] as const;
const SOURCE_KEYS = ["blockers", "events", "inventory", "targets"] as const;
const KNOWN_FIELDS = new Set<string>(EVENT_PARTICIPANT_PROFILE_FIELDS);

type PlainRecord = Record<string, unknown>;

function plainRecord(value: unknown): PlainRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as PlainRecord)
    : null;
}

function exactKeys(value: PlainRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function hash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function canonicalTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    CANONICAL_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function canonicalEventId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value.normalize("NFC") === value &&
    CANONICAL_EVENT_ID_PATTERN.test(value)
  );
}

function profileTargetToken(value: unknown): value is string {
  return typeof value === "string" && PROFILE_TARGET_TOKEN_PATTERN.test(value);
}

function safePublicEventId(value: unknown): value is string {
  return typeof value === "string" && SAFE_PUBLIC_EVENT_ID_PATTERN.test(value);
}

function safeSourceToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_SOURCE_TOKEN_PATTERN.test(value);
}

function safeInvalidSourceToken(value: unknown): string | null {
  return typeof value === "string"
    ? profileRepairToken("invalid-source", value.slice(0, 1_024))
    : null;
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

function invalidContractBlocker(input: {
  code: "REPAIR_EVENT_CONTRACT_INVALID" | "REPAIR_INVENTORY_CONTRACT_INVALID" | "REPAIR_TARGET_CONTRACT_INVALID";
  eventId?: unknown;
  targetToken?: unknown;
}): ProfileContractRepairBlocker {
  const messages = {
    REPAIR_EVENT_CONTRACT_INVALID: "Canonical repair event evidence is invalid.",
    REPAIR_INVENTORY_CONTRACT_INVALID: "Canonical repair inventory evidence is invalid.",
    REPAIR_TARGET_CONTRACT_INVALID: "Canonical repair target evidence is invalid.",
  } as const;
  return blocker({
    code: input.code,
    eventId: safePublicEventId(input.eventId) ? input.eventId : null,
    message: messages[input.code],
    targetToken: profileTargetToken(input.targetToken)
      ? input.targetToken
      : safeInvalidSourceToken(input.targetToken),
  });
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

function sortInventory(values: readonly ProfileContractRepairInventoryRowFact[]) {
  return [...values].sort(
    (left, right) =>
      compareUtf16CodeUnits(left.eventId, right.eventId) ||
      compareUtf16CodeUnits(left.targetToken, right.targetToken),
  );
}

function sortTargets(values: readonly ProfileContractRepairTargetFact[]) {
  return [...values].sort(
    (left, right) =>
      compareUtf16CodeUnits(left.eventId, right.eventId) ||
      compareUtf16CodeUnits(left.targetToken, right.targetToken),
  );
}

function parseDeletionPaths(input: {
  candidateState: "candidate" | "unchanged";
  value: unknown;
}): readonly string[] | null {
  if (!Array.isArray(input.value) || !input.value.every((value) => typeof value === "string")) {
    return null;
  }
  const values = input.value as string[];
  if (
    new Set(values).size !== values.length ||
    [...values]
      .sort(compareUtf16CodeUnits)
      .some((value, index) => value !== values[index])
  ) {
    return null;
  }
  const registrationFields = new Set<string>();
  const participantFields = new Set<string>();
  for (const path of values) {
    const registrationMatch = /^registrationProfile\.answers\.([^.]*)$/u.exec(path);
    const participantMatch = /^participant\.profileAnswers\.([^.]*)$/u.exec(path);
    const field = registrationMatch?.[1] ?? participantMatch?.[1];
    if (!field || !KNOWN_FIELDS.has(field)) return null;
    if (registrationMatch) registrationFields.add(field);
    else participantFields.add(field);
  }
  if (input.candidateState === "unchanged") {
    return values.length === 0 ? values : null;
  }
  if (registrationFields.size === 0) return null;
  if ([...participantFields].some((field) => !registrationFields.has(field))) {
    return null;
  }
  return values;
}

function parseEvent(value: unknown): ProfileContractRepairEventEvidence | null {
  const record = plainRecord(value);
  if (
    !record ||
    !exactKeys(record, EVENT_KEYS) ||
    !hash(record.activationAuditFingerprint) ||
    !positiveInteger(record.configurationHeadRevision) ||
    !positiveInteger(record.configurationVersion) ||
    !hash(record.contentHash) ||
    !canonicalEventId(record.eventId) ||
    !positiveInteger(record.eventRevision) ||
    !positiveInteger(record.eventVersion) ||
    !nonNegativeInteger(record.inventoryCount) ||
    !hash(record.inventoryHash) ||
    !canonicalTimestamp(record.profileEditDeadlineAt) ||
    record.sourceAuthority !== "canonical"
  ) {
    return null;
  }
  return record as unknown as ProfileContractRepairEventEvidence;
}

function parseInventoryRow(
  value: unknown,
): ProfileContractRepairInventoryRowFact | null {
  const record = plainRecord(value);
  if (
    !record ||
    !exactKeys(record, INVENTORY_KEYS) ||
    !["candidate", "unchanged"].includes(String(record.candidateState)) ||
    !hash(record.beforeProfilePayloadHash) ||
    !canonicalEventId(record.eventId) ||
    typeof record.lateRegistration !== "boolean" ||
    !hash(record.lifecycleHash) ||
    !positiveInteger(record.membershipHeadRevision) ||
    !["cancelled", "rsvped"].includes(String(record.membershipStatus)) ||
    !positiveInteger(record.membershipVersion) ||
    !positiveInteger(record.profileHeadRevision) ||
    !positiveInteger(record.profileVersion) ||
    !hash(record.responsesHash) ||
    !hash(record.rowFingerprint) ||
    record.sourceAuthority !== "canonical" ||
    !profileTargetToken(record.targetToken)
  ) {
    return null;
  }
  const candidateState = record.candidateState as "candidate" | "unchanged";
  const deletionPaths = parseDeletionPaths({
    candidateState,
    value: record.deletionPaths,
  });
  if (
    !deletionPaths ||
    (candidateState === "candidate"
      ? !hash(record.afterProfilePayloadHash)
      : record.afterProfilePayloadHash !== null)
  ) {
    return null;
  }
  return {
    ...(record as unknown as ProfileContractRepairInventoryRowFact),
    candidateState,
    deletionPaths,
  };
}

function parseTarget(value: unknown): ProfileContractRepairTargetFact | null {
  const record = plainRecord(value);
  if (
    !record ||
    !exactKeys(record, TARGET_KEYS) ||
    !hash(record.afterProfilePayloadHash) ||
    !hash(record.beforeProfilePayloadHash) ||
    !canonicalEventId(record.eventId) ||
    !hash(record.lifecycleHash) ||
    !positiveInteger(record.membershipHeadRevision) ||
    !positiveInteger(record.membershipVersion) ||
    !positiveInteger(record.profileHeadRevision) ||
    !positiveInteger(record.profileVersion) ||
    !hash(record.responsesHash) ||
    record.sourceAuthority !== "canonical" ||
    !profileTargetToken(record.targetToken)
  ) {
    return null;
  }
  const deletionPaths = parseDeletionPaths({
    candidateState: "candidate",
    value: record.deletionPaths,
  });
  return deletionPaths
    ? {
        ...(record as unknown as ProfileContractRepairTargetFact),
        deletionPaths,
      }
    : null;
}

function parseSourceBlocker(value: unknown): ProfileContractRepairBlocker {
  const record = plainRecord(value);
  const code = typeof record?.code === "string" ? record.code : null;
  const message = typeof record?.message === "string" ? record.message : null;
  const allowedMessages = code ? SOURCE_BLOCKER_MESSAGES[code] : undefined;
  if (
    record &&
    exactKeys(record, BLOCKER_KEYS) &&
    allowedMessages?.includes(message ?? "") &&
    (record.eventId === null || safePublicEventId(record.eventId)) &&
    (record.targetToken === null || safeSourceToken(record.targetToken))
  ) {
    return {
      code: code!,
      eventId: record.eventId as string | null,
      message: message!,
      targetToken: record.targetToken as string | null,
    };
  }
  return blocker({
    code: "REPAIR_SOURCE_BLOCKER_INVALID",
    message: "Untrusted source blocker was malformed and was not included.",
    targetToken: safeInvalidSourceToken(record?.targetToken),
  });
}

function parseSource(value: unknown): {
  blockers: ProfileContractRepairBlocker[];
  source: ProfileContractRepairSource;
} | null {
  const record = plainRecord(value);
  if (
    !record ||
    !exactKeys(record, SOURCE_KEYS) ||
    !Array.isArray(record.blockers) ||
    !Array.isArray(record.events) ||
    !Array.isArray(record.inventory) ||
    !Array.isArray(record.targets)
  ) {
    return null;
  }
  const contractBlockers: ProfileContractRepairBlocker[] = [];
  const events: ProfileContractRepairEventEvidence[] = [];
  for (const raw of record.events) {
    const parsed = parseEvent(raw);
    if (parsed) events.push(parsed);
    else {
      const item = plainRecord(raw);
      contractBlockers.push(
        invalidContractBlocker({
          code: "REPAIR_EVENT_CONTRACT_INVALID",
          eventId: item?.eventId,
        }),
      );
    }
  }
  const inventory: ProfileContractRepairInventoryRowFact[] = [];
  for (const raw of record.inventory) {
    const parsed = parseInventoryRow(raw);
    if (parsed) inventory.push(parsed);
    else {
      const item = plainRecord(raw);
      contractBlockers.push(
        invalidContractBlocker({
          code: "REPAIR_INVENTORY_CONTRACT_INVALID",
          eventId: item?.eventId,
          targetToken: item?.targetToken,
        }),
      );
    }
  }
  const targets: ProfileContractRepairTargetFact[] = [];
  for (const raw of record.targets) {
    const parsed = parseTarget(raw);
    if (parsed) targets.push(parsed);
    else {
      const item = plainRecord(raw);
      contractBlockers.push(
        invalidContractBlocker({
          code: "REPAIR_TARGET_CONTRACT_INVALID",
          eventId: item?.eventId,
          targetToken: item?.targetToken,
        }),
      );
    }
  }
  return {
    blockers: contractBlockers,
    source: {
      blockers: record.blockers.map(parseSourceBlocker),
      events,
      inventory,
      targets,
    },
  };
}

function finalizePlan(input: {
  blockers: readonly ProfileContractRepairBlocker[];
  events: readonly ProfileContractRepairEventPlan[];
  targets: readonly ProfileContractRepairTargetFact[];
}): ProfileContractRepairPlan {
  const blockers = sortBlockers(input.blockers);
  const diagnosticPayload = {
    blockers,
    events: input.events,
    repairId: PROFILE_CONTRACT_REPAIR_ID,
    schemaVersion: PROFILE_CONTRACT_REPAIR_SCHEMA_VERSION,
    targets: input.targets,
  };
  const diagnosticHash = profileRepairHash(
    "canonical-profile-contract-repair:diagnostic:v1",
    diagnosticPayload,
  );
  const applyEligible = blockers.length === 0;
  return {
    applyEligible,
    applyPlanHash: applyEligible
      ? profileRepairHash("canonical-profile-contract-repair:apply-plan:v1", {
          ...diagnosticPayload,
          diagnosticHash,
        })
      : null,
    blockers,
    diagnosticHash,
    eventCount: input.events.length,
    events: input.events,
    repairId: PROFILE_CONTRACT_REPAIR_ID,
    schemaVersion: PROFILE_CONTRACT_REPAIR_SCHEMA_VERSION,
    targetCount: input.targets.length,
    targets: input.targets,
  };
}

function invalidSourcePlan(): ProfileContractRepairPlan {
  return finalizePlan({
    blockers: [
      blocker({
        code: "REPAIR_SOURCE_CONTRACT_INVALID",
        message: "Untrusted profile repair source did not match the canonical contract.",
      }),
    ],
    events: [],
    targets: [],
  });
}

function buildValidatedPlan(parsed: ReturnType<typeof parseSource>): ProfileContractRepairPlan {
  if (!parsed) return invalidSourcePlan();
  const source = parsed.source;
  const blockers = [...parsed.blockers, ...source.blockers];
  const eventsById = new Map(source.events.map((event) => [event.eventId, event]));
  if (eventsById.size !== source.events.length) {
    blockers.push(
      blocker({
        code: "REPAIR_EVENT_DUPLICATE",
        message: "Canonical repair event evidence is duplicated.",
      }),
    );
  }
  const inventory = sortInventory(source.inventory);
  const inventoryByToken = new Map<string, ProfileContractRepairInventoryRowFact>();
  for (const value of inventory) {
    const { rowFingerprint, ...fingerprintInput } = value;
    if (rowFingerprint !== profileRepairInventoryRowFingerprint(fingerprintInput)) {
      blockers.push(
        blocker({
          code: "REPAIR_INVENTORY_ROW_FINGERPRINT_INVALID",
          eventId: value.eventId,
          message: "Canonical inventory row fingerprint does not match its evidence.",
          targetToken: value.targetToken,
        }),
      );
    }
    if (!eventsById.has(value.eventId)) {
      blockers.push(
        blocker({
          code: "REPAIR_INVENTORY_EVENT_UNKNOWN",
          eventId: value.eventId,
          message: "Canonical inventory row has no event evidence.",
          targetToken: value.targetToken,
        }),
      );
    }
    if (inventoryByToken.has(value.targetToken)) {
      blockers.push(
        blocker({
          code: "REPAIR_INVENTORY_TARGET_DUPLICATE",
          eventId: value.eventId,
          message: "Canonical inventory target token is duplicated.",
          targetToken: value.targetToken,
        }),
      );
    }
    inventoryByToken.set(value.targetToken, value);
  }
  const targets = sortTargets(source.targets);
  const targetTokens = new Set<string>();
  for (const target of targets) {
    if (!eventsById.has(target.eventId)) {
      blockers.push(
        blocker({
          code: "REPAIR_TARGET_EVENT_UNKNOWN",
          eventId: target.eventId,
          message: "Repair target has no canonical event evidence.",
          targetToken: target.targetToken,
        }),
      );
    }
    const inventoryRow = inventoryByToken.get(target.targetToken);
    if (!inventoryRow || inventoryRow.candidateState !== "candidate") {
      blockers.push(
        blocker({
          code: "REPAIR_TARGET_INVENTORY_MISSING",
          eventId: target.eventId,
          message: "Repair target is not backed by one candidate inventory row.",
          targetToken: target.targetToken,
        }),
      );
    } else if (
      profileRepairHash("canonical-profile-contract-repair:target-inventory-link:v1", {
        afterProfilePayloadHash: target.afterProfilePayloadHash,
        beforeProfilePayloadHash: target.beforeProfilePayloadHash,
        deletionPaths: target.deletionPaths,
        eventId: target.eventId,
        lifecycleHash: target.lifecycleHash,
        membershipHeadRevision: target.membershipHeadRevision,
        membershipVersion: target.membershipVersion,
        profileHeadRevision: target.profileHeadRevision,
        profileVersion: target.profileVersion,
        responsesHash: target.responsesHash,
        sourceAuthority: target.sourceAuthority,
        targetToken: target.targetToken,
      }) !==
      profileRepairHash("canonical-profile-contract-repair:target-inventory-link:v1", {
        afterProfilePayloadHash: inventoryRow.afterProfilePayloadHash,
        beforeProfilePayloadHash: inventoryRow.beforeProfilePayloadHash,
        deletionPaths: inventoryRow.deletionPaths,
        eventId: inventoryRow.eventId,
        lifecycleHash: inventoryRow.lifecycleHash,
        membershipHeadRevision: inventoryRow.membershipHeadRevision,
        membershipVersion: inventoryRow.membershipVersion,
        profileHeadRevision: inventoryRow.profileHeadRevision,
        profileVersion: inventoryRow.profileVersion,
        responsesHash: inventoryRow.responsesHash,
        sourceAuthority: inventoryRow.sourceAuthority,
        targetToken: inventoryRow.targetToken,
      })
    ) {
      blockers.push(
        blocker({
          code: "REPAIR_TARGET_INVENTORY_MISMATCH",
          eventId: target.eventId,
          message: "Repair target evidence does not match its canonical inventory row.",
          targetToken: target.targetToken,
        }),
      );
    }
    if (targetTokens.has(target.targetToken)) {
      blockers.push(
        blocker({
          code: "REPAIR_TARGET_DUPLICATE",
          eventId: target.eventId,
          message: "Canonical repair target token is duplicated.",
          targetToken: target.targetToken,
        }),
      );
    }
    targetTokens.add(target.targetToken);
  }
  for (const value of inventory) {
    if (value.candidateState === "candidate" && !targetTokens.has(value.targetToken)) {
      blockers.push(
        blocker({
          code: "REPAIR_INVENTORY_CANDIDATE_TARGET_MISSING",
          eventId: value.eventId,
          message: "Candidate inventory row has no repair target.",
          targetToken: value.targetToken,
        }),
      );
    }
  }
  for (const evidence of eventsById.values()) {
    const eventInventory = inventory.filter((value) => value.eventId === evidence.eventId);
    if (
      evidence.inventoryCount !== eventInventory.length ||
      evidence.inventoryHash !== profileRepairInventoryHash(eventInventory)
    ) {
      blockers.push(
        blocker({
          code: "REPAIR_EVENT_INVENTORY_MISMATCH",
          eventId: evidence.eventId,
          message: "Canonical event inventory count or hash is inconsistent.",
        }),
      );
    }
  }
  const eventPlans: ProfileContractRepairEventPlan[] = [...eventsById.values()]
    .sort((left, right) => compareUtf16CodeUnits(left.eventId, right.eventId))
    .map((evidence) => {
      const eventTargets = targets.filter(
        (target) => target.eventId === evidence.eventId,
      );
      return {
        ...evidence,
        blockers: sortBlockers(
          blockers.filter((value) => value.eventId === evidence.eventId),
        ),
        targetCount: eventTargets.length,
        targetsHash: profileRepairHash(
          "canonical-profile-contract-repair:event-targets:v1",
          eventTargets,
        ),
      };
    });
  return finalizePlan({ blockers, events: eventPlans, targets });
}

export function buildProfileContractRepairPlan(
  source: unknown,
): ProfileContractRepairPlan {
  try {
    if (!isTrustedProfileContractRepairSource(source)) return invalidSourcePlan();
    return buildValidatedPlan(parseSource(source));
  } catch {
    return invalidSourcePlan();
  }
}
