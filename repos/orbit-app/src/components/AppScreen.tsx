import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../i18n/standard-copy";
import { useRouter, usePathname, type Href } from "expo-router";
import { useRef, type PropsWithChildren, type ReactElement, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { layout, spacing, textStyles } from "../design/tokens";
import { createThemedStyles } from "../design/theme";
import { useMobileViewport } from "../platform/use-mobile-viewport";
import { mainTabForPath, parentForPath } from "../view-models/app-navigation";
import { rememberScroll, rememberedScroll, shellScrollKey } from "../view-models/shell-state";
import { useAppScreenEmbedding } from "./AppScreenEmbedding";
import { TabPageBar } from "./TabPageBar";
import { ShellBackground } from "./ShellBackground";
import { SHELL_GUTTER, ShellTopBar, useShellTopGap } from "./ShellTopBar";
import { TAB_BAR_CLEARANCE } from "./shell-metrics";
import { IconButton } from "./ui/IconButton";

interface AppScreenProps extends PropsWithChildren {
  backAccessibilityLabel?: string;
  backLabel?: string;
  /** "x" for a form that cancels (kit 手入力: ✕ top-left); the default ‹ goes back. */
  backIcon?: "left" | "x" | "down";
  eyebrow?: string;
  header?: ReactNode;
  headerActions?: ReactNode;
  headerVariant?: "large" | "compact";
  /**
   * R31a (R12 REWORK-REPORT-app §5): "kit" = kit .scroll — content right under the top bar (no extra 12) with the 18
   * gutter; the redesigned pages use it. "legacy" (default) keeps the old 12 / 16 for the old screens until their
   * feature Sprint rewrites them (their tests and layouts assume it).
   */
  inset?: "kit" | "legacy";
  onBack?: () => void;
  refreshControl?: ReactElement<RefreshControlProps>;
  showBack?: boolean;
  /** Secondary pages: small line under the centred title (kit .topbar .t small). */
  subtitle?: string | undefined;
  title: string;
  titleAccessory?: ReactNode;
}

export function AppScreen({
  backAccessibilityLabel,
  backLabel,
  backIcon = "left",
  children,
  eyebrow,
  header,
  headerActions,
  headerVariant = "large",
  inset = "legacy",
  onBack,
  refreshControl,
  showBack,
  subtitle,
  title,
  titleAccessory
}: AppScreenProps) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const currentPath = usePathname();
  // R05 rework M1: the path is global, so a tab page left under a pushed page would
  // briefly read the new path and grow a back bar. A page mounted as a tab page stays one.
  const ownPath = useRef(currentPath);
  if (mainTabForPath(ownPath.current) === null) ownPath.current = currentPath;
  const pathname = ownPath.current;
  const viewport = useMobileViewport();
  const canGoBack = router.canGoBack();
  const mainTab = mainTabForPath(pathname);
  const locale = useOrbitLocale();
  const copy = useStandardCopy();
  const parent = parentForPath(pathname, locale.t);
  const navVisible = showBack ?? (!mainTab && pathname !== "/ai");
  // R05: the shell draws the tab bar (root layout). A tab page — or a Task segment —
  // remembers its scroll offset so coming back to it lands where the user left.
  const embedded = useAppScreenEmbedding();
  const scrollKey = embedded ? shellScrollKey("/task", embedded.segment) : mainTab ? shellScrollKey(pathname) : null;
  const scroll = useScrollMemory(scrollKey);
  const topGap = useShellTopGap();

  if (embedded) {
    return (
      <ScrollView
        {...scroll.props}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, inset === "kit" && styles.kitContent, styles.tabContent]}
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
        { paddingTop: topGap },
        viewport.visibleHeight === null
          ? null
          : { height: viewport.visibleHeight, maxHeight: viewport.visibleHeight }
      ]}
    >
      <ShellBackground />
      {navVisible ? (
        // kit .topbar on secondary pages: ‹ round button · centred title · actions (R05 rework).
        // The back button is icon-only like the design; VoiceOver reads where it goes.
        <View style={styles.navigation}>
          <ShellTopBar title={title} subtitle={subtitle}
            left={<IconButton icon={backIcon} accessibilityLabel={backAccessibilityLabel ?? backLabel ?? (canGoBack ? copy.nav.back : fillCopy(copy.nav.backTo, { label: parent.label }))}
              onPress={onBack ?? (() => canGoBack ? router.back() : router.replace(parent.href as Href))} />}
            right={headerActions ? <View style={styles.navigationActions}>{headerActions}</View> : null} />
        </View>
      ) : null}
      <ScrollView
        {...scroll.props}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, inset === "kit" && styles.kitContent, mainTab && styles.tabContent]}
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
      {mainTab ? <TabPageBar tab={mainTab} /> : null}
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
    }
  };
  return {
    props: {
      ref,
      scrollEventThrottle: 100,
      onScrollBeginDrag: () => { pending.current = 0; },
      onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
        const y = event.nativeEvent.contentOffset.y;
        // iOS may deliver an initial zero offset after scrollTo is requested.
        // Keep the saved position until the requested offset is observed.
        if (pending.current > 0) {
          if (Math.abs(y - pending.current) > 2) return;
          pending.current = 0;
        }
        rememberScroll(key, y);
      },
      onLayout: (event: { nativeEvent: { layout: { height: number } } }) => { size.current.viewport = event.nativeEvent.layout.height; tryRestore(); },
      onContentSizeChange: (_width: number, height: number) => { size.current.content = height; tryRestore(); }
    }
  };
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  navigation: { paddingHorizontal: SHELL_GUTTER },
  navigationActions: { flexDirection: "row", alignItems: "center" },
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
  // kit .scroll (inset="kit"): no extra top, 18 gutter.
  kitContent: { paddingHorizontal: SHELL_GUTTER, paddingTop: 0 },
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
    backgroundColor: colors.bg,
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
