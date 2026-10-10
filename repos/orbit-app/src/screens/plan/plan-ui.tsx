// R23 plan screens: small business pieces shared by the goal input, the flow page
// and the manual edit page. Built from src/components/ui and theme tokens only.
import type { ReactNode, RefObject } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, IconButton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { PlanFailure } from "./plan-api";
import type { FlowStage } from "./plan-model";

const STAGE_KEYS = ["plan.stage.background", "plan.stage.questions", "plan.stage.draft", "plan.stage.fix", "plan.stage.manual"] as const;

/** 背景 / 質問 / 初版 / AI 修正 / 手動編集 — the current one dark, the ones before it soft. */
export function PlanProgress({ stage }: { stage: FlowStage }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t("plan.stage.label", { stage: t(STAGE_KEYS[stage]) })} style={styles.progress}>
      {STAGE_KEYS.map((key, index) => (
        <View key={key} style={styles.progressItem}>
          <View style={[styles.progressBar, index < stage && styles.progressDone, index === stage && styles.progressNow]} />
          <UiText numberOfLines={1} style={[styles.progressLabel, index === stage && styles.progressLabelNow]}>{t(key)}</UiText>
        </View>
      ))}
    </View>
  );
}

/**
 * The full-screen frame of the flow and the manual edit page (pushed from below, no
 * tab bar): a close button, the title, the five-step progress, a scrolling body and
 * an optional fixed footer (the AI-fix bar, the totals bar).
 */
export function PlanFrame({ title, subtitle, stage, onClose, right, footer, scrollRef, children }: {
  title: string;
  subtitle?: string;
  stage: FlowStage | null;
  onClose: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  scrollRef?: RefObject<ScrollView | null>;
  children: ReactNode;
}) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.frame}>
      <View style={styles.header}>
        <IconButton icon="x" accessibilityLabel={t("plan.frame.close")} onPress={onClose} size={34} soft />
        <View style={styles.headerText}>
          <UiText accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</UiText>
          {subtitle ? <UiText numberOfLines={1} style={styles.subtitle}>{subtitle}</UiText> : null}
        </View>
        <View style={styles.headerRight}>{right}</View>
      </View>
      {stage === null ? null : <PlanProgress stage={stage} />}
      <ScrollView ref={scrollRef} automaticallyAdjustKeyboardInsets contentContainerStyle={styles.body} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** A single-choice pill (立場、関わり方、選択肢、目標タイプ). */
export function ChoiceChip({ label, selected, onPress, guessed = false, disabled = false, accessibilityRole = "radio" }: { label: string; selected: boolean; onPress: () => void; guessed?: boolean; disabled?: boolean; accessibilityRole?: "radio" | "checkbox" }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <UiPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={guessed ? `${label} ${t("plan.common.guessed")}` : label}
      accessibilityState={accessibilityRole === "radio" ? { selected, checked: selected, disabled } : { checked: selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn, selected && guessed && styles.chipGuessed, disabled && styles.disabled]}
    >
      <UiText numberOfLines={2} style={[styles.chipLabel, selected && styles.chipLabelOn]}>{label}</UiText>
      {selected && guessed ? <UiText style={styles.chipTag}>{t("plan.common.guessed")}</UiText> : null}
    </UiPressable>
  );
}

