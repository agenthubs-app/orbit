// contact-reach R42 ④⑦ / R43 ⑧ 候補の時間を選ぶ (App). The same picker as Web's insert mode: one week of 30-minute cells
// (R40 availabilityGrid at 30 minutes: off / past cells are dashed, busy is shaded and struck, unknown can be painted),
// ‹ › moves a week up to today + 14 days. The shared paint rules (meeting-slots paintTap / paintRect): a tap paints one
// meeting length, a tap on paint erases its range, press-and-drag paints (or, started on paint, erases) a rectangle that
// may span days. The grid owns the touch from the first press (PanResponder; the sheet stops scrolling meanwhile).
// Painted ranges are cut into ≤ 5 candidates for a proposal (sliceMeetingCandidates); an e-mail draft (minimum 1) gets
// the ranges themselves. On open the next 3 confirmed-free slots are painted (seedMeetingSlots); 「挿入」 hands the
// selection back without any write.
import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent, type PanResponderGestureState } from "react-native";

import type { MeetingDetailsMedium } from "../../api/contract/appointments";
import type { SchedulingAvailabilitySettings } from "../../api/contract/scheduling-availability";
import {
  addLocalDays, availabilityGrid, cellsInRanges, isCellPaintable, localDateOf, localWeekday, paintRect, paintTap, paintedRanges, seedMeetingSlots, sliceMeetingCandidates,
  type MeetingSlot, type MeetingSlotGridDay,
} from "../../api/compute/meeting-slots";
import { ActionSheet, BottomSheet, Button, IconButton, Skeleton, TextField, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { dayLabel, rulesSummary, slotLabel, wallClock, weekdayLabel } from "./meeting-slot-text";
import { SCHEDULING_SETTINGS_HREF, effectiveTimeZone, loadMeetingBusy, schedulingRulesFor, type MeetingBusyRead } from "./scheduling-availability-client";

export type MeetingFormat = MeetingDetailsMedium["kind"];
export interface MeetingSlotSelection {
  /** The candidates sent with a proposal (≤ 5, in time order). */
  slots: MeetingSlot[];
  /** R43: the painted ranges (time order, short ones included so a reopen draws them again). Older kept drafts have none. */
  ranges?: MeetingSlot[];
  durationMinutes: number;
  format: MeetingFormat;
  /** What was typed under 会議リンク / 場所 / 電話 (may be empty). */
  place: string;
  medium: MeetingDetailsMedium;
  /** The zone the slots were picked in (the proposal's timezone). */
  timeZone: string;
}

export interface MeetingSlotPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onInsert: (selection: MeetingSlotSelection) => void;
  /** 3 for an Orbit proposal (the server takes 3–5); 1 for an e-mail draft, which gets the ranges as text. */
  minimum?: 1 | 3;
  /** In person needs a place for an Orbit proposal (the appointment requires it). */
  requirePlace?: boolean;
  initial?: MeetingSlotSelection | null;
  /** Injected for tests. */
  now?: () => number;
}

const MAX = 5;
const DURATIONS = [30, 60, 90] as const;
const FORMATS: readonly MeetingFormat[] = ["video", "in_person", "phone"];
const HORIZON_DAYS = 14;
const CELL_MINUTES = 30;
const MINUTE = 60_000;
/** Row height and gap (pt): 18 rows of 09:00–18:00 fit on one screen (design ⑧). */
const ROW = 20;
const GAP = 3;
const TIME_COLUMN = 38;

/** The medium sent with a proposal (video links must be https; a Meet link is marked google_meet). null = invalid link. */
export function mediumOf(format: MeetingFormat, place: string): MeetingDetailsMedium | null {
  const value = place.trim();
  if (format === "in_person") return { kind: "in_person", location: value };
  if (format === "phone") return { kind: "phone", phoneHint: value || null };
  if (!value) return { kind: "video", provider: "other", joinUrl: null };
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return { kind: "video", provider: url.hostname === "meet.google.com" ? "google_meet" : "other", joinUrl: url.href };
  } catch { return null; }
}

