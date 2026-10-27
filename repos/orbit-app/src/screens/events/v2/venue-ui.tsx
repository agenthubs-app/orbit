// R27 会場モード（App）的共用小件与样式：kit .card / .chip / .av / .li / .why / .tline / .bar.thin 等（b2 #26–#35）。
import { useState, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";

import type { EventVenuePerson, EventVenueResponse } from "../../../api/contract/event-venue";
import { UiPressable, UiText } from "../../../components/ui";
import Svg, { Defs, Rect, Stop } from "../../../components/ui/svg";
import { createThemedStyles, useOrbitTheme } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { LinearGradient } from "../../plan/plan-svg";
import type { JourneyT } from "./journey-model";

export type Tone = "lav" | "pink" | "blue" | "teal" | "apricot";
/** kit .av c1–c5 按参加者在名单里的位置轮换（同 Web avTone）：lav · blue · teal · pink · blue · apricot · pink · blue。 */
const AV_TONES: readonly Tone[] = ["lav", "blue", "teal", "pink", "blue", "apricot", "pink", "blue"];
const OTHER_TONES: readonly Tone[] = ["apricot", "pink", "teal", "blue"];

export function useTone() {
  const { colors } = useOrbitTheme();
  return (tone: Tone) => ({ apricot: [colors.macApricot, colors.macApricotInk], blue: [colors.macBlue, colors.macBlueInk], lav: [colors.macLav, colors.macLavInk], pink: [colors.macPink, colors.macPinkInk], teal: [colors.macTeal, colors.macTealInk] } as const)[tone];
}

/** 每个人一个固定颜色：名单里的人按名单位置；名单外（同桌的其他人）按出现顺序取 apricot · pink …；首字相同视为同一人（分组头像只有首字）。 */
export function personTones(data: EventVenueResponse) {
  const byId = new Map<string, Tone>();
  const byInitial = new Map<string, Tone>();
  data.attendees.forEach((person, index) => { const tone = AV_TONES[index % AV_TONES.length]!; byId.set(person.attendeeId, tone); if (!byInitial.has(person.initial)) byInitial.set(person.initial, tone); });
  let extra = 0;
  return (person: { attendeeId?: string; initial: string }): Tone => {
    const known = (person.attendeeId ? byId.get(person.attendeeId) : undefined) ?? byInitial.get(person.initial);
    if (known) return known;
    const tone = OTHER_TONES[extra++ % OTHER_TONES.length]!;
    if (person.attendeeId) byId.set(person.attendeeId, tone);
    byInitial.set(person.initial, tone);
    return tone;
  };
}

export const surname = (name: string) => name.split(/\s+/)[0] ?? name;
export const shortTitle = (title: string) => title.replace(/\s*vol\.?\s*\d+\s*$/i, "").trim() || title;

export function Avatar({ initial, tone, size = "md" }: { initial: string; tone: Tone; size?: "stack" | "sm" | "md" | "lg" }) {
  const { styles } = useVenueStyles();
  const [bg, ink] = useTone()(tone);
  const box = size === "lg" ? styles.avLg : size === "sm" ? styles.avSm : size === "stack" ? styles.avStack : styles.av;
  const text = size === "lg" ? styles.avLgText : size === "md" ? styles.avText : styles.avSmText;
  return <View style={[box, { backgroundColor: bg }]}><UiText style={[text, { color: ink }]}>{initial}</UiText></View>;
}

/** kit .avs：30 的小头像叠放（2px surface 描边，-8 重叠）。 */
export function AvatarStack({ people, toneOf }: { people: readonly { attendeeId?: string; initial: string }[]; toneOf: (person: { attendeeId?: string; initial: string }) => Tone }) {
  const { styles } = useVenueStyles();
  return (
    <View style={styles.avs}>
      {people.map((person, index) => <View key={`${person.attendeeId ?? person.initial}-${index}`} style={[styles.avsItem, index ? { marginLeft: -8 } : null]}><Avatar initial={person.initial} tone={toneOf(person)} size="stack" /></View>)}
    </View>
  );
}

export function Chip({ label, tone, coral, children }: { label: string; tone?: Tone; coral?: boolean; children?: ReactNode }) {
  const { styles, colors } = useVenueStyles();
  const toned = useTone();
  const [bg, ink] = coral ? [colors.coralSoft, colors.coral] : tone ? toned(tone) : [colors.surface2, colors.ink2];
  return <View style={[styles.chip, { backgroundColor: bg }]}>{children}<UiText style={[styles.chipText, { color: ink }]} numberOfLines={1}>{label}</UiText></View>;
}

export function exchangeChip(person: EventVenuePerson, t: JourneyT) {
  if (person.exchange === "incoming") return <Chip label={t("exIncoming")} tone="lav" />;
  if (person.exchange === "requested") return <Chip label={t("exRequested")} />;
  if (person.exchange === "exchanged") return <Chip label={t("exExchanged")} tone="teal" />;
  return null;
}

/** kit .why 18 圆钮 + 展开的 .why-body。 */
export function Why({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  const { styles } = useVenueStyles();
  return <UiPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} onPress={onToggle} hitSlop={8} style={styles.why}><UiText style={styles.whyText}>?</UiText></UiPressable>;
}
export function WhyBody({ text }: { text: string }) {
  const { styles } = useVenueStyles();
  return <View style={styles.whyBody}><UiText style={styles.whyBodyText}>{text}</UiText></View>;
}

/** 卡片底色 linear-gradient(150deg, mac-*, surface 65%)。 */
export function GradientCard({ from, style, children, testID }: { from: string; style?: object; children: ReactNode; testID?: string }) {
  const { styles, colors } = useVenueStyles();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // CSS 150deg：方向 (sin150, -cos150) = (0.5, 0.866)，渐变线长 = |w·0.5| + |h·0.866|，过中心。
  const half = size ? (size.w * 0.5 + size.h * 0.866) / 2 : 0;
  return (
    <View style={[styles.card, styles.clip, style]} onLayout={(event) => setSize({ h: event.nativeEvent.layout.height, w: event.nativeEvent.layout.width })} testID={testID}>
      {size ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Defs><LinearGradient id={`g${from}`} gradientUnits="userSpaceOnUse" x1={size.w / 2 - 0.5 * half} y1={size.h / 2 - 0.866 * half} x2={size.w / 2 + 0.5 * half} y2={size.h / 2 + 0.866 * half}><Stop offset={0} stopColor={from} /><Stop offset={0.65} stopColor={colors.surface} /></LinearGradient></Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#g${from})`} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/** kit .bar.thin：4 高，plum-300→plum-700 渐变，无圆钮。 */
export function ThinBar({ share }: { share: number }) {
  const { styles, colors } = useVenueStyles();
  const [width, setWidth] = useState(0);
  const fill = Math.max(0, Math.min(1, share)) * width;
  return (
    <View style={styles.thinBar} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {fill > 0 ? (
        <Svg width={fill} height={4} style={StyleSheet.absoluteFill}>
          <Defs><LinearGradient id="venueBar" x1={0} y1={0} x2={fill} y2={0} gradientUnits="userSpaceOnUse"><Stop offset={0} stopColor={colors.plum300} /><Stop offset={1} stopColor={colors.plum700} /></LinearGradient></Defs>
          <Rect x={0} y={0} width={fill} height={4} rx={2} fill="url(#venueBar)" />
        </Svg>
      ) : null}
    </View>
  );
}

export const useVenueStyles = createThemedStyles((colors) => StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  between: { justifyContent: "space-between" },
  grow: { flex: 1, minWidth: 0 },
  gap: { marginTop: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  clip: { overflow: "hidden" },
  flat: { backgroundColor: colors.surface2 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  sub: { color: colors.ink2, fontSize: 15, lineHeight: 23 },
  h3: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  title13: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  cardH: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  chip: { alignItems: "center", alignSelf: "flex-start", borderRadius: radius.pill, flexDirection: "row", gap: 4, maxWidth: "100%", paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 13, fontWeight: "700", lineHeight: 20 },
  av: { alignItems: "center", borderRadius: radius.pill, height: 38, justifyContent: "center", width: 38 },
  avText: { fontSize: 16, fontWeight: "800", lineHeight: 20 },
  avSm: { alignItems: "center", borderRadius: radius.pill, height: 30, justifyContent: "center", width: 30 },
  avSmText: { fontSize: 13, fontWeight: "800", lineHeight: 16 },
  avLg: { alignItems: "center", borderRadius: radius.pill, height: 56, justifyContent: "center", width: 56 },
  avLgText: { fontSize: 21, fontWeight: "800", lineHeight: 25 },
  avs: { flexDirection: "row" },
  // kit .avs .av：30（border-box，含 2px surface 描边）→ 内圆 26。
  avStack: { alignItems: "center", borderRadius: radius.pill, height: 26, justifyContent: "center", width: 26 },
  avsItem: { borderColor: colors.surface, borderRadius: radius.pill, borderWidth: 2 },
  li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
  liLine: { backgroundColor: colors.line, height: 1, left: 50, position: "absolute", right: 0, top: 0 },
  metaTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25 },
  metaSub: { color: colors.ink3, fontSize: 14, lineHeight: 21 },
  emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoText: { fontSize: 23, lineHeight: 28 },
  emoSm: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  emoSmText: { fontSize: 19, lineHeight: 25 },
  why: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 18, justifyContent: "center", width: 18 },
  whyText: { color: colors.ink3, fontSize: 12, fontWeight: "800", lineHeight: 15 },
  whyBody: { backgroundColor: colors.surface2, borderRadius: 14, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
  whyBodyText: { color: colors.ink2, fontSize: 14, lineHeight: 23 },
  lbtn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 34, justifyContent: "center", width: 34 },
  btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 32, justifyContent: "center", paddingHorizontal: 12 },
  btnSmText: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  primary: { backgroundColor: colors.ink },
  thinBar: { backgroundColor: colors.surface3, borderRadius: 6, height: 4, marginBottom: 4, marginTop: 8, overflow: "hidden" },
  big: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontVariant: ["tabular-nums"], fontWeight: "800" },
  mid: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 24, fontVariant: ["tabular-nums"], fontWeight: "800", letterSpacing: -0.22, lineHeight: 36 },
}));
