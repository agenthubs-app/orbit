export type ReminderTargetType = "task" | "schedule_item";
export type ReminderChannel = "in_app" | "ios_push";
export type ReminderPlanStatus = "scheduled" | "delivered" | "cancelled" | "failed";
export type NotificationPermission = "granted" | "denied" | "provisional" | "undetermined";

export interface ReminderPlanDTO {
  id: string;
  accountId: string;
  ownerUserId: string;
  targetType: ReminderTargetType;
  targetId: string;
  fireAt: string;
  timeZone: string;
  status: ReminderPlanStatus;
  channels: readonly ReminderChannel[];
  title: string;
  body: string;
  deepLink: string;
  createdBy: "user" | "agent_confirmed";
  deliveredAt?: string;
  cancelledAt?: string;
  failureCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DevicePushTokenDTO {
  id: string;
  accountId: string;
  ownerUserId: string;
  deviceId: string;
  platform: "ios";
  token: string;
  permission: NotificationPermission;
  status: "active" | "revoked" | "invalid";
  lastVerifiedAt: string;
  invalidatedAt?: string;
  failureCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timeZone: string;
}

export interface NotificationPreferencesDTO {
  accountId: string;
  ownerUserId: string;
  inAppEnabled: boolean;
  iosPushEnabled: boolean;
  lockScreenContent: "full" | "private";
  quietHours: QuietHours;
  updatedAt: string;
}

export interface NotificationDeliveryDTO {
  id: string;
  accountId: string;
  ownerUserId: string;
  reminderPlanId: string;
  deviceId?: string;
  channel: ReminderChannel;
  fireAt: string;
  status: "claimed" | "delivered" | "failed" | "suppressed";
  providerMessageId?: string;
  failureCode?: string;
  deliveredAt?: string;
  openedAt?: string;
  userAction?: "opened" | "completed" | "snoozed";
  createdAt: string;
  updatedAt: string;
}

export interface NotificationAvailabilityDTO {
  inAppAvailable: boolean;
  iosPushAvailable: boolean;
  permission: NotificationPermission;
}
