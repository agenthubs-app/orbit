import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, shadows, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  japanCalendarDateInfo,
  scheduleToCalendarView,
  shiftScheduleDateKey,
  shiftScheduleMonthDateKey,
  type ScheduleCalendarDay,
  type ScheduleCalendarView,
  type ScheduleTimelineItem
} from "../../view-models/schedule";

type ScheduleViewMode = "day" | "week" | "month";

const hourHeight = 64;
const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function usable<TData>(
  state: ReturnType<typeof useApiResource<TData>>
): state is Extract<ReturnType<typeof useApiResource<TData>>, { kind: "empty" | "success" }> {
  return state.kind === "success" || state.kind === "empty";
}

function minuteOfDay(timeLabel: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(timeLabel);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? hour * 60 + minute
    : null;
}

function currentTokyoMinute(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: "Asia/Tokyo"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return value("hour") * 60 + value("minute");
}

function itemTone(item: ScheduleTimelineItem) {
  if (item.kind === "followup") {
    return {
        backgroundColor: colors.accentSofter,
        borderColor: colors.accent,
        color: colors.accent,
        icon: "person-outline" as const
      };
  }
  if (item.kind === "meeting") {
    return {
      backgroundColor: colors.skySoft,
      borderColor: colors.sky,
      color: colors.sky,
      icon: "people-outline" as const
    };
  }
  if (item.kind === "personal") {
    return {
      backgroundColor: colors.liveSoft,
      borderColor: colors.live,
      color: colors.live,
      icon: "time-outline" as const
    };
  }
  return {
        backgroundColor: colors.amberSoft,
        borderColor: colors.amber,
        color: colors.amber,
        icon: "calendar-outline" as const
      };
}

function monthGridDateKeys(selectedDateKey: string): string[] {
  const [year, month] = selectedDateKey.split("-").map(Number);
  const firstDateKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const firstDate = new Date(`${firstDateKey}T12:00:00+09:00`);
  const sundayOffset = -firstDate.getUTCDay();
  const gridStart = shiftScheduleDateKey(firstDateKey, sundayOffset);

  return Array.from({ length: 42 }, (_, index) =>
    shiftScheduleDateKey(gridStart, index)
  );
}

export function ScheduleScreen() {
  const tasksState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.tasks, () => false);
  const eventsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.publicEvents,
    () => false
  );
  const scheduleItemsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.scheduleItems,
    () => false
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string>();
  const [viewMode, setViewMode] = useState<ScheduleViewMode>("day");
  const now = useMemo(() => new Date(), []);

  function refresh() {
    tasksState.refresh();
    eventsState.refresh();
    scheduleItemsState.refresh();
  }

  const hasAnyData = usable(tasksState) || usable(eventsState) || usable(scheduleItemsState);
  const view = hasAnyData
    ? scheduleToCalendarView({
        events: usable(eventsState) ? eventsState.data : { events: [] },
        now,
        scheduleItems: usable(scheduleItemsState)
          ? scheduleItemsState.data
          : { scheduleItems: [] },
        ...(selectedDateKey ? { selectedDateKey } : {}),
        tasks: usable(tasksState) ? tasksState.data : { tasks: [] }
      })
    : null;
  const loading = tasksState.kind === "loading" || eventsState.kind === "loading" || scheduleItemsState.kind === "loading";

  return (
    <AppScreen
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={tasksState.refreshing || eventsState.refreshing || scheduleItemsState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="日程"
    >
      {loading ? <LoadingState /> : null}
      {tasksState.kind === "offline" ? (
        <ErrorState message={tasksState.error.message} title="待办暂时连不上" />
      ) : null}
      {eventsState.kind === "offline" ? (
        <ErrorState message={eventsState.error.message} title="活动暂时连不上" />
      ) : null}
      {tasksState.kind === "failure" ? (
        <ErrorState message={tasksState.error.message} title="待办加载失败" />
      ) : null}
      {eventsState.kind === "failure" ? (
        <ErrorState message={eventsState.error.message} title="活动加载失败" />
      ) : null}
      {scheduleItemsState.kind === "failure" || scheduleItemsState.kind === "offline" ? (
        <ErrorState message={scheduleItemsState.error.message} title="个人日程加载失败" />
      ) : null}
      {view ? (
        <ScheduleWorkspace
          now={now}
          onSelectDate={setSelectedDateKey}
          onToday={() => setSelectedDateKey(undefined)}
          onViewModeChange={setViewMode}
          view={view}
          viewMode={viewMode}
        />
      ) : null}
    </AppScreen>
  );
}

