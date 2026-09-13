import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { AppScreen } from "../../components/AppScreen";
import { createThemedStyles } from "../../design/theme";
import { revokeNotificationDevice } from "../../notifications/native-notifications";
import { revokePushDeviceRegistrations } from "../../notifications/push-registration-queue";
import {
  isPushNotificationsOptedIn,
  revokeRegisteredPushDevice,
  setPushNotificationsOptIn
} from "../../notifications/push-device-session";

const settingsDestinations = [
  {
    detail: "账号、工作区与登录状态",
    href: "/account",
    section: "账号",
    title: "账号"
  },
  {
    detail: "日历、通知、相机和联系人能力",
    href: "/account/permissions",
    section: "通用",
    title: "权限中心",
    requiresAuthentication: true
  },
  {
    detail: "本地调试或真机测试使用的 Orbit API 地址",
    href: "/settings/api",
    section: "服务器",
    title: "服务器"
  }
] as const;

export function SettingsScreen() {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const { baseUrl } = useOrbitApiBaseUrl();
  const [pushOptIn, setPushOptIn] = useState<boolean | null>(null);
  const [pushOptInBusy, setPushOptInBusy] = useState(false);
  const [pushOptInError, setPushOptInError] = useState("");

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
    setPushOptInError("");
    try {
      await setPushNotificationsOptIn(false);
      setPushOptIn(false);
      const revoked = await revokePushDeviceRegistrations([
        () => revokeNotificationDevice(client),
        () => revokeRegisteredPushDevice({ baseUrl, cookieHeader: auth.cookieHeader }),
      ]);
      if (!revoked) setPushOptInError("通知解绑未完成，请重试关闭。");
    } catch {
      setPushOptInError("通知解绑未完成，请重试关闭。");
    } finally {
      setPushOptInBusy(false);
    }
  }

  return (
    <AppScreen eyebrow="Orbit" title="设置">
      <View style={styles.sections}>
        {(["通用", "账号", "服务器"] as const).map((section) => section === "通用" && !auth.signedIn ? null : (
          <View key={section} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{section}</Text>
            <View style={styles.sectionRows}>
              {section === "通用" && auth.signedIn ? <>
                <Pressable
                  accessibilityLabel={pushOptInBusy ? "正在准备…" : pushOptIn === null ? "正在读取关键提醒状态" : pushOptInError ? "重试关闭关键提醒" : pushOptIn === true ? "关闭关键提醒" : "开启关键提醒"}
                  accessibilityHint="会前准备、待跟进和关系提醒；锁屏只显示通用摘要。"
                  accessibilityRole="button"
                  disabled={pushOptInBusy || pushOptIn === null}
                  onPress={() =>
                    void (pushOptIn === true
                      ? disablePushNotifications()
                      : pushOptInError
                        ? disablePushNotifications()
                        : enablePushNotifications())
                  }
                  style={({ pressed }) => [
                    styles.destination,
                    pressed && styles.pressed,
                    pushOptInBusy && styles.actionDisabled
                  ]}
                >
                  <Text style={styles.destinationText}>关键提醒</Text>
                  <Text style={styles.valueText}>
                    {pushOptInBusy
                      ? "正在准备…"
                      : pushOptInError
                        ? "重试关闭"
                        : pushOptIn === null
                          ? "读取中…"
                          : pushOptIn === true
                            ? "开启"
                            : "关闭"}
                  </Text>
                </Pressable>
                <Text style={styles.notificationBody}>
                  会前准备、待跟进和关系提醒；锁屏只显示通用摘要。先由你明确开启系统通知；已允许时，Orbit 会在前后台同步当前设备。
                </Text>
                {pushOptInError ? <Text accessibilityRole="alert" style={styles.errorText}>{pushOptInError}</Text> : null}
              </> : null}
              {settingsDestinations
                .filter(
                  (destination) =>
                    destination.section === section && (
                      !("requiresAuthentication" in destination) ||
                      !destination.requiresAuthentication ||
                      auth.signedIn)
                )
                .map((destination) => (
                  <Pressable
                    accessibilityLabel={`打开${destination.title}`}
                    accessibilityHint={destination.detail}
                    accessibilityRole="button"
                    key={destination.href}
                    onPress={() => router.push(destination.href as Href)}
                    style={({ pressed }) => [styles.destination, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.destinationText}>{destination.href === "/account" ? "账号与工作区" : destination.title}</Text>
                    <Ionicons color={colors.text3} name="chevron-forward" size={16} />
                  </Pressable>
                ))}
            </View>
            {section === "服务器" ? <Text style={styles.notificationBody}>本地调试或真机测试使用的 Orbit API 地址</Text> : null}
          </View>
        ))}
      </View>
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  sections: { gap: 22, paddingTop: 8 },
  section: { gap: 6 },
  sectionTitle: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  sectionRows: { borderTopColor: colors.border, borderTopWidth: 1 },
  destination: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 50,
    paddingVertical: 13.5
  },
  destinationText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22
  },
  notificationBody: {
    color: colors.text3,
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 8
  },
  actionDisabled: {
    opacity: 0.55
  },
  valueText: { color: colors.muted, flexShrink: 1, fontSize: 14, lineHeight: 20, textAlign: "right" },
  errorText: { color: colors.rose, fontSize: 13, lineHeight: 20, paddingVertical: 8 },
  pressed: {
    opacity: 0.82
  }
}));
