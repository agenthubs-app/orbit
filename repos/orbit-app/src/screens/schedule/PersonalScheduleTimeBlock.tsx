import { Pressable, Switch, Text, View } from "react-native";
import { useState } from "react";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createThemedStyles } from "../../design/theme";
import type { PersonalScheduleDraft } from "../../view-models/personal-schedule-editor";
import { PersonalScheduleDateTimePicker } from "./PersonalScheduleDateTimePicker";
import type { PersonalScheduleContract } from "../../api/contract/tasks";
import { applyPersonalSchedulePicker } from "../../view-models/personal-schedule-picker";

export function PersonalScheduleTimeBlock({ draft, zone, baseline = null, disabled, initialExpanded = false, onChange, onError }: { draft: PersonalScheduleDraft; zone: string; baseline?: PersonalScheduleContract | null; disabled: boolean; initialExpanded?: boolean; onChange(draft: PersonalScheduleDraft): void; onError(message: string): void }) {
  const [picker, setPicker] = useState<"startDate" | "startTime" | "endDate" | "endTime" | null>(() => initialExpanded ? "startTime" : null);
  const locale = useOrbitLocale(); const { styles } = useStyles();
  const day = (value: string) => {
    const date = new Date(`${value}T12:00:00Z`);
    return value && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
      ? new Intl.DateTimeFormat(locale.language, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(date) : "";
  };
  // UX-8 (user 2026-10-25): the time card of iOS Calendar's New Event — an 全天 switch, then 开始 and 结束
  // rows whose date and time are tappable chips; the picker opens for the chip that was tapped.
  const chip = (field: "startDate" | "startTime" | "endDate" | "endTime", text: string, label: string) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: picker === field }} disabled={disabled} onPress={() => setPicker(field)}
      style={[styles.chip, picker === field && styles.chipOn]}><Text style={[styles.chipText, picker === field && styles.chipTextOn, !text && styles.chipEmpty]}>{text || locale.t("personal63.unset")}</Text></Pressable>;
  return <View style={styles.group}>
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{locale.t("schedule.allDay")}</Text>
        <Switch accessibilityLabel={locale.t("schedule.allDay")} value={!!draft.allDay} disabled={disabled} style={styles.switch}
          onValueChange={() => onChange({ ...draft, allDay: !draft.allDay, ...(draft.allDay ? timedFromAllDay(draft) : { endDate: "", endTime: "" }) })} />
      </View>
      <View style={[styles.row, styles.line]}>
        <Text style={styles.rowLabel}>{locale.t("personal63.start")}</Text>
        <View style={styles.chips}>
          {chip("startDate", day(draft.startDate), locale.t("personal53.adjustTime"))}
          {draft.allDay ? null : chip("startTime", draft.startTime, locale.t("schedule.fieldStartTime"))}
        </View>
      </View>
      {draft.allDay ? null : <View style={[styles.row, styles.line]}>
        <Text style={styles.rowLabel}>{locale.t("personal63.end")}</Text>
        <View style={styles.chips}>
          {chip("endDate", day(draft.endDate || draft.startDate), locale.t("personal63.endDate"))}
          {chip("endTime", draft.endTime, locale.t("schedule.fieldEndTime"))}
        </View>
      </View>}
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
  group: { marginBottom: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 14, paddingLeft: 16, overflow: "hidden" as const },
  row: { minHeight: 52, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingRight: 16, gap: 12 },
  line: { borderTopWidth: 0.5, borderColor: colors.line },
  rowLabel: { color: colors.ink, fontSize: 17 }, switch: { alignSelf: "center" as const, marginVertical: 0 },
  chips: { flexDirection: "row" as const, gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 8, justifyContent: "center" as const, backgroundColor: colors.surface2 },
  chipOn: { backgroundColor: colors.accentSoft }, chipText: { color: colors.ink, fontSize: 17 }, chipTextOn: { color: colors.accentText }, chipEmpty: { color: colors.ink3Text },
}));

// QA-D: an all-day item carries 00:00–23:59; turning 終日 off then left a 24-hour slot (and moving the start kept it).
// Like iOS Calendar, fall back to a one-hour slot on the same day.
function timedFromAllDay(draft: { startDate: string; startTime: string; endTime: string }): { startTime: string; endDate: string; endTime: string } | Record<string, never> {
  if (draft.startTime !== "00:00" || (draft.endTime !== "23:59" && draft.endTime !== "")) return {};
  return { startTime: "09:00", endDate: draft.startDate, endTime: "10:00" };
}
