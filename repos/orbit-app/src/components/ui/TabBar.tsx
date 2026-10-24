import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { createThemedStyles } from "../../design/theme";
import { darkColors, floatShadow } from "../../design/tokens";
import { GlassSurface } from "./GlassSurface";
import { Icon, type IconName } from "./Icon";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

export type TabBarItem<Key extends string> = { key: Key; label: string; icon: IconName };

// R31a (G23 / R27-04): a configurable kit .tabbar (ui.css:97-106) — a 62-tall glass capsule floating 26 above the
// bottom (34 home-indicator inset − 8 on Face ID phones), padding 6, equal items 21px icon over a 10 / 700 label,
// ink-3; the selected item sits on surface (surface-3 in dark). `variant="live"` = b2 .tabbar.livebar, the 会場 bar
// (right inset 16 instead of 14). The shell's own OrbitTabBar (NAV-V3, D line) keeps its implementation.
// A page that draws one should also call usePageBottomBar() so toasts sit above it.
export function TabBar<Key extends string>({ items, value, onChange, accessibilityLabel, variant = "main", testIDPrefix }: {
  items: TabBarItem<Key>[];
  value: Key;
  onChange: (key: Key) => void;
  accessibilityLabel?: string;
  variant?: "main" | "live";
  /** testID of each tab = `${testIDPrefix}${key}` */
  testIDPrefix?: string;
}) {
  const { styles, colors } = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.dock, variant === "live" && styles.dockLive, { bottom: Math.max(14, insets.bottom - 8) }]}>
      {/* The shadow sits on a frame outside the glass: the glass clips its blur. */}
      <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.frame}>
        <GlassSurface radius={999} style={styles.glass}>
          <View style={styles.tabs}>
            {items.map((item) => {
              const selected = item.key === value;
              return (
                <UiPressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} aria-selected={selected} onPress={() => onChange(item.key)} style={[styles.tab, selected ? styles.tabOn : null]} {...(testIDPrefix ? { testID: `${testIDPrefix}${item.key}` } : {})}>
                  <Icon name={item.icon} size={21} color={selected ? colors.ink : colors.ink3} />
                  {/* One line at a fixed size like iOS tab bars; VoiceOver reads the full label. */}
                  <UiText maxFontSizeMultiplier={1} numberOfLines={1} style={[styles.label, selected ? styles.labelOn : null]}>{item.label}</UiText>
                </UiPressable>
              );
            })}
          </View>
        </GlassSurface>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  dock: { left: 14, position: "absolute", right: 14 },
  dockLive: { right: 16 },
  frame: { borderRadius: 999, height: 62, ...floatShadow(colors) },
  glass: { flex: 1 },
  tabs: { flex: 1, flexDirection: "row", gap: 2, padding: 6 },
  tab: { alignItems: "center", borderRadius: 999, flex: 1, gap: 2, justifyContent: "center", minHeight: 44 },
  tabOn: { backgroundColor: colors === darkColors ? colors.surface3 : colors.surface },
  // RD-05 shell exception (as OrbitTabBar): unselected items keep the design's --ink-3.
  label: { color: colors.ink3, fontSize: 12, fontWeight: "700", lineHeight: 18, textAlign: "center" },
  labelOn: { color: colors.ink },
}));
