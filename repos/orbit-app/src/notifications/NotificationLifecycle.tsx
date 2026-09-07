import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useCallback, useEffect } from "react";
import { AppState, Platform } from "react-native";

import { ORBIT_API_ENDPOINTS } from "../api/endpoints";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiClient } from "../hooks/useOrbitApiClient";
import { registerNotificationDevice } from "./native-notifications";
import { createPushRegistrationSession } from "./push-registration-queue";
import {
  isPushNotificationsOptedIn,
  onPushNotificationsOptInChanged,
  readOrCreatePushDeviceId,
  shouldRegisterPushToken,
  shouldRequestPushPermission,
} from "./push-device-session";

type NotificationsModule = {
  addPushTokenListener?: (listener: (token: { data?: string }) => void) => { remove: () => void };
  getExpoPushTokenAsync: (options?: { projectId?: string }) => Promise<{ data?: string } | string>;
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
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
    const registrationSession = createPushRegistrationSession();
    let tokenSubscription: { remove: () => void } | undefined;
    let linkingSubscription: { remove: () => void } | undefined;
    let appStateSubscription: { remove: () => void } | undefined;
    let optInSubscription: (() => void) | undefined;

    const register = async (notifications: NotificationsModule, isCurrent: () => boolean, tokenOverride?: string) => {
      // The app-level opt-in is an independent privacy boundary. An already
      // granted OS permission must not silently re-register a token after the
      // user has disabled Orbit's own reminder switch.
      const optedIn = await isPushNotificationsOptedIn();
      if (!isCurrent() || !optedIn) return;
      const permission = await notifications.getPermissionsAsync();
      if (!isCurrent()) return;
      let permissionStatus = permission.status;
      if (permissionStatus !== "granted") {
        if (!shouldRequestPushPermission(permissionStatus, true)) {
          return;
        }
        permissionStatus = (await notifications.requestPermissionsAsync()).status;
      }
      if (!isCurrent() || !shouldRegisterPushToken(permissionStatus, true)) return;
      const result = tokenOverride
        ? { data: tokenOverride }
        : await notifications.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId
              ?? Constants.expoConfig?.extra?.easProjectId
              ?? Constants.easConfig?.projectId,
          });
      const token = typeof result === "string" ? result : result.data;
      if (!token?.trim()) return;
      const installationId = await readOrCreatePushDeviceId();
      const stillOptedIn = await isPushNotificationsOptedIn();
      if (!isCurrent() || !stillOptedIn) return;
      const durableRegistration = await api.post(ORBIT_API_ENDPOINTS.pushTokens, {
        body: {
          appVersion: Constants.expoConfig?.version,
          deviceId: installationId,
          permission: "granted",
          platform: Platform.OS === "ios" ? "ios" : "android",
          token,
        },
      }).catch(() => ({ success: false }));
      if (!durableRegistration.success) {
        console.warn("Orbit 收件箱推送注册未完成，将在下次回到前台时重试");
      }
      const registerLocal = await isPushNotificationsOptedIn();
      if (isCurrent() && registerLocal) {
        const localRegistration = await registerNotificationDevice(api);
        if (!localRegistration) {
          console.warn("Orbit 任务推送注册未完成，将在下次回到前台时重试");
        }
      }
    };

    void (async () => {
      const notifications = await notificationsModule();
      if (!notifications || !active) return;
      const synchronize = (tokenOverride?: string) => {
        if (!active) return;
        void registrationSession.run((isCurrent) => register(notifications, isCurrent, tokenOverride))
          .catch(() => console.warn("Orbit 推送注册未完成，将在下次回到前台时重试"));
      };
      optInSubscription = onPushNotificationsOptInChanged(() => {
        synchronize();
      });
      tokenSubscription = notifications.addPushTokenListener?.((token) => {
        if (token.data) synchronize(token.data);
      });
      appStateSubscription = AppState.addEventListener("change", (state) => {
        if (state === "active") synchronize();
      });
      synchronize();
    })();

    linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      openDelivery(deliveryIdFromUrl(url));
    });
    void Linking.getInitialURL()
      .then((url) => { if (active) openDelivery(deliveryIdFromUrl(url)); })
      .catch(() => undefined);

    return () => {
      active = false;
      registrationSession.stop();
      tokenSubscription?.remove();
      linkingSubscription?.remove();
      appStateSubscription?.remove();
      optInSubscription?.();
    };
  }, [api, auth.notificationSessionRevision, auth.ready, auth.signedIn, openDelivery]);

  return null;
}
