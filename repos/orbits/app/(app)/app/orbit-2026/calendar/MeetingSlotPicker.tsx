"use client";

// contact-reach R41 ④ / R43 ⑨ 候補の時間を選ぶ — the insert mode of the meeting picker (MeetingProposalModal mode="insert").
// One week of 30-minute cells (R40 availabilityGrid at 30 minutes: off / past cells are dashed, busy is striped, unknown
// can be painted). Paint rules are the shared ones (meeting-slots paintTap / paintRect): a click paints one meeting
// length, a click on paint erases its range, press-and-drag paints (or, started on paint, erases) a rectangle that
// may span days. Painted ranges are cut into ≤ 5 candidates for a proposal (sliceMeetingCandidates); an e-mail draft
// (minimum 1) gets the ranges themselves. On open the next 3 confirmed-free slots are painted (seedMeetingSlots);
// 「挿入」 hands the selection back without any write.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { MeetingDetailsMedium } from "../../../../../shared/contract/appointments";
import type { SchedulingAvailabilitySettings } from "../../../../../shared/contract/scheduling-availability";
import {
  addLocalDays, availabilityGrid, cellsInRanges, isCellPaintable, localDateOf, localWeekday, paintRect, paintTap, paintedRanges, seedMeetingSlots, sliceMeetingCandidates,
  type MeetingSlot,
} from "../../../../../shared/compute/meeting-slots";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import { Button, Modal, Segmented, Skeleton, TextField, fillCopy, useScopeLanguage, useStandardCopy } from "../ui";
import { createMeetingAvailabilityClient, type MeetingAvailability } from "./meeting-availability";
import { dayLabel, rulesSummary, slotLabel } from "./meeting-slot-text";
import { SCHEDULING_SETTINGS_HREF, effectiveTimeZone, schedulingRulesFor } from "./scheduling-availability-client";
import styles from "./meeting-slot-picker.module.css";

export type MeetingFormat = MeetingDetailsMedium["kind"];
export interface MeetingSlotSelection {
  /** The candidates sent with a proposal (≤ 5, in time order). */
  slots: MeetingSlot[];
  /** R43: the painted ranges (time order, short ones included so a reopen draws them again). Older kept drafts have none. */
  ranges?: MeetingSlot[];
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
  /** 3 for an Orbit proposal (the server takes 3–5); 1 for an e-mail draft, which gets the ranges as text. */
  minimum?: 1 | 3;
  /** In person needs a place for an Orbit proposal (the appointment requires it). */
  requirePlace?: boolean;
  initial?: MeetingSlotSelection | null;
  /** Injected for tests. */
  now?: () => number;
}

const MAX = 5;
const CELL_MINUTES = 30;
const HORIZON_DAYS = 14;
const DURATIONS = [30, 60, 90] as const;
const MINUTE = 60_000;

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

const spanOf = (slot: MeetingSlot) => Date.parse(slot.endsAt) - Date.parse(slot.startsAt);

export function MeetingSlotPicker(props: MeetingSlotPickerProps) {
  if (!props.open) return null;
  return <PickerSession {...props} />;
}

type Drag = { anchor: [number, number]; current: [number, number]; erase: boolean; moved: boolean; pointerId: number };

