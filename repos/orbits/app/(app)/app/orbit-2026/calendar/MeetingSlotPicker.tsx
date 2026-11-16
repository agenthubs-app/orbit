"use client";

// contact-reach R41 ④ 候補の時間を選ぶ — the insert mode of the meeting picker (MeetingProposalModal mode="insert").
// One step: the grid follows the person's 可約時間 (R40 availabilityGrid: off cells cannot be picked, busy is
// striped, unknown can be picked); on open the next 3 confirmed-free slots are preselected (seedMeetingSlots,
// none when the calendars were not read completely); 「挿入」 hands the selection back without any write.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MeetingDetailsMedium } from "../../../../../shared/contract/appointments";
import type { SchedulingAvailabilitySettings } from "../../../../../shared/contract/scheduling-availability";
import { addLocalDays, availabilityGrid, isSlotAllowed, localDateOf, localWeekday, seedMeetingSlots, type MeetingSlot } from "../../../../../shared/compute/meeting-slots";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import { Button, Modal, Segmented, Skeleton, TextField, fillCopy, useScopeLanguage, useStandardCopy } from "../ui";
import { createMeetingAvailabilityClient, type MeetingAvailability } from "./meeting-availability";
import { dayLabel, rulesSummary, slotLabel } from "./meeting-slot-text";
import { SCHEDULING_SETTINGS_HREF, effectiveTimeZone, schedulingRulesFor } from "./scheduling-availability-client";
import styles from "./meeting-slot-picker.module.css";

export type MeetingFormat = MeetingDetailsMedium["kind"];
export interface MeetingSlotSelection {
  slots: MeetingSlot[];
  durationMinutes: number;
  format: MeetingFormat;
  /** What the person typed under 会議リンク / 場所 (may be empty). */
  place: string;
  medium: MeetingDetailsMedium;
  /** The zone the slots were picked in (the proposal's timezone). */
  timeZone: string;
}

