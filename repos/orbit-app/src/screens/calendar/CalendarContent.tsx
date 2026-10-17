import { StyleSheet, View } from "react-native";

import { Button, Card, EmptyState, IconButton, Segmented, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import type { OrbitColors } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { ScheduleCalendarDay, ScheduleTimelineItem } from "../../view-models/schedule";
import type { CalendarExternalEventContract } from "../../api/contract/calendar-external-events";
import { calendarDateKeys, type CalendarMode, type CalendarProjection } from "./calendar-projection";
import type { CalendarExternalView } from "./calendar-external-state";
import { calendarExternalEventsByDay } from "./calendar-external-view";

type ReadyProjection = Extract<CalendarProjection, { kind: "ready" }>;

export function CalendarContent({ mode, projection, external, timeZone, onConnectExternal, onChangeMode, onSelectDate, onShift, onToday, onCreate, onOpenItem, onEditPersonal }: {
  mode: CalendarMode;
  projection: ReadyProjection;
  external?: CalendarExternalView;
  timeZone: string;
  onConnectExternal(): void;
  onChangeMode(mode: CalendarMode): void;
  onSelectDate(dateKey: string): void;
  onShift(direction: -1 | 1): void;
  onToday(): void;
  onCreate(): void;
  onOpenItem(item: ScheduleTimelineItem): void;
  onEditPersonal(id: string): void;
}) {
  const { t, language } = useOrbitLocale();
  const { colors, styles } = useStyles();
  const selected = projection.selectedDateKey;
  const selectedDate = new Date(`${selected}T12:00:00Z`);
  const header = new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long", ...(mode === "day" ? { day: "numeric", weekday: "short" } : {}), timeZone: "UTC" }).format(selectedDate);
  const selectedOverlaps = projection.overlaps.filter(pair => pair.dateKey === selected);
  const externalByDay = calendarExternalEventsByDay(external?.events ?? [], projection.dateKeys, timeZone);
  const selectedExternal = externalByDay.get(selected) ?? [];
  const personalConflict = selectedOverlaps.flatMap(pair => pair.ids).find(id => projection.selectedItems.some(item => item.id === id && item.kind === "personal"));
  const previous = t(mode === "month" ? "schedule.previousMonth" : mode === "week" ? "schedule.previousWeek" : "schedule.previousDay");
  const next = t(mode === "month" ? "schedule.nextMonth" : mode === "week" ? "schedule.nextWeek" : "schedule.nextDay");
  return <View style={styles.body}>
    {external?.connection === "not_connected" || external?.connection === "needs_reconnect" ? <Card variant="flat" style={styles.externalNotice}>
      <UiText style={styles.externalNoticeText}>{t(external.connection === "not_connected" ? "calendar.view.externalNotConnected" : "calendar.view.externalReconnectNeeded")}</UiText>
      <Button size="sm" label={t(external.connection === "not_connected" ? "calendar.view.externalConnect" : "calendar.view.externalReconnect")} onPress={onConnectExternal} />
    </Card> : null}
    {external?.connection === "unavailable" ? <Card variant="flat" style={styles.externalNotice}><UiText style={styles.externalNoticeText}>{t("calendar.view.externalUnavailable")}</UiText></Card> : null}
    <View style={styles.controlRow}>
      <Segmented<CalendarMode> accessibilityLabel={t("schedule.title")} segments={[
        { key: "day", label: t("schedule.viewDay") }, { key: "week", label: t("schedule.viewWeek") }, { key: "month", label: t("schedule.viewMonth") },
      ]} value={mode} onChange={onChangeMode} />
      <Button size="sm" label={t("schedule.backToday")} onPress={onToday} />
    </View>
    <View style={styles.navigation}>
      <IconButton icon="left" size={34} accessibilityLabel={previous} onPress={() => onShift(-1)} />
      <UiText accessibilityRole="header" style={styles.heading}>{header}</UiText>
      <IconButton icon="right" size={34} accessibilityLabel={next} onPress={() => onShift(1)} />
    </View>
    {mode === "month" ? <Card style={styles.gridCard}>
      <View style={styles.grid}>
        {projection.days.slice(0, 7).map(day => <UiText key={`weekday:${day.dateKey}`} style={styles.weekday}>{day.weekdayLabel}</UiText>)}
        {projection.days.map(day => <CalendarDateCell key={day.dateKey} day={day} external={externalByDay.get(day.dateKey) ?? []} currentMonth={day.dateKey.slice(0, 7) === selected.slice(0, 7)} colors={colors} onSelect={() => onSelectDate(day.dateKey)} />)}
      </View>
    </Card> : <View style={styles.weekStrip}>
      {calendarDateKeys(selected, "week").map(dateKey => {
        const day = projection.days.find(value => value.dateKey === dateKey);
        const label = day?.weekdayLabel ?? new Intl.DateTimeFormat(language, { timeZone: "UTC", weekday: "short" }).format(new Date(`${dateKey}T12:00:00Z`));
        return <UiPressable key={dateKey} accessibilityRole="button" accessibilityLabel={`${label} ${Number(dateKey.slice(8))}`} accessibilityState={{ selected: dateKey === selected }} onPress={() => onSelectDate(dateKey)} style={[styles.weekDay, dateKey === selected && styles.weekDaySelected]}>
          <UiText style={styles.weekDayLabel}>{label}</UiText><UiText style={styles.weekDayNumber}>{Number(dateKey.slice(8))}</UiText>
          <View style={styles.weekDots}>{day?.items.slice(0, 3).map(item => <View key={item.id} style={[styles.dot, { backgroundColor: tone(item.kind, colors).ink }]} />)}
            {(externalByDay.get(dateKey) ?? []).slice(0, Math.max(0, 3 - (day?.items.length ?? 0))).map(item => <View key={`external:${item.id}`} style={[styles.dot, { backgroundColor: colors.accentText }]} />)}</View>
        </UiPressable>;
      })}
    </View>}
    {projection.items.length === 0 && (external?.events.length ?? 0) === 0 ? <EmptyState title={t("calendar.view.emptyTitle")} message={t("calendar.view.emptyBody")} action={{ label: t("schedule.newPersonal"), onPress: onCreate }} /> : null}
    <Card style={styles.agenda}>
      <View style={styles.agendaHeading}>
        <UiText accessibilityRole="header" style={styles.agendaTitle}>{new Intl.DateTimeFormat(language, { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(selectedDate)}</UiText>
        <UiText style={styles.count}>{t("schedule.dayItemCount", { weekday: "", count: projection.selectedItems.length + selectedExternal.length }).trim()}</UiText>
      </View>
      {projection.selectedItems.length ? projection.selectedItems.map(item => <UiPressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title} ${t("schedule.openDetail")}`} onPress={() => onOpenItem(item)} style={styles.agendaRow}>
        <UiText style={styles.time}>{item.timeLabel || t("schedule.allDay")}</UiText>
        <View style={[styles.itemCard, { backgroundColor: tone(item.kind, colors).background }, selectedOverlaps.some(pair => pair.ids.includes(item.id)) && styles.clash]}>
          <UiText style={[styles.itemTitle, { color: tone(item.kind, colors).ink }]}>{item.title}</UiText>
          {item.subtitle ? <UiText numberOfLines={1} style={[styles.itemSubtitle, { color: tone(item.kind, colors).ink }]}>{item.subtitle}</UiText> : null}
        </View>
      </UiPressable>) : null}
      {selectedExternal.map(item => <View key={`external:${item.id}`} style={styles.agendaRow}>
        <UiText style={styles.time}>{item.allDay ? t("schedule.allDay") : new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(item.startsAt))}</UiText>
        <View style={[styles.itemCard, styles.externalItem]}><UiText style={styles.externalItemTitle}>{item.titlePreview}</UiText><UiText style={styles.externalSource}>{t("calendar.view.externalSource")} · {t("calendar.view.externalReadOnly")}</UiText></View>
      </View>)}
      {!projection.selectedItems.length && !selectedExternal.length ? <UiText style={styles.emptyDay}>{t("schedule.emptyDay")}</UiText> : null}
    </Card>
    {selectedOverlaps.length ? <Card variant="flat" style={styles.overlapCard}>
      {selectedOverlaps.map(pair => <UiText key={pair.ids.join(":")} accessibilityRole="alert" style={styles.overlapText}>{t("calendar.view.overlap", { first: pair.titles[0], second: pair.titles[1] })}</UiText>)}
      {personalConflict ? <Button size="sm" label={t("calendar.view.changeTime")} onPress={() => onEditPersonal(personalConflict)} /> : null}
    </Card> : null}
  </View>;
}

function CalendarDateCell({ day, external, currentMonth, colors, onSelect }: { day: ScheduleCalendarDay; external: readonly CalendarExternalEventContract[]; currentMonth: boolean; colors: OrbitColors; onSelect(): void }) {
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  const dateLabel = t("schedule.dateLabel", { month: Number(day.dateKey.slice(5, 7)), day: Number(day.dayNumber), weekday: day.weekdayLabel });
  return <UiPressable accessibilityRole="button" accessibilityLabel={`${dateLabel} ${day.items.length + external.length}`} accessibilityState={{ selected: day.isSelected }} onPress={onSelect} style={[styles.dateCell, !currentMonth && styles.outside, day.isSelected && styles.selectedCell]}>
    <UiText style={[styles.dateNumber, day.isToday && styles.todayNumber, (day.isSunday || day.isHoliday) && styles.holidayNumber]}>{day.dayNumber}</UiText>
    {day.items.slice(0, 2).map(item => <View key={item.id} style={[styles.monthItem, { backgroundColor: tone(item.kind, colors).background }]}><UiText numberOfLines={1} style={[styles.monthItemText, { color: tone(item.kind, colors).ink }]}>{item.title}</UiText></View>)}
    {external.slice(0, Math.max(0, 2 - day.items.length)).map(item => <View key={`external:${item.id}`} style={[styles.monthItem, styles.externalItem]}><UiText numberOfLines={1} style={styles.externalItemTitle}>{item.titlePreview}</UiText></View>)}
    {day.items.length + external.length > 2 ? <UiText style={styles.more}>{t("calendar.view.more", { count: day.items.length + external.length - 2 })}</UiText> : null}
  </UiPressable>;
}

function tone(kind: ScheduleTimelineItem["kind"], colors: OrbitColors) {
  if (kind === "meeting") return { background: colors.macBlue, ink: colors.macBlueText };
  if (kind === "personal") return { background: colors.macTeal, ink: colors.macTealText };
  if (kind === "followup") return { background: colors.macPink, ink: colors.macPinkText };
  return { background: colors.macLav, ink: colors.macLavText };
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  body: { gap: 14 }, controlRow: { flexDirection: "row", gap: 10, alignItems: "center" }, navigation: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }, heading: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  externalNotice: { backgroundColor: colors.macLav, flexDirection: "row", alignItems: "center", gap: 8 }, externalNoticeText: { color: colors.macLavText, flex: 1, fontSize: 12 },
  externalItem: { backgroundColor: colors.macLav }, externalItemTitle: { color: colors.macLavText, fontSize: 12, fontWeight: "700" }, externalSource: { color: colors.macLavText, fontSize: 11 },
  gridCard: { paddingHorizontal: 8, paddingVertical: 12 }, grid: { flexDirection: "row", flexWrap: "wrap" }, weekday: { width: "14.285%", textAlign: "center", color: colors.ink3Text, fontSize: 11, fontWeight: "700", marginBottom: 8 },
  dateCell: { width: "14.285%", minHeight: 70, padding: 3, borderWidth: 1, borderColor: colors.line, gap: 2 }, outside: { opacity: 0.45 }, selectedCell: { backgroundColor: colors.surface2 }, dateNumber: { color: colors.ink, fontSize: 12, fontWeight: "700" }, todayNumber: { color: colors.accentText }, holidayNumber: { color: colors.coralText },
  monthItem: { borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 }, monthItemText: { fontSize: 9, fontWeight: "700" }, more: { color: colors.ink3Text, fontSize: 9 },
  weekStrip: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 18, padding: 5, gap: 3 }, weekDay: { flex: 1, minHeight: 66, alignItems: "center", gap: 3, borderRadius: 12, paddingVertical: 5 }, weekDaySelected: { backgroundColor: colors.surface2 }, weekDayLabel: { color: colors.ink3Text, fontSize: 10 }, weekDayNumber: { color: colors.ink, fontSize: 14, fontWeight: "700" }, weekDots: { flexDirection: "row", gap: 2, height: 5 }, dot: { width: 4, height: 4, borderRadius: 2 },
  agenda: { gap: 8, padding: 14 }, agendaHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, agendaTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" }, count: { color: colors.ink3Text, fontSize: 11 }, agendaRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, minHeight: 48 }, time: { color: colors.ink2, width: 42, paddingTop: 9, fontSize: 11, fontWeight: "700" }, itemCard: { flex: 1, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10 }, clash: { borderColor: colors.coralText, borderWidth: 1.5 }, itemTitle: { fontSize: 13, fontWeight: "700" }, itemSubtitle: { fontSize: 11 }, emptyDay: { color: colors.ink3Text, fontSize: 13, paddingVertical: 12 }, overlapCard: { gap: 8, backgroundColor: colors.coralSoft }, overlapText: { color: colors.coralText, fontSize: 12, fontWeight: "700" },
}));