/** Monday of the week that holds `date`. */
function weekStart(date: string): string {
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const weekday = localWeekday(date);
  return addLocalDays(date, -(weekday ? order.indexOf(weekday) : 0)) ?? date;
}

const spanOf = (slot: MeetingSlot) => Date.parse(slot.endsAt) - Date.parse(slot.startsAt);

export function MeetingSlotPickerSheet(props: MeetingSlotPickerSheetProps) {
  if (!props.open) return null;
  return <PickerSession {...props} />;
}

type Drag = { anchor: [number, number]; current: [number, number]; erase: boolean; moved: boolean };

function PickerSession({ onClose, onInsert, minimum = 3, requirePlace = false, initial = null, now: clock = Date.now }: MeetingSlotPickerSheetProps) {
  const { t, language } = useOrbitLocale();
  const { styles } = useStyles();
  const router = useRouter();
  const client = useOrbitApiClient();
  const email = minimum === 1;
  const [rules, setRules] = useState<SchedulingAvailabilitySettings | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  // undefined: still reading; null: could not be read (every allowed cell is then unknown).
  const [busy, setBusy] = useState<MeetingBusyRead | null | undefined>(undefined);
  // The ranges to paint once the grid is known: the reopened selection, else the preselected slots.
  const [start, setStart] = useState<MeetingSlot[] | null>(() => initial ? (initial.ranges ?? initial.slots).map((slot) => ({ ...slot })) : null);
  const [painted, setPainted] = useState<Set<string> | null>(null);
  const [duration, setDuration] = useState<number>(initial?.durationMinutes ?? 60);
  const [format, setFormat] = useState<MeetingFormat>(initial?.format ?? "video");
  const [place, setPlace] = useState(initial?.place ?? "");
  const [week, setWeek] = useState(0);
  const [seeded, setSeeded] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  // Duration and format sit in one compact row (two pills → ActionSheet) so the week fits on one screen (R43 ⑧).
  const [menu, setMenu] = useState<"duration" | "format" | null>(null);
  const started = useRef(clock());

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const settings = await schedulingRulesFor(client, controller.signal);
      if (controller.signal.aborted) return;
      const resolved = initial?.timeZone ?? effectiveTimeZone(settings);
      setRules(settings); setZone(resolved);
      if (!initial) setDuration(settings.durationMinutes);
      const read = await loadMeetingBusy(client, resolved, clock(), language, controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      setBusy(read);
      if (!initial) {
        const seed = read ? seedMeetingSlots(settings, { timeZone: resolved, now: clock(), availability: read, durationMinutes: settings.durationMinutes }) : [];
        setStart(seed); setSeeded(seed.length > 0);
      }
    })();
    return () => controller.abort();
    // One read per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = zone ? localDateOf(started.current, zone) : null;
  const firstMonday = today ? weekStart(today) : null;
  const lastDay = today ? addLocalDays(today, HORIZON_DAYS) : null;
  // Every day that can be shown (this week's Monday up to today + 14), one grid of 30-minute cells.
  const allDays = useMemo(() => {
    if (!firstMonday || !rules || !lastDay) return [];
    const weekdays = new Set(rules.weekdays);
    const days: string[] = [];
    for (let date: string | null = firstMonday; date && date <= lastDay; date = addLocalDays(date, 1)) if (weekdays.has(localWeekday(date)!)) days.push(date);
    return days;
  }, [firstMonday, rules, lastDay]);
  const grid = useMemo(() => rules && zone && busy !== undefined ? availabilityGrid(rules, { timeZone: zone, now: clock(), days: allDays, availability: busy, durationMinutes: CELL_MINUTES }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, zone, allDays, busy]);
  useEffect(() => {
    if (grid && start && !painted) setPainted(cellsInRanges(grid.days, start));
  }, [grid, start, painted]);

  const shownMonday = firstMonday ? addLocalDays(firstMonday, week * 7) : null;
  const weekEnd = shownMonday ? addLocalDays(shownMonday, 6) : null;
  const weekDays = useMemo<MeetingSlotGridDay[]>(() => grid && shownMonday && weekEnd ? grid.days.filter((day) => day.date >= shownMonday && day.date <= weekEnd) : [], [grid, shownMonday, weekEnd]);
  const cellsPerMeeting = Math.max(1, Math.round(duration / CELL_MINUTES));
  const rows = grid?.rows ?? [];

  const current = useMemo(() => painted ?? new Set<string>(), [painted]);
  const ranges = useMemo(() => grid ? paintedRanges(grid.days, current) : [], [grid, current]);
  const slices = useMemo(() => sliceMeetingCandidates(ranges, duration, MAX), [ranges, duration]);
  const longRanges = ranges.filter((range) => spanOf(range) >= duration * MINUTE);
  const shortCount = ranges.length - longRanges.length;
  const marks = useMemo(() => {
    const number = new Map<string, number>();
    if (!email) [...slices.sent, ...slices.extra].forEach((slot, index) => number.set(slot.startsAt, index + 1));
    return {
      number,
      extra: grid && !email ? cellsInRanges(grid.days, slices.extra) : new Set<string>(),
      short: grid ? cellsInRanges(grid.days, slices.short) : new Set<string>(),
      starts: new Set(ranges.map((range) => range.startsAt)),
      ends: new Set(ranges.map((range) => range.endsAt)),
    };
  }, [grid, slices, ranges, email]);
  const preview = useMemo(() => {
    if (!drag) return null;
    const cells = drag.moved ? paintRect(weekDays, drag.anchor, drag.current) : [weekDays[drag.anchor[0]]?.cells[drag.anchor[1]]?.startsAt ?? ""];
    return { cells: new Set(cells), erase: drag.erase };
  }, [drag, weekDays]);

  const medium = mediumOf(format, place);
  const placeMissing = format === "in_person" && requirePlace && !place.trim();
  const linkInvalid = format === "video" && medium === null;
  const count = email ? longRanges.length : slices.sent.length;
  const countOk = count >= minimum;
  const canInsert = Boolean(grid && painted && zone && countOk && medium && !placeMissing);
  const insert = () => { if (canInsert && zone && medium) onInsert({ slots: slices.sent, ranges, durationMinutes: duration, format, place: place.trim(), medium, timeZone: zone }); };

  // ---- the paint gesture: the grid is the touch target (its cells do not take touches), positions map to cells ----
  const latest = useRef({ weekDays, current, cellsPerMeeting, gridWidth, drag });
  latest.current = { weekDays, current, cellsPerMeeting, gridWidth, drag };
  const origin = useRef<{ x: number; y: number } | null>(null);
  // The live gesture, written synchronously: a quick tap releases before React re-renders, so release must not read state.
  const gestureRef = useRef<Drag | null>(null);
  const track = (next: Drag | null) => { gestureRef.current = next; setDrag(next); };
  const cellAt = (x: number, y: number): [number, number] | null => {
    const { weekDays: days, gridWidth: width } = latest.current;
    const rowCount = days[0]?.cells.length ?? 0;
    if (!days.length || !rowCount || width <= 0) return null;
    const column = Math.floor(x / ((width + GAP) / days.length)), row = Math.floor(y / (ROW + GAP));
    return [Math.min(days.length - 1, Math.max(0, column)), Math.min(rowCount - 1, Math.max(0, row))];
  };
  const commit = (next: Set<string>) => { setSeeded(false); setPainted(next); };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (event: GestureResponderEvent) => {
      const x = event.nativeEvent.locationX, y = event.nativeEvent.locationY;
      const at = cellAt(x, y);
      const cell = at ? latest.current.weekDays[at[0]]?.cells[at[1]] : undefined;
      if (!at || !cell || !isCellPaintable(cell)) { origin.current = null; track(null); return; }
      origin.current = { x, y };
      track({ anchor: at, current: at, erase: latest.current.current.has(cell.startsAt!), moved: false });
    },
    onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      const from = origin.current, active = gestureRef.current;
      if (!from || !active) return;
      const at = cellAt(from.x + gesture.dx, from.y + gesture.dy);
      if (!at || (at[0] === active.current[0] && at[1] === active.current[1])) return;
      track({ ...active, current: at, moved: true });
    },
    onPanResponderRelease: () => {
      const { weekDays: days, current: on, cellsPerMeeting: length } = latest.current;
      const active = gestureRef.current;
      origin.current = null;
      track(null);
      if (!active) return;
      if (!active.moved) { commit(paintTap(days, on, active.anchor[0], active.anchor[1], length)); return; }
      const next = new Set(on);
      for (const key of paintRect(days, active.anchor, active.current)) { if (active.erase) next.delete(key); else next.add(key); }
      commit(next);
    },
    onPanResponderTerminate: () => { origin.current = null; track(null); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const tapCell = (day: number, row: number) => commit(paintTap(weekDays, current, day, row, cellsPerMeeting));

  const reading = !grid || !painted;
  // What the calendar read allows, and (separately) what is still missing before 挿入.
  const hint = reading ? "" : !busy ? t("calendar.pick.loadFailed") : !busy.complete ? t("calendar.pick.hintUnverified") : busy.orbitOnly ? t("calendar.pick.hintOrbitOnly") : seeded ? t("calendar.pick.hintSeeded") : "";
  const summary = rules ? rulesSummary(rules, t) : null;
  const placeLabel = format === "in_person" ? (requirePlace ? t("calendar.pick.place") : t("calendar.pick.optional", { label: t("calendar.pick.place") }))
    : t("calendar.pick.optional", { label: t(format === "video" ? "calendar.pick.videoUrl" : "calendar.pick.phoneHint") });
  const stateLabel = { allowed: t("calendar.pick.open"), busy: t("calendar.pick.busy"), off: t("calendar.pick.off"), unknown: t("calendar.pick.unknown") } as const;
  const formatLabel = (value: MeetingFormat) => t(value === "video" ? "calendar.slot.video" : value === "in_person" ? "calendar.slot.inPerson" : "calendar.slot.phone");
  const anyUnknown = weekDays.some((day) => day.cells.some((cell) => cell.state === "unknown"));
  const candidateLabel = (slot: MeetingSlot) => {
    const at = zone ? wallClock(slot.startsAt, zone) : null;
    const weekday = at ? localWeekday(at.date) : null;
    return at && weekday ? `${weekdayLabel(weekday, t)} ${at.time}` : "";
  };

  return (
    <BottomSheet visible onClose={onClose} accessibilityLabel={t("calendar.pick.title")} scrollEnabled={!drag}>
      <View style={styles.body} testID="slot-picker">
        <View style={styles.titleRow}>
          {/* 2026-11-21 手机扫描：375 宽时右侧按钮把标题挤断成「…最 / 大５件」。按「 · 」拆成标题 + 小字上限，按钮不缩。 */}
          <View style={styles.titleCol}>
            <UiText accessibilityRole="header" style={styles.title} numberOfLines={1}>{t("calendar.pick.title").split(" · ")[0]}</UiText>
            {t("calendar.pick.title").includes(" · ") ? <UiText style={styles.titleCap}>{t("calendar.pick.title").split(" · ").slice(1).join(" · ")}</UiText> : null}
          </View>
          <Button size="sm" variant="primary" label={email ? t("calendar.pick.insertRanges", { count }) : t("calendar.pick.insert", { count })} disabled={!canInsert} onPress={insert} />
        </View>
        {summary ? (
          <UiPressable accessibilityRole="link" accessibilityLabel={`${t("calendar.pick.rules", summary)} ${t("calendar.pick.rulesEdit")}`} style={styles.rules} testID="slot-rules"
            onPress={() => { onClose(); router.push(SCHEDULING_SETTINGS_HREF as Href); }}>
            <UiText style={styles.rulesText}>{t("calendar.pick.rules", summary)}<UiText style={styles.rulesEdit}>{`  ${t("calendar.pick.rulesEdit")}`}</UiText></UiText>
          </UiPressable>
        ) : null}
        <View style={styles.pills}>
          <UiPressable accessibilityRole="button" accessibilityLabel={`${t("calendar.pick.duration")} ${t("calendar.pick.minutes", { minutes: duration })}`} onPress={() => setMenu("duration")} style={styles.pill} testID="slot-duration">
            <UiText style={styles.pillText}>{t("calendar.pick.minutes", { minutes: duration })}</UiText><UiText style={styles.caret}>▾</UiText>
          </UiPressable>
          <UiPressable accessibilityRole="button" accessibilityLabel={`${t("calendar.pick.format")} ${formatLabel(format)}`} onPress={() => setMenu("format")} style={styles.pill} testID="slot-format">
            <UiText style={styles.pillText}>{formatLabel(format)}</UiText><UiText style={styles.caret}>▾</UiText>
          </UiPressable>
        </View>
        {hint ? <UiText style={styles.hint} testID="slot-hint">{hint}</UiText> : null}
        {reading ? <Skeleton lines={5} /> : (
          <View style={styles.week}>
            <View style={styles.weekBar}>
              <IconButton icon="left" size={34} soft accessibilityLabel={t("calendar.pick.prevWeek")} disabled={week === 0} onPress={() => setWeek((value) => value - 1)} />
              <UiText style={styles.weekLabel} testID="slot-week">{shownMonday && weekEnd ? `${dayLabel(shownMonday, t)} – ${dayLabel(weekEnd, t)}` : ""}</UiText>
              <IconButton icon="right" size={34} soft accessibilityLabel={t("calendar.pick.nextWeek")} disabled={!weekEnd || !lastDay || weekEnd >= lastDay} onPress={() => setWeek((value) => value + 1)} />
            </View>
            <View style={styles.headRow}>
              <View style={styles.timeColumn} />
              {weekDays.map((day) => {
                const weekday = localWeekday(day.date);
                return (
                  <View key={day.date} style={styles.dayHead}>
                    <UiText style={styles.dayHeadDay}>{weekday ? weekdayLabel(weekday, t) : ""}</UiText>
                    <UiText style={[styles.dayHeadDate, day.date === today && styles.today]}>{`${Number(day.date.slice(5, 7))}/${Number(day.date.slice(8, 10))}${day.date === today ? ` ${t("calendar.pick.today")}` : ""}`}</UiText>
                  </View>
                );
              })}
            </View>
            <View style={styles.gridRow}>
              <View style={styles.timeColumn} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {rows.map((time, row) => <UiText key={time} style={[styles.time, row % 2 === 1 && styles.timeHidden]}>{time}</UiText>)}
              </View>
              <View style={styles.grid} pointerEvents="box-only" testID="slot-grid" onLayout={(event: LayoutChangeEvent) => setGridWidth(event.nativeEvent.layout.width)} {...responder.panHandlers}>
                {weekDays.map((day, dayIndex) => (
                  <View key={day.date} style={styles.column} testID={`slot-day-${day.date}`}>
                    {day.cells.map((cell, row) => {
                      const key = cell.startsAt ?? "";
                      const paintable = isCellPaintable(cell);
                      const on = paintable && current.has(key);
                      const top = on && marks.starts.has(key), bottom = on && Boolean(cell.endsAt && marks.ends.has(cell.endsAt));
                      const extra = on && marks.extra.has(key), short = on && marks.short.has(key);
                      const n = on ? marks.number.get(key) : undefined;
                      const previewing = Boolean(preview && key && preview.cells.has(key));
                      return (
                        <View key={`${day.date}:${cell.time}`} testID={key ? `slot-cell-${key}` : undefined} accessible accessibilityRole="button"
                          accessibilityLabel={`${dayLabel(day.date, t)} ${cell.time} · ${on ? t("calendar.pick.picked") : stateLabel[cell.state]}`}
                          accessibilityState={{ selected: on, disabled: !paintable }} aria-selected={on} aria-disabled={!paintable} accessibilityActions={paintable ? [{ name: "activate" }] : []}
                          onAccessibilityAction={() => { if (paintable) tapCell(dayIndex, row); }}
                          {...(Platform.OS === "web" ? { dataSet: { slotState: cell.state, ...(on ? { slotOn: "" } : {}), ...(n !== undefined ? { slotN: String(n) } : {}), ...(extra ? { slotExtra: "" } : {}), ...(short ? { slotShort: "" } : {}) } } : {})}
                          style={[styles.cell, row % 2 === 0 && paintable && !on && styles.cellHour, cell.state === "busy" && styles.cellBusy, cell.state === "unknown" && styles.cellUnknown, cell.state === "off" && styles.cellOff,
                            on && styles.cellOn, on && !bottom && styles.cellJoin, top && styles.cellTop, bottom && styles.cellBottom, extra && styles.cellExtra, short && styles.cellShort,
                            previewing && (preview!.erase ? styles.cellPreviewErase : styles.cellPreview)]}>
                          {cell.state === "busy" ? <View style={styles.strike} /> : null}
                          {n !== undefined && !top ? <View style={styles.cut} /> : null}
                          {n !== undefined ? <UiText style={[styles.n, (extra || short) && styles.nLight]}>{String(n)}</UiText> : null}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.swatch, styles.swOpen]} /><UiText style={styles.legendText}>{t("calendar.pick.open")}</UiText></View>
              <View style={styles.legendItem}><View style={[styles.swatch, styles.cellBusy]}><View style={styles.strike} /></View><UiText style={styles.legendText}>{t("calendar.pick.busy")}</UiText></View>
              <View style={styles.legendItem}><View style={[styles.swatch, styles.cellOff]} /><UiText style={styles.legendText}>{t("calendar.pick.off")}</UiText></View>
              {anyUnknown ? <View style={styles.legendItem}><View style={[styles.swatch, styles.cellUnknown]} /><UiText style={styles.legendText}>{t("calendar.pick.unknown")}</UiText></View> : null}
              <View style={styles.legendItem}><View style={[styles.swatch, styles.cellOn]} /><UiText style={styles.legendText}>{t("calendar.pick.picked")}</UiText></View>
              {email ? null : <View style={styles.legendItem}><View style={[styles.swatch, styles.cellExtra]} /><UiText style={styles.legendText}>{t("calendar.pick.legendExtra", { max: MAX })}</UiText></View>}
            </View>
            <View style={styles.out} testID="slot-summary" accessibilityLiveRegion="polite">
              {email ? (
                <>
                  <UiText style={styles.outHead}>{t("calendar.pick.summaryEmail")}</UiText>
                  {longRanges.map((range) => <UiText key={range.startsAt} style={styles.outText}>{zone ? slotLabel(range, zone, t) : ""}</UiText>)}
                </>
              ) : (
                <UiText style={styles.outText}>
                  <UiText style={styles.outHead}>{t("calendar.pick.summary", { count, minutes: duration })}</UiText>
                  {slices.sent.map((slot, index) => `　${index + 1} ${candidateLabel(slot)}`).join("")}
                </UiText>
              )}
              {!email && count < minimum ? <UiText style={styles.warn} testID="slot-count-hint">{t("calendar.pick.needThree", { count: minimum })}</UiText> : null}
              {!email && slices.extra.length ? <UiText style={styles.warn} testID="slot-over">{t("calendar.pick.overMax", { max: MAX, count: slices.extra.length })}</UiText> : null}
              {shortCount ? <UiText style={styles.muted} testID="slot-short">{t("calendar.pick.short", { minutes: duration })}</UiText> : null}
            </View>
          </View>
        )}
        <TextField label={placeLabel} value={place} onChangeText={setPlace} maxLength={format === "in_person" ? 500 : format === "video" ? 2048 : 128}
          autoCapitalize="none" {...(format === "video" ? { placeholder: "https://", keyboardType: "url" as const } : format === "phone" ? { keyboardType: "phone-pad" as const } : {})}
          {...(linkInvalid ? { error: t("calendar.pick.linkInvalid") } : {})} />
        {placeMissing ? <UiText style={styles.hint}>{t("calendar.pick.placeRequired")}</UiText> : null}
      </View>
      <ActionSheet visible={menu === "duration"} title={t("calendar.pick.duration")} onClose={() => setMenu(null)} defaultFocusKey={String(duration)}
        options={[...new Set<number>([...DURATIONS, duration])].map((value) => ({ key: String(value), label: t("calendar.pick.minutes", { minutes: value }) }))}
        onSelect={(key) => { setMenu(null); setDuration(Number(key)); setSeeded(false); }} />
      <ActionSheet visible={menu === "format"} title={t("calendar.pick.format")} onClose={() => setMenu(null)} defaultFocusKey={format}
        options={FORMATS.map((key) => ({ key, label: formatLabel(key) }))}
        onSelect={(key) => { setMenu(null); setFormat(key as MeetingFormat); setPlace(""); }} />
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  body: { gap: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  titleCol: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  titleCap: { color: colors.ink3Text, fontSize: 12, marginTop: 1 },
  hint: { color: colors.ink3Text, fontSize: 13 },
  rules: { backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  rulesText: { color: colors.ink2, fontSize: 13, lineHeight: 19 },
  rulesEdit: { color: colors.ink, fontWeight: "700" },
  field: { gap: 6 },
  pills: { flexDirection: "row", gap: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2 },
  pillText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  caret: { color: colors.ink3Text, fontSize: 11 },
  label: { color: colors.ink3Text, fontSize: 13, fontWeight: "500" },
  week: { gap: 8 },
  weekBar: { flexDirection: "row", alignItems: "center", gap: 8 },
  weekLabel: { flex: 1, textAlign: "center", color: colors.ink, fontSize: 13, fontWeight: "800" },
  headRow: { flexDirection: "row", gap: GAP },
  dayHead: { flex: 1, alignItems: "center", paddingBottom: 4 },
  dayHeadDay: { color: colors.ink2, fontSize: 11, fontWeight: "700" },
  dayHeadDate: { color: colors.ink3Text, fontSize: 10, fontWeight: "600" },
  today: { color: colors.accentText },
  gridRow: { flexDirection: "row", gap: GAP },
  timeColumn: { width: TIME_COLUMN - GAP },
  time: { height: ROW + GAP, color: colors.ink3Text, fontSize: 10, textAlign: "right", paddingRight: 4, transform: [{ translateY: -6 }] },
  timeHidden: { opacity: 0 },
  grid: { flex: 1, flexDirection: "row", gap: GAP },
  column: { flex: 1 },
  cell: { height: ROW, marginBottom: GAP, borderRadius: 4, backgroundColor: colors.surface2, overflow: "visible" },
  cellHour: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.surface3 },
  cellBusy: { backgroundColor: colors.surface3, justifyContent: "center" },
  cellUnknown: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surface3 },
  cellOff: { backgroundColor: "transparent", borderWidth: 1, borderStyle: "dashed", borderColor: colors.ink4, opacity: 0.6 },
  // A painted range is one block: square joins (the gap below is filled), rounded at its first and last cell.
  cellOn: { backgroundColor: colors.ink, borderRadius: 0, borderWidth: 0 },
  cellJoin: { height: ROW + GAP, marginBottom: 0 },
  cellTop: { borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  cellBottom: { borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  cellExtra: { backgroundColor: colors.ink4 },
  cellShort: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.ink },
  cellPreview: { backgroundColor: colors.ink2, borderWidth: 0 },
  cellPreviewErase: { backgroundColor: colors.surface3, borderWidth: 0 },
  strike: { height: 1, marginHorizontal: 3, backgroundColor: colors.ink4 },
  cut: { position: "absolute", left: 4, right: 4, top: -2, height: 1, backgroundColor: colors.bg },
  n: { position: "absolute", left: 3, top: 2, color: colors.bg, fontSize: 9, fontWeight: "800", lineHeight: 10 },
  nLight: { color: colors.ink2 },
  // 2026-11-21 手机扫描：图例和下面「本文に書く時間帯」之间没有间距，贴在一起。
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendText: { color: colors.ink3Text, fontSize: 11 },
  swatch: { width: 14, height: 10, borderRadius: 3 },
  swOpen: { backgroundColor: colors.surface2 },
  out: { gap: 2 },
  outHead: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  outText: { color: colors.ink3Text, fontSize: 12, lineHeight: 18 },
  warn: { color: colors.coralText, fontSize: 12 },
  muted: { color: colors.ink3Text, fontSize: 12 },
}));
