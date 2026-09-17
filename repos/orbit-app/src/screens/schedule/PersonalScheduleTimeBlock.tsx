import { Pressable, Text, View } from "react-native";
import { useState } from "react";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createThemedStyles } from "../../design/theme";
import type { PersonalScheduleDraft } from "../../view-models/personal-schedule-editor";
import { applyPersonalScheduleDuration, personalScheduleDraft } from "../../view-models/personal-schedule-editor";
import { localParts, resolveLocalDateTime, validTimeZone } from "../../time/date-time";
import { PersonalScheduleDateTimePicker } from "./PersonalScheduleDateTimePicker";
import type { PersonalScheduleContract } from "../../api/contract/tasks";
import { applyPersonalSchedulePicker } from "../../view-models/personal-schedule-picker";

export function PersonalScheduleTimeBlock({ draft, zone, baseline = null, disabled, onChange, onError }: { draft: PersonalScheduleDraft; zone: string; baseline?: PersonalScheduleContract | null; disabled: boolean; initialExpanded?: boolean; onChange(draft: PersonalScheduleDraft): void; onError(message: string): void }) {
  const [picker, setPicker] = useState<"startDate" | "startTime" | "endDate" | "endTime" | null>(null);
  const locale = useOrbitLocale(); const { styles } = useStyles();
  const date = new Date(`${draft.startDate}T12:00:00Z`);
  const dateLabel = Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === draft.startDate
    ? new Intl.DateTimeFormat(locale.language, { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(date)
    : draft.startDate || "YYYY-MM-DD";
  const selectedDurations = ([30, 60, 120] as const).filter(minutes => {
    if (draft.allDay || !draft.endTime) return false;
    const result = applyPersonalScheduleDuration(draft, zone, minutes, baseline);
    if (result.kind !== "ready" || !validTimeZone(zone)) return false;
    const previous = personalScheduleDraft(baseline, zone);
    const pickedEnd = draft.pickerEndInstant ? localParts(draft.pickerEndInstant, zone) : null;
    const end = pickedEnd?.date === draft.endDate && pickedEnd.time === draft.endTime ? draft.pickerEndInstant
      : baseline?.endsAt && previous.endDate === draft.endDate && previous.endTime === draft.endTime ? baseline.endsAt
      : resolveLocalDateTime(draft.endDate, draft.endTime, zone);
    return !!end && Date.parse(end) === Date.parse(result.draft.pickerEndInstant!);
  });
  return <View style={styles.group}>
    <View style={styles.heading}><Text style={styles.label}>{locale.t("personal53.time")}</Text><Text style={styles.hint}>{zone}</Text></View>
    <View style={styles.card}>
      <View style={{ flexDirection: "row" }}><Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal53.adjustTime")} disabled={disabled} onPress={() => setPicker("startDate")} style={[styles.dateRow, { flex: 1 }]}><Text style={styles.label}>{dateLabel}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={locale.t("schedule.fieldEndDate")} disabled={disabled} onPress={() => setPicker("endDate")} style={[styles.dateRow, { flex: 1 }]}><Text style={styles.hint}>{locale.t(draft.allDay ? "personal63.lastDay" : "schedule.fieldEndDate")}</Text><Text style={styles.label}>{draft.endDate || "—"}</Text></Pressable></View>
      <View style={styles.timeRow}><Pressable accessibilityRole="button" accessibilityLabel={locale.t("schedule.fieldStartTime")} disabled={disabled || !!draft.allDay} onPress={() => setPicker("startTime")} style={styles.timeColumn}><Text style={styles.hint}>{locale.t("schedule.fieldStartTime")}</Text><Text style={styles.time}>{draft.allDay ? locale.t("schedule.allDay") : draft.startTime || "—"}</Text></Pressable><Text style={styles.arrow}>→</Text><Pressable accessibilityRole="button" accessibilityLabel={locale.t("schedule.fieldEndTime")} disabled={disabled || !!draft.allDay} onPress={() => setPicker("endTime")} style={styles.timeColumn}><Text style={styles.hint}>{locale.t("schedule.fieldEndTime")}</Text><Text style={styles.time}>{draft.allDay ? locale.t("schedule.allDay") : draft.endTime || "—"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal53.reschedule")} disabled={disabled} onPress={() => setPicker("startDate")} style={styles.adjust}><Text style={styles.adjustText}>{locale.t("personal53.reschedule")}</Text></Pressable></View>
      <View style={styles.shortcuts}>{([30, 60, 120] as const).map(minutes => <Pressable key={minutes} accessibilityRole="button" accessibilityLabel={locale.t(minutes === 30 ? "personal53.minutes30" : minutes === 60 ? "personal53.minutes60" : "personal53.minutes120")} aria-selected={selectedDurations.includes(minutes)} accessibilityState={{ selected: selectedDurations.includes(minutes) }} disabled={disabled} onPress={() => { const result = applyPersonalScheduleDuration(draft, zone, minutes, baseline); if (result.kind === "ready") onChange(result.draft); else onError(result.message); }} style={styles.shortcut}><View style={[styles.shortcutVisual, selectedDurations.includes(minutes) && styles.selectedShortcut]}><Text style={[styles.shortcutText, selectedDurations.includes(minutes) && styles.selectedText]}>{locale.t(minutes === 30 ? "personal53.minutes30" : minutes === 60 ? "personal53.minutes60" : "personal53.minutes120")}</Text></View></Pressable>)}<Pressable accessibilityRole="button" aria-selected={!!draft.allDay} accessibilityState={{ selected: !!draft.allDay }} disabled={disabled} onPress={() => onChange({ ...draft, allDay: !draft.allDay, ...(draft.allDay ? {} : { endDate: "", endTime: "" }) })} style={styles.shortcut}><View style={[styles.shortcutVisual, draft.allDay && styles.selectedShortcut]}><Text style={[styles.shortcutText, draft.allDay && styles.selectedText]}>{locale.t("schedule.allDay")}</Text></View></Pressable></View>
      <View style={[styles.footer, { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 0, minHeight: 44 }]}><Text style={[styles.hint, { flex: 1 }]}>{locale.t("personal53.orbitOnly")}</Text>{!draft.allDay && (draft.endDate || draft.endTime) ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal63.clearEnd")} disabled={disabled} onPress={() => { if (!disabled) { const next = { ...draft, endDate: "", endTime: "" }; delete next.pickerEndInstant; onChange(next); } }} style={{ minHeight: 44, minWidth: 44, justifyContent: "center" }}><Text style={styles.adjustText}>{locale.t("personal63.clearEnd")}</Text></Pressable> : null}</View>
    </View>
    {picker ? <PersonalScheduleDateTimePicker key={picker} kind={picker.endsWith("Date") ? "date" : "time"} value={draft[picker]} zone={zone} disabled={disabled} onCancel={() => setPicker(null)} onConfirm={value => {
      if (!disabled && value !== draft[picker]) {
        onChange(applyPersonalSchedulePicker(draft, baseline, zone, picker, value));
      }
      setPicker(null);
    }} /> : null}
  </View>;
}
const useStyles = createThemedStyles(colors => ({
  group: { gap: 8, marginBottom: 12 }, heading: { flexDirection: "row" as const, justifyContent: "space-between" as const }, label: { color: colors.text, fontSize: 15, fontWeight: "800" as const }, hint: { color: colors.text3, fontSize: 11 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden" as const }, dateRow: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row" as const, justifyContent: "space-between" as const, borderBottomWidth: 1, borderColor: colors.border },
  timeRow: { paddingHorizontal: 14, paddingTop: 6, flexDirection: "row" as const, alignItems: "center" as const }, timeColumn: { flex: 1, gap: 3 }, arrow: { width: 34, color: colors.text4, fontSize: 18, marginTop: 12, textAlign: "center" as const }, adjust: { minHeight: 44, minWidth: 44, alignItems: "flex-end" as const, justifyContent: "center" as const, marginTop: 12 }, adjustText: { color: colors.accent, fontSize: 12, fontWeight: "700" as const }, time: { color: colors.text, fontSize: 24, fontWeight: "800" as const, letterSpacing: -0.72 }, shortcuts: { paddingHorizontal: 14, paddingBottom: 4, flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 }, shortcut: { minHeight: 44, minWidth: 44, justifyContent: "center" as const }, shortcutVisual: { minHeight: 28, justifyContent: "center" as const, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }, shortcutText: { color: colors.text, fontSize: 12 }, selectedShortcut: { backgroundColor: colors.text, borderColor: colors.text }, selectedText: { color: colors.surface, fontWeight: "600" as const }, footer: { color: colors.text3, backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 10, fontSize: 11 }, inputs: { padding: 14, gap: 10 }, input: { minHeight: 44, color: colors.text, borderBottomWidth: 1, borderColor: colors.border, fontSize: 16 },
}));
