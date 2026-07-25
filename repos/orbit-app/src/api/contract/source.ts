// 跨客户端契约：关系来源与价值枚举。
// 常量数组留在 shared/domain/source-types.ts，那边有类型断言保证与这里一致。
// 本文件不得引入任何 import，见 shared/contract/README.md。

export type SourceTypeCode =
  | "manual"
  | "business_card_ocr"
  | "qr_scan"
  | "event_import"
  | "external_contacts"
  | "email_signal"
  | "calendar_signal"
  | "referral"
  | "chat_summary"
  | "agent_action"
  | "system";

export type RelationshipStageCode =
  | "captured"
  | "reviewing"
  | "active"
  | "needs_follow_up"
  | "nurture"
  | "archived";

export type RelationshipValueTypeCode =
  | "strategic_fit"
  | "commercial_opportunity"
  | "knowledge_exchange"
  | "referral_path"
  | "community_context";

export interface SourceReferenceContract {
  type: SourceTypeCode;
  id: string;
  label?: string;
}