function ScheduleWorkspace({
  now,
  onSelectDate,
  onToday,
  onViewModeChange,
  view,
  viewMode
}: {
  now: Date;
  onSelectDate: (dateKey: string) => void;
  onToday: () => void;
  onViewModeChange: (mode: ScheduleViewMode) => void;
  view: ScheduleCalendarView;
  viewMode: ScheduleViewMode;
}) {
  return (
    <View style={styles.workspace}>
      <View style={styles.commandRow}>
        <View style={styles.legendRow}>
          <ScheduleLegend color={colors.accent} label="人脉待办" />
          <ScheduleLegend color={colors.sky} label="会面" />
          <ScheduleLegend color={colors.amber} label="活动" />
        </View>
        <Pressable
          accessibilityLabel="回到今天"
          accessibilityRole="button"
          onPress={onToday}
          style={({ pressed }) => [styles.todayButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.todayButtonText}>今天</Text>
        </Pressable>
      </View>
      <ScheduleViewSwitcher onChange={onViewModeChange} value={viewMode} />
      {viewMode === "month" ? (
        <ScheduleMonthGrid onSelectDate={onSelectDate} view={view} />
      ) : (
        <ScheduleWeekStrip
          onMoveWeek={(days) =>
            onSelectDate(shiftScheduleDateKey(view.selectedDateKey, days))
          }
          onSelectDate={onSelectDate}
          view={view}
        />
      )}
      {viewMode === "day" ? <ScheduleDayView now={now} view={view} /> : null}
      {viewMode === "week" ? <ScheduleWeekAgenda view={view} /> : null}
      {viewMode === "month" ? (
        <ScheduleCompactAgenda
          badgeLabel={view.selectedHolidayName}
          emptyMessage="这一天暂无安排"
          items={[...view.allDayItems, ...view.timedItems]}
          title={view.selectedDayLabel}
        />
      ) : null}
    </View>
  );
}

function ScheduleLegend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function ScheduleViewSwitcher({
  onChange,
  value
}: {
  onChange: (mode: ScheduleViewMode) => void;
  value: ScheduleViewMode;
}) {
  const options: Array<{ label: string; value: ScheduleViewMode }> = [
    { label: "日", value: "day" },
    { label: "周", value: "week" },
    { label: "月", value: "month" }
  ];

  return (
    <View accessibilityRole="tablist" style={styles.viewSwitcher}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.viewSwitchButton,
              selected ? styles.viewSwitchButtonSelected : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Text
              style={[
                styles.viewSwitchText,
                selected ? styles.viewSwitchTextSelected : null
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ScheduleWeekStrip({
  onMoveWeek,
  onSelectDate,
  view
}: {
  onMoveWeek: (days: number) => void;
  onSelectDate: (dateKey: string) => void;
  view: ScheduleCalendarView;
}) {
  return (
    <View style={styles.calendarPanel}>
      <View style={styles.weekHeader}>
        <Pressable
          accessibilityLabel="上一周"
          accessibilityRole="button"
          onPress={() => onMoveWeek(-7)}
          style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
        >
          <Ionicons color={colors.text2} name="chevron-back" size={18} />
        </Pressable>
        <View style={styles.weekHeadingCopy}>
          <Text style={styles.monthLabel}>{view.monthLabel}</Text>
          <Text style={styles.weekLabel}>{view.weekLabel}</Text>
        </View>
        <Pressable
          accessibilityLabel="下一周"
          accessibilityRole="button"
          onPress={() => onMoveWeek(7)}
          style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
        >
          <Ionicons color={colors.text2} name="chevron-forward" size={18} />
        </Pressable>
      </View>
      <View style={styles.dayStrip}>
        {view.days.map((day) => (
          <ScheduleDayButton day={day} key={day.dateKey} onPress={onSelectDate} />
        ))}
      </View>
    </View>
  );
}

function ScheduleDayButton({
  day,
  onPress
}: {
  day: ScheduleCalendarDay;
  onPress: (dateKey: string) => void;
}) {
  const accessibilityHoliday = day.holidayName ? `，${day.holidayName}` : "";

  return (
    <Pressable
      accessibilityLabel={`${day.weekdayLabel}${day.dayNumber}日${accessibilityHoliday}，${day.items.length}项安排`}
      accessibilityRole="button"
      accessibilityState={{ selected: day.isSelected }}
      onPress={() => onPress(day.dateKey)}
      style={({ pressed }) => [
        styles.dayButton,
        day.isSelected ? styles.dayButtonSelected : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Text
        style={[
          styles.dayWeekday,
          day.isSaturday ? styles.saturdayText : null,
          day.isSunday || day.isHoliday ? styles.holidayText : null,
          day.isSelected ? styles.dayTextSelected : null
        ]}
      >
        {day.weekdayLabel.replace("周", "")}
      </Text>
      <Text
        style={[
          styles.dayNumber,
          day.isSaturday ? styles.saturdayText : null,
          day.isSunday || day.isHoliday ? styles.holidayText : null,
          day.isToday && !day.isSelected ? styles.todayDateText : null,
          day.isSelected ? styles.dayTextSelected : null
        ]}
      >
        {day.dayNumber}
      </Text>
      <View style={styles.dayDots}>
        {day.items.slice(0, 3).map((item) => (
          <View
            key={`${day.dateKey}-${item.kind}-${item.id}`}
            style={[
              styles.dayDot,
              {
                backgroundColor: day.isSelected
                  ? colors.onAccent
                  : itemTone(item).color
              }
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

function ScheduleDayView({ now, view }: { now: Date; view: ScheduleCalendarView }) {
  const selectedHolidayName = view.selectedHolidayName;

  return (
    <View style={styles.dayView}>
      <View style={styles.sectionHeadingRow}>
        <View style={styles.selectedDateHeading}>
          <Text style={styles.sectionTitle}>{view.selectedDayLabel}</Text>
          {selectedHolidayName ? (
            <View style={styles.holidayBadge}>
              <Text style={styles.holidayBadgeText}>{selectedHolidayName}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sectionCount}>
          {view.allDayItems.length + view.timedItems.length} 项
        </Text>
      </View>
      {view.allDayItems.length > 0 ? (
        <View style={styles.allDayRow}>
          <Text style={styles.allDayLabel}>全天</Text>
          <View style={styles.allDayItems}>
            {view.allDayItems.map((item) => (
              <ScheduleAgendaRow item={item} key={`${item.kind}-${item.id}`} />
            ))}
          </View>
        </View>
      ) : null}
      <ScheduleTimeGrid
        isToday={view.days.some((day) => day.isSelected && day.isToday)}
        items={view.timedItems}
        now={now}
      />
    </View>
  );
}

function ScheduleTimeGrid({
  isToday,
  items,
  now
}: {
  isToday: boolean;
  items: ScheduleTimelineItem[];
  now: Date;
}) {
  const itemMinutes = items
    .map((item) => minuteOfDay(item.timeLabel))
    .filter((value): value is number => value !== null);
  const earliestMinute = itemMinutes.length > 0 ? Math.min(...itemMinutes) : 9 * 60;
  const latestMinute = items.reduce((latest, item) => {
    const startsAt = minuteOfDay(item.timeLabel);
    return startsAt === null
      ? latest
      : Math.max(latest, startsAt + item.durationMinutes);
  }, 18 * 60);
  const startHour = Math.max(0, Math.min(8, Math.floor(earliestMinute / 60)));
  const endHour = Math.min(24, Math.max(21, Math.ceil(latestMinute / 60)));
  const hours = Array.from(
    { length: endHour - startHour + 1 },
    (_, index) => startHour + index
  );
  const gridHeight = (endHour - startHour) * hourHeight;
  const currentTop = ((currentTokyoMinute(now) - startHour * 60) / 60) * hourHeight;

  return (
    <View style={[styles.timeGrid, { height: gridHeight + 1 }]}>
      {hours.map((hour) => (
        <View
          key={hour}
          style={[styles.hourRow, { top: (hour - startHour) * hourHeight }]}
        >
          <Text style={styles.hourLabel}>{String(hour).padStart(2, "0")}:00</Text>
          <View style={styles.hourLine} />
        </View>
      ))}
      {isToday && currentTop >= 0 && currentTop <= gridHeight ? (
        <View style={[styles.currentTimeRow, { top: currentTop }]}>
          <View style={styles.currentTimeDot} />
          <View style={styles.currentTimeLine} />
        </View>
      ) : null}
      {items.map((item) => {
        const startsAt = minuteOfDay(item.timeLabel);
        if (startsAt === null) {
          return null;
        }
        const top = ((startsAt - startHour * 60) / 60) * hourHeight;
        const height = Math.max(42, (item.durationMinutes / 60) * hourHeight - 4);
        return (
          <ScheduleTimeBlock
            height={height}
            item={item}
            key={`${item.kind}-${item.id}`}
            top={top}
          />
        );
      })}
      {items.length === 0 ? (
        <View style={styles.emptyTimeline}>
          <Ionicons color={colors.text4} name="calendar-clear-outline" size={20} />
          <Text style={styles.emptyTimelineText}>这一天暂无安排</Text>
        </View>
      ) : null}
    </View>
  );
}

function ScheduleTimeBlock({
  height,
  item,
  top
}: {
  height: number;
  item: ScheduleTimelineItem;
  top: number;
}) {
  const router = useRouter();
  const tone = itemTone(item);
  const compact = height < 56;

  return (
    <Pressable
      accessibilityHint="打开日程详情"
      accessibilityLabel={`${item.title}，${item.timeLabel || "时间待定"}，${item.actionLabel}`}
      accessibilityRole="button"
      onPress={() => router.push(item.href as Href)}
      style={({ pressed }) => [
        styles.timeBlock,
        {
          backgroundColor: tone.backgroundColor,
          borderLeftColor: tone.borderColor,
          height,
          top
        },
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.timeBlockHeader}>
        <Ionicons color={tone.color} name={tone.icon} size={14} />
        <Text numberOfLines={1} style={[styles.timeBlockTime, { color: tone.color }]}>
          {item.timeLabel}
        </Text>
        <Text numberOfLines={1} style={styles.timeBlockTitle}>
          {item.title}
        </Text>
      </View>
      {!compact && item.subtitle ? (
        <Text numberOfLines={1} style={styles.timeBlockMeta}>
          {item.subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ScheduleWeekAgenda({ view }: { view: ScheduleCalendarView }) {
  return (
    <View style={styles.agendaSection}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>本周安排</Text>
        <Text style={styles.sectionCount}>
          {view.days.reduce((sum, day) => sum + day.items.length, 0)} 项
        </Text>
      </View>
      <View style={styles.weekAgendaList}>
        {view.days.map((day) => (
          <View key={day.dateKey} style={styles.weekAgendaDay}>
            <View style={styles.weekAgendaDate}>
              <Text
                style={[
                  styles.weekAgendaWeekday,
                  day.isSaturday ? styles.saturdayText : null,
                  day.isSunday || day.isHoliday ? styles.holidayText : null
                ]}
              >
                {day.weekdayLabel}
              </Text>
              <Text
                style={[
                  styles.weekAgendaNumber,
                  day.isSaturday ? styles.saturdayText : null,
                  day.isSunday || day.isHoliday ? styles.holidayText : null
                ]}
              >
                {day.dayNumber}
              </Text>
            </View>
            <View style={styles.weekAgendaItems}>
              {day.items.length > 0 ? (
                day.items.map((item) => (
                  <ScheduleAgendaRow item={item} key={`${item.kind}-${item.id}`} />
                ))
              ) : (
                <Text style={styles.weekAgendaEmpty}>暂无安排</Text>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ScheduleMonthGrid({
  onSelectDate,
  view
}: {
  onSelectDate: (dateKey: string) => void;
  view: ScheduleCalendarView;
}) {
  const dateKeys = monthGridDateKeys(view.selectedDateKey);
  const selectedMonth = view.selectedDateKey.slice(0, 7);

  return (
    <View style={styles.calendarPanel}>
      <View style={styles.monthGridHeader}>
        <Pressable
          accessibilityLabel="上个月"
          accessibilityRole="button"
          onPress={() =>
            onSelectDate(shiftScheduleMonthDateKey(view.selectedDateKey, -1))
          }
          style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
        >
          <Ionicons color={colors.text2} name="chevron-back" size={18} />
        </Pressable>
        <Text style={styles.monthGridTitle}>{view.monthLabel}</Text>
        <Pressable
          accessibilityLabel="下个月"
          accessibilityRole="button"
          onPress={() =>
            onSelectDate(shiftScheduleMonthDateKey(view.selectedDateKey, 1))
          }
          style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
        >
          <Ionicons color={colors.text2} name="chevron-forward" size={18} />
        </Pressable>
      </View>
      <View style={styles.monthWeekdays}>
        {weekdayLabels.map((label, index) => (
          <Text
            key={label}
            style={[
              styles.monthWeekday,
              index === 6 ? styles.saturdayText : null,
              index === 0 ? styles.holidayText : null
            ]}
          >
            {label.replace("周", "")}
          </Text>
        ))}
      </View>
      <View style={styles.monthDays}>
        {dateKeys.map((dateKey) => {
          const selected = dateKey === view.selectedDateKey;
          const dateItems = view.items.filter((item) => item.dateKey === dateKey);
          const calendarDateInfo = japanCalendarDateInfo(dateKey);
          return (
            <Pressable
              accessibilityLabel={`${Number(dateKey.slice(-2))}日${calendarDateInfo.holidayName ? `，${calendarDateInfo.holidayName}` : ""}，${dateItems.length}项安排`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={dateKey}
              onPress={() => onSelectDate(dateKey)}
              style={({ pressed }) => [
                styles.monthDay,
                selected ? styles.monthDaySelected : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text
                style={[
                  styles.monthDayText,
                  calendarDateInfo.isSaturday ? styles.saturdayText : null,
                  calendarDateInfo.isSunday || calendarDateInfo.isHoliday
                    ? styles.holidayText
                    : null,
                  !dateKey.startsWith(selectedMonth) ? styles.monthDayMuted : null,
                  selected ? styles.dayTextSelected : null
                ]}
              >
                {Number(dateKey.slice(-2))}
              </Text>
              <View style={styles.monthDayDots}>
                {dateItems.slice(0, 2).map((item) => (
                  <View
                    key={`${dateKey}-${item.kind}-${item.id}`}
                    style={[
                      styles.monthDayDot,
                      {
                        backgroundColor: selected
                          ? colors.onAccent
                          : itemTone(item).color
                      }
                    ]}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ScheduleCompactAgenda({
  badgeLabel,
  emptyMessage,
  items,
  title
}: {
  badgeLabel: string | undefined;
  emptyMessage: string;
  items: ScheduleTimelineItem[];
  title: string;
}) {
  return (
    <View style={styles.agendaSection}>
      <View style={styles.sectionHeadingRow}>
        <View style={styles.selectedDateHeading}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {badgeLabel ? (
            <View style={styles.holidayBadge}>
              <Text style={styles.holidayBadgeText}>{badgeLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sectionCount}>{items.length} 项</Text>
      </View>
      {items.length > 0 ? (
        <View style={styles.compactAgendaList}>
          {items.map((item) => (
            <ScheduleAgendaRow item={item} key={`${item.kind}-${item.id}`} />
          ))}
        </View>
      ) : (
        <Text style={styles.compactAgendaEmpty}>{emptyMessage}</Text>
      )}
    </View>
  );
}

function ScheduleAgendaRow({ item }: { item: ScheduleTimelineItem }) {
  const router = useRouter();
  const tone = itemTone(item);

  return (
    <Pressable
      accessibilityLabel={`${item.title}，${item.timeLabel || "全天"}`}
      accessibilityRole="button"
      onPress={() => router.push(item.href as Href)}
      style={({ pressed }) => [styles.agendaRow, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.agendaTime, { color: tone.color }]}>
        {item.timeLabel || "全天"}
      </Text>
      <View style={[styles.agendaIcon, { backgroundColor: tone.backgroundColor }]}>
        <Ionicons color={tone.color} name={tone.icon} size={16} />
      </View>
      <View style={styles.agendaCopy}>
        <Text numberOfLines={1} style={styles.agendaTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.agendaMeta}>
          {item.subtitle}
        </Text>
      </View>
      <Ionicons color={colors.text4} name="chevron-forward" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  agendaCopy: { flex: 1, minWidth: 0 },
  agendaIcon: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  agendaMeta: { color: colors.text3, fontSize: typography.caption, lineHeight: 17 },
  agendaRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 58,
    paddingVertical: spacing.sm
  },
  agendaSection: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.subtle
  },
  agendaTime: { fontSize: typography.small, fontWeight: "800", width: 43 },
  agendaTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 19
  },
  allDayItems: { flex: 1 },
  allDayLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    width: 44
  },
  allDayRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: spacing.sm
  },
  calendarPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.subtle
  },
  commandRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44
  },
  compactAgendaEmpty: {
    color: colors.text3,
    fontSize: typography.small,
    paddingVertical: spacing.lg,
    textAlign: "center"
  },
  compactAgendaList: { marginBottom: -spacing.sm },
  currentTimeDot: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 7,
    width: 7
  },
  currentTimeLine: { backgroundColor: colors.accent, flex: 1, height: 1 },
  currentTimeRow: {
    alignItems: "center",
    flexDirection: "row",
    left: 49,
    position: "absolute",
    right: 0,
    zIndex: 3
  },
  dayButton: {
    alignItems: "center",
    borderRadius: radius.md,
    flex: 1,
    height: 70,
    justifyContent: "center",
    minWidth: 0,
    paddingVertical: spacing.xs
  },
  dayButtonSelected: { backgroundColor: colors.accent },
  dayDot: { borderRadius: radius.pill, height: 4, width: 4 },
  dayDots: { flexDirection: "row", gap: 2, height: 5, justifyContent: "center" },
  dayNumber: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 22
  },
  dayStrip: { flexDirection: "row", gap: 3 },
  dayTextSelected: { color: colors.onAccent },
  dayView: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    ...shadows.subtle
  },
  dayWeekday: {
    color: colors.text3,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16
  },
  emptyTimeline: {
    alignItems: "center",
    gap: spacing.xs,
    left: 64,
    position: "absolute",
    right: spacing.md,
    top: 92
  },
  emptyTimelineText: { color: colors.text4, fontSize: typography.small },
  hourLabel: { color: colors.text4, fontSize: 11, marginTop: -8, width: 46 },
  hourLine: { borderTopColor: colors.border, borderTopWidth: 1, flex: 1 },
  hourRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    left: 0,
    position: "absolute",
    right: 0
  },
  holidayBadge: {
    backgroundColor: colors.roseSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs
  },
  holidayBadgeText: {
    color: colors.rose,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  holidayText: { color: colors.rose },
  iconButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  legendDot: { borderRadius: radius.pill, height: 6, width: 6 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  legendRow: { flexDirection: "row", gap: spacing.md },
  legendText: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  monthDay: {
    alignItems: "center",
    borderRadius: radius.control,
    flexBasis: "14.285%",
    height: 44,
    justifyContent: "center"
  },
  monthDayDot: { borderRadius: radius.pill, height: 3, width: 3 },
  monthDayDots: { flexDirection: "row", gap: 2, height: 4 },
  monthDayMuted: { color: colors.text4 },
  monthDaySelected: { backgroundColor: colors.accent },
  monthDayText: { color: colors.ink, fontSize: typography.small, fontWeight: "700" },
  monthDays: { flexDirection: "row", flexWrap: "wrap" },
  monthGridHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  monthGridTitle: { color: colors.ink, fontSize: typography.section, fontWeight: "800" },
  monthLabel: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "800",
    lineHeight: 22
  },
  monthWeekday: {
    color: colors.text3,
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center"
  },
  monthWeekdays: { flexDirection: "row", marginBottom: spacing.xs },
  pressed: { opacity: 0.72 },
  saturdayText: { color: colors.sky },
  selectedDateHeading: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.sm
  },
  sectionCount: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  sectionHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md
  },
  sectionTitle: { color: colors.ink, fontSize: typography.section, fontWeight: "800" },
  timeBlock: {
    borderLeftWidth: 3,
    borderRadius: radius.control,
    gap: 3,
    justifyContent: "center",
    left: 54,
    paddingHorizontal: spacing.sm,
    position: "absolute",
    right: 0,
    zIndex: 2
  },
  timeBlockHeader: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  timeBlockMeta: {
    color: colors.text3,
    fontSize: 11,
    lineHeight: 15,
    marginLeft: 18
  },
  timeBlockTime: { fontSize: 11, fontWeight: "800" },
  timeBlockTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "800"
  },
  timeGrid: { position: "relative" },
  todayButton: {
    alignItems: "center",
    borderColor: colors.border2,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  todayButtonText: { color: colors.accent, fontSize: typography.small, fontWeight: "800" },
  todayDateText: { color: colors.accent },
  viewSwitchButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flex: 1,
    height: 40,
    justifyContent: "center"
  },
  viewSwitchButtonSelected: { backgroundColor: colors.surface },
  viewSwitchText: { color: colors.text3, fontSize: typography.small, fontWeight: "700" },
  viewSwitchTextSelected: { color: colors.accent, fontWeight: "800" },
  viewSwitcher: {
    backgroundColor: colors.surface3,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    padding: 3
  },
  weekAgendaDate: { alignItems: "center", paddingTop: spacing.sm, width: 42 },
  weekAgendaDay: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 62
  },
  weekAgendaEmpty: { color: colors.text4, fontSize: typography.small, paddingVertical: spacing.lg },
  weekAgendaItems: { flex: 1 },
  weekAgendaList: { marginBottom: -1 },
  weekAgendaNumber: { color: colors.ink, fontSize: typography.body, fontWeight: "800" },
  weekAgendaWeekday: { color: colors.text3, fontSize: 10, fontWeight: "700" },
  weekHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  weekHeadingCopy: { alignItems: "center", gap: spacing.xxs },
  weekLabel: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  workspace: { gap: spacing.md }
});
