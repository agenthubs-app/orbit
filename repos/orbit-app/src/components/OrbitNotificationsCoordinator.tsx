import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { useCallback, useEffect } from "react";
import { AppState, Platform } from "react-native";

import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiClient } from "../hooks/useOrbitApiClient";
import {
  createNotificationResponseGuard,
  notificationHrefFromDeepLink,
} from "../notifications/notification-model";
import {
  cancelOrbitManagedNotifications,
  getReminderNotificationGeneration,
  onReminderPlansChanged,
  syncReminderNotifications,
} from "../notifications/native-notifications";

const responseGuard = createNotificationResponseGuard();

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    async handleNotification(notification) {
      const deliveryId = notification.request.content.data?.deliveryId;
      const durableDelivery = typeof deliveryId === "string" && Boolean(deliveryId.trim());
      return {
        shouldPlaySound: !durableDelivery,
        shouldSetBadge: durableDelivery,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
}

function openNotification(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data;
  const deliveryId = typeof data?.deliveryId === "string" ? data.deliveryId.trim() : "";
  const href = notificationHrefFromDeepLink(data?.deepLink);
  if (!deliveryId && !href) return;
  const notificationId = response.notification.request.identifier;
  if (!responseGuard.shouldHandle(notificationId, response.actionIdentifier)) return;
  if (deliveryId) {
    router.push({ pathname: "/inbox", params: { deliveryId } } as Href);
  } else if (href) {
    router.push(href as Href);
  }
}

export function OrbitNotificationsCoordinator() {
  const { notificationSessionRevision, ready, signedIn } = useOrbitAuthSession();
  const client = useOrbitApiClient();

  const synchronize = useCallback(async (generation: number) => {
    if (!ready || !signedIn || Platform.OS !== "ios") return;
    await syncReminderNotifications(client, generation);
  }, [client, ready, signedIn]);

  useEffect(() => {
    if (!ready || !signedIn || Platform.OS === "web") return;
    let active = true;
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (active) openNotification(response);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active && response) openNotification(response);
    }).catch(() => {
      console.warn("Orbit 无法读取最近的通知入口");
    });
    return () => {
      active = false;
      responseSubscription.remove();
    };
  }, [ready, signedIn]);

  useEffect(() => {
    if (ready && !signedIn && Platform.OS === "ios") {
      void cancelOrbitManagedNotifications();
    }
  }, [ready, signedIn]);

  useEffect(() => {
    if (!ready || !signedIn || Platform.OS !== "ios") return;
    const generation = getReminderNotificationGeneration();
    void synchronize(generation);
    const unsubscribe = onReminderPlansChanged(() => void synchronize(generation));
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void synchronize(generation);
    });
    return () => {
      unsubscribe();
      appStateSubscription.remove();
      void cancelOrbitManagedNotifications().catch(() => {
        console.warn("Orbit 未能清除旧账号的本地提醒");
      });
    };
  }, [notificationSessionRevision, ready, signedIn, synchronize]);

  return null;
}
