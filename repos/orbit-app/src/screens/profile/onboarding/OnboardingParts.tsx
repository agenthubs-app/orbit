/**
 * Layout pieces of the three-step onboarding (docs/designs/redesign-2026-10/onboarding-3step-proposal.html ④ App
 * A1–A7). Spacing, colours and structure are the board's CSS values; every font size is the board's put through the
 * App type scale (UX-1) by `type()`, line heights in proportion.
 */
import { useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, useWindowDimensions, type LayoutChangeEvent, type TextInputProps, type TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ShellBackground } from "../../../components/ShellBackground";
import { EmailNotice } from "../../../email-verification/EmailNotice";
import { useShellTopGap } from "../../../components/ShellTopBar";
import { Icon, IconButton, UiPressable, UiText, type IconName } from "../../../components/ui";
import Svg, { Defs, Rect, Stop } from "../../../components/ui/svg";
import { faceFor } from "../../../components/ui/Text";
import { createThemedStyles, useOrbitTheme } from "../../../design/theme";
import { shadows } from "../../../design/tokens";
import { appTypeSize } from "../../../design/type-scale";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import type { GoalTone } from "../../../view-models/profile-onboarding";
import { LinearGradient } from "../../plan/plan-svg";

const size = appTypeSize;
export function type(board: number, weight: TextStyle["fontWeight"] = "400", lineHeight = 1.5, letterSpacingEm = 0): TextStyle {
  const fontSize = size(board);
  return { fontSize, fontWeight: weight, lineHeight: Math.round(fontSize * lineHeight * 100) / 100, ...(letterSpacingEm ? { letterSpacing: Math.round(fontSize * letterSpacingEm * 100) / 100 } : {}) };
}

// Measured on the gate (see ui/cjk-lift): in the same line box iOS sets these sizes 1pt lower than the browser, and
// draws an emoji about 1.18× wider.
const LIFT = Platform.OS === "ios" ? { transform: [{ translateY: -1 }] } : {};
// The board's 1.5px borders lay out and draw as 1 (measured: .tog = line + 16 + 2).
const LINE = 1;
/** Kana / kanji take the Japanese face; an all-Latin value (a phone number, an address) stays in the system font, as drawn. */
const CJK = /[\u3040-\u30ff\u3400-\u9fff]/u;
const HALF_LIFT = Platform.OS === "ios" ? { transform: [{ translateY: -0.5 }] } : {};
const emoji = (board: number): TextStyle => ({ ...type(board), ...(Platform.OS === "ios" ? { fontSize: Math.round(appTypeSize(board) * 8.5) / 10 } : {}) });

/** .phone .scroll (0 18) under the status band; the top bar scrolls with the page, the foot stays at the bottom. */
export function OnboardingFrame({ children, footer, scrollRef }: { children: ReactNode; footer: ReactNode; scrollRef?: RefObject<ScrollView | null> }) {
  const { styles } = useOnboardingStyles();
  const topGap = useShellTopGap();
  // On iOS the foot is an inset, not padding: UIKit then scrolls a focused field clear of it, not just clear of the keyboard.
  const [footHeight, setFootHeight] = useState(120);
  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { paddingTop: topGap }]}>
      <ShellBackground />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        {/* The foot is absolute: it needs a box that the keyboard padding really shortens. */}
        <View style={styles.fill}>
        <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "ios" ? 24 : footHeight + 24 }]} contentInset={{ bottom: Platform.OS === "ios" ? footHeight : 0 }} scrollIndicatorInsets={{ bottom: footHeight }} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" style={styles.fill} testID="onboarding-scroll">
          <EmailNotice />
          {children}
        </ScrollView>
        <View onLayout={event => setFootHeight(event.nativeEvent.layout.height)} pointerEvents="box-none" style={styles.foot}>
          <FootFade />
          {footer}
        </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FootFade() {
  const { colors } = useOrbitTheme();
  const [box, setBox] = useState({ width: 0, height: 0 });
  return (
    <View onLayout={event => setBox(event.nativeEvent.layout)} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {box.width ? (
        <Svg height={box.height} width={box.width}>
          <Defs><LinearGradient id="onboardingFoot" x1="0" x2="0" y1="0" y2="1"><Stop offset="0" stopColor={colors.bg} stopOpacity="0" /><Stop offset="0.28" stopColor={colors.bg} stopOpacity="1" /></LinearGradient></Defs>
          <Rect fill="url(#onboardingFoot)" height={box.height} width={box.width} x={0} y={0} />
        </Svg>
      ) : null}
    </View>
  );
}

