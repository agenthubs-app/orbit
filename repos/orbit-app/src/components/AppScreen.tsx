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
import { layout, spacing, textStyles } from "../design/tokens";
import { createThemedStyles } from "../design/theme";

interface AppScreenProps extends PropsWithChildren {
  eyebrow?: string;
  headerVariant?: "large" | "compact";
  refreshControl?: ReactElement<RefreshControlProps>;
  showBack?: boolean;
  title: string;
}

export function AppScreen({
  children,
  eyebrow,
  headerVariant = "large",
  refreshControl,
  showBack,
  title
}: AppScreenProps) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const canGoBack = router.canGoBack();
  // Orbit AI is the only home, so a screen opened without history still needs a
  // way back to it now that the bottom tab bar is gone.
  const navVisible = showBack ?? (canGoBack || pathname !== "/ai");

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
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
          {eyebrow && eyebrow.trim().toLowerCase() !== "orbit" ? (
            <Text style={styles.eyebrow}>{eyebrow}</Text>
          ) : null}
          <Text accessibilityRole="header" style={[styles.title, headerVariant === "compact" ? styles.compactTitle : null]}>
            {title}
          </Text>
        </View>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: layout.toolbar,
    justifyContent: "center",
    marginBottom: spacing.xs,
    minWidth: layout.toolbar
  },
  backButtonPressed: {
    opacity: 0.72
  },
  body: {
    gap: spacing.lg
  },
  content: {
    alignSelf: "center",
    gap: spacing.lg,
    maxWidth: layout.contentMax,
    paddingBottom: layout.contentBottom,
    paddingHorizontal: layout.pageInset,
    paddingTop: spacing.md,
    width: "100%"
  },
  eyebrow: {
    ...textStyles.caption,
    color: colors.text3,
    fontWeight: "600"
  },
  header: {
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  safeArea: {
    backgroundColor: colors.surface,
    flex: 1
  },
  title: {
    ...textStyles.pageTitle,
    color: colors.ink
  },
  compactTitle: {
    ...textStyles.title
  }
}));
