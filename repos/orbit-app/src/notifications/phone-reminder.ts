import { Linking, Platform } from "react-native";

import type { OrbitApiClient } from "../api/client";
import { changeNotificationOptIn } from "../screens/settings/notifications/notification-permission-control";

/**
 * agent-design AG16 (approved draft 16-3, App): whether this phone will show a scheduled task's reminder. The App
 * already has 「在这台 iPhone 上接收通知」 (notification settings); this reuses it — the same opt-in and the same system
 * permission — instead of a second switch. Allowing here turns that opt-in on (the existing lifecycle then registers
 * the phone); 「不在这台手机上提醒」 turns it off and revokes the phone's registration, as the settings switch does.
 *
 * not_asked: the system has not asked yet (allowing makes iOS show its own prompt). on: allowed and opted in.
 * off: allowed by the system, turned off in Orbit. blocked: refused in the system — only the Settings app can change it.
 */
export type PhoneReminderState = "on" | "not_asked" | "off" | "blocked";
export type PhonePermission = "granted" | "denied" | "undetermined";

export function phoneReminderState(permission: PhonePermission, optedIn: boolean): PhoneReminderState {
  if (permission === "denied") return "blocked";
  if (permission === "undetermined") return "not_asked";
  return optedIn ? "on" : "off";
}

export interface PhoneReminderDevice {
  read(): Promise<PhoneReminderState>;
  /** Only from the owner's press: the system's own prompt appears here when it has not asked yet. */
  allow(): Promise<PhoneReminderState>;
  stop(): Promise<PhoneReminderState>;
  openSettings(): Promise<void>;
}

const permissionOf = (status: string): PhonePermission => (status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");

/**
 * The real phone; null where the App has no phone notifications (its web build). Without a client (the line under a
 * card, which never offers to stop) the phone's registration cannot be revoked and stopping reports failure.
 */
export function nativePhoneReminderDevice(client: OrbitApiClient | null): PhoneReminderDevice | null {
  if (Platform.OS === "web") return null;
  const notifications = async () => {
    const loaded = (await import("expo-notifications")) as unknown as { default?: unknown };
    return (loaded.default ?? loaded) as { getPermissionsAsync(): Promise<{ status: string }>; requestPermissionsAsync(): Promise<{ status: string }> };
  };
  const session = () => import("./push-device-session");
  const permission = async () => permissionOf((await (await notifications()).getPermissionsAsync()).status);
  const read = async () => phoneReminderState(await permission(), await (await session()).isPushNotificationsOptedIn());
  const change = async (enabled: boolean) => {
    const pushSession = await session();
    await changeNotificationOptIn(enabled, {
      getPermission: permission,
      requestPermission: async () => permissionOf((await (await notifications()).requestPermissionsAsync()).status),
      revoke: async () => (client ? pushSession.revokeRegisteredPushDevice({ client }) : false),
      setOptIn: pushSession.setPushNotificationsOptIn,
    });
    return read();
  };
  return { allow: () => change(true), openSettings: () => Linking.openSettings(), read, stop: () => change(false) };
}