/** kit .topbar with text on the right: the 44 side cell keeps the title centred, the label overflows it evenly. */
export function OnboardingTopBar({ onBack, onLogout, title }: { onBack?: (() => void) | undefined; onLogout: () => void; /** 迁移账号补资料页用「プロフィールの確認」（UR-R10）。 */ title?: string }) {
  const { styles } = useOnboardingStyles();
  const { t } = useOrbitLocale();
  return (
    <View style={styles.topbar}>
      <View style={styles.side}>{onBack ? <IconButton accessibilityLabel={t("onboarding.v3.back")} icon="left" onPress={onBack} /> : null}</View>
      <UiText accessibilityRole="header" numberOfLines={1} style={styles.topTitle}>{title ?? t("onboarding.v3.title")}</UiText>
      <View style={styles.side}>
        <UiPressable accessibilityLabel={t("onboarding.v3.logout")} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }} onPress={onLogout} style={styles.logout} testID="onboarding-logout">
          <UiText numberOfLines={1} style={styles.logoutText}>{t("onboarding.v3.logout")}</UiText>
        </UiPressable>
      </View>
    </View>
  );
}

/** .stp.s3 + the 「ステップ n / 3」 line. */
export function OnboardingProgress({ index, label, eta, total }: { index: number; label: string; eta: string; total: number }) {
  const { styles } = useOnboardingStyles();
  return (
    <View>
      <View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.progress}>
        {Array.from({ length: total }, (_, bar) => <View key={bar} style={[styles.bar, bar < index && styles.barDone]}>{bar === index ? <View style={styles.barNow} /> : null}</View>)}
      </View>
      <View style={styles.progressLine}><UiText style={styles.lbl}>{label}</UiText><UiText style={styles.lbl}>{eta}</UiText></View>
    </View>
  );
}

/** .once: the fixed line under the progress bar of every step. */
export function OnceNotice({ scan }: { scan: boolean }) {
  const { styles } = useOnboardingStyles();
  const { t } = useOrbitLocale();
  return (
    <View style={styles.once}>
      <View style={[styles.emo, styles.emoSurface]}><UiText maxFontSizeMultiplier={1.2} style={styles.emoText}>🪪</UiText></View>
      <UiText style={styles.onceText}>
        {t("onboarding.v3.onceLead")}<UiText style={styles.onceStrong}>{t("onboarding.v3.onceStrong")}</UiText>{t("onboarding.v3.onceEnd")}{scan ? t("onboarding.v3.onceScan") : ""}
      </UiText>
    </View>
  );
}

export function Emo({ emoji, tone, large = false }: { emoji: string; tone: GoalTone | "surface"; large?: boolean }) {
  const { styles } = useOnboardingStyles();
  return <View style={[styles.emo, large && styles.emoLarge, styles[`emo_${tone}`]]}><UiText maxFontSizeMultiplier={1.2} style={large ? styles.emoTextLarge : styles.emoText}>{emoji}</UiText></View>;
}

