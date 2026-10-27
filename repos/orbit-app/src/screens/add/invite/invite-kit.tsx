// R15 招待コード: the kit pieces both invite pages share, translated once from b11 A2 (#6–#13) and kit/ui.css —
// .btn.xl / .btn.ghost, .guide (white card with the lavender glow top right), .card / .card.flat (radius 24),
// .chip, .lbl, .lnk. Numbers are the kit's; colours come from the theme.
import { useState, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { KitSpin } from "../scan-kit";
import { UiPressable, UiText } from "../../../components/ui";
import Svg, { Circle, Defs, RadialGradient, Stop } from "../../../components/ui/svg";
import { createThemedStyles, useOrbitTheme } from "../../../design/theme";

/** .btn.primary.block.xl (50 high, 14.5 / 700) — or the plain surface-2 one. */
export function KitXl({ label, onPress, primary = true, busy = false, disabled = false, testID }: { label: string; onPress: () => void; primary?: boolean; busy?: boolean; disabled?: boolean; testID?: string }) {
  const { colors, styles } = useInviteKit();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy, disabled: busy || disabled }} disabled={busy || disabled} onPress={onPress}
      style={[styles.xl, { backgroundColor: primary ? colors.ink : colors.surface2 }, disabled ? styles.off : null]} testID={testID}>
      {busy ? <KitSpin tone="muted" /> : null}
      <UiText numberOfLines={1} style={[styles.xlText, { color: primary ? colors.bg : colors.ink }]}>{label}</UiText>
    </UiPressable>
  );
}

/** .btn.ghost.block (40 high, ink-2). */
export function KitGhost({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const { styles } = useInviteKit();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.ghost} testID={testID}>
      <UiText style={styles.ghostText}>{label}</UiText>
    </UiPressable>
  );
}

/** .guide: the white card whose top right glows lavender (220 circle at right −80 / top −90, mac-lav → transparent). */
export function KitGuide({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { colors, styles } = useInviteKit();
  const [width, setWidth] = useState(0);
  return (
    <View style={[styles.guide, style]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} testID={testID}>
      {width ? (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={width} height={220}>
          <Defs>
            <RadialGradient id="invite-guide-glow" cx={width - 30} cy={20} r={110} gradientUnits="userSpaceOnUse">
              <Stop offset={0} stopColor={colors.macLav} stopOpacity={0.9} />
              <Stop offset={0.7} stopColor={colors.macLav} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={width - 30} cy={20} r={110} fill="url(#invite-guide-glow)" />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/** .chip (3 / 9, 11 / 700, surface-2 on ink-2); `teal` = 本人入力; `off` = 連絡先（オフ） at half strength. */
export function KitChip({ label, tone, off = false, icon }: { label: string; tone?: "teal"; off?: boolean; icon?: ReactNode }) {
  const { colors, styles } = useInviteKit();
  return (
    <View style={[styles.chip, { backgroundColor: tone === "teal" ? colors.macTeal : colors.surface2 }, off ? styles.chipOff : null]}>
      {icon}
      <UiText style={[styles.chipText, { color: tone === "teal" ? colors.macTealInk : colors.ink2 }]}>{label}</UiText>
    </View>
  );
}

/** .lnk (12 / 700, accent; coral for 無効にする). */
export function KitLink({ label, onPress, danger = false, disabled = false, testID }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean; testID?: string }) {
  const { colors, styles } = useInviteKit();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={10} testID={testID}>
      <UiText style={[styles.link, { color: danger ? colors.coralText : colors.accentText }, disabled ? styles.off : null]}>{label}</UiText>
    </UiPressable>
  );
}

export function useInviteKit() {
  const { colors } = useOrbitTheme();
  return { colors, styles: useStyles().styles };
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  xl: { alignItems: "center", alignSelf: "stretch", borderRadius: 999, flexDirection: "row", gap: 6, height: 50, justifyContent: "center", paddingHorizontal: 16 },
  xlText: { fontSize: 17, fontWeight: "700", lineHeight: 25 },
  off: { opacity: 0.4 },
  ghost: { alignItems: "center", alignSelf: "stretch", borderRadius: 999, height: 40, justifyContent: "center" },
  ghostText: { color: colors.ink2, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  guide: { backgroundColor: colors.surface, borderRadius: 24, overflow: "hidden", padding: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 14 },
  flat: { backgroundColor: colors.surface2, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 12 },
  chip: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 4, paddingHorizontal: 9, paddingVertical: 3 },
  chipOff: { opacity: 0.5 },
  chipText: { fontSize: 13, fontWeight: "700", lineHeight: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  sub: { color: colors.ink2, fontSize: 15, lineHeight: 23 },
  link: { fontSize: 14, fontWeight: "700", lineHeight: 21 },
  rowBetween: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  infoTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 23 },
}));
export const useInviteKitStyles = useStyles;
