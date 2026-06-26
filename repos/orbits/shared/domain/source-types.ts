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

export type SourceType = (typeof SOURCE_TYPES)[number];

export const RELATIONSHIP_STAGE_VALUES = [
  "captured",
  "reviewing",
  "active",
  "needs_follow_up",
  "nurture",
  "archived",
] as const;

export type RelationshipStage = (typeof RELATIONSHIP_STAGE_VALUES)[number];

export const RELATIONSHIP_VALUE_TYPES = [
  "strategic_fit",
  "commercial_opportunity",
  "knowledge_exchange",
  "referral_path",
  "community_context",
] as const;

export type RelationshipValueType = (typeof RELATIONSHIP_VALUE_TYPES)[number];

export const PERMISSION_STATE_VALUES = [
  "not_requested",
  "requested",
  "granted",
  "denied",
  "revoked",
] as const;

export type PermissionState = (typeof PERMISSION_STATE_VALUES)[number];

export interface SourceReferenceDTO {
  type: SourceType;
  id: string;
  label?: string;
}

function includesValue<const TValue extends readonly string[]>(
  values: TValue,
  value: unknown,
): value is TValue[number] {
  return typeof value === "string" && values.includes(value as TValue[number]);
}

export function isSourceType(value: unknown): value is SourceType {
  return includesValue(SOURCE_TYPES, value);
}

export function isRelationshipStage(
  value: unknown,
): value is RelationshipStage {
  return includesValue(RELATIONSHIP_STAGE_VALUES, value);
}

export function isRelationshipValueType(
  value: unknown,
): value is RelationshipValueType {
  return includesValue(RELATIONSHIP_VALUE_TYPES, value);
}

export function isPermissionState(value: unknown): value is PermissionState {
  return includesValue(PERMISSION_STATE_VALUES, value);
}