/** .btn: 40 pill, sm 32, xl 50 (the page's main button). */
export function KitButton({ label, onPress, variant = "soft", size: height = "md", block = false, icon, iconSize = 16, badge, trailing, disabled = false, accessibilityLabel, testID }: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "soft" | "surface" | "ghost";
  size?: "md" | "sm" | "take" | "xl";
  block?: boolean;
  icon?: IconName;
  iconSize?: 16;
  badge?: string | undefined;
  trailing?: string | undefined;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors, styles } = useOnboardingStyles();
  const color = variant === "primary" ? colors.bg : variant === "ghost" ? colors.ink2 : colors.ink;
  return (
    <UiPressable accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} hitSlop={height === "sm" ? 6 : 2} onPress={onPress} testID={testID}
      style={[styles.btn, height === "sm" && styles.btnSm, height === "take" && styles.btnTake, height === "xl" && styles.btnXl, styles[`btn_${variant}`], block && styles.block, disabled && styles.disabled]}>
      {icon ? <Icon color={color} name={icon} size={iconSize} /> : null}
      <UiText numberOfLines={1} style={[styles.btnText, height === "sm" && styles.btnTextSm, height === "xl" && styles.btnTextXl, { color }]}>{label}{trailing ? <UiText style={[styles.btnTrailing, height === "xl" && styles.btnTrailingXl, { color }]}>{` ${trailing}`}</UiText> : null}</UiText>
      {badge ? <View style={styles.badge}><UiText style={styles.badgeText}>{badge}</UiText></View> : null}
    </UiPressable>
  );
}

export type FieldMark = "card" | "ai" | "carried" | undefined;

/** .fld: label (+ 名刺から / AI 推定 chip), 48 box, message or error below. */
export function Field({ badge, children, error, flagged = false, focused = false, hint, label, mark, onLayout, style, testID }: {
  /** A neutral chip after the label (「おすすめ」, UR-C); 名刺から / AI 推定 take its place when set. */
  badge?: string | undefined;
  children: ReactNode; error?: string | undefined;
  /** Red box without a message of its own (the group says what is wrong, UR-C13). */
  flagged?: boolean;
  focused?: boolean; hint?: string; label: string; mark?: FieldMark; onLayout?: (event: LayoutChangeEvent) => void; style?: object; testID?: string;
}) {
  const { styles } = useOnboardingStyles();
  return (
    <View onLayout={onLayout} style={[styles.field, style]} testID={testID}>
      <View style={styles.labelRow}>
        <UiText style={styles.label}>{label}</UiText>
        {mark ? <MarkChip mark={mark} /> : badge ? <View style={[styles.chip, styles.chipRec]}><UiText numberOfLines={1} style={[styles.chipText, styles.chipTextRec]}>{badge}</UiText></View> : null}
      </View>
      <View style={[styles.box, focused && styles.boxFocused, error || flagged ? styles.boxError : null]}>{children}</View>
      {error ? <UiText accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.msg, styles.msgError]}>{error}</UiText> : hint ? <UiText style={styles.msg}>{hint}</UiText> : null}
    </View>
  );
}

export function MarkChip({ mark }: { mark: "card" | "ai" | "carried" }) {
  const { styles } = useOnboardingStyles();
  const { t } = useOrbitLocale();
  // 「引き継ぎ」（UR-R10，旧系统带来的值）与「名刺から」同色。
  return <View style={[styles.chip, mark === "ai" ? styles.chipAi : styles.chipCard]}><UiText numberOfLines={1} style={[styles.chipText, mark === "ai" ? styles.chipTextAi : styles.chipTextCard]}>{t(mark === "ai" ? "onboarding.v3.fromAi" : mark === "carried" ? "onboarding.v3.carried" : "onboarding.v3.fromCard")}</UiText></View>;
}

export function TextField({ badge, error, flagged = false, hint, inputRef, label, accessibilityLabel, mark, onLayout, ...input }: { badge?: string | undefined; error?: string | undefined; flagged?: boolean; hint?: string; inputRef?: Ref<TextInput>; label: string; accessibilityLabel: string; mark?: FieldMark; onLayout?: (event: LayoutChangeEvent) => void } & Omit<TextInputProps, "style" | "onLayout">) {
  const { colors, styles } = useOnboardingStyles();
  const { language } = useOrbitLocale();
  const [focused, setFocused] = useState(false);
  return (
    <Field badge={badge} error={error} flagged={flagged} focused={focused} {...(hint ? { hint } : {})} label={label} mark={mark} {...(onLayout ? { onLayout } : {})}>
      <TextInput {...input} accessibilityHint={error} accessibilityLabel={accessibilityLabel} maxFontSizeMultiplier={1.7} onBlur={() => setFocused(false)} onFocus={() => setFocused(true)} placeholderTextColor={colors.ink3Text} ref={inputRef}
        returnKeyType={input.returnKeyType ?? "done"} style={[styles.input, Platform.OS === "ios" && language === "ja" && CJK.test(input.value || input.placeholder || "") ? { fontFamily: faceFor("400") } : null]} />
    </Field>
  );
}

