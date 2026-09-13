import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout, textStyles, radius, spacing, typography, type OrbitColors } from "../../design/tokens";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
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

const hourHeight = 56;
const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

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

function itemTone(item: ScheduleTimelineItem, colors: OrbitColors) {
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
  const year = Number(selectedDateKey.slice(0, 4));
  const month = Number(selectedDateKey.slice(5, 7));
  const firstDateKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const firstDate = new Date(`${firstDateKey}T12:00:00+09:00`);
  const mondayOffset = -((firstDate.getUTCDay() + 6) % 7);
  const gridStart = shiftScheduleDateKey(firstDateKey, mondayOffset);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = Math.max(35, Math.ceil((daysInMonth - mondayOffset) / 7) * 7);

  return Array.from({ length: cellCount }, (_, index) =>
    shiftScheduleDateKey(gridStart, index)
  );
}

export function ScheduleScreen() {
  const { colors } = useOrbitTheme();
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
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

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
        weekStartsOn: 1,
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
  const { colors, styles } = useStyles();
  return (
    <View style={styles.workspace}>
      <View style={styles.commandRow}>
        <ScheduleViewSwitcher onChange={onViewModeChange} value={viewMode} />
        <Pressable
          accessibilityLabel="回到今天"
          accessibilityRole="button"
          onPress={onToday}
          style={({ pressed }) => [styles.todayButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.todayButtonText}>今天</Text>
        </Pressable>
      </View>
      <ScheduleDateHeading onSelectDate={onSelectDate} view={view} viewMode={viewMode} />
      {viewMode === "month" ? (
        <ScheduleMonthGrid onSelectDate={onSelectDate} view={view} />
      ) : (
        <ScheduleWeekStrip
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
      <View style={styles.legendRow}>
        <ScheduleLegend color={colors.accent} label="人脉待办" />
        <ScheduleLegend color={colors.sky} label="会面" />
        <ScheduleLegend color={colors.amber} label="活动" />
        <ScheduleLegend color={colors.live} label="个人日程" />
      </View>
    </View>
  );
}

function ScheduleLegend({ color, label }: { color: string; label: string }) {
  const { styles } = useStyles();
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
  const { styles } = useStyles();
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
            aria-selected={selected}
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

function ScheduleDateHeading({ onSelectDate, view, viewMode }: {
  onSelectDate: (dateKey: string) => void;
  view: ScheduleCalendarView;
  viewMode: ScheduleViewMode;
}) {
  const { colors, styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  const compactDate = (dateKey: string) => dateKey.split("-").slice(1).map(Number).join(".");
  const title = viewMode === "day" ? compactDate(view.selectedDateKey)
    : viewMode === "week" ? `${compactDate(view.days[0]!.dateKey)} – ${compactDate(view.days[6]!.dateKey)}`
    : `${view.selectedDateKey.slice(0, 4)} · ${Number(view.selectedDateKey.slice(5, 7))}月`;
  const selectedDay = view.days.find(day => day.isSelected)!;
  // A Monday-first week's Thursday determines its ISO week-year.
  const thursday = new Date(`${view.days[3]!.dateKey}T00:00:00Z`);
  const weekYear = thursday.getUTCFullYear();
  const weekNumber = Math.ceil(((thursday.getTime() - Date.UTC(weekYear, 0, 1)) / 86_400_000 + 1) / 7);
  const move = (direction: number) => onSelectDate(viewMode === "month"
    ? shiftScheduleMonthDateKey(view.selectedDateKey, direction)
    : shiftScheduleDateKey(view.selectedDateKey, direction * (viewMode === "week" ? 7 : 1)));
  return (
    <View style={[styles.weekHeader, fontScale > 1.3 && styles.weekHeaderLarge]}>
      <View style={[styles.weekHeadingCopy, fontScale > 1.3 && styles.weekHeadingCopyLarge]}>
        <Text accessibilityRole="header" style={[styles.dateTitle, viewMode === "day" && styles.dayDateTitle]}>{title}</Text>
        {viewMode !== "month" ? <Text style={styles.dateSubtitle}>{viewMode === "day"
          ? `${selectedDay.weekdayLabel} · ${selectedDay.items.length} 项`
          : `${weekYear} · 第 ${weekNumber} 周`}</Text> : null}
        {viewMode === "day" && view.selectedHolidayName ? <Text style={styles.holidayBadgeText}>{view.selectedHolidayName}</Text> : null}
      </View>
      <View style={styles.dateArrows}>
        <Pressable accessibilityLabel={viewMode === "day" ? "上一天" : viewMode === "week" ? "上一周" : "上个月"} accessibilityRole="button"
          onPress={() => move(-1)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons color={colors.ink} name="chevron-back" size={18} />
        </Pressable>
        <Pressable accessibilityLabel={viewMode === "day" ? "下一天" : viewMode === "week" ? "下一周" : "下个月"} accessibilityRole="button"
          onPress={() => move(1)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons color={colors.ink} name="chevron-forward" size={18} />
        </Pressable>
      </View>
    </View>
  );
}

function ScheduleWeekStrip({
  onSelectDate,
  view
}: {
  onSelectDate: (dateKey: string) => void;
  view: ScheduleCalendarView;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.calendarPanel}>
      <View testID="schedule-week-strip" style={styles.dayStrip}>
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
  const { colors, styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  const accessibilityHoliday = day.holidayName ? `，${day.holidayName}` : "";

  return (
    <Pressable
      accessibilityLabel={`${day.weekdayLabel}${day.dayNumber}日${accessibilityHoliday}，${day.items.length}项安排`}
      accessibilityRole="button"
      accessibilityState={{ selected: day.isSelected }}
      aria-selected={day.isSelected}
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
        {fontScale > 1.3 ? day.weekdayLabel.replace("周", "") : day.weekdayLabel}
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
                backgroundColor: itemTone(item, colors).color
              }
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

function ScheduleDayView({ now, view }: { now: Date; view: ScheduleCalendarView }) {
  const { styles } = useStyles();

  return (
    <View style={styles.dayView}>
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
  const { colors, styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  const hourGutter = Math.max(42, Math.ceil(36 * fontScale + spacing.xs));
  const itemMinutes = items
    .map((item) => minuteOfDay(item.timeLabel))
    .filter((value): value is number => value !== null);
  const earliestMinute = itemMinutes.length > 0 ? Math.min(...itemMinutes) : 9 * 60;
  const latestMinute = items.reduce((latest, item) => {
    const startsAt = minuteOfDay(item.timeLabel);
    return startsAt === null
      ? latest
      : Math.max(latest, startsAt + item.durationMinutes);
  }, 17 * 60);
  const startHour = Math.max(0, Math.min(9, Math.floor(earliestMinute / 60)));
  const endHour = Math.min(24, Math.max(17, Math.ceil(latestMinute / 60)));
  const hours = Array.from(
    { length: endHour - startHour + 1 },
    (_, index) => startHour + index
  );
  const gridHeight = (endHour - startHour) * hourHeight;
  const currentMinute = currentTokyoMinute(now);
  const currentTop = ((currentMinute - startHour * 60) / 60) * hourHeight;
  const nextMinute = isToday ? Math.min(...itemMinutes.filter(minute => minute >= currentMinute)) : Infinity;

  return (
    <View style={[styles.timeGrid, { height: gridHeight + 1 }]}>
      {hours.map((hour) => (
        <View
          key={hour}
          style={[styles.hourRow, { top: (hour - startHour) * hourHeight }]}
        >
          <Text style={[styles.hourLabel, { width: hourGutter }]}>{String(hour).padStart(2, "0")}:00</Text>
          <View style={styles.hourLine} />
        </View>
      ))}
      {isToday && currentTop >= 0 && currentTop <= gridHeight ? (
        <View testID="schedule-current-time" style={[styles.currentTimeRow, { top: currentTop }]}>
          <Text style={[styles.currentTimeLabel, { width: hourGutter }]}>{String(Math.floor(currentMinute / 60)).padStart(2, "0")}:{String(currentMinute % 60).padStart(2, "0")}</Text>
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
        const height = Math.max(44, (item.durationMinutes / 60) * hourHeight - 4);
        return (
          <ScheduleTimeBlock
            height={height}
            hourGutter={hourGutter}
            item={item}
            nextUp={startsAt === nextMinute}
            key={`${item.kind}-${item.id}`}
            top={top}
          />
        );
      })}
      {items.length === 0 ? (
        <View style={[styles.emptyTimeline, { left: hourGutter + 18 }]}>
          <Ionicons color={colors.text4} name="calendar-clear-outline" size={20} />
          <Text style={styles.emptyTimelineText}>这一天暂无安排</Text>
        </View>
      ) : null}
    </View>
  );
}

function ScheduleTimeBlock({
  height,
  hourGutter,
  item,
  nextUp,
  top
}: {
  height: number;
  hourGutter: number;
  item: ScheduleTimelineItem;
  nextUp: boolean;
  top: number;
}) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const tone = itemTone(item, colors);
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
          backgroundColor: nextUp ? colors.ink : colors.surface2,
          borderLeftColor: tone.borderColor,
          height,
          left: hourGutter + spacing.sm,
          top
        },
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.timeBlockHeader}>
        <Text numberOfLines={1} style={[styles.timeBlockTitle, nextUp && styles.timeBlockTitleNext]}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={[styles.timeBlockTime, nextUp && styles.timeBlockMetaNext]}>
          {item.timeLabel}
        </Text>
      </View>
      {!compact && item.subtitle ? (
        <Text numberOfLines={1} style={[styles.timeBlockMeta, nextUp && styles.timeBlockMetaNext]}>
          {item.subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ScheduleWeekAgenda({ view }: { view: ScheduleCalendarView }) {
  const { styles } = useStyles();
  const orderedDays = [...view.days.filter(day => day.dateKey >= view.selectedDateKey),
    ...view.days.filter(day => day.dateKey < view.selectedDateKey)];
  return (
    <View testID="schedule-week-agenda" style={styles.agendaSection}>
      <View style={styles.weekAgendaList}>
        {orderedDays.map((day) => (
          <View key={day.dateKey} style={styles.weekAgendaDay}>
            {day.dateKey < view.selectedDateKey && day === view.days[0] ? <Text style={styles.earlierDaysLabel}>本周较早日期</Text> : null}
            <View style={styles.weekAgendaDate}>
              <Text
                accessibilityRole="header"
                style={[
                  styles.sectionTitle,
                  day.isSaturday ? styles.saturdayText : null,
                  day.isSunday || day.isHoliday ? styles.holidayText : null,
                  day.isToday ? styles.todayDateText : null
                ]}
              >
                {day.isToday ? "今天 · " : ""}{Number(day.dateKey.slice(5, 7))}月{day.dayNumber}日 {day.weekdayLabel}
              </Text>
              <Text style={styles.sectionCount}>{day.items.length} 项</Text>
            </View>
            {day.holidayName ? <Text style={styles.holidayBadgeText}>{day.holidayName}</Text> : null}
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
  const { colors, styles } = useStyles();
  const dateKeys = monthGridDateKeys(view.selectedDateKey);
  const selectedMonth = view.selectedDateKey.slice(0, 7);

  return (
    <View style={styles.calendarPanel}>
      <View style={styles.monthWeekdays}>
        {weekdayLabels.map((label, index) => (
          <Text
            key={label}
            style={[
              styles.monthWeekday,
              index === 5 ? styles.saturdayText : null,
              index === 6 ? styles.holidayText : null
            ]}
          >
            {label.replace("周", "")}
          </Text>
        ))}
      </View>
      <View testID="schedule-month-days" style={styles.monthDays}>
        {dateKeys.map((dateKey) => {
          if (!dateKey.startsWith(selectedMonth)) return <View key={dateKey} style={styles.monthDay} />;
          const selected = dateKey === view.selectedDateKey;
          const dateItems = view.items.filter((item) => item.dateKey === dateKey);
          const calendarDateInfo = japanCalendarDateInfo(dateKey);
          return (
            <Pressable
              accessibilityLabel={`${Number(dateKey.slice(-2))}日${calendarDateInfo.holidayName ? `，${calendarDateInfo.holidayName}` : ""}，${dateItems.length}项安排`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              aria-selected={selected}
              key={dateKey}
              onPress={() => onSelectDate(dateKey)}
              style={({ pressed }) => [
                styles.monthDay,
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
                  selected ? styles.monthDaySelected : null
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
                        backgroundColor: itemTone(item, colors).color
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
  const { styles } = useStyles();
  return (
    <View style={[styles.agendaSection, styles.monthAgenda]}>
      <View style={styles.sectionHeadingRow}>
        <View style={styles.selectedDateHeading}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
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
  const { colors, styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const router = useRouter();
  const tone = itemTone(item, colors);

  return (
    <Pressable
      accessibilityLabel={`${item.title}，${item.timeLabel || "全天"}`}
      accessibilityRole="button"
      onPress={() => router.push(item.href as Href)}
      style={({ pressed }) => [styles.agendaRow, largeText ? styles.agendaRowLarge : null, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.agendaTime, largeText ? styles.agendaTimeLarge : null]}>
        {item.timeLabel || "全天"}
      </Text>
      <View style={[styles.agendaMarker, { backgroundColor: tone.color }]} />
      <View style={[styles.agendaCopy, largeText ? styles.agendaCopyLarge : null]}>
        <Text numberOfLines={largeText ? undefined : 1} style={styles.agendaTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={largeText ? undefined : 1} style={styles.agendaMeta}>
          {item.subtitle}
        </Text>
      </View>
      {!largeText ? <Ionicons color={colors.text4} name="chevron-forward" size={16} /> : null}
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  agendaCopy: { flex: 1, minWidth: 0 },
  agendaCopyLarge: { flexBasis: "100%" },
  agendaMarker: { width: 2, height: 30, borderRadius: 1 },
  agendaMeta: { ...textStyles.caption, color: colors.text3 },
  agendaRow: {
    alignItems: "center",
    borderBottomColor: colors.hairline,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 62,
    paddingVertical: 12
  },
  agendaSection: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 0
  },
  agendaRowLarge: { flexWrap: "wrap" },
  agendaTime: { color: colors.ink, fontSize: 14, fontWeight: "800", width: 46 },
  agendaTimeLarge: { flexShrink: 0, width: "auto" },
  agendaTitle: {
    color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "700"
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 0
  },
  commandRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
    gap: 10
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
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 3
  },
  currentTimeLabel: { color: colors.accent, backgroundColor: colors.surface, fontSize: 11, fontWeight: "800", marginTop: -8, marginBottom: -8 },
  dayButton: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingVertical: 6,
    gap: 4,
    minHeight: 56
  },
  dayButtonSelected: { borderBottomColor: colors.accent },
  dayDot: { borderRadius: radius.pill, height: 4, width: 4 },
  dayDots: { flexDirection: "row", gap: 2, height: 5, justifyContent: "center" },
  dayNumber: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22
  },
  dayStrip: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  dayTextSelected: { color: colors.accent },
  dayView: {
    borderColor: colors.border,
    paddingTop: 2,
    backgroundColor: colors.surface,
    paddingHorizontal: 0
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
    height: 44,
    justifyContent: "center",
    width: 44,
    borderRadius: radius.control
  },
  legendDot: { borderRadius: radius.pill, height: 6, width: 6 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  legendRow: { flexDirection: "row", flexWrap: "wrap", flexShrink: 1, gap: 12, paddingTop: 8 },
  legendText: { color: colors.text3, fontSize: 11, fontWeight: "600" },
  monthDay: {
    alignItems: "center",
    flexBasis: "14.285%",
    justifyContent: "center",
    minHeight: layout.control,
    paddingVertical: spacing.xs
  },
  monthDayDot: { borderRadius: radius.pill, height: 4, width: 4 },
  monthDayDots: { flexDirection: "row", gap: 2, height: 4 },
  monthDaySelected: { backgroundColor: colors.accent, borderRadius: 16, color: colors.onAccent },
  monthDayText: { color: colors.ink, fontSize: 15, fontWeight: "600", minWidth: 32, minHeight: 32, textAlign: "center", lineHeight: 22, paddingVertical: 5 },
  monthDays: { flexDirection: "row", flexWrap: "wrap", rowGap: 4 },
  monthAgenda: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 14 },
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
    gap: spacing.sm,
    flexWrap: "wrap"
  },
  sectionCount: { color: colors.accent, fontSize: 12, fontWeight: "700", flexShrink: 0 },
  sectionHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 0,
    gap: 8
  },
  sectionTitle: { ...textStyles.section, color: colors.ink, flexShrink: 1 },
  timeBlock: {
    borderLeftWidth: 2,
    borderRadius: 7,
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
    marginLeft: 0
  },
  timeBlockTime: { color: colors.text3, fontSize: 12, fontWeight: "500" },
  timeBlockTitleNext: { color: colors.canvas },
  timeBlockMetaNext: { color: colors.canvas, opacity: 0.8 },
  timeBlockTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "800"
  },
  timeGrid: { position: "relative" },
  todayButton: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" },
  todayButtonText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  todayDateText: { color: colors.accent },
  viewSwitchButton: {
    minHeight: 44, justifyContent: "center", alignItems: "center",
    borderRadius: 7, paddingHorizontal: 4, paddingVertical: 6, flex: 1
  },
  viewSwitchButtonSelected: { backgroundColor: colors.ink },
  viewSwitchText: { color: colors.text3, fontSize: 13, fontWeight: "700" },
  viewSwitchTextSelected: { color: colors.canvas },
  viewSwitcher: {
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: "row",
    padding: 3,
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10
  },
  weekAgendaDate: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 8 },
  weekAgendaDay: { gap: 4 },
  weekAgendaEmpty: { color: colors.text3, fontSize: 12, paddingVertical: 12 },
  weekAgendaItems: {},
  weekAgendaList: { gap: 18 },
  earlierDaysLabel: { color: colors.text3, fontSize: 12, paddingBottom: 8 },
  weekHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  weekHeadingCopy: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 10, rowGap: 4, flex: 1, minWidth: 0 },
  weekHeaderLarge: { flexWrap: "wrap" },
  weekHeadingCopyLarge: { flexDirection: "column", alignItems: "flex-start", flexBasis: "100%", flexShrink: 0 },
  dateArrows: { flexDirection: "row", flexShrink: 0, marginLeft: "auto" },
  dateTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: "900", letterSpacing: -0.6 },
  dayDateTitle: { fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  dateSubtitle: { color: colors.text3, fontSize: 13, lineHeight: 19 },
  workspace: { gap: 14 }
}));
