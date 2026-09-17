import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { localParts, shiftCalendarDate, validTimeZone } from "../../time/date-time";

// Mount a fresh session for each trigger; only Done publishes its staged value.
export function PersonalScheduleDateTimePicker({ kind, value, zone, disabled: saving, embedded = false, onCancel, onConfirm }: { kind: "date" | "time"; value: string; zone: string; disabled: boolean; embedded?: boolean; onCancel(): void; onConfirm(value: string): void }) {
  const { t, language } = useOrbitLocale();
  const { styles } = useStyles();
  const available = validTimeZone(zone);
  const disabled = saving || !available;
  const today = localParts(Date.now(), available ? zone : "UTC");
  const [selected, setSelected] = useState(value || (kind === "date" ? today.date : today.time));
  const columns = useRef<(ScrollView | null)[]>([]);
  const cancel = useRef<View>(null);
  useEffect(() => { if (embedded && Platform.OS === "web") cancel.current?.focus(); }, [embedded]);
  const [month, setMonth] = useState((kind === "date" && value ? value : today.date).slice(0, 7));
  const first = `${month}-01`;
  const firstDate = new Date(`${first}T12:00:00Z`);
  const nextMonth = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 1));
  const days = new Date(nextMonth.getTime() - 86_400_000).getUTCDate();
  const navigate = (amount: number) => setMonth(new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + amount, 1)).toISOString().slice(0, 7));
  const chooseTime = (index: number, part: number) => { const parts = selected.split(":"); parts[index] = String(part).padStart(2, "0"); setSelected(parts.join(":")); };
  const content = <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={onCancel} style={styles.backdrop} />
      <View role="dialog" accessibilityViewIsModal accessibilityLabel={t(kind === "date" ? "personal53.date" : "personal53.time")} style={styles.sheet}>
        <View style={styles.header}><Pressable ref={cancel} accessibilityRole="button" onPress={onCancel} style={styles.action}><Text style={styles.text}>{t("common.cancel")}</Text></Pressable><Text style={styles.title}>{t(kind === "date" ? "personal53.date" : "personal53.time")}</Text><Pressable accessibilityRole="button" disabled={disabled} onPress={() => { if (!disabled) onConfirm(selected); }} style={styles.action}><Text style={styles.text}>{t("personal60.done")}</Text></Pressable></View>
        {!available ? <Text accessibilityRole="alert" style={styles.hint}>{t("schedule.timezoneUnavailable")}</Text> : null}
        {kind === "date" ? <ScrollView>
          <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel={t("schedule.previousMonth")} disabled={disabled} onPress={() => navigate(-1)} style={styles.action}><Text style={styles.text}>‹</Text></Pressable><Text style={styles.title}>{new Intl.DateTimeFormat(language, { year: "numeric", month: "long", timeZone: "UTC" }).format(firstDate)}</Text><Pressable accessibilityRole="button" accessibilityLabel={t("schedule.nextMonth")} disabled={disabled} onPress={() => navigate(1)} style={styles.action}><Text style={styles.text}>›</Text></Pressable></View>
          <View style={styles.grid}>{Array.from({ length: 7 }, (_, day) => <View key={day} style={styles.cell}><Text style={styles.hint}>{new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 8, 13 + day)))}</Text></View>)}{Array.from({ length: firstDate.getUTCDay() }, (_, i) => <View key={`blank-${i}`} style={styles.cell} />)}{Array.from({ length: days }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, "0")}`; return <Pressable key={date} accessibilityRole="button" accessibilityLabel={date} aria-selected={selected === date} accessibilityState={{ selected: selected === date }} disabled={disabled} onPress={() => setSelected(date)} style={[styles.cell, selected === date && styles.selected]}><Text style={[styles.text, date === today.date && styles.today]}>{i + 1}</Text></Pressable>; })}</View>
          <View style={styles.header}>{([0, 1] as const).map(offset => <Pressable key={offset} accessibilityRole="button" disabled={disabled} onPress={() => { const date = shiftCalendarDate(today.date, offset); setSelected(date); setMonth(date.slice(0, 7)); }} style={styles.action}><Text style={styles.text}>{t(offset === 0 ? "scheduleVm.today" : "scheduleVm.tomorrow")}</Text></Pressable>)}</View>
        </ScrollView> : <View style={styles.columns}>{([24, 60] as const).map((count, index) => <View key={index} role="radiogroup" accessibilityLabel={t(index === 0 ? "personal63.hour" : "personal63.minute")} style={styles.column}><Text style={styles.hint}>{t(index === 0 ? "personal63.hour" : "personal63.minute")}</Text><ScrollView ref={node => { columns.current[index] = node; }} onLayout={() => columns.current[index]?.scrollTo({ y: Math.max(0, Number(selected.split(":")[index]) * 44 - 88), animated: false })} style={styles.column}>{Array.from({ length: count }, (_, part) => { const label = String(part).padStart(2, "0"); const active = selected.split(":")[index] === label; return <Pressable key={part} accessibilityRole="radio" accessibilityLabel={`${index === 0 ? "HH" : "mm"} ${label}`} aria-checked={active} accessibilityState={{ checked: active }} disabled={disabled} onPress={() => chooseTime(index, part)} style={[styles.option, active && styles.selected]}><Text style={styles.text}>{label}</Text></Pressable>; })}</ScrollView></View>)}</View>}
      </View>
    </View>;
  return embedded ? content : <Modal transparent visible animationType="slide" onRequestClose={onCancel}>{content}</Modal>;
}

const useStyles = createThemedStyles(colors => ({
  overlay: { flex: 1, justifyContent: "flex-end" as const, backgroundColor: "rgba(0,0,0,0.35)" }, backdrop: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 28, maxHeight: "85%" as const }, header: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }, action: { minHeight: 44, minWidth: 44, justifyContent: "center" as const }, text: { color: colors.text, fontSize: 16 }, title: { color: colors.text, fontSize: 16, fontWeight: "700" as const }, hint: { color: colors.text3, fontSize: 11 },
  grid: { flexDirection: "row" as const, flexWrap: "wrap" as const }, cell: { width: `${100 / 7}%` as const, minHeight: 44, justifyContent: "center" as const, alignItems: "center" as const, borderRadius: 8 }, selected: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accent }, today: { color: colors.accent, fontWeight: "700" as const }, columns: { flexDirection: "row" as const, height: 264, gap: 16 }, column: { flex: 1 }, option: { minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 8 },
}));
