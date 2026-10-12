import { usePathname, useRootNavigationState, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createThemedStyles } from "../design/theme";
import { darkColors, floatShadow } from "../design/tokens";
import { MAIN_TAB_PATHS, mainTabForPath, type MainTab } from "../view-models/app-navigation";
import { OrbitNavigationIcon, type NavigationIconName } from "./OrbitNavigationIcon";
import { useStandardCopy } from "../i18n/standard-copy";
import { useMobileViewport } from "../platform/use-mobile-viewport";
import { GlassSurface } from "./ui/GlassSurface";
import { TAB_BAR_HEIGHT } from "./shell-metrics";
import { openMainTab, trackRootNavigationState } from "./shell-navigation";
import { UiPressable } from "./ui/Pressable";
import { UiText } from "./ui/Text";
import { useReducedMotion } from "./ui/motion";

// R05 NAV-V3 (RD-02): five equal items; iOrbit opens its full-screen page.
const tabs = [
  { id: "home", copyKey: "home" },
  { id: "contacts", copyKey: "network" },
  { id: "iorbit", copyKey: "iorbit" },
  { id: "events", copyKey: "events" },
  { id: "task", copyKey: "task" }
] as const satisfies readonly { id: NavigationIconName; copyKey: string }[];


export function OrbitTabBar({ active }: { active: MainTab }) {
  const { styles } = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // R03 contract A: tab names are the standard wording shared with the Web.
  const copy = useStandardCopy();
  const { keyboardVisible } = useMobileViewport();

  if (keyboardVisible) return null;
  // kit bottom 26 sits over the home indicator: 34pt inset − 8 on Face ID phones.
  const bottom = Math.max(14, insets.bottom - 8);
  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom }]}>
      {/* The shadow sits on a frame outside the glass: the glass clips its blur. */}
      <View accessibilityRole="tablist" accessibilityLabel={copy.nav.main} style={styles.frame}>
      <GlassSurface radius={999} style={styles.bar}>
        <View style={styles.row}>
          {tabs.map(tab => {
            const label = copy.nav[tab.copyKey];
            const selected = active === tab.id;
            return (
              <UiPressable key={tab.id} accessibilityRole="tab" accessibilityLabel={label}
                accessibilityState={{ selected }} aria-selected={selected}
                onPress={() => tab.id === "iorbit" ? router.push("/ai" as Href) : selected ? undefined : openMainTab(router, MAIN_TAB_PATHS[tab.id])}
                style={[styles.tab, selected && styles.selected]}>
                <OrbitNavigationIcon name={tab.id} color={selected ? styles.labelSelected.color : styles.label.color} />
                {/* One line at a fixed size like iOS tab bars; VoiceOver reads the full label. */}
                <UiText maxFontSizeMultiplier={1} numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>{label}</UiText>
              </UiPressable>
            );
          })}
        </View>
      </GlassSurface>
      </View>
    </View>
  );
}

/** The one tab bar: mounted once by the root layout, shown only on the four tab pages. */
export function ShellTabBar() {
  trackRootNavigationState(useRootNavigationState());
  const active = mainTabForPath(usePathname());
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  // D07: like iOS hidesBottomBarWhenPushed, the bar leaves to the left with the tab
  // page when a secondary page is pushed, and comes back with it on the way back.
  // The bar is drawn over the stack, so it slides the full width in the push time.
  const animate = Platform.OS !== "web" && !reduced;
  const [shown, setShown] = useState<MainTab | null>(active);
  const offset = useRef(new Animated.Value(0)).current;
  const previous = useRef(active);
  useEffect(() => {
    const before = previous.current;
    previous.current = active;
    if (active) setShown(active);
    if (!animate || Boolean(before) === Boolean(active)) {
      offset.setValue(0);
      if (!active) setShown(null);
      return;
    }
    offset.setValue(active ? -width : 0);
    const run = Animated.timing(offset, { toValue: active ? 0 : -width, duration: PUSH_MS, easing: Easing.bezier(0.2, 0.9, 0.3, 1), useNativeDriver: true });
    run.start(({ finished }) => { if (finished && !active) setShown(null); });
    return () => run.stop();
  }, [active, animate, offset, width]);
  const tab = active ?? shown;
  if (!tab) return null;
  return animate
    ? <Animated.View pointerEvents={active ? "box-none" : "none"} style={[StyleSheet.absoluteFill, { transform: [{ translateX: offset }] }]}><OrbitTabBar active={tab} /></Animated.View>
    : <OrbitTabBar active={tab} />;
}

/** The native stack's push / pop time on iOS. */
const PUSH_MS = 350;

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  dock: { position: "absolute", left: 14, right: 14, alignItems: "center" },
  frame: { width: "100%", maxWidth: 508, height: TAB_BAR_HEIGHT, borderRadius: 999, ...floatShadow(colors) },
  bar: { flex: 1 },
  row: { flex: 1, flexDirection: "row", padding: 6, gap: 2 },
  tab: { flex: 1, minWidth: 44, minHeight: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", gap: 2 },
  selected: { backgroundColor: colors === darkColors ? colors.surface3 : colors.surface },
  // RD-05 shell exception (like the Web capsule labels): unselected items keep the design's --ink-3.
  // kit 10px at line-height 1.5; lifted 2px@3x like other shell text (ui/cjk-lift).
  label: { color: colors.ink3, fontSize: 10, lineHeight: 15, fontWeight: "700", textAlign: "center", maxWidth: "100%", transform: [{ translateY: -0.67 }] },
  labelSelected: { color: colors.ink }
}));
