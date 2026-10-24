import { useState, type ReactNode } from "react";
import { Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import * as SafeArea from "react-native-safe-area-context";

import { createThemedStyles } from "../design/theme";
import { cjkLift } from "./ui/cjk-lift";
import { UiText } from "./ui/Text";

/** kit `.phone .scroll` starts under a 50pt status band (ui.css:78) and is padded 0 18. */
export const SHELL_STATUS_BAND = 50;
export const SHELL_GUTTER = 18;

/** Extra top padding so a page under a shorter status bar (16e: 47) still starts at 50, like the frame. */
// (Read through the namespace: the render-test fixtures stub the module with SafeAreaView only.)
const useInsets: () => { top: number } = (SafeArea as { useSafeAreaInsets?: () => { top: number } }).useSafeAreaInsets ?? (() => ({ top: SHELL_STATUS_BAND }));
export function useShellTopGap(): number {
  const top = useInsets().top;
  // Only the phone frame has the 50pt status band; the web App has no status bar.
  return Platform.OS === "ios" ? Math.max(0, SHELL_STATUS_BAND - top) : 0;
}

// kit .topbar (ui.css:83): grid 44 | 1fr | 44, centred title 17/800 and an optional
// 11.5/500 subtitle, a 40pt round button (IconButton) at the start of each side cell.
// The page gives the 18pt gutter. Either side may be empty; the title stays centred
// and wraps like the kit's (no nowrap on .topbar), so long titles and large text grow.
// A side wider than 44 (a text action such as 保存) widens both sides equally, like a
// UINavigationBar, so the title stays centred and the action is never clipped.
const SIDE = 44;

export function ShellTopBar({ title, subtitle, left, right }: { title: string; subtitle?: string | undefined; left?: ReactNode; right?: ReactNode }) {
  const { styles } = useStyles();
  const [widths, setWidths] = useState({ left: 0, right: 0 });
  const side = Math.max(SIDE, widths.left, widths.right);
  const measure = (key: "left" | "right") => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setWidths((current) => current[key] === width ? current : { ...current, [key]: width });
  };
  return (
    <View style={styles.bar}>
      <View style={[styles.side, { minWidth: side }]}><View style={styles.content} onLayout={measure("left")}>{left}</View></View>
      <View style={styles.center}>
        {title ? <UiText accessibilityRole="header" style={[styles.title, cjkLift(title, -1, -1)]}>{title}</UiText> : null}
        {subtitle ? <UiText style={[styles.subtitle, cjkLift(subtitle, -0.5, 0)]}>{subtitle}</UiText> : null}
      </View>
      <View style={[styles.side, { minWidth: side }, side > SIDE && styles.sideEnd]}><View style={styles.content} onLayout={measure("right")}>{right}</View></View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", paddingTop: 6, paddingBottom: 14 },
  // Sides keep their natural width (never shrink); the inner row reports it.
  side: { flexShrink: 0, alignItems: "flex-start" },
  sideEnd: { alignItems: "flex-end" },
  content: { flexDirection: "row", alignItems: "center" },
  center: { flex: 1, minWidth: 0, alignItems: "center" },
  // body line-height 1.5 (ui.css:9) → 25.5 / 17.25
  title: { color: colors.ink, fontSize: 19, lineHeight: 29, fontWeight: "800", letterSpacing: 0.17, textAlign: "center" },
  // RD-05 shell exception (R07 review M1): secondary shell text keeps the design's --ink-3.
  subtitle: { color: colors.ink3, fontSize: 13, lineHeight: 20, fontWeight: "500", marginTop: 1, textAlign: "center" },
}));
