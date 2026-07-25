import type { ContractMatches } from "../contract-check";
import type {
  RelationshipStageCode,
  RelationshipValueTypeCode,
  SourceReferenceContract,
  SourceTypeCode,
} from "../contract/source";

// shared/domain/source-types 是所有 feature contract 共用的枚举源头。
// 业务模块应从这里复用 source/stage/value/permission 类型，避免各自发明字符串。
//
// 跨客户端可见的那几个枚举在 shared/contract/source.ts 里另有一份纯类型声明，
// 供 iOS App 拷贝。文件末尾的断言保证两边不会漂移。
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

// 名片档案的职级枚举；register 的 levelOptions 收敛到这里。
export const SENIORITY_LEVEL_VALUES = [
  "individual_contributor",
  "manager",
  "director",
  "vp",
  "c_level",
  "founder",
] as const;

export type SeniorityLevel = (typeof SENIORITY_LEVEL_VALUES)[number];

// 会面（Meeting）实体的状态；区别于 TaskDTO 的提醒状态。
export const MEETING_STATUS_VALUES = [
  "proposed",
  "pending_confirmation",
  "confirmed",
  "completed",
  "cancelled",
] as const;

export type MeetingStatus = (typeof MEETING_STATUS_VALUES)[number];

export const MEETING_MODE_VALUES = ["in_person", "video", "phone"] as const;

export type MeetingMode = (typeof MEETING_MODE_VALUES)[number];

// 联系人网络分类（名片夹仪表盘的人物画像轴），独立于 valueTypes 与 stage。
export const NETWORK_CATEGORY_VALUES = [
  "prospect",
  "partner",
  "investor",
  "connector",
  "advisor",
  "customer",
] as const;

export type NetworkCategory = (typeof NETWORK_CATEGORY_VALUES)[number];

// 活动 RSVP / 出席状态；缺失视为未报名。
export const RSVP_STATUS_VALUES = [
  "invited",
  "rsvped",
  "waitlisted",
  "checked_in",
  "no_show",
  "cancelled",
] as const;

export type RsvpStatus = (typeof RSVP_STATUS_VALUES)[number];

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

export function isSeniorityLevel(value: unknown): value is SeniorityLevel {
  return includesValue(SENIORITY_LEVEL_VALUES, value);
}

export function isMeetingStatus(value: unknown): value is MeetingStatus {
  return includesValue(MEETING_STATUS_VALUES, value);
}

export function isMeetingMode(value: unknown): value is MeetingMode {
  return includesValue(MEETING_MODE_VALUES, value);
}

export function isRsvpStatus(value: unknown): value is RsvpStatus {
  return includesValue(RSVP_STATUS_VALUES, value);
}

export function isNetworkCategory(value: unknown): value is NetworkCategory {
  return includesValue(NETWORK_CATEGORY_VALUES, value);
}

// 跨客户端契约一致性断言。任何一边改了枚举而另一边没跟上，这里就编译不过。
// 修的时候两边一起改：本文件的常量数组 + shared/contract/source.ts。
export type SourceTypeMatchesContract = ContractMatches<
  SourceType,
  SourceTypeCode
>;
export type RelationshipStageMatchesContract = ContractMatches<
  RelationshipStage,
  RelationshipStageCode
>;
export type RelationshipValueTypeMatchesContract = ContractMatches<
  RelationshipValueType,
  RelationshipValueTypeCode
>;
export type SourceReferenceMatchesContract = ContractMatches<
  SourceReferenceDTO,
  SourceReferenceContract
>;