export function SelectField({ accessibilityLabel, disabled = false, error, hint, icon, label, mark, onLayout, onPress, pressRef, style, trailing, value, placeholder }: {
  accessibilityLabel: string; disabled?: boolean; error?: string | undefined; hint?: string; icon: IconName; label: string; mark?: FieldMark; onLayout?: (event: LayoutChangeEvent) => void; onPress: () => void; pressRef?: Ref<View>; style?: object; trailing?: ReactNode; value: string | null; placeholder: string;
}) {
  const { colors, styles } = useOnboardingStyles();
  return (
    <Field error={error} {...(hint ? { hint } : {})} label={label} mark={mark} {...(onLayout ? { onLayout } : {})} {...(style ? { style } : {})}>
      <UiPressable accessibilityHint={error} accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} pressedScale={1} ref={pressRef} style={styles.select}>
        <UiText numberOfLines={1} style={[styles.selectText, value === null && styles.placeholder]}>{value ?? placeholder}</UiText>
        {trailing}
        <Icon color={colors.ink} name={icon} size={16} />
      </UiPressable>
    </Field>
  );
}

/** .miss: what is still missing (or why saving failed), centred above the button. */
export function MissLine({ text }: { text: string }) {
  const { colors, styles } = useOnboardingStyles();
  return <View accessibilityLiveRegion="polite" accessibilityRole="alert" accessible style={styles.miss} testID="onboarding-missing"><Icon color={colors.coralText} name="flag" size={16} /><UiText style={styles.missText}>{text}</UiText></View>;
}

