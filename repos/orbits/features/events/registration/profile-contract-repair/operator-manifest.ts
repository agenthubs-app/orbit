import { profileRepairHash } from "./contract";
import { parseJsonWithUniqueObjectKeys } from "../operator-json";

export const PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_SCHEMA_VERSION = 1 as const;
export const PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_REPAIR_TYPE =
  "canonical_profile_empty_answer_v1" as const;
export const PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_INVALID =
  "PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_INVALID" as const;

export interface ProfileContractRepairOperatorManifest {
  readonly events: readonly string[];
  readonly manifestHash: string;
  readonly repairType: typeof PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_REPAIR_TYPE;
  readonly schemaVersion: typeof PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_SCHEMA_VERSION;
}

export interface ProfileContractRepairOperatorManifestFailure {
  readonly error: typeof PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_INVALID;
  readonly manifest: null;
}

const EVENT_ID = /^[\p{L}\p{M}\p{N}\p{S}._:-]+$/u;
const ROOT_KEYS = ["events", "repairType", "schemaVersion"] as const;

function invalid(): ProfileContractRepairOperatorManifestFailure {
  return Object.freeze({
    error: PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_INVALID,
    manifest: null,
  });
}

function dataValue(object: object, key: PropertyKey): unknown {
  const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw 0;
  return descriptor.value;
}

function exactDataKeys(object: object, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(object);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function validEventId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value &&
    value.normalize("NFC") === value &&
    EVENT_ID.test(value)
  );
}

/**
 * Parses untrusted operator input without invoking user-defined getters or
 * allowing hostile objects to escape as diagnostics.  Invalid input is a
 * fixed, data-only result so callers can fail closed without echoing it.
 */
export function parseProfileContractRepairOperatorManifest(
  input: unknown,
): ProfileContractRepairOperatorManifest | ProfileContractRepairOperatorManifestFailure {
  try {
    const value = typeof input === "string"
      ? parseJsonWithUniqueObjectKeys(input)
      : input;
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return invalid();
    if (!exactDataKeys(value, ROOT_KEYS)) return invalid();

    const record = value as object;
    const schemaVersion = dataValue(record, "schemaVersion");
    const repairType = dataValue(record, "repairType");
    const rawEvents = dataValue(record, "events");
    if (
      schemaVersion !== PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_SCHEMA_VERSION ||
      repairType !== PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_REPAIR_TYPE ||
      !Array.isArray(rawEvents) ||
      Reflect.ownKeys(rawEvents).length !== rawEvents.length + 1 ||
      Reflect.ownKeys(rawEvents).some((key) =>
        typeof key === "symbol" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)),
      )
    ) return invalid();

    const events = Array.from({ length: rawEvents.length }, (_, index) =>
      dataValue(rawEvents, String(index)),
    );
    if (
      events.length === 0 ||
      !events.every(validEventId) ||
      events.some((eventId, index) =>
        index > 0 && events[index - 1]! >= eventId,
      )
    ) return invalid();

    const copiedEvents = Object.freeze([...events]);
    return Object.freeze({
      events: copiedEvents,
      manifestHash: profileRepairHash(
        "canonical-profile-contract-repair:operator-manifest:v1",
        {
          events: copiedEvents,
          repairType: PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_REPAIR_TYPE,
          schemaVersion: PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_SCHEMA_VERSION,
        },
      ),
      repairType: PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_REPAIR_TYPE,
      schemaVersion: PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_SCHEMA_VERSION,
    });
  } catch {
    return invalid();
  }
}
