"use client";

// contact-reach R41 ⑤ 設定 › 日程: the 可約時間 the meeting picker follows (GET/PUT /api/scheduling/availability, R40).
// Every change saves at once (like the other settings) with a 「保存しました」 toast; a combination the server would
// refuse (end before start, lunch outside the hours, no weekday) is stopped here and never sent. Below it, the
// calendar connection the busy check relies on (same read and cache key as 設定 › 連携).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SCHEDULING_BUFFERS, SCHEDULING_DURATIONS, SCHEDULING_MINIMUM_NOTICES, SCHEDULING_WEEKDAYS } from "../../../../../shared/api-schema/scheduling-availability";
import type { SchedulingAvailabilitySettings, SchedulingBufferMinutes, SchedulingDurationMinutes, SchedulingMinimumNotice } from "../../../../../shared/contract/scheduling-availability";
import type { IntegrationAuthorization } from "../../../../../features/integrations/contract";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { noticeLabel, weekdayLabel } from "../calendar/meeting-slot-text";
import { SCHEDULING_AVAILABILITY_ANSWER_KEY, readSchedulingAvailability, settingsOf, writeSchedulingAvailability } from "../calendar/scheduling-availability-client";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import { Bone, RetryCard, Segmented, Toggle, fillCopy, useScopeLanguage, useToast } from "../ui";
import { integrationStatus, listIntegrations } from "./integrations-api";
import styles from "./ScheduleSettings.module.css";

const INTEGRATIONS_KEY = "settings:integrations";
const HALF_HOURS = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** What the server would refuse (R40 update schema), checked before anything is sent. */
export function scheduleProblem(settings: SchedulingAvailabilitySettings): "days" | "hours" | "lunch" | null {
  if (!settings.weekdays.length) return "days";
  if (minutes(settings.start) >= minutes(settings.end)) return "hours";
  if (settings.lunch) {
    const from = minutes(settings.lunch.start), to = minutes(settings.lunch.end);
    if (from >= to || from < minutes(settings.start) || to > minutes(settings.end)) return "lunch";
  }
  return null;
}

