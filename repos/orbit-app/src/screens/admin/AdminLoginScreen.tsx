import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { LoadingState } from "../../components/LoadingState";
import { spacing, textStyles } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { adminLoginToView } from "../../view-models/admin";

export function AdminLoginScreen() {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const view = adminLoginToView({ signedIn: auth.signedIn });

  return (
    <AppScreen eyebrow="管理员" title={view.title}>
      {!auth.ready ? <LoadingState /> : null}
      {auth.ready ? (
        <DataCard detail={view.summary} title="账号访问">
          <View style={styles.actionStack}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(view.primaryHref as Href)}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.primaryButtonText}>{view.primaryLabel}</Text>
              <Ionicons
                color={colors.onAccent}
                name={auth.signedIn ? "arrow-forward" : "log-in-outline"}
                size={17}
              />
            </Pressable>
          </View>
        </DataCard>
      ) : null}

      <DataCard detail={view.boundary} title="当前边界">
        <Text style={styles.bodyText}>
          这里不会显示“已发送”一类本地模拟结果，也不会绕过账号登录直接授予后台权限。
        </Text>
      </DataCard>
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actionStack: {
    gap: spacing.md
  },
  bodyText: {
    ...textStyles.body,
    color: colors.text2,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm
  },
  primaryButtonText: {
    ...createControlStyles(colors).primaryButtonText
  }
}));
