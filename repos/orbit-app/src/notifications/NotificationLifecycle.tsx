import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";

import { ORBIT_API_ENDPOINTS } from "../api/endpoints";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiClient } from "../hooks/useOrbitApiClient";
import {
  isPushNotificationsOptedIn,
  onPushNotificationsOptInChanged,
  readOrCreatePushDeviceId,
  shouldRegisterPushToken,
  shouldRequestPushPermission,
} from "./push-device-session";

type NotificationsModule = {
  addNotificationResponseReceivedListener?: (listener: (response: any) => void) => { remove: () => void };
  addPushTokenListener?: (listener: (token: { data?: string }) => void) => { remove: () => void };
  getExpoPushTokenAsync: (options?: { projectId?: string }) => Promise<{ data?: string } | string>;
  getLastNotificationResponseAsync?: () => Promise<any>;
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  setNotificationHandler?: (handler: unknown) => void;
};

async function notificationsModule(): Promise<NotificationsModule | null> {
  if (Platform.OS === "web") return null;
  try {
    const loaded = (await import("expo-notifications")) as any;
    return (loaded.default ?? loaded) as NotificationsModule;
  } catch {
    // A web build or an older development client may not contain the native
    // module. The app stays usable; token registration simply remains off.
    return null;
  }
}

function deliveryIdFromNotification(response: any): string | null {
  const value = response?.notification?.request?.content?.data?.deliveryId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deliveryIdFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = Linking.parse(value);
    const path = parsed.path?.replace(/^\/+/, "") ?? "";
    const pathId = path.startsWith("notifications/")
      ? path.slice("notifications/".length)
      : "";
    const queryId = typeof parsed.queryParams?.deliveryId === "string"
      ? parsed.queryParams.deliveryId
      : "";
    const candidate = pathId || queryId;
    return candidate.trim() || null;
  } catch {
    return null;
  }
}

export function OrbitNotificationLifecycle() {
  const api = useOrbitApiClient();
  const auth = useOrbitAuthSession();

  const openDelivery = useCallback((deliveryId: string | null) => {
    if (!deliveryId || !auth.signedIn) return;
    router.push({
      params: { deliveryId },
      pathname: "/inbox"
    } as never);
  }, [auth.signedIn]);

  useEffect(() => {
    if (!auth.ready || !auth.signedIn || Platform.OS === "web") return;
    let active = true;
    let responseSubscription: { remove: () => void } | undefined;
    let tokenSubscription: { remove: () => void } | undefined;
    let linkingSubscription: { remove: () => void } | undefined;
    let optInSubscription: (() => void) | undefined;

    const register = async (notifications: NotificationsModule, tokenOverride?: string) => {
      // The app-level opt-in is an independent privacy boundary. An already
      // granted OS permission must not silently re-register a token after the
      // user has disabled Orbit's own reminder switch.
      if (!(await isPushNotificationsOptedIn())) return;
      const permission = await notifications.getPermissionsAsync();
      let permissionStatus = permission.status;
      if (permissionStatus !== "granted") {
        if (!shouldRequestPushPermission(permissionStatus, true)) {
          return;
        }
        permissionStatus = (await notifications.requestPermissionsAsync()).status;
      }
      if (!active || !shouldRegisterPushToken(permissionStatus, true)) return;
      const result = tokenOverride
        ? { data: tokenOverride }
        : await notifications.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId,
          });
      const token = typeof result === "string" ? result : result.data;
      if (!token?.trim()) return;
      const installationId = await readOrCreatePushDeviceId();
      await api.post(ORBIT_API_ENDPOINTS.pushTokens, {
        body: {
          appVersion: Constants.expoConfig?.version,
          deviceId: installationId,
          permission: "granted",
          platform: Platform.OS === "ios" ? "ios" : "android",
          token,
        },
      });
    };

    void (async () => {
      const notifications = await notificationsModule();
      if (!notifications || !active) return;
      notifications.setNotificationHandler?.({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      try {
        await register(notifications);
      } catch {
        // Permission or project configuration failures must not break the app
        // shell. The next login/app foreground can retry registration.
      }
      responseSubscription = notifications.addNotificationResponseReceivedListener?.((response) => {
        openDelivery(deliveryIdFromNotification(response));
      });
      optInSubscription = onPushNotificationsOptInChanged(() => {
        void register(notifications).catch(() => undefined);
      });
      tokenSubscription = notifications.addPushTokenListener?.((token) => {
        if (token.data) void register(notifications, token.data).catch(() => undefined);
      });
      const initial = await notifications.getLastNotificationResponseAsync?.();
      openDelivery(deliveryIdFromNotification(initial));
    })();

    linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      openDelivery(deliveryIdFromUrl(url));
    });
    void Linking.getInitialURL()
      .then((url) => openDelivery(deliveryIdFromUrl(url)))
      .catch(() => undefined);

    return () => {
      active = false;
      responseSubscription?.remove();
      tokenSubscription?.remove();
      linkingSubscription?.remove();
      optInSubscription?.();
    };
  }, [api, auth.ready, auth.signedIn, openDelivery]);

  return null;
}
