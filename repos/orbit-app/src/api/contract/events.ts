// 跨客户端契约：活动。
// 对应 GET /api/events 与 GET /api/events/:id 返回的活动记录。
// 常量数组留在 features/events/event-crud-and-import/contract.ts，那边有断言保证一致。

import type { SourceReferenceContract } from "./source";

export type EventStatusCode =
  | "draft"
  | "confirmed"
  | "imported"
  | "pending_import"
  | "cancelled";

export type EventCaptureMethodCode =
  | "manual_form"
  | "calendar_sync"
  | "organizer_feed";

// 活动是怎么进到 Orbit 里的。
export interface EventOriginContract extends SourceReferenceContract {
  label: string;
  captureMethod: EventCaptureMethodCode;
  provider: string;
  providerRecordId: string;
  importedAt: string;
  calendarSyncRequested: false;
  organizerFeedRequested: false;
  liveDatabaseWriteExecuted: boolean;
  externalNetworkRequested: false;
}

export interface EventEvidenceContract {
  evidenceId: string;
  source: EventOriginContract;
  excerpt: string;
  capturedAt: string;
  createdBy: string;
}

// 活动列表与详情共用的核心记录。
export interface EventRecordContract {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  status: EventStatusCode;
  sourceMetadata: EventOriginContract;
  evidence: readonly EventEvidenceContract[];
  relationshipContext: string;
  recommendedPreparation: string;
  nextAction: string;
  calendarSyncRequested: false;
  calendarProviderRequested: false;
  organizerFeedRequested: false;
  liveDatabaseWriteExecuted: boolean;
  externalNetworkRequested: false;
  aiProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}