function PickerSession({ onClose, onInsert, minimum = 3, requirePlace = false, initial = null, now: clock = Date.now }: MeetingSlotPickerProps) {
  const language = useScopeLanguage();
  const copy = useStandardCopy();
  const t = (key: keyof typeof taskCopy, values?: Record<string, string | number>) => fillCopy(pickCopy(taskCopy[key], language), values ?? {});
  const email = minimum === 1;
  const [rules, setRules] = useState<SchedulingAvailabilitySettings | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  // undefined: still reading; null: could not be read (every allowed cell is then unknown).
  const [availability, setAvailability] = useState<MeetingAvailability | null | undefined>(undefined);
  // The ranges to paint once the grid is known: the reopened selection, else the preselected slots.
  const [start, setStart] = useState<MeetingSlot[] | null>(() => initial ? (initial.ranges ?? initial.slots).map((slot) => ({ ...slot })) : null);
  const [painted, setPainted] = useState<Set<string> | null>(null);
  const [duration, setDuration] = useState<number>(initial?.durationMinutes ?? 60);
  const [format, setFormat] = useState<MeetingFormat>(initial?.format ?? "video");
  const [place, setPlace] = useState(initial?.place ?? "");
  const [week, setWeek] = useState(0);
  const [seeded, setSeeded] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const reader = useMemo(() => createMeetingAvailabilityClient(), []);
  const started = useRef(clock());
  const gridRef = useRef<HTMLDivElement | null>(null);

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
  const grid = useMemo(() => rules && zone && availability !== undefined ? availabilityGrid(rules, { timeZone: zone, now: clock(), days: allDays, availability, durationMinutes: CELL_MINUTES }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, zone, allDays, availability]);
  useEffect(() => {
    if (grid && start && !painted) setPainted(cellsInRanges(grid.days, start));
  }, [grid, start, painted]);

  const shownMonday = firstMonday ? addLocalDays(firstMonday, week * 7) : null;
  const weekEnd = shownMonday ? addLocalDays(shownMonday, 6) : null;
  const weekDays = useMemo(() => grid && shownMonday && weekEnd ? grid.days.filter((day) => day.date >= shownMonday && day.date <= weekEnd) : [], [grid, shownMonday, weekEnd]);
  const cellsPerMeeting = Math.max(1, Math.round(duration / CELL_MINUTES));

  const current = painted ?? new Set<string>();
  const ranges = useMemo(() => grid ? paintedRanges(grid.days, current) : [], [grid, current]);
  const slices = useMemo(() => sliceMeetingCandidates(ranges, duration, MAX), [ranges, duration]);
  const longRanges = ranges.filter((range) => spanOf(range) >= duration * MINUTE);
  const shortCount = ranges.length - longRanges.length;
  // How each painted cell is drawn: candidate numbers and cut lines, lighter cells past 5, outlined short ranges.
  const marks = useMemo(() => {
    const number = new Map<string, number>();
    const extra = grid && !email ? cellsInRanges(grid.days, slices.extra) : new Set<string>();
    const short = grid ? cellsInRanges(grid.days, slices.short) : new Set<string>();
    if (!email) [...slices.sent, ...slices.extra].forEach((slot, index) => number.set(slot.startsAt, index + 1));
    return { number, extra, short, starts: new Set(ranges.map((range) => range.startsAt)), ends: new Set(ranges.map((range) => range.endsAt)) };
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

  const update = (next: Set<string>) => { setSeeded(false); setPainted(next); };
  const tap = (day: number, row: number) => update(paintTap(weekDays, current, day, row, cellsPerMeeting));
  const cellAt = (x: number, y: number): [number, number] | null => {
    const target = typeof document === "undefined" ? null : document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell-day]");
    if (!target || !gridRef.current?.contains(target)) return null;
    return [Number(target.dataset.cellDay), Number(target.dataset.cellRow)];
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || drag) return;
    const at = cellAt(event.clientX, event.clientY);
    const cell = at ? weekDays[at[0]]?.cells[at[1]] : undefined;
    if (!at || !cell || !isCellPaintable(cell)) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is a nicety */ }
    setDrag({ anchor: at, current: at, erase: current.has(cell.startsAt!), moved: false, pointerId: event.pointerId });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const at = cellAt(event.clientX, event.clientY);
    if (!at || (at[0] === drag.current[0] && at[1] === drag.current[1])) return;
    setDrag({ ...drag, current: at, moved: true });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setDrag(null);
    if (!drag.moved) { tap(drag.anchor[0], drag.anchor[1]); return; }
    const next = new Set(current);
    for (const key of paintRect(weekDays, drag.anchor, drag.current)) { if (drag.erase) next.delete(key); else next.add(key); }
    update(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: number, row: number) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    tap(day, row);
  };

  const stateLabel = { allowed: t("proposalFree"), busy: t("proposalBusy"), off: t("pickLegendOff"), unknown: t("proposalUnknown") } as const;
  const hint = availability === undefined ? "" : !availability || !availability.complete ? t("proposalUnverified") : availability.orbitOnly ? t("pickHintOrbitOnly") : seeded ? t("pickHintSeeded") : t("pickGesture");
  const summary = rules ? rulesSummary(rules, language) : null;
  const placeLabel = format === "in_person" ? (requirePlace ? t("proposalPlace") : t("pickOptional", { label: t("proposalPlace") })) : t("pickOptional", { label: t(format === "video" ? "proposalVideoUrl" : "proposalPhoneHint") });
  const anyUnknown = weekDays.some((day) => day.cells.some((cell) => cell.state === "unknown"));
  const rows = grid?.rows ?? [];

  return (
    <Modal open form onClose={onClose} title={t("pickTitle")} size={1000}>
      {!grid || !painted ? <Skeleton lines={5} /> : <div className={styles.pick} data-slot-picker="">
        <div>
          <div className={styles.weekBar}>
            <Button icon="left" size="sm" label={t("calendarPrevious")} disabled={week === 0} onClick={() => setWeek((value) => value - 1)} />
            <b>{shownMonday && weekEnd ? t("pickWeekRange", { from: dayLabel(shownMonday, language), to: dayLabel(weekEnd, language) }) : ""}</b>
            <Button icon="right" size="sm" label={t("calendarNext")} disabled={!weekEnd || !lastDay || weekEnd >= lastDay} onClick={() => setWeek((value) => value + 1)} />
          </div>
          <div className={styles.head} style={{ gridTemplateColumns: `44px repeat(${Math.max(weekDays.length, 1)}, minmax(0, 1fr))` }}>
            <span />
            {weekDays.map((day) => <b key={day.date} className={`${styles.dayHead} ${day.date === today ? styles.today : ""}`}>{dayLabel(day.date, language)}{day.date === today ? <em>{t("pickToday")}</em> : null}</b>)}
          </div>
          <div className={styles.body} style={{ gridTemplateColumns: `44px minmax(0, 1fr)` }}>
            <div className={styles.times} aria-hidden="true">{rows.map((time, row) => <time key={time} className={`${styles.hour} ${row % 2 ? styles.half : ""}`}>{time}</time>)}</div>
            <div ref={gridRef} className={styles.grid} role="grid" aria-label={t("pickGesture")} style={{ gridTemplateColumns: `repeat(${Math.max(weekDays.length, 1)}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${Math.max(rows.length, 1)}, var(--slot-row))` }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)} data-slot-grid="">
              {weekDays.map((day, dayIndex) => day.cells.map((cell, row) => {
                const key = cell.startsAt ?? "";
                const paintable = isCellPaintable(cell);
                const on = paintable && current.has(key);
                const previewing = Boolean(preview && key && preview.cells.has(key));
                const n = on ? marks.number.get(key) : undefined;
                const classes = [styles.cell, styles[cell.state === "allowed" ? "open" : cell.state], row % 2 === 0 ? styles.hourLine : "",
                  on ? styles.on : "", on && marks.starts.has(key) ? styles.top : "", on && cell.endsAt && marks.ends.has(cell.endsAt) ? styles.bottom : "",
                  on && marks.short.has(key) ? styles.short : "", on && marks.extra.has(key) ? styles.extra : "", n !== undefined && !marks.starts.has(key) ? styles.cut : "",
                  previewing ? (preview!.erase ? styles.previewErase : styles.preview) : ""].filter(Boolean).join(" ");
                return <button key={`${day.date}:${cell.time}`} type="button" role="gridcell" className={`btn ${classes}`} style={{ gridColumn: dayIndex + 1, gridRow: row + 1 }}
                  tabIndex={paintable ? 0 : -1} aria-disabled={!paintable} aria-pressed={on} aria-label={`${dayLabel(day.date, language)} ${cell.time} · ${on ? t("pickLegendPicked") : stateLabel[cell.state]}`}
                  data-cell-day={dayIndex} data-cell-row={row} data-slot={key} data-slot-state={cell.state} {...(on ? { "data-slot-on": "" } : {})}
                  {...(n !== undefined ? { "data-slot-n": n } : {})} {...(on && marks.extra.has(key) ? { "data-slot-extra": "" } : {})} {...(on && marks.short.has(key) ? { "data-slot-short": "" } : {})}
                  onKeyDown={(event) => onKeyDown(event, dayIndex, row)}>{n !== undefined ? <span className={styles.n}>{n}</span> : null}</button>;
              }))}
            </div>
          </div>
          <div className={styles.legend}>
            <span><i className={styles.swOpen} />{t("pickLegendOpen")}</span>
            <span><i className={styles.swBusy} />{t("pickLegendBusy")}</span>
            <span><i className={styles.swOff} />{t("pickLegendOff")}</span>
            {anyUnknown ? <span><i className={styles.swUnknown} />{t("proposalUnknown")}</span> : null}
            <span><i className={styles.swPicked} />{t("pickLegendPicked")}</span>
            {email ? null : <span><i className={styles.swExtra} />{t("pickLegendExtra", { max: MAX })}</span>}
          </div>
        </div>
        <div className={styles.side}>
          {summary ? <div className={styles.rules} data-slot-rules="">{t("pickRules", summary)}<Link prefetch href={SCHEDULING_SETTINGS_HREF}>{t("pickRulesEdit")}</Link></div> : null}
          <Segmented<string> label={t("proposalDuration")} value={String(duration)} segments={[...new Set([...DURATIONS, duration])].map((value) => ({ key: String(value), label: t("proposalMinutes", { minutes: value }) }))} onChange={(value) => { setDuration(Number(value)); setSeeded(false); }} />
          <Segmented<MeetingFormat> label={t("proposalFormat")} value={format} segments={[{ key: "video", label: t("mediumVideo") }, { key: "in_person", label: t("mediumInPerson") }, { key: "phone", label: t("mediumPhone") }]} onChange={(value) => { setFormat(value); setPlace(""); }} />
          <TextField label={placeLabel} aria-label={placeLabel} value={place} maxLength={format === "in_person" ? 500 : format === "video" ? 2048 : 128}
            placeholder={format === "video" ? "https://" : undefined} onChange={(event) => setPlace(event.target.value)} />
          {linkInvalid ? <p className={styles.error} role="alert">{t("pickLinkInvalid")}</p> : null}
          {placeMissing ? <p className={styles.error}>{t("pickPlaceRequired")}</p> : null}
          <div className={styles.out} data-slot-summary="" aria-live="polite">
            <b className={styles.outHead}>{email ? t("pickSummaryEmail") : t("pickSummary", { count, minutes: duration })}</b>
            {(email ? longRanges : slices.sent).length ? <ol className={styles.chosen} aria-label={t("proposalSelection")}>
              {(email ? longRanges : slices.sent).map((slot, index) => <li key={slot.startsAt}>{`${index + 1}. ${zone ? slotLabel(slot, zone, language) : ""}`}</li>)}
            </ol> : null}
            {!email && count < minimum ? <p className={styles.warn} data-slot-need="">{t("pickNeedThree", { count: minimum })}</p> : null}
            {!email && slices.extra.length ? <p className={styles.warn} data-slot-over="">{t("pickOverMax", { max: MAX, count: slices.extra.length })}</p> : null}
            {shortCount ? <p className={styles.muted} data-slot-short-hint="">{t("pickShort", { minutes: duration })}</p> : null}
          </div>
        </div>
      </div>}
      <div className={styles.foot}>
        <span className={styles.hint} data-slot-hint="">{hint}</span>
        <Button label={copy.action.cancel} onClick={onClose} />
        <Button variant="primary" label={email ? t("pickInsertRanges", { count }) : t("pickInsert", { count })} disabled={!canInsert} onClick={insert} data-slot-insert="" />
      </div>
    </Modal>
  );
}
