import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname, type Href } from "expo-router";
import type { PropsWithChildren, ReactElement } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing, typography } from "../design/tokens";

interface AppScreenProps extends PropsWithChildren {
  eyebrow?: string;
  refreshControl?: ReactElement<RefreshControlProps>;
  showBack?: boolean;
  title: string;
}

export function AppScreen({
  children,
  eyebrow,
  refreshControl,
  showBack,
  title
}: AppScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const canGoBack = router.canGoBack();
  // Orbit AI is the only home, so a screen opened without history still needs a
  // way back to it now that the bottom tab bar is gone.
  const navVisible = showBack ?? (canGoBack || pathname !== "/ai");

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={refreshControl}
      >
        <View style={styles.header}>
          {navVisible ? (
            <Pressable
              accessibilityLabel={canGoBack ? "返回" : "回到 Orbit AI"}
              accessibilityRole="button"
              onPress={() =>
                canGoBack ? router.back() : router.replace("/ai" as Href)
              }
              style={({ pressed }) => [
                styles.backButton,
                pressed ? styles.backButtonPressed : null
              ]}
            >
              <Ionicons
                color={colors.ink}
                name={canGoBack ? "chevron-back" : "sparkles-outline"}
                size={20}
              />
            </Pressable>
          ) : null}
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text adjustsFontSizeToFit numberOfLines={2} style={styles.title}>
            {title}
          </Text>
        </View>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    marginBottom: spacing.xs,
    marginLeft: -spacing.xs,
    width: 44
  },
  backButtonPressed: {
    opacity: 0.72
  },
  body: {
    gap: 14
  },
  content: {
    alignSelf: "center",
    gap: spacing.lg,
    maxWidth: 540,
    paddingBottom: 96,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    width: "100%"
  },
  eyebrow: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  header: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs
  },
  safeArea: {
    backgroundColor: colors.bgSoft,
    flex: 1
  },
  title: {
    color: colors.ink,
    fontSize: typography.display,
    fontWeight: "700",
    lineHeight: 29
  }
});