export interface MeetingSlotPickerProps {
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

/** The medium sent with a proposal (video links must be https; a Meet link is marked google_meet). */
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

export function MeetingSlotPicker(props: MeetingSlotPickerProps) {
  if (!props.open) return null;
  return <PickerSession {...props} />;
}

function PickerSession({ onClose, onInsert, minimum = 3, requirePlace = false, initial = null, now: clock = Date.now }: MeetingSlotPickerProps) {
  const language = useScopeLanguage();
  const copy = useStandardCopy();
  const t = (key: keyof typeof taskCopy, values?: Record<string, string | number>) => fillCopy(pickCopy(taskCopy[key], language), values ?? {});
  const [rules, setRules] = useState<SchedulingAvailabilitySettings | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  // undefined: still reading; null: could not be read (every allowed cell is then unknown).
  const [availability, setAvailability] = useState<MeetingAvailability | null | undefined>(undefined);
  const [slots, setSlots] = useState<MeetingSlot[]>(() => initial?.slots.map((slot) => ({ ...slot })) ?? []);
  const [duration, setDuration] = useState<number>(initial?.durationMinutes ?? 60);
  const [format, setFormat] = useState<MeetingFormat>(initial?.format ?? "video");
  const [place, setPlace] = useState(initial?.place ?? "");
  const [week, setWeek] = useState(0);
  const [seeded, setSeeded] = useState(false);
  const reader = useMemo(() => createMeetingAvailabilityClient(), []);
  const started = useRef(clock());

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const settings = await schedulingRulesFor(controller.signal);
      if (controller.signal.aborted) return;
      const resolved = initial?.timeZone ?? effectiveTimeZone(settings) ?? "UTC";
      setRules(settings); setZone(resolved);
      if (!initial) setDuration(settings.durationMinutes);
      let read: MeetingAvailability | null = null;
      try { read = await reader.load(resolved, clock(), controller.signal, { firstDay: 0 }); } catch { read = null; }
      // Google Calendar not connected, or not offered on this server ("off"): Orbit's own schedule is the whole picture (design ④ note).
      if (read && !read.complete && read.orbitOnly) read = { ...read, complete: true };
      if (controller.signal.aborted) return;
      setAvailability(read);
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
  const firstMonday = today ? weekStart(today) : null;
  const shownMonday = firstMonday ? addLocalDays(firstMonday, week * 7) : null;
  const lastDay = today ? addLocalDays(today, 14) : null;
  const days = useMemo(() => {
    if (!shownMonday || !rules || !lastDay) return [];
    const weekdays = new Set(rules.weekdays);
    return Array.from({ length: 7 }, (_, offset) => addLocalDays(shownMonday, offset)!).filter((date) => weekdays.has(localWeekday(date)!) && date <= lastDay);
  }, [shownMonday, rules, lastDay]);
  const grid = useMemo(() => rules && zone ? availabilityGrid(rules, { timeZone: zone, now: clock(), days, availability: availability ?? null, durationMinutes: duration }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, zone, days, availability, duration]);

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
  const stateLabel = { allowed: t("proposalFree"), busy: t("proposalBusy"), off: t("pickLegendOff"), unknown: t("proposalUnknown") } as const;
  const hint = availability === undefined ? "" : !availability || !availability.complete ? t("proposalUnverified") : availability.orbitOnly ? t("pickHintOrbitOnly") : seeded ? t("pickHintSeeded") : "";
  const summary = rules ? rulesSummary(rules, language) : null;
  const placeLabel = format === "in_person" ? (requirePlace ? t("proposalPlace") : t("pickOptional", { label: t("proposalPlace") })) : t("pickOptional", { label: t(format === "video" ? "proposalVideoUrl" : "proposalPhoneHint") });
  const weekEnd = shownMonday ? addLocalDays(shownMonday, 6) : null;

  return (
    <Modal open form onClose={onClose} title={t("pickTitle")} size={1000}>
      {!grid || availability === undefined ? <Skeleton lines={5} /> : <div className={styles.pick} data-slot-picker="">
        <div>
          <div className={styles.weekBar}>
            <Button icon="left" size="sm" label={t("calendarPrevious")} disabled={week === 0} onClick={() => setWeek((value) => value - 1)} />
            <b>{shownMonday && weekEnd ? t("pickWeekRange", { from: dayLabel(shownMonday, language), to: dayLabel(weekEnd, language) }) : ""}</b>
            <Button icon="right" size="sm" label={t("calendarNext")} disabled={!weekEnd || !lastDay || weekEnd >= lastDay} onClick={() => setWeek((value) => value + 1)} />
          </div>
          <div className={styles.grid} style={{ gridTemplateColumns: `40px repeat(${Math.max(grid.days.length, 1)}, minmax(0, 1fr))` }} role="grid">
            <span />
            {grid.days.map((day) => <b key={day.date} className={styles.dayHead}>{dayLabel(day.date, language)}</b>)}
            {grid.rows.map((time, row) => [
              <time key={`t:${time}`} className={styles.hour}>{time}</time>,
              ...grid.days.map((day) => {
                const cell = day.cells[row]!;
                const slot = cell.startsAt && cell.endsAt ? { startsAt: cell.startsAt, endsAt: cell.endsAt } : null;
                const index = ordinal(cell.startsAt);
                const pickable = Boolean(slot) && (cell.state === "allowed" || cell.state === "unknown");
                const disabled = index < 0 && (!pickable || slots.length >= MAX || (slot ? collides(slot) : true));
                return <button key={`${day.date}:${time}`} type="button" disabled={disabled} aria-pressed={index >= 0}
                  aria-label={`${dayLabel(day.date, language)} ${time} · ${stateLabel[cell.state]}`} data-slot-state={cell.state} data-slot={cell.startsAt ?? ""}
                  className={`btn ${styles.cell} ${styles[cell.state === "allowed" ? "open" : cell.state] ?? ""} ${index >= 0 ? styles.picked : ""}`}
                  onClick={() => { if (slot && (index >= 0 || !disabled)) toggle(slot); }}>{index >= 0 ? index + 1 : ""}</button>;
              }),
            ])}
          </div>
          <div className={styles.legend}>
            <span><i className={styles.swOpen} />{t("pickLegendOpen")}</span>
            <span><i className={styles.swBusy} />{t("pickLegendBusy")}</span>
            <span><i className={styles.swOff} />{t("pickLegendOff")}</span>
            <span><i className={styles.swPicked} />{t("pickLegendPicked")}</span>
            {grid.days.some((day) => day.cells.some((cell) => cell.state === "unknown")) ? <span><i className={styles.swUnknown} />{t("proposalUnknown")}</span> : null}
          </div>
        </div>
        <div className={styles.side}>
          {summary ? <div className={styles.rules} data-slot-rules="">{t("pickRules", summary)}<Link prefetch href={SCHEDULING_SETTINGS_HREF}>{t("pickRulesEdit")}</Link></div> : null}
          <Segmented<string> label={t("proposalDuration")} value={String(duration)} segments={[...new Set([...DURATIONS, duration])].map((value) => ({ key: String(value), label: t("proposalMinutes", { minutes: value }) }))} onChange={(value) => changeDuration(Number(value))} />
          <Segmented<MeetingFormat> label={t("proposalFormat")} value={format} segments={[{ key: "video", label: t("mediumVideo") }, { key: "in_person", label: t("mediumInPerson") }, { key: "phone", label: t("mediumPhone") }]} onChange={(value) => { setFormat(value); setPlace(""); }} />
          <TextField label={placeLabel} aria-label={placeLabel} value={place} maxLength={format === "in_person" ? 500 : format === "video" ? 2048 : 128}
            placeholder={format === "video" ? "https://" : undefined} onChange={(event) => setPlace(event.target.value)} />
          {linkInvalid ? <p className={styles.error} role="alert">{t("pickLinkInvalid")}</p> : null}
          {placeMissing ? <p className={styles.error}>{t("pickPlaceRequired")}</p> : null}
          {slots.length ? <ol className={styles.chosen} aria-label={t("proposalSelection")}>
            {slots.map((slot, index) => <li key={slot.startsAt}>{`${index + 1}. ${zone ? slotLabel(slot, zone, language) : ""}`}</li>)}
          </ol> : null}
        </div>
      </div>}
      <div className={styles.foot}>
        <span className={styles.hint} data-slot-hint="">{grid && availability !== undefined && !countOk && minimum === 3 ? t("pickNeedThree") : hint}</span>
        <Button label={copy.action.cancel} onClick={onClose} />
        <Button variant="primary" label={t("pickInsert", { count: slots.length })} disabled={!canInsert} onClick={insert} data-slot-insert="" />
      </div>
    </Modal>
  );
}
