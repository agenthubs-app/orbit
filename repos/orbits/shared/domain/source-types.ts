// shared/domain/source-types 是所有 feature contract 共用的枚举源头。
// 业务模块应从这里复用 source/stage/value/permission 类型，避免各自发明字符串。
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

export const PREFERRED_LANGUAGE_VALUES = [
  "ja",
  "en",
  "zh",
  "mixed",
] as const;

export type PreferredLanguage = (typeof PREFERRED_LANGUAGE_VALUES)[number];

export const RELATIONSHIP_TRUST_LEVEL_VALUES = [
  "unverified",
  "emerging",
  "warm",
  "trusted",
] as const;

export type RelationshipTrustLevel =
  (typeof RELATIONSHIP_TRUST_LEVEL_VALUES)[number];

export const RELATIONSHIP_TARGET_TYPES = [
  "account",
  "profile",
  "event",
  "attendee",
  "contact",
  "connection",
  "conversation",
  "message",
] as const;

export type RelationshipTargetType = (typeof RELATIONSHIP_TARGET_TYPES)[number];

export const AI_ANALYSIS_TYPE_VALUES = [
  "event_intent",
  "relationship_profile",
  "match_explanation",
  "interaction_memory",
] as const;

export type AiAnalysisType = (typeof AI_ANALYSIS_TYPE_VALUES)[number];

export const MATCH_RECOMMENDATION_TYPE_VALUES = [
  "event_follow_up",
  "warm_intro",
  "context_share",
] as const;

export type MatchRecommendationType =
  (typeof MATCH_RECOMMENDATION_TYPE_VALUES)[number];

export const INTERACTION_MEMORY_TYPE_VALUES = [
  "event_note",
  "follow_up_request",
  "referral_offer",
] as const;

export type InteractionMemoryType =
  (typeof INTERACTION_MEMORY_TYPE_VALUES)[number];

export const RECOMMENDATION_TEST_CASE_TYPES = [
  "golden_match",
  "negative_case",
  "dirty_data",
] as const;

export type RecommendationTestCaseType =
  (typeof RECOMMENDATION_TEST_CASE_TYPES)[number];

export const RECOMMENDATION_TEST_EXPECTED_OUTCOMES = [
  "recommend",
  "suppress",
  "manual_review",
] as const;

export type RecommendationTestExpectedOutcome =
  (typeof RECOMMENDATION_TEST_EXPECTED_OUTCOMES)[number];

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

// includesValue 是窄化 unknown 输入的通用 helper。
// API route 和 mock service 可以用它把外部字符串收敛到受控枚举。
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

export function isPreferredLanguage(value: unknown): value is PreferredLanguage {
  return includesValue(PREFERRED_LANGUAGE_VALUES, value);
}

export function isRelationshipTrustLevel(
  value: unknown,
): value is RelationshipTrustLevel {
  return includesValue(RELATIONSHIP_TRUST_LEVEL_VALUES, value);
}

export function isRelationshipTargetType(
  value: unknown,
): value is RelationshipTargetType {
  return includesValue(RELATIONSHIP_TARGET_TYPES, value);
}

export function isAiAnalysisType(value: unknown): value is AiAnalysisType {
  return includesValue(AI_ANALYSIS_TYPE_VALUES, value);
}

export function isMatchRecommendationType(
  value: unknown,
): value is MatchRecommendationType {
  return includesValue(MATCH_RECOMMENDATION_TYPE_VALUES, value);
}

export function isInteractionMemoryType(
  value: unknown,
): value is InteractionMemoryType {
  return includesValue(INTERACTION_MEMORY_TYPE_VALUES, value);
}

export function isRecommendationTestCaseType(
  value: unknown,
): value is RecommendationTestCaseType {
  return includesValue(RECOMMENDATION_TEST_CASE_TYPES, value);
}

export function isRecommendationTestExpectedOutcome(
  value: unknown,
): value is RecommendationTestExpectedOutcome {
  return includesValue(RECOMMENDATION_TEST_EXPECTED_OUTCOMES, value);
}

export function isPermissionState(value: unknown): value is PermissionState {
  return includesValue(PERMISSION_STATE_VALUES, value);
}
