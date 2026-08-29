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
  onReminderPlansChanged,
  registerNotificationDevice,
  syncReminderNotifications,
} from "../notifications/native-notifications";

const responseGuard = createNotificationResponseGuard();

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    async handleNotification() {
      return {
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
}

function openNotification(response: Notifications.NotificationResponse): void {
  const notificationId = response.notification.request.identifier;
  if (!responseGuard.shouldHandle(notificationId, response.actionIdentifier)) return;
  const href = notificationHrefFromDeepLink(response.notification.request.content.data?.deepLink);
  if (href) router.push(href as Href);
}

export function OrbitNotificationsCoordinator() {
  const { ready, signedIn } = useOrbitAuthSession();
  const client = useOrbitApiClient();

  const synchronize = useCallback(async () => {
    if (!ready || !signedIn || Platform.OS !== "ios") return;
    await syncReminderNotifications(client);
    await registerNotificationDevice(client);
  }, [client, ready, signedIn]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openNotification(response);
    });
    return () => responseSubscription.remove();
  }, []);

  useEffect(() => {
    if (ready && !signedIn && Platform.OS === "ios") {
      void cancelOrbitManagedNotifications();
    }
  }, [ready, signedIn]);

  useEffect(() => {
    if (!ready || !signedIn || Platform.OS !== "ios") return;
    void synchronize();
    const unsubscribe = onReminderPlansChanged(() => void synchronize());
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void synchronize();
    });
    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [ready, signedIn, synchronize]);

  return null;
}
