// R23–R25 App 计划页像素返工（RD-16）：设计稿 kit（docs/designs/redesign-2026-10/kit/ui.css 与
// app.html / b4 / b10 / b12 画板）里计划页用到的类，按原数值一次翻译成 RN 样式与小组件。
// 规则：字号 / 字重 / 行高（kit 默认 1.5，类里另写的照写）/ 字距（em × 字号）/ 间距 / 圆角照抄，
// 颜色只用 token；看得见的按钮高 40，用 hitSlop 把可点范围补到 44（决定表 D01）。
// 只放计划页自己的业务小件；通用组件仍用 src/components/ui。
import { useState, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { Icon, UiPressable, UiText } from "../../components/ui";
import Svg, { Defs, Path, Rect, Stop } from "../../components/ui/svg";
import type { DesignIconName } from "../../api/design/icons";
import { createThemedStyles } from "../../design/theme";
import { LinearGradient } from "./plan-svg";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";

/** kit 文字：字号、字重、行高倍数（默认 1.5）、字距（em）。 */
export function kitText(size: number, weight: TextStyle["fontWeight"] = "400", lineHeight = 1.5, letterSpacingEm = 0): TextStyle {
  return { fontSize: size, fontWeight: weight, lineHeight: Math.round(size * lineHeight * 100) / 100, ...(letterSpacingEm ? { letterSpacing: Math.round(size * letterSpacingEm * 100) / 100 } : {}) };
}

export type KitTone = "neutral" | "lav" | "teal" | "pink" | "apricot" | "blue" | "coral" | "ok";

/** .chip（padding 3 / 9、圆角 999、11px 700），带 mac 色。 */
export function KitChip({ label, tone = "neutral", style }: { label: string; tone?: KitTone; style?: StyleProp<ViewStyle> }) {
  const { styles } = useKitStyles();
  return (
    <View style={[styles.chip, styles[`chip_${tone}`], style]}>
      <UiText numberOfLines={1} style={[styles.chipText, styles[`chipText_${tone}`]]}>{label}</UiText>
    </View>
  );
}

/** kit .sample-tag（9.5px 800、圆角 6、apricot）：示例数据必须标出（「处处有据」）。 */
export function KitSampleTag({ style }: { style?: StyleProp<ViewStyle> }) {
  const { styles } = useKitStyles();
  const copy = useStandardCopy();
  return <View style={[styles.sampleTag, style]}><UiText style={styles.sampleTagText}>{copy.sample.tag}</UiText></View>;
}

/** .emo（40 / 圆角 13 / 21px）与 .emo.sm（32 / 10 / 17px）。 */
export function KitEmo({ emoji, tone = "lav", sm = false }: { emoji: string; tone?: Exclude<KitTone, "neutral" | "coral" | "ok">; sm?: boolean }) {
  const { styles } = useKitStyles();
  return (
    <View style={[sm ? styles.emoSm : styles.emo, styles[`emo_${tone}`]]}>
      <UiText maxFontSizeMultiplier={1.2} style={sm ? styles.emoTextSm : styles.emoText}>{emoji}</UiText>
    </View>
  );
}

/** .why：18px 圆形「?」，点开 / 收起 .why-body（根拠）。 */
export function useKitWhy(reason: string | null | undefined) {
  const { styles } = useKitStyles();
  const copy = useStandardCopy();
  const [open, setOpen] = useState(false);
  const button = reason ? (
    <UiPressable accessibilityRole="button" accessibilityLabel={copy.aiCard.showWhy} accessibilityState={{ expanded: open }} hitSlop={13} onPress={() => setOpen((value) => !value)} style={styles.why}>
      <UiText style={styles.whyText}>?</UiText>
    </UiPressable>
  ) : null;
  const body = reason && open ? <View style={styles.whyBody}><UiText style={styles.whyBodyText}>{reason}</UiText></View> : null;
  return { button, body, open };
}

/** .btn（高 40、圆角 999、13px 700、surface-2）/ .primary / .sm（高 32、12px）。可点范围补到 44。 */
export function KitButton({ label, icon, onPress, primary = false, sm = false, xl = false, disabled = false, badge, style, accessibilityLabel, testID }: {
  label: string;
  icon?: DesignIconName;
  onPress: () => void;
  primary?: boolean;
  sm?: boolean;
  /** .btn.xl：高 50、14.5px（底栏主按钮）。 */
  xl?: boolean;
  disabled?: boolean;
  badge?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors, styles } = useKitStyles();
  const color = primary ? colors.bg : colors.ink;
  return (
    <UiPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={sm ? 6 : 2}
      onPress={onPress}
      style={[styles.btn, sm && styles.btnSm, xl && styles.btnXl, primary && styles.btnPrimary, disabled && styles.btnDisabled, style]}
      testID={testID}
    >
      {icon ? <Icon name={icon} size={16} color={color} /> : null}
      <UiText numberOfLines={1} style={[sm ? styles.btnTextSm : xl ? styles.btnTextXl : styles.btnText, { color }]}>{label}</UiText>
      {badge ? <View style={styles.btnBadge}><UiText style={styles.btnBadgeText}>{badge}</UiText></View> : null}
    </UiPressable>
  );
}

/** .card（surface、圆角 r-xl 24、padding 18）。 */
export function KitCard({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { styles } = useKitStyles();
  return <View style={[styles.card, style]} testID={testID}>{children}</View>;
}

/** .card-h：h3（14.5px 800）+ 右侧 .lbl / 任意节点。 */
export function KitCardHead({ title, right, style }: { title: ReactNode; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { styles } = useKitStyles();
  return (
    <View style={[styles.cardH, style]}>
      {typeof title === "string" ? <UiText accessibilityRole="header" style={styles.h3}>{title}</UiText> : title}
      {typeof right === "string" ? <UiText style={styles.lbl}>{right}</UiText> : right}
    </View>
  );
}

/**
 * kit `linear-gradient(135deg, from, to stop%)` 铺满父容器（父容器要 overflow hidden + 圆角）。
 * CSS 的 135° 渐变线过中心、长度 = (w + h)·sin45°，这里按同一几何换成 userSpace 端点。
 * `vertical`：`linear-gradient(to bottom, …)`（底栏 .foot 的淡出）；`fromOpacity` 0 = 从透明开始（kit `transparent`）。
 */
export function KitGradient({ from, to, stop = 1, id, vertical = false, fromOpacity = 1 }: { from: string; to: string; stop?: number; id: string; vertical?: boolean; fromOpacity?: number }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const half = size ? ((size.w + size.h) * Math.SQRT1_2) / 2 : 0;
  const cx = (size?.w ?? 0) / 2;
  const cy = (size?.h ?? 0) / 2;
  const d = half * Math.SQRT1_2;
  return (
    <View pointerEvents="none" onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} style={StyleSheet.absoluteFill}>
      {size ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={vertical ? 0 : cx - d} y1={vertical ? 0 : cy - d} x2={vertical ? 0 : cx + d} y2={vertical ? size.h : cy + d}>
              <Stop offset={0} stopColor={from} stopOpacity={fromOpacity} />
              <Stop offset={stop} stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * kit 习熟斜纹 `repeating-linear-gradient(135deg, plum-300 0 2px, plum-100 2px 6px)`：沿渐变方向每 6px 一条 2px 线，
 * 线与 x + y = 常数 平行，相位从左上角 0 开始。
 */
export function KitHatch({ line, base }: { line: string; base: string }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const period = 6 * Math.SQRT2;
  const width = 2 * Math.SQRT2;
  const d = size ? Array.from({ length: Math.ceil((size.w + size.h) / period) + 1 }, (_, k) => {
    const a = k * period;
    const b = a + width;
    return `M${a} 0L${b} 0L${b - size.h} ${size.h}L${a - size.h} ${size.h}Z`;
  }).join("") : "";
  return (
    <View pointerEvents="none" onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} style={[StyleSheet.absoluteFill, { backgroundColor: base }]}>
      {size ? <Svg width={size.w} height={size.h}><Path d={d} fill={line} /></Svg> : null}
    </View>
  );
}

const STAGE_KEYS = ["plan.stage.background", "plan.stage.questions", "plan.stage.draft", "plan.stage.fix", "plan.stage.manual"] as const;

/** .fm 五段进度（背景 / 質問 / 初版 / AI 修正 / 手動編集）：每段顶上 4px 条，done = plum-300 + ink-3，on = plum-700 + ink；5 = 全部完成。 */
export function KitStages({ stage, style, keys = STAGE_KEYS }: { stage: 0 | 1 | 2 | 3 | 4 | 5; style?: StyleProp<ViewStyle>; keys?: readonly (typeof STAGE_KEYS[number] | "plan.review.stagePremise" | "plan.review.stageFix" | "plan.review.stageManual")[] }) {
  const { styles } = useKitStyles();
  const { t } = useOrbitLocale();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t("plan.stage.label", { stage: t(keys[Math.min(stage, keys.length - 1)]!) })} style={[styles.fm, style]}>
      {keys.map((key, index) => (
        <View key={key} style={styles.fmItem}>
          <View style={[styles.fmBar, index < stage && styles.fmBarDone, index === stage && styles.fmBarOn]} />
          <UiText numberOfLines={1} style={[styles.fmText, index < stage && styles.fmTextDone, index === stage && styles.fmTextOn]}>{t(key)}</UiText>
        </View>
      ))}
    </View>
  );
}

export const useKitStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18 },
  cardH: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  h3: { color: colors.ink, ...kitText(14.5, "800") },
  lbl: { color: colors.ink3, ...kitText(11.5, "500") },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  grow: { flex: 1, minWidth: 0 },

  chip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, maxWidth: "100%" },
  chipText: { ...kitText(11, "700") },
  chip_neutral: { backgroundColor: colors.surface2 },
  chipText_neutral: { color: colors.ink2 },
  chip_lav: { backgroundColor: colors.macLav },
  chipText_lav: { color: colors.macLavInk },
  chip_teal: { backgroundColor: colors.macTeal },
  chipText_teal: { color: colors.macTealInk },
  chip_pink: { backgroundColor: colors.macPink },
  chipText_pink: { color: colors.macPinkInk },
  chip_apricot: { backgroundColor: colors.macApricot },
  chipText_apricot: { color: colors.macApricotInk },
  chip_blue: { backgroundColor: colors.macBlue },
  chipText_blue: { color: colors.macBlueInk },
  chip_coral: { backgroundColor: colors.coralSoft },
  chipText_coral: { color: colors.coralText },
  chip_ok: { backgroundColor: colors.okSoft },
  chipText_ok: { color: colors.okText },

  emo: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  emoSm: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emoText: { fontSize: 21, lineHeight: 31.5 },
  emoTextSm: { fontSize: 17, lineHeight: 25.5 },
  emo_lav: { backgroundColor: colors.macLav },
  emo_teal: { backgroundColor: colors.macTeal },
  emo_pink: { backgroundColor: colors.macPink },
  emo_apricot: { backgroundColor: colors.macApricot },
  emo_blue: { backgroundColor: colors.macBlue },

  why: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  whyText: { color: colors.ink3, ...kitText(10.5, "800", 1.5), textAlign: "center" },
  whyBody: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surface2 },
  whyBodyText: { color: colors.ink2, ...kitText(12, "400", 1.65) },

  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.surface2 },
  btnSm: { height: 32, paddingHorizontal: 12 },
  btnPrimary: { backgroundColor: colors.ink },
  btnDisabled: { opacity: 0.45 },
  btnText: { ...kitText(13, "700") },
  btnXl: { height: 50 },
  btnTextXl: { ...kitText(14.5, "700") },
  btnTextSm: { ...kitText(12, "700") },
  btnBadge: { backgroundColor: colors.accentSoft, borderRadius: 6, paddingVertical: 1, paddingHorizontal: 4 },
  btnBadgeText: { color: colors.plum700, ...kitText(9.5, "800", 1.5, -0.02) },

  sampleTag: { alignSelf: "flex-start", paddingVertical: 1, paddingHorizontal: 6, borderRadius: 6, backgroundColor: colors.macApricot },
  sampleTagText: { color: colors.macApricotInk, ...kitText(9.5, "800") },
  fm: { flexDirection: "row", gap: 4 },
  fmItem: { flex: 1, minWidth: 0, alignItems: "center", paddingTop: 7 },
  fmBar: { position: "absolute", left: 0, right: 0, top: 0, height: 4, borderRadius: 2, backgroundColor: colors.surface3 },
  fmBarDone: { backgroundColor: colors.plum300 },
  fmBarOn: { backgroundColor: colors.plum700 },
  fmText: { color: colors.ink4, ...kitText(10, "800") },
  fmTextDone: { color: colors.ink3 },
  fmTextOn: { color: colors.ink },
}));
