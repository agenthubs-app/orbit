import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { localParts, shiftCalendarDate, validTimeZone } from "../../time/date-time";

// Mount a fresh session for each trigger; only Done publishes its staged value.
// Far-off dates (a birthday): `yearJump` adds year steps in place of 今天/明天, `initialMonth` opens an
// empty picker on that month with nothing chosen yet, and days after `max` cannot be chosen.
export function PersonalScheduleDateTimePicker({ kind, value, zone, disabled: saving, embedded = false, yearJump = false, initialMonth, max, title, onCancel, onConfirm }: { kind: "date" | "time"; value: string; zone: string; disabled: boolean; embedded?: boolean; yearJump?: boolean; initialMonth?: string; max?: string; title?: string; onCancel(): void; onConfirm(value: string): void }) {
  const { t, language } = useOrbitLocale();
  const { styles } = useStyles();
  const available = validTimeZone(zone);
  const disabled = saving || !available;
  const today = localParts(Date.now(), available ? zone : "UTC");
  const [selected, setSelected] = useState(value || (kind === "date" ? (initialMonth ? "" : today.date) : today.time));
  const columns = useRef<(ScrollView | null)[]>([]);
  const cancel = useRef<View>(null);
  useEffect(() => { if (embedded && Platform.OS === "web") cancel.current?.focus(); }, [embedded]);
  const [month, setMonth] = useState(kind === "date" && value ? value.slice(0, 7) : initialMonth ?? today.date.slice(0, 7));
  const first = `${month}-01`;
  const firstDate = new Date(`${first}T12:00:00Z`);
  const nextMonth = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 1));
  const days = new Date(nextMonth.getTime() - 86_400_000).getUTCDate();
  const navigate = (amount: number) => setMonth(new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + amount, 1)).toISOString().slice(0, 7));
  // With `yearJump`, tapping the month title lists years (like the iOS year wheel) instead of stepping one year at a time.
  const [yearsOpen, setYearsOpen] = useState(false);
  const lastYear = Number((max ?? today.date).slice(0, 4));
  const monthTitle = new Intl.DateTimeFormat(language, { year: "numeric", month: "long", timeZone: "UTC" }).format(firstDate);
  const chooseTime = (index: number, part: number) => { const parts = selected.split(":"); parts[index] = String(part).padStart(2, "0"); setSelected(parts.join(":")); };
  const content = <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={onCancel} style={styles.backdrop} />
      <View role="dialog" accessibilityViewIsModal accessibilityLabel={t(kind === "date" ? "personal53.date" : "personal53.time")} style={styles.sheet}>
        <View style={styles.header}><Pressable ref={cancel} accessibilityRole="button" onPress={onCancel} style={styles.action}><Text style={styles.text}>{t("common.cancel")}</Text></Pressable><Text style={styles.title}>{title ?? t(kind === "date" ? "personal53.date" : "personal53.time")}</Text><Pressable accessibilityRole="button" disabled={disabled || !selected} onPress={() => { if (!disabled && selected) onConfirm(selected); }} style={styles.action}><Text style={styles.text}>{t("personal60.done")}</Text></Pressable></View>
        {!available ? <Text accessibilityRole="alert" style={styles.hint}>{t("schedule.timezoneUnavailable")}</Text> : null}
        {kind === "date" ? <ScrollView>
          <View style={styles.header}>{yearJump ? <Pressable accessibilityRole="button" accessibilityLabel={t("schedule.previousYear")} disabled={disabled} onPress={() => navigate(-12)} style={styles.action}><Text style={styles.text}>«</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel={t("schedule.previousMonth")} disabled={disabled} onPress={() => navigate(-1)} style={styles.action}><Text style={styles.text}>‹</Text></Pressable>{yearJump ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: yearsOpen }} accessibilityLabel={monthTitle} disabled={disabled} onPress={() => setYearsOpen(open => !open)} style={[styles.action, styles.yearToggle]}><Text style={[styles.title, yearsOpen && styles.today]}>{monthTitle}</Text><Text style={[styles.hint, yearsOpen && styles.today]}>{yearsOpen ? "▲" : "▼"}</Text></Pressable> : <Text style={styles.title}>{monthTitle}</Text>}<Pressable accessibilityRole="button" accessibilityLabel={t("schedule.nextMonth")} disabled={disabled} onPress={() => navigate(1)} style={styles.action}><Text style={styles.text}>›</Text></Pressable>{yearJump ? <Pressable accessibilityRole="button" accessibilityLabel={t("schedule.nextYear")} disabled={disabled} onPress={() => navigate(12)} style={styles.action}><Text style={styles.text}>»</Text></Pressable> : null}</View>
          {yearsOpen ? <View style={styles.grid}>{Array.from({ length: 101 }, (_, i) => { const year = lastYear - i; const active = year === firstDate.getUTCFullYear(); return <Pressable key={year} accessibilityRole="button" accessibilityState={{ selected: active }} disabled={disabled} onPress={() => { setMonth(`${year}-${month.slice(5, 7)}`); setYearsOpen(false); }} style={[styles.yearCell, active && styles.selected]}><Text style={[styles.text, active && styles.today]}>{year}</Text></Pressable>; })}</View> : null}
          {yearsOpen ? null : <View style={styles.grid}>{Array.from({ length: 7 }, (_, day) => <View key={day} style={styles.cell}><Text style={styles.hint}>{new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 8, 13 + day)))}</Text></View>)}{Array.from({ length: firstDate.getUTCDay() }, (_, i) => <View key={`blank-${i}`} style={styles.cell} />)}{Array.from({ length: days }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, "0")}`; const late = max !== undefined && date > max; return <Pressable key={date} accessibilityRole="button" accessibilityLabel={date} aria-selected={selected === date} accessibilityState={{ selected: selected === date, disabled: disabled || late }} disabled={disabled || late} onPress={() => setSelected(date)} style={[styles.cell, selected === date && styles.selected]}><Text style={[styles.text, date === today.date && styles.today, late && styles.late]}>{i + 1}</Text></Pressable>; })}</View>}
          {yearJump ? null : <View style={styles.header}>{([0, 1] as const).map(offset => <Pressable key={offset} accessibilityRole="button" disabled={disabled} onPress={() => { const date = shiftCalendarDate(today.date, offset); setSelected(date); setMonth(date.slice(0, 7)); }} style={styles.action}><Text style={styles.text}>{t(offset === 0 ? "scheduleVm.today" : "scheduleVm.tomorrow")}</Text></Pressable>)}</View>}
        </ScrollView> : <View style={styles.columns}>{([24, 60] as const).map((count, index) => <View key={index} role="radiogroup" accessibilityLabel={t(index === 0 ? "personal63.hour" : "personal63.minute")} style={styles.column}><Text style={styles.hint}>{t(index === 0 ? "personal63.hour" : "personal63.minute")}</Text><ScrollView ref={node => { columns.current[index] = node; }} onLayout={() => columns.current[index]?.scrollTo({ y: Math.max(0, Number(selected.split(":")[index]) * 44 - 88), animated: false })} style={styles.column}>{Array.from({ length: count }, (_, part) => { const label = String(part).padStart(2, "0"); const active = selected.split(":")[index] === label; return <Pressable key={part} accessibilityRole="radio" accessibilityLabel={`${index === 0 ? "HH" : "mm"} ${label}`} aria-checked={active} accessibilityState={{ checked: active }} disabled={disabled} onPress={() => chooseTime(index, part)} style={[styles.option, active && styles.selected]}><Text style={styles.text}>{label}</Text></Pressable>; })}</ScrollView></View>)}</View>}
      </View>
    </View>;
  return embedded ? content : <Modal transparent visible animationType="slide" onRequestClose={onCancel}>{content}</Modal>;
}

const useStyles = createThemedStyles(colors => ({
  overlay: { flex: 1, justifyContent: "flex-end" as const, backgroundColor: colors.scrim }, backdrop: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 28, maxHeight: "85%" as const }, header: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }, action: { minHeight: 44, minWidth: 44, justifyContent: "center" as const }, text: { color: colors.ink, fontSize: 18 }, title: { color: colors.ink, fontSize: 18, fontWeight: "700" as const }, hint: { color: colors.ink3Text, fontSize: 13 },
  grid: { flexDirection: "row" as const, flexWrap: "wrap" as const }, yearToggle: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 }, yearCell: { width: "25%" as const, minHeight: 44, justifyContent: "center" as const, alignItems: "center" as const, borderRadius: 8 }, cell: { width: `${100 / 7}%` as const, minHeight: 44, justifyContent: "center" as const, alignItems: "center" as const, borderRadius: 8 }, selected: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accentText }, today: { color: colors.accentText, fontWeight: "700" as const }, late: { color: colors.ink3Text, opacity: 0.45 }, columns: { flexDirection: "row" as const, height: 264, gap: 16 }, column: { flex: 1 }, option: { minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 8 },
}));