/** .tog */
export function Toggle({ kind = "plain", label, onPress, disabled = false, accessibilityLabel }: { kind?: "plain" | "on" | "ai" | "add"; label: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const { colors, styles } = useOnboardingStyles();
  const icon = kind === "on" ? "check" : kind === "ai" ? "sparkle" : kind === "add" ? "plus" : null;
  const color = kind === "on" ? colors.ink : kind === "add" ? colors.ink3Text : colors.ink2;
  return (
    <UiPressable accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="button" accessibilityState={kind === "on" || kind === "plain" ? { disabled, selected: kind === "on" } : { disabled }} {...(kind === "on" || kind === "plain" ? { "aria-selected": kind === "on" } : {})} disabled={disabled} hitSlop={{ top: 3, bottom: 3, left: 0, right: 0 }} onPress={onPress}
      style={[styles.tog, kind === "on" && styles.togOn, kind === "ai" && styles.togAi, kind === "add" && styles.togAdd, disabled && styles.disabled]}>
      {icon ? <Icon color={color} name={icon} size={16} /> : null}
      <UiText style={[styles.togText, { color }]}>{label}</UiText>
    </UiPressable>
  );
}


export const useOnboardingStyles = createThemedStyles(colors => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: { paddingHorizontal: 18 },
  foot: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 30, gap: 8 },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 18, gap: 12 },

  topbar: { flexDirection: "row", alignItems: "center", minHeight: 52, paddingTop: 6, paddingBottom: 14 },
  side: { width: 44, alignItems: "flex-start", justifyContent: "center" },
  topTitle: { flex: 1, color: colors.ink, textAlign: "center", ...type(17, "800", 1.5, 0.01), ...LIFT },
  logout: { height: 32, justifyContent: "center", alignItems: "center", alignSelf: "center", minWidth: 120, marginHorizontal: -38 },
  logoutText: { color: colors.ink2, ...type(12, "700"), ...LIFT },

  progress: { flexDirection: "row", gap: 5 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  barDone: { backgroundColor: colors.plum500 },
  barNow: { width: "50%", height: 5, backgroundColor: colors.plum700 },
  progressLine: { flexDirection: "row", justifyContent: "space-between", marginTop: 7, marginBottom: 12 },
  lbl: { color: colors.ink3Text, ...type(11.5, "500") },

  once: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.accentSoft },
  onceText: { flex: 1, color: colors.ink2, ...type(12.5, "600", 1.65), ...LIFT },
  onceStrong: { color: colors.ink, ...type(12.5, "800", 1.65) },

  emo: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emoLarge: { width: 40, height: 40, borderRadius: 13 },
  emoSurface: { backgroundColor: colors.surface },
  emo_surface: { backgroundColor: colors.surface },
  emo_pink: { backgroundColor: colors.macPink },
  emo_apricot: { backgroundColor: colors.macApricot },
  emo_blue: { backgroundColor: colors.macBlue },
  emo_teal: { backgroundColor: colors.macTeal },
  emo_lav: { backgroundColor: colors.macLav },
  emoText: emoji(17),
  emoTextLarge: emoji(21),

  h1: { color: colors.ink, marginTop: 14, ...type(24, "900", 1.35, -0.01) },
  h1Second: { color: colors.ink, marginTop: 22, marginBottom: 4, ...type(19, "900", 1.35, -0.01), ...LIFT },
  sub: { color: colors.ink2, marginTop: 4, marginBottom: 14, ...type(12.5), ...LIFT },
  subSecond: { color: colors.ink2, marginBottom: 14, ...type(12.5), ...LIFT },

  scan: { borderWidth: 2, borderStyle: "dashed", borderColor: colors.plum300, borderRadius: 22, paddingVertical: 18, paddingHorizontal: 16, marginTop: 12, gap: 10, alignItems: "center", overflow: "hidden" },
  // color-mix(accent-soft 55%, transparent)
  scanTint: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.accentSoft, opacity: 0.55 },
  scanEmoji: emoji(34),
  scanTitle: { color: colors.ink, textAlign: "center", ...type(15, "700") },
  scanDone: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.macLav },
  scanDoneText: { flex: 1, minWidth: 0 },
  // The board's <b> sits in a 14/1.5 line box.
  scanDoneTitle: { color: colors.ink, ...type(13.5, "700"), lineHeight: size(14) * 1.5, ...LIFT },

  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, alignSelf: "center" },
  btnSm: { height: 32, paddingHorizontal: 12 },
  btnTake: { height: 46, paddingHorizontal: 22 },
  btnXl: { height: 50 },
  btn_primary: { backgroundColor: colors.ink },
  btn_soft: { backgroundColor: colors.surface2 },
  btn_surface: { backgroundColor: colors.surface },
  btn_ghost: { backgroundColor: "transparent" },
  block: { alignSelf: "stretch" },
  disabled: { opacity: 0.45 },
  btnText: { ...type(13, "700") },
  btnTextSm: { ...type(12, "700") },
  btnTextXl: { ...type(14.5, "700") },
  btnTrailingXl: { ...type(14.5, "600") },
  btnTrailing: { opacity: 0.6, ...type(13, "600") },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: colors.surface },
  badgeText: { color: colors.ink2, ...type(11, "700") },

  field: { marginTop: 12 },
  fieldHalf: { flex: 1, minWidth: 0 },
  fieldRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  label: { color: colors.ink2, ...type(12, "700"), ...LIFT },
  box: { height: 48, borderRadius: 14, borderWidth: LINE, borderColor: "transparent", backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  boxFocused: { borderColor: colors.plum500 },
  boxError: { borderColor: colors.coral, backgroundColor: colors.coralSoft },
  input: { flex: 1, minWidth: 0, alignSelf: "stretch", paddingHorizontal: 14, paddingVertical: 0, color: colors.ink, fontSize: type(14).fontSize, outlineStyle: "solid", outlineWidth: 0 },
  select: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14 },
  selectText: { flex: 1, minWidth: 0, color: colors.ink, ...type(14), ...LIFT },
  placeholder: { color: colors.ink3Text },
  clear: { alignItems: "center", justifyContent: "center", width: 24, height: 24 },
  msg: { color: colors.ink3Text, marginTop: 6, ...type(11.5, "600", 1.55), ...LIFT },
  msgError: { color: colors.coralText },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipCard: { backgroundColor: colors.macLav },
  chipAi: { backgroundColor: colors.macBlue },
  chipText: { ...type(11, "700") },
  // UR-C .chip.rec：页面底上 surface-2 / ink-3。
  chipRec: { backgroundColor: colors.surface2 },
  chipTextRec: { color: colors.ink3Text },
  chipTextCard: { color: colors.macLavText },
  chipTextAi: { color: colors.macBlueText },

  miss: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  missText: { flexShrink: 1, color: colors.coralText, ...type(13, "700"), ...LIFT },
  errLine: { color: colors.coralText, marginTop: 12, ...type(12, "700"), ...LIFT },
  // UR-C .cg：联系方式组（与上面的栏位同一种样式，不再套卡）。
  cg: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.line },
  cgHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  cgTitle: { color: colors.ink, ...type(16, "800") },
  cgSmall: { color: colors.ink3Text, ...type(12, "700") },
  cgSee: { color: colors.ink2, marginTop: 4, ...type(12.5, "600", 1.6), ...LIFT },
  addMore: { marginTop: 12, height: 48, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.ink4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  addMoreError: { borderColor: colors.coral },
  addMoreText: { color: colors.ink2, ...type(13.5, "700"), ...LIFT },

  goals: { gap: 10 },
  // .gt.err outline (1.5 → drawn as 1, offset 6) outside the grid without moving it.
  goalsError: { position: "absolute", left: -7, right: -7, top: -7, bottom: -7, borderRadius: 29, borderWidth: 1, borderColor: colors.coral },
  goalRow: { flexDirection: "row", gap: 10 },
  goal: { flex: 1, minWidth: 0, borderRadius: 20, borderWidth: 2, borderColor: "transparent", backgroundColor: colors.surface, padding: 13, gap: 6, alignItems: "flex-start" },
  goalOn: { borderColor: colors.plum500 },
  goalText: { color: colors.ink, ...type(13, "700"), ...LIFT },
  goalSub: { color: colors.ink3Text, ...type(11, "500"), ...LIFT },
  order: { position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  orderText: { color: colors.onAccent, ...type(11, "800") },

  group: { marginTop: 16 },
  groupFirst: { marginTop: 0 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  groupTitle: { color: colors.ink, ...type(13, "800"), ...LIFT },
  groupChip: { marginLeft: 6 },
  togs: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tog: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, borderWidth: LINE, borderColor: "transparent", backgroundColor: colors.surface },
  togOn: { backgroundColor: colors.accentSoft, borderColor: colors.plum500 },
  togAi: { backgroundColor: "transparent", borderStyle: "dashed", borderColor: colors.plum300 },
  togAdd: { backgroundColor: "transparent", borderStyle: "dashed", borderColor: colors.ink4 },
  togText: { ...type(12.5, "700"), ...LIFT },

  seg: { flexDirection: "row", alignSelf: "flex-start", gap: 2, padding: 3, borderRadius: 999, backgroundColor: colors.surface2, marginBottom: 12 },
  segItem: { paddingVertical: 6, paddingHorizontal: 13, borderRadius: 999 },
  segOn: { backgroundColor: colors.surface, ...shadows.segment },
  segText: { color: colors.ink2, ...type(12, "600") },
  segTextOn: { color: colors.ink },
  card: { borderRadius: 24, padding: 18, backgroundColor: colors.surface },
  introText: { color: colors.ink, ...type(14, "400", 1.85), ...HALF_LIFT },
  introInput: { color: colors.ink, padding: 0, minHeight: 130, textAlignVertical: "top", outlineStyle: "solid", outlineWidth: 0, ...type(14, "400", 1.85) },
  introMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  over: { color: colors.coralText },
  push: { marginLeft: "auto" },
  why: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  whyText: { color: colors.ink3Text, ...type(10.5, "800") },
  whyBody: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surface2 },
  whyBodyText: { color: colors.ink2, ...type(12, "400", 1.65), ...LIFT },
  bone: { height: 14, borderRadius: 7, marginBottom: 12, backgroundColor: colors.surface3 },
  regenerate: { marginTop: 12 },
  private: { color: colors.ink3Text, textAlign: "center", marginTop: 10, ...type(11.5, "500"), ...LIFT },

  sheetTitle: { color: colors.ink, marginBottom: 10, ...type(17, "800") },
  // UR-R11 .sheet.pick：标题 + 件数 + ✕；每行 54 高、单选圈；最后一行露一半，底部渐隐。
  pickHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  pickTitle: { flex: 1, color: colors.ink, ...type(18, "800") },
  pickCount: { color: colors.ink3Text, ...type(12, "700") },
  opt: { height: 54, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderRadius: 14, marginTop: 2 },
  optOn: { backgroundColor: colors.accentSoft },
  optText: { flex: 1, minWidth: 0, color: colors.ink, ...type(15, "700"), ...LIFT },
  rad: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.8, borderColor: colors.ink4, alignItems: "center", justifyContent: "center" },
  radOn: { borderColor: colors.plum700 },
  radDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.plum700 },
  optFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 40 },
  repairNotice: { marginTop: 4 },
  clearBirth: { alignItems: "flex-start", marginTop: 8 },
  dim: { opacity: 0.55 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface2, marginBottom: 6 },
  sheetRowOn: { backgroundColor: colors.accentSoft },
  sheetRowText: { flex: 1, color: colors.ink, ...type(14, "600") },
  sheetInput: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.surface2, color: colors.ink, marginBottom: 10, fontSize: type(14).fontSize },
}));

