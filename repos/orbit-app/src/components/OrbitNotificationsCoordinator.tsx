import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { useCallback, useEffect } from "react";
import { AppState, Platform } from "react-native";

import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { serverReachability } from "../api/server-reachability";
import { useOrbitApiClient } from "../hooks/useOrbitApiClient";
import { useSyncCoordinatorSession } from "../hooks/useSyncedCollection";
import { startOutboxUploadTriggers, syncThenNavigate } from "../data/sync/outbox-upload-triggers";
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
        shouldPlaySound: !durableDelivery || notification.request.content.sound === 'default',
        shouldSetBadge: durableDelivery,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
}

function openNotification(
  response: Notifications.NotificationResponse,
  session: ReturnType<typeof useSyncCoordinatorSession>,
): void {
  const data = response.notification.request.content.data;
  const deliveryId = typeof data?.deliveryId === "string" ? data.deliveryId.trim() : "";
  const href = notificationHrefFromDeepLink(data?.deepLink);
  if (!deliveryId && !href) return;
  const notificationId = response.notification.request.identifier;
  if (!responseGuard.shouldHandle(notificationId, response.actionIdentifier)) return;
  if (!session) return;
  void syncThenNavigate(session, () => {
    if (deliveryId) router.push({ pathname: "/inbox", params: { deliveryId } } as Href);
    else if (href) router.push(href as Href);
  });
}

export function OrbitNotificationsCoordinator() {
  const { notificationSessionRevision, ready, signedIn } = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const { baseUrl, ready: baseUrlReady } = useOrbitApiBaseUrl();
  const syncSession = useSyncCoordinatorSession(ready && signedIn);
  const syncOutbox = useCallback(() => {
    if (!syncSession?.isCurrent()) return;
    void syncSession.synchronize("note", { reason: "explicit" }).promise.catch(() => undefined);
  }, [syncSession]);

  useEffect(() => {
    if (!ready || !signedIn || !baseUrlReady || !syncSession || Platform.OS === "web") return;
    // Sprint 0136: cold start, foreground, network restored and the 15-second poll in one place.
    return startOutboxUploadTriggers({ syncOutbox, appState: AppState, reachability: serverReachability, baseUrl });
  }, [baseUrl, baseUrlReady, client, ready, signedIn, syncOutbox, syncSession]);

  const synchronize = useCallback(async (generation: number) => {
    if (!ready || !signedIn || Platform.OS !== "ios") return;
    await syncReminderNotifications(client, generation).catch(() => {
      console.warn('Orbit 提醒交接未完成，将在下次回到前台时重试');
    });
  }, [client, ready, signedIn]);

  useEffect(() => {
    if (!ready || !signedIn || !syncSession || Platform.OS === "web") return;
    let active = true;
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (active) openNotification(response, syncSession);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active && response) openNotification(response, syncSession);
    }).catch(() => {
      console.warn("Orbit 无法读取最近的通知入口");
    });
    return () => {
      active = false;
      responseSubscription.remove();
    };
  }, [notificationSessionRevision, ready, signedIn, syncSession]);

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
