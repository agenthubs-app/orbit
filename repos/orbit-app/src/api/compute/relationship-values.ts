/**
 * Sprint 0117 (dashboard D3): the relationship enums the shared dashboard
 * computations validate records with. They moved here from
 * shared/domain/source-types.ts, which re-exports them, so the server and the
 * App (a copy of this directory) accept exactly the same values; the
 * type-level check against shared/contract/source.ts stays in source-types.
 */
export const SOURCE_TYPES = [
  "manual",
  "business_card_ocr",
  "qr_scan",
  "event_import",
  "external_contacts",
  "email_signal",
  "calendar_signal",
  "referral",
  "chat_summary",
  "agent_action",
  "system",
] as const;

export const RELATIONSHIP_STAGE_VALUES = [
  "captured",
  "reviewing",
  "active",
  "needs_follow_up",
  "nurture",
  "archived",
] as const;

export const RELATIONSHIP_VALUE_TYPES = [
  "strategic_fit",
  "commercial_opportunity",
  "knowledge_exchange",
  "referral_path",
  "community_context",
] as const;

export const RELATIONSHIP_TRUST_LEVEL_VALUES = [
  "unverified",
  "emerging",
  "warm",
  "trusted",
] as const;

function includesValue<const TValue extends readonly string[]>(
  values: TValue,
  value: unknown,
): value is TValue[number] {
  return typeof value === "string" && values.includes(value as TValue[number]);
}

export function isSourceType(value: unknown): value is (typeof SOURCE_TYPES)[number] {
  return includesValue(SOURCE_TYPES, value);
}

export function isRelationshipStage(value: unknown): value is (typeof RELATIONSHIP_STAGE_VALUES)[number] {
  return includesValue(RELATIONSHIP_STAGE_VALUES, value);
}

export function isRelationshipValueType(value: unknown): value is (typeof RELATIONSHIP_VALUE_TYPES)[number] {
  return includesValue(RELATIONSHIP_VALUE_TYPES, value);
}

export function isRelationshipTrustLevel(value: unknown): value is (typeof RELATIONSHIP_TRUST_LEVEL_VALUES)[number] {
  return includesValue(RELATIONSHIP_TRUST_LEVEL_VALUES, value);
}
