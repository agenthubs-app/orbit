// R17 主催（App）的共用小件：kit .hc 活动卡（b6 #21 / #22、b12 #420）、.bar（带圆钮）、.ring、.emo、.btn.sm、💻「PC で」卡。
// .chip / .av / .bar.thin 沿用 R27 venue-ui（同一 kit 值）。数值照画板源码：.hc r22 p18 gap4 · .cnt3 gap8 mt12 · .cnt3 > div r14 9/11。
import { useState, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";

import type { HostCenterEventRow } from "../../api/contract/host-events";
import { Icon, UiPressable, UiText, type IconName } from "../../components/ui";
import Svg, { Circle, Defs, Rect, Stop } from "../../components/ui/svg";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { radius } from "../../design/tokens";
import { LinearGradient } from "../plan/plan-svg";
import { Chip, ThinBar, type Tone } from "../events/v2/venue-ui";
import { eventTone, fillPercent, hostDateLong, rowNote, statusChip, type HostT } from "./host-model";

export function useToneColors() {
  const { colors } = useOrbitTheme();
  return (tone: Tone) => ({ apricot: colors.macApricot, blue: colors.macBlue, lav: colors.macLav, pink: colors.macPink, teal: colors.macTeal } as const)[tone];
}

/** kit .emo（40 r13 21）/ .emo.sm（32 r10 17）。 */
export function Emo({ emoji, tone, small = false }: { emoji: string; tone: Tone; small?: boolean }) {
  const { styles } = useHostStyles();
  const bg = useToneColors()(tone);
  return <View style={[small ? styles.emoSm : styles.emo, { backgroundColor: bg }]}><UiText style={small ? styles.emoSmText : styles.emoText}>{emoji}</UiText></View>;
}

/** kit .btn.sm（32 高，12/700）；primary = ink 底。 */
export function BtnSm({ label, onPress, primary = false, icon, testID }: { label: string; onPress: () => void; primary?: boolean; icon?: IconName | undefined; testID?: string }) {
  const { styles, colors } = useHostStyles();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.btnSm, primary ? styles.primary : null]} testID={testID}>
      {icon ? <Icon name={icon} size={16} color={primary ? colors.bg : colors.ink} /> : null}
      <UiText style={[styles.btnSmText, primary ? { color: colors.bg } : null]}>{label}</UiText>
    </UiPressable>
  );
}

/** kit .btn（40 高，13/700）；block 撑满；primary / ghost。 */
export function Btn({ label, onPress, variant = "default", icon, height = 40, style, testID }: { label: string; onPress: () => void; variant?: "default" | "primary" | "ghost"; icon?: IconName | undefined; height?: number; style?: object | undefined; testID?: string }) {
  const { styles, colors } = useHostStyles();
  const ink = variant === "primary" ? colors.bg : variant === "ghost" ? colors.ink2 : colors.ink;
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.btn, { height }, variant === "primary" ? styles.primary : variant === "ghost" ? styles.ghost : null, style]} testID={testID}>
      {icon ? <Icon name={icon} size={16} color={ink} /> : null}
      <UiText style={[styles.btnText, { color: ink }]}>{label}</UiText>
    </UiPressable>
  );
}

/** kit .bar（6 高、plum-300→plum-700、右端 14 的圆钮）。 */
export function Bar({ share }: { share: number }) {
  const { styles, colors } = useHostStyles();
  const [width, setWidth] = useState(0);
  const fill = Math.max(0, Math.min(1, share)) * width;
  return (
    <View style={styles.bar} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {fill > 0 ? (
        <>
          <Svg width={fill} height={6} style={StyleSheet.absoluteFill}>
            <Defs><LinearGradient id="hostBar" x1={0} y1={0} x2={fill} y2={0} gradientUnits="userSpaceOnUse"><Stop offset={0} stopColor={colors.plum300} /><Stop offset={1} stopColor={colors.plum700} /></LinearGradient></Defs>
            <Rect x={0} y={0} width={fill} height={6} rx={3} fill="url(#hostBar)" />
          </Svg>
          <View style={[styles.knob, { left: fill - 7 }]} />
        </>
      ) : null}
    </View>
  );
}

