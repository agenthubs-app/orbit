import { Pressable, Text, TextInput, View } from "react-native";
import { useState } from "react";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createThemedStyles } from "../../design/theme";
import type { PersonalScheduleDraft } from "../../view-models/personal-schedule-editor";
import { applyPersonalScheduleDuration } from "../../view-models/personal-schedule-editor";

export function PersonalScheduleTimeBlock({ draft, zone, disabled, initialExpanded = false, onChange, onError }: { draft: PersonalScheduleDraft; zone: string; disabled: boolean; initialExpanded?: boolean; onChange(draft: PersonalScheduleDraft): void; onError(message: string): void }) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const locale = useOrbitLocale(); const { styles, colors } = useStyles();
  return <View style={styles.group}>
    <View style={styles.heading}><Text style={styles.label}>{locale.t("personal53.time")}</Text><Text style={styles.hint}>{zone}</Text></View>
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal53.adjustTime")} disabled={disabled} onPress={() => setExpanded(value => !value)} style={styles.dateRow}><Text style={styles.hint}>{locale.t("personal53.date")}</Text><Text style={styles.label}>{draft.startDate || "YYYY-MM-DD"}</Text></Pressable>
      <View style={styles.timeRow}><View><Text style={styles.hint}>{locale.t("schedule.fieldStartTime")}</Text><Text style={styles.time}>{draft.allDay ? locale.t("schedule.allDay") : draft.startTime || "—"}</Text></View><Text style={styles.hint}>→</Text><View><Text style={styles.hint}>{locale.t("schedule.fieldEndTime")}</Text><Text style={styles.time}>{draft.allDay ? locale.t("schedule.allDay") : draft.endTime || "—"}</Text></View></View>
      <View style={styles.shortcuts}>{([30, 60, 120] as const).map(minutes => <Pressable key={minutes} accessibilityRole="button" accessibilityLabel={locale.t(minutes === 30 ? "personal53.minutes30" : minutes === 60 ? "personal53.minutes60" : "personal53.minutes120")} disabled={disabled} onPress={() => { const result = applyPersonalScheduleDuration(draft, zone, minutes); if (result.kind === "ready") onChange(result.draft); else onError(result.message); }} style={styles.shortcut}><Text style={styles.shortcutText}>{locale.t(minutes === 30 ? "personal53.minutes30" : minutes === 60 ? "personal53.minutes60" : "personal53.minutes120")}</Text></Pressable>)}<Pressable accessibilityRole="button" accessibilityState={{ selected: !!draft.allDay }} disabled={disabled} onPress={() => onChange({ ...draft, allDay: !draft.allDay, ...(draft.allDay ? {} : { endDate: "", endTime: "" }) })} style={styles.shortcut}><Text style={styles.shortcutText}>{locale.t("schedule.allDay")}</Text></Pressable></View>
      {expanded ? <View style={styles.inputs}>{([["startDate", "schedule.fieldStartDate", "YYYY-MM-DD"], ...(!draft.allDay ? [["startTime", "schedule.fieldStartTime", "HH:mm"], ["endTime", "schedule.fieldEndTime", "HH:mm"]] : []), ["endDate", "schedule.fieldEndDate", "YYYY-MM-DD"]] as ["startDate" | "startTime" | "endDate" | "endTime", "schedule.fieldStartDate" | "schedule.fieldStartTime" | "schedule.fieldEndDate" | "schedule.fieldEndTime", string][]).map(([field, label, placeholder]) => <View key={field}><Text style={styles.hint}>{locale.t(label)}</Text><TextInput accessibilityLabel={locale.t(label)} value={draft[field]} placeholder={placeholder} placeholderTextColor={colors.text4} editable={!disabled} autoCapitalize="none" style={styles.input} onChangeText={value => onChange({ ...draft, [field]: value })} /></View>)}</View> : null}
      <Text style={styles.footer}>{locale.t("personal53.orbitOnly")}</Text>
    </View>
  </View>;
}
const useStyles = createThemedStyles(colors => ({
  group: { gap: 8, marginBottom: 20 }, heading: { flexDirection: "row" as const, justifyContent: "space-between" as const }, label: { color: colors.text, fontSize: 16, fontWeight: "700" as const }, hint: { color: colors.text3, fontSize: 12 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden" as const }, dateRow: { minHeight: 48, padding: 14, flexDirection: "row" as const, justifyContent: "space-between" as const, borderBottomWidth: 1, borderColor: colors.border },
  timeRow: { padding: 14, flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const }, time: { color: colors.text, fontSize: 26, fontWeight: "800" as const }, shortcuts: { paddingHorizontal: 14, paddingBottom: 14, flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 }, shortcut: { minHeight: 44, justifyContent: "center" as const, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }, shortcutText: { color: colors.text, fontSize: 14 }, footer: { color: colors.text3, backgroundColor: colors.surface2, padding: 12, fontSize: 12 }, inputs: { padding: 14, gap: 10 }, input: { minHeight: 44, color: colors.text, borderBottomWidth: 1, borderColor: colors.border, fontSize: 16 },
}));
