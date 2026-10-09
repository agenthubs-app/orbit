/**
 * Layout pieces of the onboarding screens (docs/designs/2026-09-27-app-onboarding-live).
 * Visual values come from controls.ts / tokens.ts only: black primary buttons, blue for
 * text links and counts, hairline-separated rows, rose/amber banners.
 */
import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createControlStyles } from "../../../design/controls";
import { createThemedStyles } from "../../../design/theme";
import { layout, rowRoleStyles, spacing, textStyles } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";

export function StepFrame({ backLabel, children, footer, index, onBack, total }: {
  backLabel: string;
  children: ReactNode;
  footer: ReactNode;
  index: number;
  onBack: () => void;
  total: number;
}) {
  const { colors, styles } = useOnboardingStyles();
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.stepHeader}>
        <View style={styles.stepNav}>
          <Pressable accessibilityLabel={backLabel} accessibilityRole="button" hitSlop={8} onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Ionicons color={colors.accentText} name="chevron-back" size={20} />
            <Text style={styles.backText}>{backLabel}</Text>
          </Pressable>
          <Text style={styles.stepCount}>{`${index + 1} / ${total}`}</Text>
        </View>
        <View accessibilityLabel={`${index + 1} / ${total}`} accessibilityRole="progressbar" style={styles.progress}>
          {Array.from({ length: total }, (_, bar) => <View key={bar} style={[styles.progressBar, bar <= index && styles.progressBarOn]} />)}
        </View>
      </View>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.stepContent} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </SafeAreaView>
  );
}

export function StepHead({ lead, title }: { lead: string; title: string }) {
  const { styles } = useOnboardingStyles();
  return (
    <View style={styles.head}>
      <Text accessibilityRole="header" style={styles.pageTitle}>{title}</Text>
      <Text style={styles.lead}>{lead}</Text>
    </View>
  );
}

