import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { layout, spacing, textStyles } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";

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
  const { colors, styles } = useStyles();
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
          <Pressable
            accessibilityLabel={`打开${destination.title}`}
            accessibilityRole="button"
            key={destination.href}
            onPress={() => router.push(destination.href as Href)}
            style={({ pressed }) => [styles.destination, pressed ? styles.pressed : null]}
          >
            <Ionicons color={colors.accent} name={destination.icon} size={20} />
            <View style={styles.destinationCopy}>
              <Text style={styles.destinationText}>{destination.title}</Text>
              <Text style={styles.destinationDetail}>{destination.detail}</Text>
            </View>
            <Ionicons color={colors.text3} name="chevron-forward" size={16} />
          </Pressable>
        ))}
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  destination: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: layout.control,
    paddingVertical: spacing.lg
  },
  destinationCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  destinationText: {
    ...textStyles.listTitle,
    color: colors.text
  },
  destinationDetail: {
    ...textStyles.small,
    color: colors.text3
  },
  pressed: {
    opacity: 0.82
  }
}));
