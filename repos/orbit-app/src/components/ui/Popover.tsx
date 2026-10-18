import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { floatShadow } from "../../design/tokens";
import { UiPortal } from "./Portal";
import { UiPressable } from "./Pressable";
import { Scrim } from "./Scrim";
import { UiText } from "./Text";
import { useBackHandler } from "./useBackHandler";

// R31a (R24-05c): the App's anchored pop-up menu — b4 A6 #28 .gmenu: a surface panel (radius 24, padding 8,
// --shadow-float) placed under its trigger (left / right insets and top in screen points) over the sheet scrim;
// rows are .gi (gap 10, padding 10, radius 16; the current one on surface-2; 13.5 / 700 title over a .lbl line).
// A backdrop tap, Android back or the VoiceOver escape gesture closes it. (The Web .pop — 340–440 wide, radius 22,
// no scrim — is the Web library's; the App board draws the scrimmed .gmenu.)
export function Popover({ visible, onClose, anchor, children, accessibilityLabel, testID }: {
  visible: boolean;
  onClose: () => void;
  /** Where the panel sits, in screen points (kit .gmenu: left 18 / right 60 / top 192 under the goal title). */
  anchor: { top: number; left: number; right: number };
  children: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { styles, colors } = useStyles();
  useBackHandler(visible, onClose);
  if (!visible) return null;
  return (
    <UiPortal>
      <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={StyleSheet.absoluteFill}>
        <Scrim onPress={onClose} />
        <View accessibilityLabel={accessibilityLabel} testID={testID} style={[styles.panel, floatShadow(colors), { top: anchor.top, left: anchor.left, right: anchor.right }]}>
          {children}
        </View>
      </View>
    </UiPortal>
  );
}

/** kit .gmenu .gi: one menu row (leading tile / icon, title + optional .lbl line, trailing mark). */
export function PopoverRow({ title, subtitle, leading, trailing, selected = false, muted = false, onPress, accessibilityRole = "button", accessibilityLabel, testID }: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  /** title in ink-3 (kit: 完了した目標) */
  muted?: boolean;
  onPress: () => void;
  accessibilityRole?: "button" | "link" | "radio";
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { styles } = useStyles();
  return (
    <UiPressable accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ selected, checked: accessibilityRole === "radio" ? selected : undefined }} {...(accessibilityRole === "radio" ? { "aria-checked": selected } : {})} onPress={onPress} style={[styles.row, selected && styles.rowOn]} {...(testID ? { testID } : {})}>
      {leading}
      <View style={styles.meta}>
        <UiText numberOfLines={2} style={[styles.title, muted && styles.titleMuted]}>{title}</UiText>
        {subtitle ? <UiText numberOfLines={1} style={styles.sub}>{subtitle}</UiText> : null}
      </View>
      {trailing}
    </UiPressable>
  );
}

/** kit divider inside .gmenu: 1px --line, margin 4 10. */
export function PopoverDivider() {
  const { styles } = useStyles();
  return <View style={styles.divider} />;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  panel: { position: "absolute", borderRadius: 24, backgroundColor: colors.surface, padding: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 16 },
  rowOn: { backgroundColor: colors.surface2 },
  meta: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 13.5, fontWeight: "700", lineHeight: 20.25 },
  // kit ink-3 text → the readable ink-3-text (RD-05; a [contrast] substitution in the pixel gate).
  titleMuted: { color: colors.ink3Text },
  sub: { color: colors.ink3Text, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: 10, marginVertical: 4 },
}));
