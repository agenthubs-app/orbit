import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { colors, spacing, typography } from "../../design/tokens";
import {
  isPushNotificationsOptedIn,
  revokeRegisteredPushDevice,
  setPushNotificationsOptIn
} from "../../notifications/push-device-session";

const settingsDestinations = [
  {
    detail: "账号、工作区与登录状态",
    href: "/account",
    icon: "person-circle-outline",
    title: "账号"
  },
  {
    detail: "日历、通知、相机和联系人能力",
    href: "/account/permissions",
    icon: "shield-checkmark-outline",
    title: "权限中心",
    requiresAuthentication: true
  },
  {
    detail: "本地调试或真机测试使用的 Orbit API 地址",
    href: "/settings/api",
    icon: "server-outline",
    title: "服务器"
  }
] as const;

export function SettingsScreen() {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const [pushOptIn, setPushOptIn] = useState<boolean | null>(null);
  const [pushOptInBusy, setPushOptInBusy] = useState(false);

  useEffect(() => {
    if (!auth.signedIn) {
      setPushOptIn(null);
      return;
    }
    let active = true;
    void isPushNotificationsOptedIn().then((enabled) => {
      if (active) setPushOptIn(enabled);
    });
    return () => {
      active = false;
    };
  }, [auth.signedIn]);

  async function enablePushNotifications() {
    setPushOptInBusy(true);
    try {
      await setPushNotificationsOptIn(true);
      setPushOptIn(true);
    } finally {
      setPushOptInBusy(false);
    }
  }

  async function disablePushNotifications() {
    setPushOptInBusy(true);
    try {
      await revokeRegisteredPushDevice({
        baseUrl,
        cookieHeader: auth.cookieHeader
      });
      await setPushNotificationsOptIn(false);
      setPushOptIn(false);
    } finally {
      setPushOptInBusy(false);
    }
  }

  return (
    <AppScreen eyebrow="Orbit" title="设置">
      {auth.signedIn ? (
        <DataCard
          detail="会前准备、待跟进和关系提醒；锁屏只显示通用摘要。"
          title="关键提醒"
        >
          <Text style={styles.notificationBody}>
            先看提醒价值，再由你明确开启系统通知。已允许通知时，Orbit 会在前后台同步当前设备。
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={pushOptInBusy}
            onPress={() =>
              void (pushOptIn === true
                ? disablePushNotifications()
                : enablePushNotifications())
            }
            style={({ pressed }) => [
              styles.action,
              pressed && styles.actionPressed,
              pushOptInBusy && styles.actionDisabled
            ]}
          >
            <Text style={styles.actionText}>
              {pushOptInBusy
                ? "正在准备…"
                : pushOptIn === true
                  ? "关闭关键提醒"
                  : "开启关键提醒"}
            </Text>
          </Pressable>
        </DataCard>
      ) : null}
      {settingsDestinations
        .filter(
          (destination) =>
            !("requiresAuthentication" in destination) ||
            !destination.requiresAuthentication ||
            auth.signedIn
        )
        .map((destination) => (
          <DataCard
            detail={destination.detail}
            key={destination.href}
            onPress={() => router.push(destination.href as Href)}
            title={destination.title}
          >
            <View style={styles.destination}>
              <Ionicons
                color={colors.accent}
                name={destination.icon}
                size={20}
              />
              <Text style={styles.destinationText}>打开{destination.title}</Text>
            </View>
          </DataCard>
        ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  destination: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  destinationText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "600"
  },
  notificationBody: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20,
    marginBottom: spacing.md
  },
  action: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  actionPressed: {
    opacity: 0.82
  },
  actionDisabled: {
    opacity: 0.55
  },
  actionText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  }
});
