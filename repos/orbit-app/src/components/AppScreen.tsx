import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname, type Href } from "expo-router";
import type { PropsWithChildren, ReactElement, ReactNode } from "react";
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
import { mainTabForPath, parentForPath } from "../view-models/app-navigation";
import { OrbitTabBar } from "./OrbitTabBar";

interface AppScreenProps extends PropsWithChildren {
  backAccessibilityLabel?: string;
  backLabel?: string;
  eyebrow?: string;
  header?: ReactNode;
  headerActions?: ReactNode;
  headerVariant?: "large" | "compact";
  refreshControl?: ReactElement<RefreshControlProps>;
  showBack?: boolean;
  title: string;
  titleAccessory?: ReactNode;
}

export function AppScreen({
  backAccessibilityLabel,
  backLabel,
  children,
  eyebrow,
  header,
  headerActions,
  headerVariant = "large",
  refreshControl,
  showBack,
  title,
  titleAccessory
}: AppScreenProps) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const canGoBack = router.canGoBack();
  const mainTab = mainTabForPath(pathname);
  const parent = parentForPath(pathname);
  const navVisible = showBack ?? (!mainTab && pathname !== "/ai");

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {navVisible ? (
        <View style={styles.navigation}>
          <Pressable accessibilityLabel={backAccessibilityLabel ?? (canGoBack ? "返回" : "返回" + parent.label)} accessibilityRole="button"
            onPress={() => canGoBack ? router.back() : router.replace(parent.href as Href)}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
            <Ionicons color={colors.accent} name="chevron-back" size={20} />
            <Text style={styles.backLabel}>{backLabel ?? (canGoBack ? "返回" : parent.label)}</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.navigationTitle}>{title}</Text>
          <View style={styles.navigationActions}>{headerActions}</View>
        </View>
      ) : null}
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, mainTab && styles.tabContent]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {header ?? (!navVisible ? <View style={styles.header}>
          {eyebrow && eyebrow.trim().toLowerCase() !== "orbit" ? (
            <Text style={styles.eyebrow}>{eyebrow}</Text>
          ) : null}
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={[styles.title, headerVariant === "compact" ? styles.compactTitle : null]}>{title}</Text>
            {titleAccessory}
            {headerActions ? <View style={styles.headerActions}>{headerActions}</View> : null}
          </View>
        </View> : eyebrow && eyebrow.trim().toLowerCase() !== "orbit" ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null)}
        <View style={styles.body}>{children}</View>
      </ScrollView>
      {mainTab ? <OrbitTabBar active={mainTab} /> : null}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    minHeight: layout.toolbar,
    justifyContent: "center",
    minWidth: layout.toolbar
  },
  backLabel: { color: colors.accent, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  navigation: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 16, paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
  navigationTitle: { flex: 1, color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "800", textAlign: "center" },
  navigationActions: { minWidth: 44, maxWidth: "30%", flexShrink: 1 },
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
  tabContent: { paddingBottom: 140 },
  eyebrow: {
    ...textStyles.caption,
    color: colors.text3,
    fontWeight: "600"
  },
  header: {
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerActions: { marginLeft: "auto", flexDirection: "row", flexShrink: 0 },
  safeArea: {
    backgroundColor: colors.surface,
    flex: 1
  },
  title: {
    ...textStyles.pageTitle,
    color: colors.ink,
    flexShrink: 1
  },
  compactTitle: {
    ...textStyles.title
  }
}));
