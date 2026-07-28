import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Text, View, StyleSheet } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { colors, spacing, typography } from "../../design/tokens";

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

  return (
    <AppScreen eyebrow="Orbit" title="设置">
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
  }
});
