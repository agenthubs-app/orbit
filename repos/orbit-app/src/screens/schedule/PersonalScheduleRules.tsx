import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createThemedStyles } from "../../design/theme";
import type { PersonalScheduleDraft } from "../../view-models/personal-schedule-editor";
import { PersonalScheduleDateTimePicker } from "./PersonalScheduleDateTimePicker";
import { UiPressable, UiText } from "../../components/ui";

export function PersonalScheduleRules({ draft, zone = "UTC", disabled = false, readOnly = false, reminderElapsed = false, onChange, scope }: { draft: PersonalScheduleDraft; zone?: string; disabled?: boolean; readOnly?: boolean; reminderElapsed?: boolean; onChange?: (draft: PersonalScheduleDraft) => void; scope?: { selected: "occurrence" | "series" | null; isOccurrence: boolean; onSelect(value: "occurrence" | "series"): void } }) {
  const locale = useOrbitLocale(); const { styles } = useStyles();
  const [open, setOpen] = useState<"reminder" | "repeat" | "scope" | null>(null);
  const [untilOpen, setUntilOpen] = useState(false);
  const untilTrigger = useRef<View>(null);
  const closeUntil = () => { setUntilOpen(false); requestAnimationFrame(() => untilTrigger.current?.focus()); };
  const close = () => setOpen(null);
  const drag = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => true, onPanResponderRelease: (_event, gesture) => { if (gesture.dy > 60 && Math.abs(gesture.dy) > Math.abs(gesture.dx)) close(); } }), []);
  const reminderLabel = (value: PersonalScheduleDraft["reminderMinutes"]) => locale.t(value === null || value === undefined ? "personal60.none" : value === 0 ? "personal60.atStart" : value === 1440 ? "personal60.beforeDay" : "personal60.beforeMinutes", { count: value ?? 0 });
  const repeatLabel = (value: PersonalScheduleDraft["recurrence"]) => locale.t(value ? `personal60.${value.frequency}` : "personal60.noRepeat");
  const title = locale.t(open === "reminder" ? "taskDetail.reminder" : open === "scope" ? "personal60.scope" : "personal59.repeat");
  const row = (label: string, value: string, kind: "reminder" | "repeat" | "scope") => readOnly ? <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View> : <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={kind === "scope" ? disabled : disabled || (!!scope && scope.selected !== "series")} onPress={() => setOpen(kind)} style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></Pressable>;
  return <View>
    {scope ? row(locale.t("personal60.scope"), scope.selected ? locale.t(scope.selected === "series" ? "personal60.series" : "personal60.occurrence") : "—", "scope") : null}
    {row(locale.t("taskDetail.reminder"), reminderLabel(draft.reminderMinutes), "reminder")}
    {row(locale.t("personal59.repeat"), [repeatLabel(draft.recurrence), draft.recurrence?.until].filter(Boolean).join(" · "), "repeat")}
    {scope ? <Text style={styles.hint}>{locale.t("personal60.seriesRules")}</Text> : null}
    {reminderElapsed ? <Text style={styles.hint}>{locale.t("personal60.pastReminder")}</Text> : null}
    <Modal visible={open !== null} transparent animationType="slide" onRequestClose={untilOpen ? closeUntil : close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("common.close")} onPress={close} style={[styles.backdrop, untilOpen && { display: "none" }]} />
        <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={[styles.sheet, untilOpen && { display: "none" }]}>
          <View {...drag.panHandlers} style={styles.drag}><View style={styles.handle} /></View>
          <View style={styles.heading}><Text accessibilityRole="header" style={styles.label}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={locale.t("common.close")} onPress={close} style={styles.action}><Text style={styles.link}>{locale.t("common.close")}</Text></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {open === "reminder" ? ([null, 0, 5, 15, 30, 60, 1440] as const).map(value => <Pressable key={String(value)} accessibilityRole="radio" accessibilityLabel={reminderLabel(value)} accessibilityState={{ checked: (draft.reminderMinutes ?? null) === value }} disabled={disabled} onPress={() => { onChange?.({ ...draft, reminderMinutes: value }); close(); }} style={styles.row}><Text style={styles.value}>{reminderLabel(value)}</Text><Text style={styles.link}>{(draft.reminderMinutes ?? null) === value ? "✓" : ""}</Text></Pressable>) : null}
            {open === "repeat" ? <><PersonalScheduleRepeatChoices draft={draft} disabled={disabled} onChange={next => onChange?.(next)} />{draft.recurrence ? <><Text style={styles.hint}>{locale.t("personal60.until")}</Text><Pressable accessibilityRole="button" ref={untilTrigger} accessibilityLabel={locale.t("personal60.until")} disabled={disabled} onPress={() => setUntilOpen(true)} style={styles.input}><Text style={styles.value}>{draft.recurrence.until || "YYYY-MM-DD"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal60.noUntil")} disabled={disabled} onPress={() => { if (!disabled) onChange?.({ ...draft, recurrence: { frequency: draft.recurrence!.frequency } }); }} style={styles.action}><Text style={styles.link}>{locale.t("personal60.noUntil")}</Text></Pressable>{draft.recurrence.frequency === "monthly" ? <Text style={styles.hint}>{locale.t("personal60.monthlySkip")}</Text> : null}</> : null}</> : null}
            {open === "scope" && scope ? (scope.isOccurrence ? ["occurrence", "series"] as const : ["series"] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={locale.t(value === "series" ? "personal60.series" : "personal60.occurrence")} accessibilityState={{ checked: scope.selected === value }} disabled={disabled} onPress={() => { scope.onSelect(value); close(); }} style={styles.row}><Text style={styles.value}>{locale.t(value === "series" ? "personal60.series" : "personal60.occurrence")}</Text><Text style={styles.link}>{scope.selected === value ? "✓" : ""}</Text></Pressable>) : null}
          </ScrollView>
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal60.done")} onPress={close} style={styles.action}><Text style={styles.link}>{locale.t("personal60.done")}</Text></Pressable>
        </View>
        {untilOpen && draft.recurrence ? <PersonalScheduleDateTimePicker embedded kind="date" value={draft.recurrence.until || draft.startDate} zone={zone} disabled={disabled} onCancel={closeUntil} onConfirm={until => { if (!disabled) onChange?.({ ...draft, recurrence: { frequency: draft.recurrence!.frequency, until } }); closeUntil(); }} /> : null}
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

export function PersonalScheduleRepeatChoices({ draft, disabled, onChange }: { draft: PersonalScheduleDraft; disabled: boolean; onChange(draft: PersonalScheduleDraft): void }) {
  const locale = useOrbitLocale(); const { styles } = useStyles();
  return <View accessibilityRole="radiogroup" accessibilityLabel={locale.t("personal59.repeat")}>{([null, "daily", "weekly", "monthly"] as const).map(value => {
    const checked = (draft.recurrence?.frequency ?? null) === value;
    const label = locale.t(value ? `personal60.${value}` : "personal60.noRepeat");
    return <UiPressable key={String(value)} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked }} aria-checked={checked} disabled={disabled} onPress={() => onChange({ ...draft, recurrence: value ? { frequency: value, ...(draft.recurrence?.until ? { until: draft.recurrence.until } : {}) } : null })} style={styles.row}>
      <View style={[styles.radio, checked && styles.radioChecked]}>{checked ? <View style={styles.radioDot} /> : null}</View><UiText style={styles.optionLabel}>{label}</UiText>
    </UiPressable>;
  })}</View>;
}
const useStyles = createThemedStyles(colors => ({
  row: { minHeight: 44, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 12, borderBottomWidth: 1, borderColor: colors.line }, label: { color: colors.ink, fontSize: 17, fontWeight: "800" as const }, value: { flexShrink: 1, color: colors.ink3Text, fontSize: 15 }, hint: { color: colors.ink3Text, fontSize: 14, marginTop: 8 }, link: { color: colors.accentText, fontSize: 17 }, action: { minHeight: 44, justifyContent: "center" as const, alignItems: "center" as const },
  overlay: { flex: 1, justifyContent: "flex-end" as const }, backdrop: { position: "absolute" as const, top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.scrim }, sheet: { maxHeight: "85%" as const, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 24 }, drag: { height: 28, alignItems: "center" as const, justifyContent: "center" as const }, handle: { height: 4, width: 40, borderRadius: 2, backgroundColor: colors.line }, heading: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }, content: { paddingBottom: 12 }, input: { minHeight: 44, borderBottomWidth: 1, borderColor: colors.line, color: colors.ink, fontSize: 18 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line, alignItems: "center" as const, justifyContent: "center" as const, marginRight: 10 }, radioChecked: { borderColor: colors.accentText }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentText }, optionLabel: { color: colors.ink, fontSize: 17, fontWeight: "600" as const, flex: 1 },
}));
