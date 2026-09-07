// 跨客户端契约：主动提醒的设备注册、投递账本和偏好。
// Push payload 只携带 opaque deliveryId；token 永远不属于响应契约。

export type PushDevicePlatformCode = "ios" | "android" | "web";
export type PushPermissionStateCode = "granted" | "denied" | "undetermined";

export interface PushDeviceContract {
  deviceId: string;
  platform: PushDevicePlatformCode;
  permission: PushPermissionStateCode;
  appVersion?: string;
  registeredAt: string;
  updatedAt: string;
  revokedAt?: string;
  active: boolean;
}

export type NotificationDeliveryPhaseCode =
  | "pre_event"
  | "post_event"
  | "commitment";
export type NotificationDeliveryChannelCode = "push" | "in_app";
export type NotificationDeliveryStatusCode =
  | "scheduled"
  | "processing"
  | "receipt_pending"
  | "sent"
  | "retry_scheduled"
  | "suppressed"
  | "failed"
  | "dead_letter";

export interface NotificationDeliveryContract {
  deliveryId: string;
  signalId: string;
  signalRevision: string;
  phase: NotificationDeliveryPhaseCode;
  channel: NotificationDeliveryChannelCode;
  status: NotificationDeliveryStatusCode;
  title: string;
  body: string;
  data: Readonly<{ deliveryId: string }>;
  target: {
    deliveryId: string;
    kind: "inbox";
  };
  scheduledFor: string;
  availableAt: string;
  attempt: number;
  maxAttempts: number;
  providerReceiptId?: string;
  lastError?: string;
  suppressionReason?: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
}

export interface AgentReminderPreferencesContract {
  preEventBriefPushEnabled: boolean;
  postEventReminderPushEnabled: boolean;
  followupDuePushEnabled: boolean;
  quietHours: {
    start: string;
    end: string;
  };
  timeZone: string;
  updatedAt: string;
}