/** kit .ring（84 / 9，plum-700 一段，起点 12 点）。 */
export function Ring({ share, size = 84, stroke = 9, children }: { share: number; size?: number; stroke?: number; children?: ReactNode }) {
  const { colors } = useOrbitTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(1, share)) * c;
  return (
    <View style={{ alignItems: "center", height: size, justifyContent: "center", width: size }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surface3} strokeWidth={stroke} fill="none" />
        {value > 0 ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.plum700} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${value} ${c}`} /> : null}
      </Svg>
      {children}
    </View>
  );
}

/** kit .card.flat.row：💻 + 一句（+ 可选按钮），App 不做的编辑去 PC。 */
export function PcCard({ text, title, action, emoji = "💻", tone = "blue", style }: { text: string; title?: string; action?: ReactNode; emoji?: string; tone?: Tone; style?: object }) {
  const { styles } = useHostStyles();
  return (
    <View style={[styles.card, styles.flat, styles.row, style]}>
      <Emo emoji={emoji} tone={tone} small />
      <View style={styles.grow}>
        {title ? <UiText style={styles.b13}>{title}</UiText> : null}
        <UiText style={styles.lbl}>{text}</UiText>
      </View>
      {action}
    </View>
  );
}

/** kit .hc：運営センター的一场活动卡。 */
export function HostEventCard({ row, t, language, onAction, onOpen, faded = false }: { row: HostCenterEventRow; t: HostT; language: string; onAction?: () => void; onOpen?: () => void; faded?: boolean }) {
  const { styles, colors } = useHostStyles();
  const chip = statusChip(row.status);
  const primary = row.action === "open_check_in";
  const where = [hostDateLong(row.startsAt, language, t), row.venue].filter(Boolean).join(" · ");
  const n = (value: number | null) => (value == null ? "—" : String(value));
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={row.title} onPress={onOpen ?? (() => undefined)} disabled={faded || !onOpen} style={[styles.hc, faded ? styles.faded : null]} testID={`host-row-${row.eventId}`}>
      <View style={[styles.row, styles.between]}>
        <Emo emoji={row.emoji ?? "📅"} tone={eventTone(row.emoji, row.eventId)} />
        <View><Chip label={t(chip.label)} {...(chip.tone && chip.tone !== "coral" ? { tone: chip.tone } : {})} coral={chip.tone === "coral"}>{chip.live ? <View style={[styles.liveDot, { backgroundColor: colors.macTealInk }]} /> : null}</Chip></View>
      </View>
      <UiText style={styles.hcTitle} numberOfLines={2}>{row.title}</UiText>
      <UiText style={styles.lbl} numberOfLines={1}>{where}</UiText>
      <View style={styles.cnt3}>
        <View style={styles.cnt}><UiText style={styles.cntLbl}>{t("kApplied")}</UiText><UiText style={styles.cntNum}>{row.applied}{row.capacity ? <UiText style={styles.cntSmall}>{`/${row.capacity}`}</UiText> : null}</UiText></View>
        <View style={styles.cnt}><UiText style={styles.cntLbl}>{t("cMatched")}</UiText><UiText style={styles.cntNum}>{n(row.matched)}</UiText></View>
        <View style={styles.cnt}><UiText style={styles.cntLbl}>{t("cCheckedIn")}</UiText><UiText style={styles.cntNum}>{n(row.checkedIn)}</UiText></View>
      </View>
      <ThinBar share={fillPercent(row.applied, row.capacity) / 100} />
      <View style={[styles.row, styles.between, styles.hcFoot]}>
        <UiText style={[styles.lbl, styles.grow]} numberOfLines={1}>{rowNote(row, t)}</UiText>
        <BtnSm label={t(primary ? "openCheckIn" : "openConsole")} primary={primary} icon={primary ? "check" : undefined} onPress={onAction ?? (() => undefined)} />
      </View>
    </UiPressable>
  );
}

export const numFont = Platform.OS === "ios" ? "ui-rounded" : undefined;

export const useHostStyles = createThemedStyles((colors) => StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  between: { justifyContent: "space-between" },
  grow: { flex: 1, minWidth: 0 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  flat: { backgroundColor: colors.surface2 },
  next: { marginTop: 14 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  sub: { color: colors.ink2, fontSize: 15, lineHeight: 23 },
  h3: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  // 画板里 13px 的 <b> 都是 div 内的行内元素：行盒按 14px × 1.5 = 21 的 strut。
  b13: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 24 },
  b14: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25 },
  cardH: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between", marginBottom: 12 },
  emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoText: { fontSize: 23, lineHeight: 28 },
  emoSm: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  emoSmText: { fontSize: 19, lineHeight: 25 },
  btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 32, justifyContent: "center", paddingHorizontal: 12 },
  btnSmText: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  btn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 6, justifyContent: "center", paddingHorizontal: 16 },
  btnText: { fontSize: 15, fontWeight: "700", lineHeight: 22 },
  primary: { backgroundColor: colors.ink },
  ghost: { backgroundColor: "transparent" },
  hc: { backgroundColor: colors.surface, borderRadius: 22, gap: 4, minWidth: 0, padding: 18 },
  faded: { opacity: 0.5 },
  hcTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 26, marginTop: 10 },
  hcFoot: { paddingTop: 8 },
  liveDot: { borderRadius: 4, height: 7, width: 7 },
  cnt3: { flexDirection: "row", gap: 8, marginTop: 12 },
  // .cnt3 > div 里的 span.lbl 是行内元素，行盒按 div 的 14px × 1.5 = 21 的 strut 撑高，字落在基线上（比居中低约 1px）。
  cntLbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 23, paddingTop: 1 },
  cnt: { backgroundColor: colors.surface2, borderRadius: 14, flex: 1, minWidth: 0, paddingHorizontal: 11, paddingVertical: 9 },
  cntNum: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 22, fontWeight: "800", lineHeight: 26 },
  cntSmall: { color: colors.ink3, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 13, fontWeight: "700" },
  bar: { backgroundColor: colors.surface3, borderRadius: 6, height: 6, marginBottom: 4, marginTop: 8 },
  knob: { backgroundColor: colors.surface, borderColor: colors.plum700, borderRadius: 7, borderWidth: 3, height: 14, position: "absolute", top: -4, width: 14 },
  sampleTag: { backgroundColor: colors.macApricot, borderRadius: 6, marginLeft: 4, paddingHorizontal: 6, paddingVertical: 1 },
  sampleTagText: { color: colors.macApricotInk, fontSize: 12, fontWeight: "800", lineHeight: 18 },
  muted: { color: colors.ink3 },
}));
