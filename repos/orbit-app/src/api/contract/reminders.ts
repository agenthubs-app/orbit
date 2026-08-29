export type ReminderTargetType = "task" | "schedule_item";
export type ReminderChannel = "in_app" | "ios_push";
export type NotificationPermission = "granted" | "denied" | "provisional" | "undetermined";

export interface ReminderPlanContract {
  id: string;
  targetType: ReminderTargetType;
  targetId: string;
  fireAt: string;
  timeZone: string;
  status: "scheduled" | "delivered" | "cancelled" | "failed";
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

export interface DevicePushTokenContract {
  id: string;
  deviceId: string;
  platform: "ios";
  token: string;
  permission: NotificationPermission;
  status: "active" | "revoked" | "invalid";
  lastVerifiedAt: string;
}