/** A small label pill (出典、推測、空き …). */
export function Tag({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" | "gap" | "ok" }) {
  const { styles } = useStyles();
  return (
    <View style={[styles.tag, tone === "accent" && styles.tagAccent, tone === "gap" && styles.tagGap, tone === "ok" && styles.tagOk]}>
      <UiText numberOfLines={1} style={[styles.tagText, tone === "accent" && styles.tagTextAccent, tone === "gap" && styles.tagTextGap, tone === "ok" && styles.tagTextOk]}>{label}</UiText>
    </View>
  );
}

export function SectionTitle({ title, trailing }: { title: string; trailing?: ReactNode }) {
  const { styles } = useStyles();
  return (
    <View style={styles.sectionRow}>
      <UiText accessibilityRole="header" style={styles.sectionTitle}>{title}</UiText>
      {trailing}
    </View>
  );
}

/** AI_LIMIT and the goal limits: an explanation, never the failure card (UI-SPEC). */
export function LimitNote({ failure }: { failure: Extract<PlanFailure, { kind: "aiLimit" | "goalMonthlyLimit" | "goalLimit" }> }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const text = failure.kind === "aiLimit"
    ? t(failure.limit === "monthly" ? "plan.limit.aiMonthly" : "plan.limit.aiDaily")
    : t(failure.kind === "goalMonthlyLimit" ? "plan.limit.goalMonthly" : "plan.limit.goalActive");
  return (
    <View accessibilityRole="text" style={styles.limit}>
      <UiText style={styles.limitText}>{text}</UiText>
    </View>
  );
}

/** 「別の端末で変更されました」 + read again. */
export function StaleNote({ onReload }: { onReload: () => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <View accessibilityRole="alert" style={styles.limit}>
      <UiText style={styles.limitText}>{t("plan.error.stale")}</UiText>
      <Button label={t("plan.error.reload")} onPress={onReload} size="sm" variant="secondary" />
    </View>
  );
}

/** A plain one-line problem (network, used up, other) under the action that failed. */
export function InlineProblem({ text }: { text: string }) {
  const { styles } = useStyles();
  return <UiText accessibilityRole="alert" style={styles.problem}>{text}</UiText>;
}

export function isLimitFailure(failure: PlanFailure | null): failure is Extract<PlanFailure, { kind: "aiLimit" | "goalMonthlyLimit" | "goalLimit" }> {
  return failure?.kind === "aiLimit" || failure?.kind === "goalMonthlyLimit" || failure?.kind === "goalLimit";
}

/** The generic sentence for a failure that has no screen of its own. */
export function useFailureText() {
  const { t } = useOrbitLocale();
  return (failure: PlanFailure): string => {
    switch (failure.kind) {
      case "network": return t("plan.error.network");
      case "used": return t("plan.error.used");
      case "aiBusy": return t("plan.error.busy");
      default: return t("plan.error.generic");
    }
  };
}

export const usePlanStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16, gap: 12 },
  softCard: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 14, gap: 8 },
  dashedCard: { borderRadius: radius.lg, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.surface3, padding: 14, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  grow: { flex: 1, minWidth: 0 },
  heading: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 13.5, lineHeight: 21 },
  body2: { color: colors.ink2, fontSize: 13, lineHeight: 20 },
  caption: { color: colors.ink3Text, fontSize: 12, lineHeight: 17 },
  label: { color: colors.ink2, fontSize: 12, fontWeight: "700" },
  number: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  numberNow: { backgroundColor: colors.plum900 },
  numberText: { color: colors.ink2, fontSize: 12, fontWeight: "800" },
  numberTextNow: { color: colors.onAccent },
  input: { minHeight: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, color: colors.ink, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  inputMultiline: { minHeight: 64, textAlignVertical: "top" },
  conclusion: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 12, gap: 6 },
  conclusionText: { color: colors.accentText, fontSize: 13.5, lineHeight: 21, fontWeight: "700" },
  emoji: { fontSize: 20, lineHeight: 26 },
  strike: { color: colors.ink3Text, fontSize: 12.5, lineHeight: 19, textDecorationLine: "line-through" },
  after: { color: colors.ink, fontSize: 13, lineHeight: 20, backgroundColor: colors.accentSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  bubble: { alignSelf: "flex-end", maxWidth: "86%", backgroundColor: colors.plum900, borderRadius: radius.bubble, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { color: colors.onAccent, fontSize: 13.5, lineHeight: 20 },
  divider: { height: 1, backgroundColor: colors.line },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: "transparent" },
  avatarOn: { backgroundColor: colors.plum100, borderColor: colors.plum500 },
  avatarText: { color: colors.ink3Text, fontSize: 12, fontWeight: "800" },
  avatarTextOn: { color: colors.plum900 },
  footerRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  bigNumber: { color: colors.ink, fontSize: 22, lineHeight: 26, fontWeight: "900" },
  bigNumberOut: { color: colors.ink3Text },
}));

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  headerText: { flex: 1, minWidth: 0 },
  headerRight: { flexShrink: 0 },
  title: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  subtitle: { color: colors.ink3Text, fontSize: 12, lineHeight: 17 },
  progress: { flexDirection: "row", gap: 4, paddingHorizontal: 16, paddingBottom: 10 },
  progressItem: { flex: 1, gap: 4, minWidth: 0 },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: colors.surface3 },
  progressDone: { backgroundColor: colors.plum300 },
  progressNow: { backgroundColor: colors.plum900 },
  progressLabel: { color: colors.ink3Text, fontSize: 10.5, textAlign: "center" },
  progressLabelNow: { color: colors.ink, fontWeight: "800" },
  body: { alignSelf: "center", width: "100%", maxWidth: 540, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, gap: 14 },
  footer: { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, gap: 8 },
  chip: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: "transparent", maxWidth: "100%" },
  chipOn: { borderColor: colors.plum500, backgroundColor: colors.accentSoft },
  chipGuessed: { borderStyle: "dashed", backgroundColor: colors.surface },
  chipLabel: { color: colors.ink2, fontSize: 12.5, fontWeight: "700", flexShrink: 1 },
  chipLabelOn: { color: colors.ink },
  chipTag: { color: colors.ink3Text, fontSize: 10.5, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  tag: { alignSelf: "flex-start", borderRadius: radius.tag, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.surface2, maxWidth: 180 },
  tagAccent: { backgroundColor: colors.accentSoft },
  tagGap: { backgroundColor: colors.macPink },
  tagOk: { backgroundColor: colors.okSoft },
  tagText: { color: colors.ink2, fontSize: 10.5, fontWeight: "700" },
  tagTextAccent: { color: colors.accentText },
  tagTextGap: { color: colors.macPinkText },
  tagTextOk: { color: colors.okText },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitle: { color: colors.ink, fontSize: 13.5, fontWeight: "800" },
  limit: { backgroundColor: colors.macApricot, borderRadius: radius.md, padding: 12, gap: 8 },
  limitText: { color: colors.macApricotText, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  problem: { color: colors.coralText, fontSize: 12.5, lineHeight: 18 },
}));