function deviceZone(): string {
  try { return new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}
function zones(current: string | null): string[] {
  let list: string[] = [];
  try { list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { list = []; }
  return [...new Set([...(current ? [current] : []), deviceZone(), ...list])];
}

export function ScheduleSettings() {
  const language = useScopeLanguage();
  const toast = useToast();
  const t = (key: keyof typeof taskCopy, values?: Record<string, string | number>) => fillCopy(pickCopy(taskCopy[key], language), values ?? {});
  const remembered = lastAnswer<SchedulingAvailabilitySettings>(SCHEDULING_AVAILABILITY_ANSWER_KEY);
  // saved: what the server holds; shown: what is on screen (may be an edit the checks stopped).
  const saved = useRef<SchedulingAvailabilitySettings | null>(remembered ? settingsOf(remembered) : null);
  const [shown, setShown] = useState<SchedulingAvailabilitySettings | null>(() => remembered ? settingsOf(remembered) : null);
  const [readFailed, setReadFailed] = useState(false);
  const [records, setRecords] = useState<IntegrationAuthorization[] | null>(() => lastAnswer<IntegrationAuthorization[]>(INTEGRATIONS_KEY) ?? null);
  const queue = useRef(Promise.resolve());

  const read = async () => {
    setReadFailed(false);
    const value = await readSchedulingAvailability();
    if (value) { saved.current = settingsOf(value); setShown(settingsOf(value)); } else setReadFailed(true);
  };
  useEffect(() => {
    if (!answerFresh(SCHEDULING_AVAILABILITY_ANSWER_KEY, FRESH.slow) || !remembered) void read();
    if (!answerFresh(INTEGRATIONS_KEY, FRESH.slow)) void listIntegrations().then((list) => { setRecords(list); rememberAnswer(INTEGRATIONS_KEY, list); }).catch(() => setRecords((current) => current ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (next: SchedulingAvailabilitySettings) => {
    setShown(next);
    if (scheduleProblem(next)) return;
    queue.current = queue.current.then(async () => {
      const result = await writeSchedulingAvailability(next);
      if (result.ok) { saved.current = settingsOf(result.data); toast.success(t("scheduleSaved")); }
      else { toast.error(t("scheduleSaveFailed")); if (saved.current) setShown(saved.current); }
    });
  };

  if (!shown) {
    if (readFailed) return <RetryCard title={t("scheduleReadFailed")} onRetry={() => void read()} />;
    return <div className={styles.stack} aria-busy="true"><section className={styles.card}><Bone width={120} height={18} /><Bone width="80%" height={13} />
      {Array.from({ length: 6 }, (_, index) => <div key={index} className={styles.row}><Bone width={80} height={13} /><Bone width="60%" height={30} round /></div>)}</section></div>;
  }

  const problem = scheduleProblem(shown);
  const set = (patch: Partial<SchedulingAvailabilitySettings>) => change({ ...shown, ...patch });
  const timeSelect = (label: string, value: string, onChange: (value: string) => void, allowed: (time: string) => boolean) => (
    <select className={styles.select} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {HALF_HOURS.filter((time) => time === value || allowed(time)).map((time) => <option key={time} value={time}>{time}</option>)}
    </select>
  );
  const calendar = records ? integrationStatus(records.find((record) => record.provider === "google_calendar")) : null;
  const zone = shown.timeZoneMode === "fixed" && shown.timeZone ? shown.timeZone : "device";

  return <div className={styles.stack} data-schedule-settings="">
    <section className={styles.card} aria-labelledby="schedule-availability-title">
      <h2 id="schedule-availability-title">{t("availTitle")}</h2>
      <p className={styles.desc}>{t("availDesc")}</p>
      <div className={styles.row}><span className={styles.key}>{t("rowDays")}</span>
        <div className={styles.days} role="group" aria-label={t("rowDays")}>{SCHEDULING_WEEKDAYS.map((day) => {
          const on = shown.weekdays.includes(day);
          return <button key={day} type="button" className={`btn ${styles.day}`} aria-pressed={on} aria-label={weekdayLabel(day, language)} disabled={on && shown.weekdays.length === 1} data-schedule-day={day}
            onClick={() => set({ weekdays: on ? shown.weekdays.filter((item) => item !== day) : SCHEDULING_WEEKDAYS.filter((item) => item === day || shown.weekdays.includes(item)) })}>{weekdayLabel(day, language)}</button>;
        })}</div></div>
      <div className={styles.row}><span className={styles.key}>{t("rowHours")}</span>
        <div className={styles.value}>
          {timeSelect(`${t("rowHours")} · ${t("rowFrom")}`, shown.start, (start) => set({ start }), (time) => minutes(time) < minutes(shown.end))}
          <span>–</span>
          {timeSelect(`${t("rowHours")} · ${t("rowUntil")}`, shown.end, (end) => set({ end }), (time) => minutes(time) > minutes(shown.start))}
        </div></div>
      <div className={styles.row}><span className={styles.key}>{t("rowLunch")}</span>
        <div className={styles.value}>
          <Toggle checked={shown.lunch !== null} label={t("rowLunch")} onChange={(on) => {
            if (!on) { set({ lunch: null }); return; }
            const from = Math.max(minutes(shown.start), Math.min(12 * 60, minutes(shown.end) - 60));
            const text = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${value % 60 ? "30" : "00"}`;
            set({ lunch: { start: text(from), end: text(Math.min(from + 60, minutes(shown.end))) } });
          }} />
          {shown.lunch ? <>
            {timeSelect(`${t("rowLunch")} · ${t("rowFrom")}`, shown.lunch.start, (start) => set({ lunch: { start, end: shown.lunch!.end } }), (time) => minutes(time) >= minutes(shown.start) && minutes(time) < minutes(shown.lunch!.end))}
            <span>–</span>
            {timeSelect(`${t("rowLunch")} · ${t("rowUntil")}`, shown.lunch.end, (end) => set({ lunch: { start: shown.lunch!.start, end } }), (time) => minutes(time) > minutes(shown.lunch!.start) && minutes(time) <= minutes(shown.end))}
          </> : null}
        </div></div>
      {problem === "hours" || problem === "lunch" ? <p className={styles.error} role="alert" data-schedule-problem={problem}>{t(problem === "hours" ? "scheduleHoursInvalid" : "scheduleLunchInvalid")}</p> : null}
      <div className={styles.row}><span className={styles.key}>{t("rowDuration")}</span>
        <div className={styles.value}><Segmented<string> label={t("rowDuration")} value={String(shown.durationMinutes)} segments={SCHEDULING_DURATIONS.map((value) => ({ key: String(value), label: t("proposalMinutes", { minutes: value }) }))} onChange={(value) => set({ durationMinutes: Number(value) as SchedulingDurationMinutes })} /></div></div>
      <div className={styles.row}><span className={styles.key}>{t("rowNotice")}</span>
        <div className={styles.value}><select className={styles.select} aria-label={t("rowNotice")} value={shown.minimumNotice} onChange={(event) => set({ minimumNotice: event.target.value as SchedulingMinimumNotice })}>
          {SCHEDULING_MINIMUM_NOTICES.map((notice) => <option key={notice} value={notice}>{noticeLabel(notice, language)}</option>)}</select></div></div>
      <div className={styles.row}><span className={styles.key}>{t("rowBuffer")}</span>
        <div className={styles.value}><select className={styles.select} aria-label={t("rowBuffer")} value={String(shown.bufferMinutes)} onChange={(event) => set({ bufferMinutes: Number(event.target.value) as SchedulingBufferMinutes })}>
          {SCHEDULING_BUFFERS.map((value) => <option key={value} value={value}>{value ? t("proposalMinutes", { minutes: value }) : t("bufferNone")}</option>)}</select>
          <span className={styles.hint}>{t("rowBufferHint")}</span></div></div>
      <div className={styles.row}><span className={styles.key}>{t("rowZone")}</span>
        <div className={styles.value}><select className={styles.select} aria-label={t("rowZone")} value={zone} onChange={(event) => set(event.target.value === "device" ? { timeZoneMode: "device", timeZone: null } : { timeZoneMode: "fixed", timeZone: event.target.value })}>
          <option value="device">{t("zoneDevice", { zone: deviceZone() })}</option>
          {zones(shown.timeZone).map((value) => <option key={value} value={value}>{value}</option>)}</select></div></div>
    </section>
    <section className={styles.card} aria-labelledby="schedule-calendar-title">
      <h2 id="schedule-calendar-title">{t("calendarCardTitle")}</h2>
      <div className={styles.conn}>{calendar === null ? <Bone width="60%" height={13} /> : <span data-schedule-calendar={calendar}>{t(calendar === "connected" ? "calendarConnected" : "calendarNotConnected")}</span>}
        <Link prefetch href="/app/settings/integrations">{t("calendarManage")}</Link></div>
    </section>
  </div>;
}
