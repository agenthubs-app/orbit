// R16 取り込み (b9 A2 / A3 App): the kit pieces the import pages share — .btn.block.xl / .ghost
// (KitFoot buttons), .emo, .lbtn, .cbx, .xrow, .gen, .gstep / .ill .mi, .file, .orb. Kit values only.
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { Icon, UiPressable, UiText, type IconName } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { KitSpin } from "../scan-kit";

/** .btn.block.xl (50 high, 14.5): primary = ink, plain = surface-2. */
export function XlButton({ label, onPress, primary = true, icon, disabled = false, busy = false, testID }: { label: string; onPress: () => void; primary?: boolean; icon?: IconName; disabled?: boolean; busy?: boolean; testID?: string }) {
  const { colors, styles } = useImportKitStyles();
  const ink = primary ? colors.bg : colors.ink;
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
      style={[styles.xl, primary ? styles.xlPrimary : styles.xlPlain, disabled ? styles.off : null]} testID={testID}>
      {busy ? <KitSpin tone="muted" /> : icon ? <Icon name={icon} size={16} color={ink} /> : null}
      <UiText numberOfLines={1} style={[styles.xlText, { color: ink }]}>{label}</UiText>
    </UiPressable>
  );
}

/** .btn.block (40 high, 13, surface-2). */
export function BlockButton({ label, onPress, icon, testID }: { label: string; onPress: () => void; icon?: IconName; testID?: string }) {
  const { colors, styles } = useImportKitStyles();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.ghost, styles.block]} testID={testID}>
      {icon ? <Icon name={icon} size={16} color={colors.ink} /> : null}
      <UiText style={styles.blockText}>{label}</UiText>
    </UiPressable>
  );
}

/** .btn.ghost.block (40 high, 13, ink-2). */
export function GhostButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const { styles } = useImportKitStyles();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.ghost} testID={testID}>
      <UiText style={styles.ghostText}>{label}</UiText>
    </UiPressable>
  );
}

/** .cbx (20, radius 7, 1.8 border; on = plum-700 with a check). */
export function KitCheck({ on }: { on: boolean }) {
  const { colors, styles } = useImportKitStyles();
  return <View style={[styles.cbx, on && styles.cbxOn]}>{on ? <Icon name="check" size={16} color={colors.surface} /> : null}</View>;
}

/** .gen row: done (ok + check), now (spinner, bold), waiting (empty, ink-3). */
export function GenRow({ label, count, state, first = false }: { label: string; count?: string | undefined; state: "done" | "now" | "wait"; first?: boolean }) {
  const { colors, styles } = useImportKitStyles();
  return (
    <View style={[styles.gen, !first && styles.genLine]}>
      {state === "done" ? <View style={[styles.gi, styles.giDone]}><Icon name="check" size={16} color={colors.surface} /></View>
        : state === "now" ? <View style={styles.gi}><KitSpin /></View> : <View style={styles.gi} />}
      <UiText style={[styles.genText, state === "now" && styles.genNow, state === "wait" && styles.genWait]}>{label}</UiText>
      {count ? <UiText style={styles.lbl}>{count}</UiText> : null}
    </View>
  );
}

/** .gstep: the black number and the step. */
export function KitStep({ n, title, children, first = false }: { n: number; title: string; children?: ReactNode; first?: boolean }) {
  const { styles } = useImportKitStyles();
  return (
    <View style={[styles.gstep, !first && styles.gstepGap]}>
      <View style={styles.gstepN}><UiText style={styles.gstepNText}>{String(n)}</UiText></View>
      <View style={styles.grow}>
        <UiText style={styles.gstepTitle}>{title}</UiText>
        {children}
      </View>
    </View>
  );
}

/** .ill .mi rows; `hl` = the one to tap (accent-soft, plum ring), `dim` = .6. */
export function KitIll({ items }: { items: readonly { key: string; label: string; icon?: IconName; check?: "on" | "off"; hl?: boolean; dim?: boolean }[] }) {
  const { colors, styles } = useImportKitStyles();
  return (
    <View style={styles.ill}>
      {items.map((item) => (
        <View key={item.key} style={[styles.mi, item.hl && styles.miHl, item.dim && styles.dim]}>
          {item.icon ? <Icon name={item.icon} size={16} color={item.hl ? colors.ink : colors.ink2} /> : null}
          {item.check ? <View style={[styles.miBox, item.check === "on" && styles.miBoxOn]}>{item.check === "on" ? <Icon name="check" size={16} color={colors.surface} /> : null}</View> : null}
          <UiText numberOfLines={1} style={[styles.miText, item.hl && styles.miTextHl]}>{item.label}</UiText>
        </View>
      ))}
    </View>
  );
}

/** .orb: 86 round, radial lav → plum-300 → rose-300. */
export function KitOrb({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors, styles } = useImportKitStyles();
  return (
    <View style={[styles.orb, style]}>
      <Svg width={86} height={86}>
        <Defs>
          <RadialGradient id="import-orb" cx="35%" cy="35%" r="92%">
            <Stop offset={0} stopColor={colors.macLav} />
            <Stop offset={0.6} stopColor={colors.plum300} />
            <Stop offset={1} stopColor={colors.rose300} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={86} height={86} fill="url(#import-orb)" />
      </Svg>
    </View>
  );
}

export const useImportKitStyles = createThemedStyles((colors) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  xl: { height: 50, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  xlPrimary: { backgroundColor: colors.ink },
  xlPlain: { backgroundColor: colors.surface2 },
  xlText: { fontSize: 17, fontWeight: "700", lineHeight: 25 },
  off: { opacity: 0.4 },
  ghost: { height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  block: { backgroundColor: colors.surface2, flexDirection: "row", gap: 6 },
  blockText: { fontSize: 15, fontWeight: "700", lineHeight: 22, color: colors.ink },
  ghostText: { fontSize: 15, fontWeight: "700", lineHeight: 22, color: colors.ink2 },
  cbx: { width: 20, height: 20, borderRadius: 7, borderWidth: 1.8, borderColor: colors.ink4, alignItems: "center", justifyContent: "center" },
  cbxOn: { backgroundColor: colors.plum700, borderColor: colors.plum700 },
  gen: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  genLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  gi: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  giDone: { backgroundColor: colors.ok },
  genText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 22 },
  genNow: { fontWeight: "700" },
  genWait: { color: colors.ink3 },
  gstep: { flexDirection: "row", gap: 10 },
  gstepGap: { marginTop: 12 },
  gstepN: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", marginRight: 2 },
  gstepNText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  gstepTitle: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 24, marginTop: 3, marginBottom: 6 },
  ill: { borderRadius: 14, backgroundColor: colors.surface2, padding: 10, gap: 4 },
  mi: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.surface, overflow: "hidden" },
  miHl: { backgroundColor: colors.accentSoft, borderWidth: 1.5, borderColor: colors.plum500, paddingVertical: 3.5, paddingHorizontal: 6.5 },
  miText: { color: colors.ink2, fontSize: 12, lineHeight: 18 },
  miTextHl: { color: colors.ink, fontWeight: "700" },
  miBox: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.8, borderColor: colors.ink4, alignItems: "center", justifyContent: "center" },
  miBoxOn: { backgroundColor: colors.plum700, borderColor: colors.plum700 },
  dim: { opacity: 0.6 },
  orb: { width: 86, height: 86, borderRadius: 43, overflow: "hidden", alignSelf: "center", marginTop: 6 },
}));