export function PrimaryButton({ disabled = false, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) {
  const { styles } = useOnboardingStyles();
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ disabled = false, icon, label, onPress, grow = true }: { disabled?: boolean; grow?: boolean; icon?: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors, styles } = useOnboardingStyles();
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, !grow && styles.secondaryCompact, disabled && styles.disabled, pressed && styles.pressed]}>
      {icon ? <Ionicons color={colors.ink} name={icon} size={18} /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function Banner({ actionLabel, kind, message, onAction }: { actionLabel?: string | undefined; kind: "failed" | "offline"; message: string; onAction?: (() => void) | undefined }) {
  const { styles } = useOnboardingStyles();
  const failed = kind === "failed";
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.banner, failed ? styles.bannerFailed : styles.bannerOffline]}>
      <Text style={[styles.bannerText, failed ? styles.bannerTextFailed : styles.bannerTextOffline]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityLabel={actionLabel} accessibilityRole="button" onPress={onAction} style={styles.bannerAction}>
          <Text style={[styles.bannerActionText, failed ? styles.bannerTextFailed : styles.bannerTextOffline]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Field({ children, half = false, helper, label, optional }: { children: ReactNode; half?: boolean; helper?: string; label: string; optional?: boolean }) {
  const { styles } = useOnboardingStyles();
  const locale = useOrbitLocale();
  return (
    <View style={[styles.field, half && styles.fieldHalf]}>
      <Text style={styles.fieldLabel}>{label}{optional ? <Text style={styles.fieldOptional}>{`  ${locale.t("onboarding.optional")}`}</Text> : null}</Text>
      {children}
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

export function Chip({ disabled = false, label, onPress, removable = false, selected }: { disabled?: boolean; label: string; onPress: () => void; removable?: boolean; selected: boolean }) {
  const { styles } = useOnboardingStyles();
  const locale = useOrbitLocale();
  return (
    <Pressable accessibilityLabel={removable ? locale.t("onboarding.removeNamed", { name: label }) : label} accessibilityRole="button" accessibilityState={{ disabled, selected }}
      disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{removable ? `${label}  ×` : label}</Text>
    </Pressable>
  );
}

/** 「+ 自定义」: opens an inline input; the value is normalised by the caller. */
export function CustomChip({ disabled, onAdd }: { disabled: boolean; onAdd: (value: string) => void }) {
  const { colors, styles } = useOnboardingStyles();
  const locale = useOrbitLocale();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open) {
    return (
      <Pressable accessibilityLabel={locale.t("onboarding.custom")} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.chip, styles.customChip, disabled && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.chipText}>{locale.t("onboarding.custom")}</Text>
      </Pressable>
    );
  }
  function add() {
    onAdd(value);
    setValue("");
    setOpen(false);
  }
  return (
    <View style={styles.customRow}>
      <TextInput accessibilityLabel={locale.t("onboarding.customPlaceholder")} autoFocus maxLength={24} onChangeText={setValue} onSubmitEditing={add}
        placeholder={locale.t("onboarding.customPlaceholder")} placeholderTextColor={colors.ink3Text} returnKeyType="done" style={[styles.input, styles.customInput]} value={value} />
      <Pressable accessibilityLabel={locale.t("onboarding.add")} accessibilityRole="button" accessibilityState={{ disabled: !value.trim() }} disabled={!value.trim()} onPress={add} style={styles.linkButton}>
        <Text style={[styles.linkText, !value.trim() && styles.mutedLink]}>{locale.t("onboarding.add")}</Text>
      </Pressable>
    </View>
  );
}

export const useOnboardingStyles = createThemedStyles(colors => {
  const controls = createControlStyles(colors);
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.45 },
    // Welcome / resume
    welcome: { flexGrow: 1, paddingHorizontal: layout.pageInset, paddingTop: spacing.xl, paddingBottom: spacing.xl },
    logo: { color: colors.ink, fontSize: 26, fontWeight: "900", letterSpacing: -0.8 },
    logoDot: { color: colors.accentText },
    welcomeIntro: { gap: spacing.md, marginTop: 56 },
    kicker: { ...rowRoleStyles.groupHeading, color: colors.okText },
    welcomeTitle: { color: colors.ink, fontSize: 34, lineHeight: 42, fontWeight: "900", letterSpacing: -0.8 },
    stepList: { marginTop: 36, borderTopWidth: 1, borderTopColor: colors.line },
    stepRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.line },
    stepNo: { width: 20, color: colors.ink3Text, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
    stepTitle: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "600" },
    stepHint: { color: colors.ink3Text, fontSize: 13 },
    spacer: { flexGrow: 1, minHeight: spacing.xl },
    actions: { gap: 10 },
    textButton: { alignItems: "center", justifyContent: "center", minHeight: layout.control },
    textButtonText: { color: colors.ink, fontSize: 15, fontWeight: "600" },
    resumeCard: { gap: spacing.md, marginTop: 56, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: spacing.lg },
    resumeTitle: { ...textStyles.section, color: colors.ink },
    resumeBody: { ...textStyles.small, color: colors.ink2 },
    resumeActions: { flexDirection: "row", gap: 10 },
    // Step frame
    stepHeader: { gap: 14, paddingHorizontal: layout.pageInset, paddingTop: spacing.sm },
    stepNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.toolbar },
    backButton: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: layout.toolbar },
    backText: { color: colors.accentText, fontSize: 16 },
    stepCount: { color: colors.ink3Text, fontSize: 13, fontVariant: ["tabular-nums"] },
    progress: { flexDirection: "row", gap: 4 },
    progressBar: { flex: 1, height: 3, borderRadius: 999, backgroundColor: colors.line },
    progressBarOn: { backgroundColor: colors.ink },
    stepContent: { gap: 18, paddingHorizontal: layout.pageInset, paddingTop: 22, paddingBottom: spacing.xl },
    footer: { gap: 10, paddingHorizontal: layout.pageInset, paddingTop: spacing.md, paddingBottom: spacing.sm },
    head: { gap: spacing.sm },
    pageTitle: { ...textStyles.pageTitle, color: colors.ink, letterSpacing: -0.6 },
    lead: { ...textStyles.body, color: colors.ink2 },
    // Controls
    primaryButton: controls.primaryButton,
    primaryButtonText: controls.primaryButtonText,
    secondaryButton: { ...controls.secondaryButton, flexDirection: "row", gap: spacing.sm },
    secondaryCompact: { paddingHorizontal: 18 },
    secondaryButtonText: controls.secondaryButtonText,
    input: controls.input,
    multiline: { ...controls.input, minHeight: 68, textAlignVertical: "top", paddingTop: 10 },
    bioInput: { ...controls.input, minHeight: 200, textAlignVertical: "top", paddingTop: spacing.md },
    headlineInput: { ...controls.input, fontWeight: "600" },
    selectButton: { ...controls.input, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
    selectText: { ...textStyles.body, color: colors.ink, flexShrink: 1 },
    selectPlaceholder: { color: colors.ink3Text },
    fields: { gap: 14 },
    field: { gap: 6 },
    fieldHalf: { flex: 1, minWidth: 0 },
    fieldRow: { flexDirection: "row", gap: 10 },
    fieldLabel: { ...rowRoleStyles.fieldLabel, color: colors.ink2 },
    fieldOptional: { color: colors.ink3Text, fontWeight: "400" },
    helper: { ...textStyles.caption, color: colors.ink3Text },
    warning: { ...textStyles.caption, color: colors.coralText },
    optionList: { borderTopWidth: 1, borderTopColor: colors.line },
    optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.control, borderBottomWidth: 1, borderBottomColor: colors.line },
    optionText: { ...textStyles.body, color: colors.ink, flexShrink: 1 },
    chip: controls.chip,
    chipSelected: controls.selectedChip,
    chipText: controls.chipText,
    chipTextSelected: controls.selectedChipText,
    customChip: { backgroundColor: colors.surface, borderWidth: 1, borderStyle: "dashed", borderColor: colors.ink4 },
    customRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexBasis: "100%" },
    customInput: { flex: 1 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    group: { gap: spacing.sm },
    groupName: { ...rowRoleStyles.fieldLabel, color: colors.ink2 },
    sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md },
    groupHeading: { ...rowRoleStyles.groupHeading, color: colors.ink3Text },
    count: { color: colors.accentText, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
    sectionTitle: { ...textStyles.section, color: colors.ink },
    sectionMeta: { ...textStyles.caption, color: colors.ink3Text },
    horizonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.md },
    horizonChips: { flexDirection: "row", gap: 6 },
    linkButton: { alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: layout.control, paddingHorizontal: spacing.xs },
    linkText: { color: colors.accentText, fontSize: 14, fontWeight: "600" },
    mutedLink: { color: colors.ink3Text },
    // Intro
    aiRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 },
    aiLabel: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
    aiMark: { width: 22, height: 22, borderRadius: 6, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
    aiMarkDot: { width: 7, height: 7, borderRadius: 2, backgroundColor: colors.accentText },
    aiFailed: { gap: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 14 },
    aiFailedBody: { ...textStyles.small, color: colors.ink3Text },
    counter: { ...textStyles.caption, color: colors.ink3Text, alignSelf: "flex-end" },
    counterOver: { color: colors.coralText },
    // Import
    importCard: { alignItems: "center", gap: spacing.md, paddingVertical: 26, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.line, borderRadius: 12 },
    importIcon: { width: 64, height: 64, borderRadius: 999, borderWidth: 1, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
    importBody: { ...textStyles.small, color: colors.ink3Text, textAlign: "center" },
    statList: { borderTopWidth: 1, borderTopColor: colors.line },
    statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.line },
    statLabel: { ...textStyles.body, color: colors.ink },
    statValue: { ...textStyles.body, color: colors.ink, fontWeight: "800", fontVariant: ["tabular-nums"] },
    statMuted: { color: colors.ink3Text, fontWeight: "400" },
    statLink: { ...textStyles.body, color: colors.accentText, fontWeight: "700" },
    // Banners
    banner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: spacing.md },
    bannerFailed: { backgroundColor: colors.coralSoft },
    bannerOffline: { backgroundColor: colors.macApricot },
    bannerText: { flex: 1, fontSize: 14, lineHeight: 21 },
    bannerTextFailed: { color: colors.coralText },
    bannerTextOffline: { color: colors.macApricotText },
    bannerAction: { minHeight: layout.control, justifyContent: "center", paddingHorizontal: spacing.xs },
    bannerActionText: { fontSize: 14, fontWeight: "700" },
    toast: { ...textStyles.small, color: colors.okText },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: layout.pageInset }
  });
});
