import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createThemedStyles } from "../design/theme";
import { floatShadow } from "../design/tokens";
import type { MainTab } from "../view-models/app-navigation";
import { OrbitNavigationIcon } from "./OrbitNavigationIcon";
import { useStandardCopy } from "../i18n/standard-copy";
import { useMobileViewport } from "../platform/use-mobile-viewport";

const tabs = [
  { id: "home", copyKey: "home", href: "/home" },
  { id: "contacts", copyKey: "network", href: "/contacts" },
  { id: "ai", copyKey: "iorbit", href: "/ai" },
  { id: "events", copyKey: "events", href: "/events" },
  { id: "profile", copyKey: "me", href: "/profile" }
] as const;

export function OrbitTabBar({ active }: { active: MainTab }) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  // R03 contract A: tab names are the standard wording shared with the Web.
  const copy = useStandardCopy();
  const { keyboardVisible } = useMobileViewport();

  if (keyboardVisible) return null;
  return (
    <SafeAreaView edges={{ bottom: "maximum" }} pointerEvents="box-none" style={styles.safeArea}>
      <View accessibilityRole="tablist" accessibilityLabel={copy.nav.main} style={styles.bar}>
        {tabs.map(tab => {
          const label = copy.nav[tab.copyKey];
          const selected = active === tab.id;
          const central = tab.id === "ai";
          const color = central ? colors.onAccent : selected ? colors.accentText : colors.ink3Text;
          return (
            <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={label}
              accessibilityState={{ selected }} aria-selected={selected}
              onPress={() => central ? router.push(tab.href) : router.replace(tab.href)}
              style={({ pressed }) => [styles.tab, central && styles.centralTab, selected && styles.selected, pressed && styles.pressed]}>
              <View style={central ? styles.planet : null}>
                <OrbitNavigationIcon name={tab.id} size={central ? 24 : 22} color={color} />
              </View>
              {/* R03: one line, fixed size like iOS tab bars (large text uses the long-press large-content view, R05). */}
              <Text maxFontSizeMultiplier={1} numberOfLines={1} style={[styles.label, { color: central ? colors.ink : color }, central && styles.centralLabel]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safeArea: { position: "absolute", left: 16, right: 16, bottom: 0, paddingBottom: 14, alignItems: "center" },
  bar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    minHeight: 72, borderRadius: 36, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    ...floatShadow(colors), maxWidth: 508, width: "100%"
  },
  tab: { alignItems: "center", justifyContent: "center", gap: 3, flex: 1, maxWidth: 60, minWidth: 44, minHeight: 56, borderRadius: 18, paddingVertical: 4 },
  centralTab: { gap: 4, flexBasis: "auto", flexGrow: 0, flexShrink: 0, maxWidth: "100%", paddingVertical: 0 },
  selected: { backgroundColor: colors.accentSoft },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "600", textAlign: "center", maxWidth: "100%", flexShrink: 1 },
  centralLabel: { fontSize: 10, lineHeight: 12, fontWeight: "700", letterSpacing: 0.6 },
  planet: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink },
  pressed: { opacity: 0.65 }
}));
