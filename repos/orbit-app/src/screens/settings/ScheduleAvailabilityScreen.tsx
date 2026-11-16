// contact-reach R42 ⑤ 設定 › 日程 (App; same rows as Web R41 ScheduleSettings): weekday dots, hours, an optional lunch
// break, default length, minimum notice, buffer, time zone (follows the device). Every change is saved at once
// (PUT /api/scheduling/availability, R40) with a 保存しました toast; an invalid combination is not saved and says why;
// a failed save puts the previous value back. Only used to pick your own times — no public booking page.
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { SchedulingAvailabilitySettings, SchedulingBufferMinutes, SchedulingDurationMinutes, SchedulingMinimumNotice, SchedulingWeekday } from "../../api/contract/scheduling-availability";
import { SCHEDULING_BUFFERS, SCHEDULING_MINIMUM_NOTICES, schedulingAvailabilityUpdateInputSchema } from "../../api/schema/scheduling-availability";
import { AppScreen } from "../../components/AppScreen";
import { ActionSheet, BottomSheet, Button, Card, RetryCard, Segmented, Skeleton, Toggle, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import type { MessageKey } from "../../i18n/messages";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { ALL_WEEKDAYS, noticeLabel, weekdayLabel } from "../calendar/meeting-slot-text";
import { deviceTimeZone, readSchedulingAvailability, settingsOf, writeSchedulingAvailability } from "../calendar/scheduling-availability-client";
import { integrationState } from "../me/settings-api";
import { useAccountSettingsApi } from "../me/useAccountSettingsApi";

const HALF_HOURS = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
type TimeField = "start" | "end" | "lunchStart" | "lunchEnd";
/** The text inside a weekday dot: 月 / 一 / Mo. */
const dotLabel = (label: string, language: string) => (language === "zh" ? label.slice(-1) : language === "en" ? label.slice(0, 2) : label);

/** Why a combination cannot be saved (null = it can). */
export function scheduleProblem(settings: SchedulingAvailabilitySettings): MessageKey | null {
  if (!settings.weekdays.length) return "settings.schedule.daysInvalid";
  if (minutes(settings.start) >= minutes(settings.end)) return "settings.schedule.hoursInvalid";
  if (settings.lunch && (minutes(settings.lunch.start) >= minutes(settings.lunch.end) || minutes(settings.lunch.start) < minutes(settings.start) || minutes(settings.lunch.end) > minutes(settings.end))) return "settings.schedule.lunchInvalid";
  return schedulingAvailabilityUpdateInputSchema.safeParse(settings).success ? null : "settings.schedule.saveFailed";
}

/** The times a field may take given the others (the end never at or before the start; lunch inside the hours). */
export function timeOptions(settings: SchedulingAvailabilitySettings, field: TimeField): string[] {
  const at = minutes;
  if (field === "start") return HALF_HOURS.filter((time) => at(time) < at(settings.end));
  if (field === "end") return HALF_HOURS.filter((time) => at(time) > at(settings.start));
  const lunch = settings.lunch ?? { start: "12:00", end: "13:00" };
  if (field === "lunchStart") return HALF_HOURS.filter((time) => at(time) >= at(settings.start) && at(time) < Math.min(at(lunch.end), at(settings.end)));
  return HALF_HOURS.filter((time) => at(time) > Math.max(at(lunch.start), at(settings.start)) && at(time) <= at(settings.end));
}

export function ScheduleAvailabilityScreen() {
  const { t, language } = useOrbitLocale();
  const { styles } = useStyles();
  const toast = useToast();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const accountApi = useAccountSettingsApi();
  // undefined: reading; null: could not be read.
  const [settings, setSettings] = useState<SchedulingAvailabilitySettings | null | undefined>(undefined);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [timeField, setTimeField] = useState<TimeField | null>(null);
  const [menu, setMenu] = useState<"notice" | "buffer" | null>(null);
  const [calendar, setCalendar] = useState<"connected" | "not_connected" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef<SchedulingAvailabilitySettings | null>(null);
  const zone = deviceTimeZone();
  const offline = auth.offline;

  useEffect(() => {
    const controller = new AbortController();
    void readSchedulingAvailability(client, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      const next = value ? settingsOf(value) : null;
      latest.current = next; setSettings(next);
    });
    void accountApi.integrations(controller.signal).then((records) => {
      if (controller.signal.aborted || !records) return;
      setCalendar(integrationState(records.find((record) => record.provider === "google_calendar")) === "connected" ? "connected" : "not_connected");
    }).catch(() => undefined);
    return () => controller.abort();
  }, [accountApi, client, attempt]);

  const change = useCallback((patch: Partial<SchedulingAvailabilitySettings>) => {
    const previous = latest.current;
    if (!previous || offline) return;
    const next = settingsOf({ ...previous, ...patch });
    const why = scheduleProblem(next);
    setProblem(why);
    if (why) return;
    latest.current = next; setSettings(next);
    // Saves go one after another, so an older write never lands after a newer one.
    saving.current = saving.current.then(async () => {
      const result = await writeSchedulingAvailability(client, next);
      if (result.ok) { toast.success(t("settings.schedule.saved")); return; }
      if (latest.current === next) { latest.current = previous; setSettings(previous); }
      toast.error(t("settings.schedule.saveFailed"));
    });
  }, [client, offline, t, toast]);

  const toggleDay = (day: SchedulingWeekday) => {
    if (!settings) return;
    const on = settings.weekdays.includes(day);
    change({ weekdays: on ? settings.weekdays.filter((value) => value !== day) : ALL_WEEKDAYS.filter((value) => value === day || settings.weekdays.includes(value)) });
  };
  const pickTime = (field: TimeField, value: string) => {
    setTimeField(null);
    if (!settings) return;
    if (field === "start" || field === "end") change({ [field]: value });
    else { const lunch = settings.lunch ?? { start: "12:00", end: "13:00" }; change({ lunch: field === "lunchStart" ? { start: value, end: lunch.end } : { start: lunch.start, end: value } }); }
  };
  const fieldValue = (field: TimeField) => !settings ? "" : field === "start" ? settings.start : field === "end" ? settings.end : field === "lunchStart" ? settings.lunch?.start ?? "" : settings.lunch?.end ?? "";
  const timeButton = (field: TimeField, label: string) => (
    <UiPressable accessibilityRole="button" accessibilityLabel={`${label} ${fieldValue(field)}`} disabled={offline} onPress={() => setTimeField(field)} style={styles.time} testID={`schedule-time-${field}`}>
      <UiText style={styles.timeText}>{fieldValue(field)}</UiText>
    </UiPressable>
  );
  const bufferLabel = (value: number) => value === 0 ? t("settings.schedule.bufferNone") : t("settings.schedule.bufferMinutes", { minutes: value });

  return (
    <AppScreen inset="kit" title={t("settings.schedule.title")}>
      <View style={styles.stack} testID="schedule-settings">
        {settings === undefined ? <Card><Skeleton lines={6} /></Card>
          : settings === null ? <RetryCard title={t("settings.schedule.readFailed")} onRetry={() => { setSettings(undefined); setAttempt((value) => value + 1); }} />
          : (
            <Card style={styles.card}>
              <UiText accessibilityRole="header" style={styles.h}>{t("settings.schedule.availTitle")}</UiText>
              <UiText style={styles.desc}>{t("settings.schedule.availDesc")}</UiText>
              {offline ? <UiText style={styles.alert}>{t("settings.schedule.needsNetwork")}</UiText> : null}
              <View style={styles.row}>
                <UiText style={styles.k}>{t("settings.schedule.days")}</UiText>
                <View style={styles.days}>
                  {ALL_WEEKDAYS.map((day) => {
                    const on = settings.weekdays.includes(day);
                    return (
                      <UiPressable key={day} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: offline }} aria-checked={on} accessibilityLabel={weekdayLabel(day, t)} disabled={offline}
                        onPress={() => toggleDay(day)} style={[styles.day, on && styles.dayOn]} testID={`schedule-day-${day}`}>
                        <UiText style={[styles.dayText, on && styles.dayTextOn]}>{dotLabel(weekdayLabel(day, t), language)}</UiText>
                      </UiPressable>
                    );
                  })}
                </View>
              </View>
              <View style={styles.row}>
                <UiText style={styles.k}>{t("settings.schedule.hours")}</UiText>
                <View style={styles.inline}>{timeButton("start", t("settings.schedule.from"))}<UiText style={styles.dash}>–</UiText>{timeButton("end", t("settings.schedule.until"))}</View>
              </View>
              <View style={styles.row}>
                <View style={styles.between}>
                  <UiText style={styles.k}>{t("settings.schedule.lunch")}</UiText>
                  <Toggle value={Boolean(settings.lunch)} accessibilityLabel={t("settings.schedule.lunch")} disabled={offline}
                    onValueChange={(on) => change({ lunch: on ? { start: "12:00", end: "13:00" } : null })} />
                </View>
                {settings.lunch ? <View style={styles.inline}>{timeButton("lunchStart", `${t("settings.schedule.lunch")} ${t("settings.schedule.from")}`)}<UiText style={styles.dash}>–</UiText>{timeButton("lunchEnd", `${t("settings.schedule.lunch")} ${t("settings.schedule.until")}`)}</View> : null}
              </View>
              <View style={styles.row}>
                <UiText style={styles.k}>{t("settings.schedule.duration")}</UiText>
                <Segmented accessibilityLabel={t("settings.schedule.duration")} value={String(settings.durationMinutes)} onChange={(value) => change({ durationMinutes: Number(value) as SchedulingDurationMinutes })}
                  segments={[30, 60, 90].map((value) => ({ key: String(value), label: t("calendar.pick.minutes", { minutes: value }) }))} />
              </View>
              <View style={styles.row}>
                <UiText style={styles.k}>{t("settings.schedule.notice")}</UiText>
                <UiPressable accessibilityRole="button" accessibilityLabel={`${t("settings.schedule.notice")} ${noticeLabel(settings.minimumNotice, t)}`} disabled={offline} onPress={() => setMenu("notice")} style={styles.select} testID="schedule-notice">
                  <UiText style={styles.timeText}>{noticeLabel(settings.minimumNotice, t)}</UiText><UiText style={styles.caret}>▾</UiText>
                </UiPressable>
              </View>
              <View style={styles.row}>
                <UiText style={styles.k}>{t("settings.schedule.buffer")}</UiText>
                <UiPressable accessibilityRole="button" accessibilityLabel={`${t("settings.schedule.buffer")} ${bufferLabel(settings.bufferMinutes)}`} disabled={offline} onPress={() => setMenu("buffer")} style={styles.select} testID="schedule-buffer">
                  <UiText style={styles.timeText}>{bufferLabel(settings.bufferMinutes)}</UiText><UiText style={styles.caret}>▾</UiText>
                </UiPressable>
                <UiText style={styles.desc}>{t("settings.schedule.bufferHint")}</UiText>
              </View>
              <View style={styles.row}>
                <UiText style={styles.k}>{t("settings.schedule.zone")}</UiText>
                <UiText style={styles.v}>{settings.timeZoneMode === "fixed" && settings.timeZone ? settings.timeZone : t("settings.schedule.zoneDevice", { zone })}</UiText>
              </View>
              {problem ? <UiText accessibilityRole="alert" style={styles.alert} testID="schedule-problem">{t(problem)}</UiText> : null}
            </Card>
          )}
        {calendar ? (
          <Card style={styles.card}>
            <UiText accessibilityRole="header" style={styles.h2}>{t("settings.schedule.calendarTitle")}</UiText>
            <UiText style={styles.desc}>{t(calendar === "connected" ? "settings.schedule.calendarConnected" : "settings.schedule.calendarNotConnected")}</UiText>
            <View style={styles.inline}><Button size="sm" label={t("settings.schedule.calendarManage")} onPress={() => router.push("/settings/integrations" as Href)} /></View>
          </Card>
        ) : null}
      </View>
      {settings ? (
        <>
          <BottomSheet visible={timeField !== null} onClose={() => setTimeField(null)} accessibilityLabel={t("settings.schedule.hours")}>
            <View style={styles.times} testID="schedule-time-options">
              {timeField ? timeOptions(settings, timeField).map((time) => (
                <UiPressable key={time} accessibilityRole="button" accessibilityLabel={time} accessibilityState={{ selected: time === fieldValue(timeField) }} onPress={() => pickTime(timeField, time)}
                  style={[styles.time, styles.timeOption, time === fieldValue(timeField) && styles.timeOn]}>
                  <UiText style={[styles.timeText, time === fieldValue(timeField) && styles.timeTextOn]}>{time}</UiText>
                </UiPressable>
              )) : null}
            </View>
          </BottomSheet>
          <ActionSheet visible={menu === "notice"} title={t("settings.schedule.notice")} onClose={() => setMenu(null)} defaultFocusKey={settings.minimumNotice}
            options={SCHEDULING_MINIMUM_NOTICES.map((value) => ({ key: value, label: noticeLabel(value, t) }))}
            onSelect={(key) => { setMenu(null); change({ minimumNotice: key as SchedulingMinimumNotice }); }} />
          <ActionSheet visible={menu === "buffer"} title={t("settings.schedule.buffer")} onClose={() => setMenu(null)} defaultFocusKey={String(settings.bufferMinutes)}
            options={SCHEDULING_BUFFERS.map((value) => ({ key: String(value), label: bufferLabel(value) }))}
            onSelect={(key) => { setMenu(null); change({ bufferMinutes: Number(key) as SchedulingBufferMinutes }); }} />
        </>
      ) : null}
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  stack: { gap: 12 },
  card: { gap: 4 },
  h: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  h2: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  desc: { color: colors.ink2, fontSize: 13, lineHeight: 19 },
  row: { gap: 8, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  k: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  v: { color: colors.ink2, fontSize: 14 },
  days: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  day: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  dayOn: { backgroundColor: colors.ink },
  dayText: { color: colors.ink3Text, fontSize: 13, fontWeight: "700" },
  dayTextOn: { color: colors.bg },
  inline: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  dash: { color: colors.ink2, fontSize: 14 },
  time: { minHeight: 38, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  timeText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  timeOption: { minWidth: 72 },
  timeOn: { backgroundColor: colors.ink },
  timeTextOn: { color: colors.bg },
  times: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  select: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 8, minHeight: 38, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surface2 },
  caret: { color: colors.ink3Text, fontSize: 12 },
  alert: { color: colors.coralText, fontSize: 13, lineHeight: 19 },
}));
