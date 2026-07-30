// 跨客户端契约：跟进任务。
// 对应 GET /api/tasks 与 POST /api/tasks/generate 返回的 tasks / triggers。
// 这些是「建议的任务」，不是已经创建的真实提醒——客户端文案必须体现这一点。

import type { SourceReferenceContract } from "./source";

export type FollowupTriggerKindCode =
  | "new_connection"
  | "event_encounter"
  | "promised_action"
  | "dormant_relationship";

export type FollowupPriorityCode = "today" | "this_week" | "nurture";

export type FollowupSourceReferenceContract = SourceReferenceContract & {
  type:
    | "agent_action"
    | "calendar_signal"
    | "email_signal"
    | "event_import"
    | "manual"
    | "system";
  label: string;
  providerRecordId: string;
  generatedBy: string;
};

// 触发原因：为什么系统建议跟进这个人。
export interface FollowupTriggerContract {
  triggerId: string;
  kind: FollowupTriggerKindCode;
  label: string;
  detail: string;
  occurredAt: string;
  connectionId: string;
  contactName: string;
  organization: string;
  source: FollowupSourceReferenceContract;
  evidenceIds: readonly string[];
  backgroundSchedulerRequested: false;
  liveDatabaseReadExecuted: boolean;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
  externalNetworkRequested: false;
}

// 给客户端展示的复核提示，提醒任务仍需人工验证证据。
export interface FollowupAuditContract {
  sourceLabel: string;
  providerBoundary: "scheduler false, AI false, persistence false";
  verificationAction: "Verify evidence";
}

// 一条建议任务。注意它尚未落库，也没有发出任何提醒。
export interface FollowupTaskContract {
  taskId: string;
  title: string;
  triggerKind: FollowupTriggerKindCode;
  priority: FollowupPriorityCode;
  dueAt?: string;
  dueInDays: number;
  contactId?: string | null;
  connectionId: string;
  contactName: string;
  organization: string;
  recommendedAction: string;
  rationale: string;
  source: FollowupSourceReferenceContract;
  evidenceIds: readonly string[];
  generatedBy: string;
  audit: FollowupAuditContract;
  backgroundSchedulerRequested: false;
  liveTaskPersistenceRequested: false;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
  externalNetworkRequested: false;
}
