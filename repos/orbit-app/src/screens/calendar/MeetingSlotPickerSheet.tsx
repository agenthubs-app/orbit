// contact-reach R42 ④⑦ 候補の時間を選ぶ (App). The same picker as Web R41's insert mode, drawn as a list by day for the
// phone: the cells follow the person's 可約時間 (R40 availabilityGrid — "off" cells are left out, busy ones are shown but
// cannot be picked, unknown ones can be picked); on open the next 3 confirmed-free slots are preselected (seedMeetingSlots,
// none when the calendars were not read completely); 「N 件を挿入」 hands the selection back without any write.
import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { MeetingDetailsMedium } from "../../api/contract/appointments";
import type { SchedulingAvailabilitySettings } from "../../api/contract/scheduling-availability";
import { addLocalDays, availabilityGrid, isSlotAllowed, localDateOf, localWeekday, seedMeetingSlots, type MeetingSlot, type MeetingSlotCell } from "../../api/compute/meeting-slots";
import { BottomSheet, Button, Segmented, Skeleton, TextField, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { dayLabel, rulesSummary, slotLabel } from "./meeting-slot-text";
import { SCHEDULING_SETTINGS_HREF, effectiveTimeZone, loadMeetingBusy, schedulingRulesFor, type MeetingBusyRead } from "./scheduling-availability-client";

export type MeetingFormat = MeetingDetailsMedium["kind"];
export interface MeetingSlotSelection {
  slots: MeetingSlot[];
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
  /** 3 for an Orbit proposal (the server takes 3–5), 1 for an e-mail draft. */
  minimum?: 1 | 3;
  /** In person needs a place for an Orbit proposal (the appointment requires it). */
  requirePlace?: boolean;
  initial?: MeetingSlotSelection | null;
  /** Injected for tests. */
  now?: () => number;
}

const MAX = 5;
const DURATIONS = [30, 60, 90] as const;
const HORIZON_DAYS = 14;

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

export function MeetingSlotPickerSheet(props: MeetingSlotPickerSheetProps) {
  if (!props.open) return null;
  return <PickerSession {...props} />;
}

function PickerSession({ onClose, onInsert, minimum = 3, requirePlace = false, initial = null, now: clock = Date.now }: MeetingSlotPickerSheetProps) {
  const { t, language } = useOrbitLocale();
  const { styles } = useStyles();
  const router = useRouter();
  const client = useOrbitApiClient();
  const [rules, setRules] = useState<SchedulingAvailabilitySettings | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  // undefined: still reading; null: could not be read (every allowed cell is then unknown).
  const [busy, setBusy] = useState<MeetingBusyRead | null | undefined>(undefined);
  const [slots, setSlots] = useState<MeetingSlot[]>(() => initial?.slots.map((slot) => ({ ...slot })) ?? []);
  const [duration, setDuration] = useState<number>(initial?.durationMinutes ?? 60);
  const [format, setFormat] = useState<MeetingFormat>(initial?.format ?? "video");
  const [place, setPlace] = useState(initial?.place ?? "");
  const [seeded, setSeeded] = useState(false);
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
      if (!initial && read) {
        const seed = seedMeetingSlots(settings, { timeZone: resolved, now: clock(), availability: read, durationMinutes: settings.durationMinutes });
        if (seed.length) { setSlots(seed); setSeeded(true); }
      }
    })();
    return () => controller.abort();
    // One read per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = zone ? localDateOf(started.current, zone) : null;
  const days = useMemo(() => {
    if (!today || !rules) return [];
    const weekdays = new Set(rules.weekdays);
    return Array.from({ length: HORIZON_DAYS + 1 }, (_, offset) => addLocalDays(today, offset)!).filter((date) => weekdays.has(localWeekday(date)!));
  }, [today, rules]);
  const grid = useMemo(() => rules && zone ? availabilityGrid(rules, { timeZone: zone, now: clock(), days, availability: busy ?? null, durationMinutes: duration }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, zone, days, busy, duration]);

  const medium = mediumOf(format, place);
  const placeMissing = format === "in_person" && requirePlace && !place.trim();
  const linkInvalid = format === "video" && medium === null;
  const countOk = slots.length >= minimum && slots.length <= MAX;
  const canInsert = Boolean(rules && zone && countOk && medium && !placeMissing);
  const insert = () => { if (canInsert && zone && medium) onInsert({ slots: [...slots].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)), durationMinutes: duration, format, place: place.trim(), medium, timeZone: zone }); };
  const toggle = (slot: MeetingSlot) => {
    setSeeded(false);
    setSlots((current) => {
      const index = current.findIndex((item) => Date.parse(item.startsAt) === Date.parse(slot.startsAt));
      if (index >= 0) return current.filter((_, position) => position !== index);
      if (current.length >= MAX) return current;
      return [...current, slot].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    });
  };
  const changeDuration = (minutes: number) => {
    setDuration(minutes); setSeeded(false);
    setSlots((current) => current.map((slot) => ({ startsAt: slot.startsAt, endsAt: new Date(Date.parse(slot.startsAt) + minutes * 60_000).toISOString() }))
      .filter((slot) => !rules || !zone || isSlotAllowed(rules, slot, { timeZone: zone, now: clock() })));
  };
  const ordinal = (startsAt: string | null) => startsAt ? slots.findIndex((slot) => Date.parse(slot.startsAt) === Date.parse(startsAt)) : -1;
  const collides = (cell: MeetingSlot) => slots.some((slot) => Date.parse(slot.startsAt) !== Date.parse(cell.startsAt) && Date.parse(slot.startsAt) < Date.parse(cell.endsAt) && Date.parse(slot.endsAt) > Date.parse(cell.startsAt));
  const reading = !grid || busy === undefined;
  // What the calendar read allows, and (separately) what is still missing before 挿入.
  const hint = reading ? "" : busy === null ? t("calendar.pick.loadFailed") : !busy.complete ? t("calendar.pick.hintUnverified") : busy.orbitOnly ? t("calendar.pick.hintOrbitOnly") : seeded ? t("calendar.pick.hintSeeded") : "";
  const countHint = !reading && !countOk && minimum === 3 ? t("calendar.pick.needThree") : "";
  const summary = rules ? rulesSummary(rules, t) : null;
  const placeLabel = format === "in_person" ? (requirePlace ? t("calendar.pick.place") : t("calendar.pick.optional", { label: t("calendar.pick.place") }))
    : t("calendar.pick.optional", { label: t(format === "video" ? "calendar.pick.videoUrl" : "calendar.pick.phoneHint") });
  const stateLabel = { allowed: t("calendar.pick.open"), busy: t("calendar.pick.busy"), off: t("calendar.pick.off"), unknown: t("calendar.pick.unknown") } as const;
  const shownDays = grid ? grid.days.filter((day) => day.cells.some((cell) => cell.state !== "off")) : [];
  const anyUnknown = shownDays.some((day) => day.cells.some((cell) => cell.state === "unknown"));

  const cellView = (date: string, cell: MeetingSlotCell) => {
    if (cell.state === "off" || !cell.startsAt || !cell.endsAt) return null;
    const slot = { startsAt: cell.startsAt, endsAt: cell.endsAt };
    const index = ordinal(cell.startsAt);
    const pickable = cell.state === "allowed" || cell.state === "unknown";
    const disabled = index < 0 && (!pickable || slots.length >= MAX || collides(slot));
    return (
      <UiPressable key={cell.startsAt} accessibilityRole="button" accessibilityState={{ selected: index >= 0, disabled }} aria-selected={index >= 0} disabled={disabled}
        accessibilityLabel={`${dayLabel(date, t)} ${cell.time} · ${index >= 0 ? t("calendar.pick.picked") : stateLabel[cell.state]}`}
        onPress={() => toggle(slot)} testID={`slot-cell-${cell.startsAt}`}
        style={[styles.cell, cell.state === "busy" && styles.cellBusy, cell.state === "unknown" && styles.cellUnknown, index >= 0 && styles.cellPicked, disabled && cell.state !== "busy" && styles.cellDisabled]}>
        <UiText style={[styles.cellText, cell.state === "busy" && styles.cellTextBusy, index >= 0 && styles.cellTextPicked]}>{index >= 0 ? `${index + 1} · ${cell.time}` : cell.time}</UiText>
      </UiPressable>
    );
  };

  return (
    <BottomSheet visible onClose={onClose} accessibilityLabel={t("calendar.pick.title")}>
      <View style={styles.body} testID="slot-picker">
        <View style={styles.titleRow}>
          <UiText accessibilityRole="header" style={styles.title}>{t("calendar.pick.title")}</UiText>
          <Button size="sm" variant="primary" label={t("calendar.pick.insert", { count: slots.length })} disabled={!canInsert} onPress={insert} />
        </View>
        {hint ? <UiText style={styles.hint} testID="slot-hint">{hint}</UiText> : null}
        {countHint ? <UiText style={styles.hint} testID="slot-count-hint">{countHint}</UiText> : null}
        {summary ? (
          <UiPressable accessibilityRole="link" accessibilityLabel={`${t("calendar.pick.rules", summary)} ${t("calendar.pick.rulesEdit")}`} style={styles.rules} testID="slot-rules"
            onPress={() => { onClose(); router.push(SCHEDULING_SETTINGS_HREF as Href); }}>
            <UiText style={styles.rulesText}>{t("calendar.pick.rules", summary)}<UiText style={styles.rulesEdit}>{`  ${t("calendar.pick.rulesEdit")}`}</UiText></UiText>
          </UiPressable>
        ) : null}
        <View style={styles.field}>
          <UiText style={styles.label}>{t("calendar.pick.duration")}</UiText>
          <Segmented accessibilityLabel={t("calendar.pick.duration")} value={String(duration)} onChange={(value) => changeDuration(Number(value))}
            segments={[...new Set<number>([...DURATIONS, duration])].map((value) => ({ key: String(value), label: t("calendar.pick.minutes", { minutes: value }) }))} />
        </View>
        <View style={styles.field}>
          <UiText style={styles.label}>{t("calendar.pick.format")}</UiText>
          <Segmented<MeetingFormat> accessibilityLabel={t("calendar.pick.format")} value={format} onChange={(value) => { setFormat(value); setPlace(""); }}
            segments={[{ key: "video", label: t("calendar.slot.video") }, { key: "in_person", label: t("calendar.slot.inPerson") }, { key: "phone", label: t("calendar.slot.phone") }]} />
        </View>
        <TextField label={placeLabel} value={place} onChangeText={setPlace} maxLength={format === "in_person" ? 500 : format === "video" ? 2048 : 128}
          autoCapitalize="none" {...(format === "video" ? { placeholder: "https://", keyboardType: "url" as const } : format === "phone" ? { keyboardType: "phone-pad" as const } : {})}
          {...(linkInvalid ? { error: t("calendar.pick.linkInvalid") } : {})} />
        {placeMissing ? <UiText style={styles.hint}>{t("calendar.pick.placeRequired")}</UiText> : null}
        {reading ? <Skeleton lines={5} /> : (
          <>
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.cell, styles.swatch]} /><UiText style={styles.legendText}>{t("calendar.pick.open")}</UiText></View>
              <View style={styles.legendItem}><View style={[styles.cellBusy, styles.swatch]} /><UiText style={styles.legendText}>{t("calendar.pick.busy")}</UiText></View>
              {anyUnknown ? <View style={styles.legendItem}><View style={[styles.cellUnknown, styles.swatch]} /><UiText style={styles.legendText}>{t("calendar.pick.unknown")}</UiText></View> : null}
              <View style={styles.legendItem}><View style={[styles.cellPicked, styles.swatch]} /><UiText style={styles.legendText}>{t("calendar.pick.picked")}</UiText></View>
            </View>
            {shownDays.map((day) => (
              <View key={day.date} style={styles.day} testID={`slot-day-${day.date}`}>
                <UiText style={styles.dayHead}>{dayLabel(day.date, t)}</UiText>
                <View style={styles.cells}>{day.cells.map((cell) => cellView(day.date, cell))}</View>
              </View>
            ))}
            {slots.length ? (
              <View style={styles.chosen} accessibilityLabel={t("calendar.pick.picked")}>
                {slots.map((slot, index) => <UiText key={slot.startsAt} style={styles.chosenText}>{`${index + 1}. ${zone ? slotLabel(slot, zone, t) : ""}`}</UiText>)}
              </View>
            ) : null}
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  body: { gap: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: "800" },
  hint: { color: colors.ink3Text, fontSize: 13 },
  rules: { backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  rulesText: { color: colors.ink2, fontSize: 13, lineHeight: 19 },
  rulesEdit: { color: colors.ink, fontWeight: "700" },
  field: { gap: 6 },
  label: { color: colors.ink3Text, fontSize: 13, fontWeight: "500" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendText: { color: colors.ink3Text, fontSize: 12 },
  swatch: { width: 14, height: 10, minWidth: 14, minHeight: 10, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 3 },
  day: { gap: 8 },
  dayHead: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  cells: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cell: { minWidth: 64, minHeight: 36, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  cellBusy: { backgroundColor: colors.surface3, opacity: 0.7 },
  cellUnknown: { backgroundColor: colors.surface, borderWidth: 1, borderStyle: "dashed", borderColor: colors.line },
  cellPicked: { backgroundColor: colors.ink, borderWidth: 0 },
  cellDisabled: { opacity: 0.4 },
  cellText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  cellTextBusy: { color: colors.ink3Text, textDecorationLine: "line-through" },
  cellTextPicked: { color: colors.bg, fontWeight: "800" },
  chosen: { gap: 4, paddingTop: 4 },
  chosenText: { color: colors.ink2, fontSize: 13 },
}));
