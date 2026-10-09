import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../i18n/standard-copy";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname, type Href } from "expo-router";
import type { PropsWithChildren, ReactElement, ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps, PixelRatio } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { layout, spacing, textStyles } from "../design/tokens";
import { createThemedStyles } from "../design/theme";
import { useMobileViewport } from "../platform/use-mobile-viewport";
import { mainTabForPath, parentForPath } from "../view-models/app-navigation";
import { OrbitTabBar } from "./OrbitTabBar";

interface AppScreenProps extends PropsWithChildren {
  backAccessibilityLabel?: string;
  backLabel?: string;
  eyebrow?: string;
  header?: ReactNode;
  headerActions?: ReactNode;
  headerVariant?: "large" | "compact";
  onBack?: () => void;
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
  onBack,
  refreshControl,
  showBack,
  title,
  titleAccessory
}: AppScreenProps) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const viewport = useMobileViewport();
  const canGoBack = router.canGoBack();
  const mainTab = mainTabForPath(pathname);
  const locale = useOrbitLocale();
  const copy = useStandardCopy();
  const parent = parentForPath(pathname, locale.t);
  // Like iOS: when the destination name would not fit (large text, long name), the
  // back button says just 戻る / 返回 / Back; the accessibility label keeps the name.
  const genericBack = canGoBack || PixelRatio.getFontScale() >= 1.5 || parent.label.length > 12;
  const navVisible = showBack ?? (!mainTab && pathname !== "/ai");

  return (
    <SafeAreaView
      edges={["top"]}
      style={[
        styles.safeArea,
        viewport.visibleHeight === null
          ? null
          : { height: viewport.visibleHeight, maxHeight: viewport.visibleHeight }
      ]}
    >
      {navVisible ? (
        <View style={styles.navigation}>
          <Pressable accessibilityLabel={backAccessibilityLabel ?? (canGoBack ? copy.nav.back : fillCopy(copy.nav.backTo, { label: parent.label }))} accessibilityRole="button"
            onPress={onBack ?? (() => canGoBack ? router.back() : router.replace(parent.href as Href))}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
            <Ionicons color={colors.accentText} name="chevron-back" size={20} />
            <Text numberOfLines={1} style={styles.backLabel}>{backLabel ?? (genericBack ? copy.nav.back : parent.label)}</Text>
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
  backLabel: { color: colors.accentText, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  navigation: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 16, paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: colors.line },
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
    color: colors.ink3Text,
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
