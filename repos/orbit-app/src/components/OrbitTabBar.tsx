import { usePathname, useRouter, type Href } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createThemedStyles } from "../design/theme";
import { darkColors, floatShadow } from "../design/tokens";
import { MAIN_TAB_PATHS, mainTabForPath, type MainTab } from "../view-models/app-navigation";
import { OrbitNavigationIcon, type NavigationIconName } from "./OrbitNavigationIcon";
import { useStandardCopy } from "../i18n/standard-copy";
import { useMobileViewport } from "../platform/use-mobile-viewport";
import { GlassSurface } from "./ui/GlassSurface";
import { TAB_BAR_HEIGHT } from "./shell-metrics";
import { UiPressable } from "./ui/Pressable";
import { UiText } from "./ui/Text";

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
                onPress={() => tab.id === "iorbit" ? router.push("/ai" as Href) : selected ? undefined : router.replace(MAIN_TAB_PATHS[tab.id] as Href)}
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
  const active = mainTabForPath(usePathname());
  return active ? <OrbitTabBar active={active} /> : null;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  dock: { position: "absolute", left: 14, right: 14, alignItems: "center" },
  frame: { width: "100%", maxWidth: 508, height: TAB_BAR_HEIGHT, borderRadius: 999, ...floatShadow(colors) },
  bar: { flex: 1 },
  row: { flex: 1, flexDirection: "row", padding: 6, gap: 2 },
  tab: { flex: 1, minWidth: 44, minHeight: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", gap: 2 },
  selected: { backgroundColor: colors === darkColors ? colors.surface3 : colors.surface },
  label: { color: colors.ink3Text, fontSize: 10, lineHeight: 12, fontWeight: "700", textAlign: "center", maxWidth: "100%" },
  labelSelected: { color: colors.ink }
}));