/**
 * UR-R11 行业底部面板（迁移账号补资料）：标题旁写件数；列表固定高度，最后一行露出一半，底部渐隐，打开时闪一下滚动条，一看就知道能滚。
 * 点选即关闭；✕ 或点外面不改。
 */
export function PickList({ count, onClose, onPick, options, selected, title }: { count: number; onClose: () => void; onPick: (id: string) => void; options: readonly { id: string; label: string }[]; selected: string; title: string }) {
  const { colors, styles } = useOnboardingStyles();
  const { t } = useOrbitLocale();
  const { height } = useWindowDimensions();
  const list = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  // Whole rows that fit in about 62% of the screen, plus half a row (56 = 54 + 2 gap).
  const fit = Math.max(3, Math.floor((height * 0.62) / 56));
  const listHeight = options.length > fit ? fit * 56 + 28 : options.length * 56 + 4;
  useEffect(() => { const timer = setTimeout(() => list.current?.flashScrollIndicators(), 350); return () => clearTimeout(timer); }, []);
  return (
    <View testID="onboarding-pick-list">
      <View style={styles.pickHead}>
        <UiText accessibilityRole="header" numberOfLines={1} style={styles.pickTitle}>{title}</UiText>
        <UiText style={styles.pickCount}>{t("onboarding.v3.itemCount", { count })}</UiText>
        <IconButton accessibilityLabel={t("common.close")} icon="x" onPress={onClose} />
      </View>
      <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height: listHeight }}>
        <ScrollView ref={list} nestedScrollEnabled persistentScrollbar showsVerticalScrollIndicator>
          {options.map(option => {
            const on = option.id === selected;
            return (
              <UiPressable accessibilityLabel={option.label} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} key={option.id} onPress={() => onPick(option.id)} pressedScale={1} style={[styles.opt, on && styles.optOn]}>
                <View style={[styles.rad, on && styles.radOn]}>{on ? <View style={styles.radDot} /> : null}</View>
                <UiText numberOfLines={1} style={styles.optText}>{option.label}</UiText>
              </UiPressable>
            );
          })}
        </ScrollView>
        {options.length > fit && width ? (
          <Svg height={40} pointerEvents="none" style={styles.optFade} width={width}>
            <Defs><LinearGradient id="pickFade" x1={0} x2={0} y1={0} y2={40} gradientUnits="userSpaceOnUse"><Stop offset={0} stopColor={colors.surface} stopOpacity={0} /><Stop offset={1} stopColor={colors.surface} stopOpacity={1} /></LinearGradient></Defs>
            <Rect fill="url(#pickFade)" height={40} width={width} x={0} y={0} />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}
