import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../i18n/standard-copy";
import { useRouter, usePathname, type Href } from "expo-router";
import { useRef, type PropsWithChildren, type ReactElement, type ReactNode } from "react";
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
import { rememberScroll, rememberedScroll, shellScrollKey } from "../view-models/shell-state";
import { useAppScreenEmbedding } from "./AppScreenEmbedding";
import { TAB_BAR_CLEARANCE } from "./shell-metrics";
import { Icon } from "./ui/Icon";

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
  // R05: the shell draws the tab bar (root layout). A tab page — or a Task segment —
  // remembers its scroll offset so coming back to it lands where the user left.
  const embedded = useAppScreenEmbedding();
  const scrollKey = embedded ? shellScrollKey("/task", embedded.segment) : mainTab ? shellScrollKey(pathname) : null;
  const scroll = useScrollMemory(scrollKey);

  if (embedded) {
    return (
      <ScrollView
        {...scroll.props}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, styles.tabContent]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        <View style={styles.body}>{children}</View>
      </ScrollView>
    );
  }

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
            <Icon color={colors.accentText} name="left" size={20} />
            <Text numberOfLines={1} style={styles.backLabel}>{backLabel ?? (genericBack ? copy.nav.back : parent.label)}</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.navigationTitle}>{title}</Text>
          <View style={styles.navigationActions}>{headerActions}</View>
        </View>
      ) : null}
      <ScrollView
        {...scroll.props}
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
    </SafeAreaView>
  );
}

// Restores the remembered offset once the content is tall enough to reach it
// (contentOffset alone is iOS-only and clamps while data is still loading), then
// keeps recording it while the user scrolls. A drag before that cancels the restore.
function useScrollMemory(key: string | null) {
  const ref = useRef<ScrollView>(null);
  const pending = useRef(key ? rememberedScroll(key) : 0);
  const size = useRef({ viewport: 0, content: 0 });
  if (!key) return { props: {} };
  // Pages fill in as their data arrives: restore once the remembered offset can be reached.
  const tryRestore = () => {
    const { viewport, content } = size.current;
    if (pending.current > 0 && viewport > 0 && content - viewport >= pending.current) {
      ref.current?.scrollTo({ x: 0, y: pending.current, animated: false });
      pending.current = 0;
    }
  };
  return {
    props: {
      ref,
      scrollEventThrottle: 100,
      onScrollBeginDrag: () => { pending.current = 0; },
      onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
        if (pending.current === 0) rememberScroll(key, event.nativeEvent.contentOffset.y);
      },
      onLayout: (event: { nativeEvent: { layout: { height: number } } }) => { size.current.viewport = event.nativeEvent.layout.height; tryRestore(); },
      onContentSizeChange: (_width: number, height: number) => { size.current.content = height; tryRestore(); }
    }
  };
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
  tabContent: { paddingBottom: TAB_BAR_CLEARANCE },
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
