import { type Href, useGlobalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, RefreshControl, StyleSheet } from "react-native";

import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { IconButton, RetryCard, Skeleton, UiText } from "../../components/ui";
import { useToast } from "../../components/ui/Toast";
import { useOrbitTheme } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { localParts } from "../../time/date-time";
import { useScheduleCalendarSource } from "../schedule/schedule-calendar-source";
import { CalendarContent } from "./CalendarContent";
import { calendarProjection, calendarSelectionFromRoute, shiftCalendarSelection, type CalendarMode } from "./calendar-projection";
import { useCalendarExternalEvents } from "./useCalendarExternalEvents";

/** Task calendar body. TaskScreen owns its slot and the top-bar add action. */
export function CalendarScreen() {
  const router = useRouter();
  const toast = useToast();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const { colors } = useOrbitTheme();
  const { language, t } = useOrbitLocale();
  const { timeZone } = useOrbitTimeZone();
  const params = useGlobalSearchParams<{ date?: string | string[] }>();
  const routeDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const source = useScheduleCalendarSource();
  const [now, setNow] = useState(() => new Date());
  const [dateKey, setDateKey] = useState(() => calendarSelectionFromRoute(routeDate, new Date(), timeZone));
  const [mode, setMode] = useState<CalendarMode>("month");
  useEffect(() => setDateKey(calendarSelectionFromRoute(routeDate, new Date(), timeZone)), [routeDate, timeZone]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const parts = [source.tasks, source.events, source.scheduleItems];
  const external = useCalendarExternalEvents(dateKey, mode, timeZone, !source.offline);
  const hasData = parts.some(part => part.kind === "ready");
  const loading = parts.some(part => part.kind === "loading");
  const projection = hasData ? calendarProjection({
    actorId: auth.actorId ?? "", dateKey,
    events: source.events.kind === "ready" ? source.events.data : { events: [] },
    language, mode, now,
    scheduleItems: source.scheduleItems.kind === "ready" ? source.scheduleItems.data : { scheduleItems: [] },
    tasks: source.tasks.kind === "ready" ? source.tasks.data : { tasks: [] }, timeZone,
  }) : null;
  const create = () => router.push("/schedule/personal/new" as Href);
  const connectExternal = () => {
    try {
      const url = new URL("/api/integrations/google_calendar/authorize?returnTo=calendar", server.baseUrl).toString();
      void Linking.openURL(url).catch(() => toast.error(t("calendar.view.externalOpenFailed")));
    } catch { toast.error(t("calendar.view.externalOpenFailed")); }
  };
  const refresh = () => { source.refresh(); external.refresh(); };
  const syncedAt = source.offline?.lastSyncedAt;
  const syncTime = syncedAt && Number.isFinite(Date.parse(syncedAt))
    ? new Date(syncedAt).toLocaleString(language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const offlineMessage = Platform.OS !== "web"
    ? syncTime ? t("schedule.offlineQueuedSnapshot", { time: syncTime }) : t("schedule.offlineQueuedNoSnapshot")
    : syncTime ? t("sync.offlineSnapshot", { time: syncTime }) : t("sync.offlineNoSnapshot");
  const failureMessage = (message: string) => t(message === "sync.failure" ? "sync.failure" : "calendar.view.invalid");
  return <AppScreen inset="kit" title={t("schedule.title")} refreshControl={<RefreshControl refreshing={source.refreshing || external.refreshing} onRefresh={refresh} tintColor={colors.accentText} />}
    headerActions={<IconButton icon="plus" accessibilityLabel={t("schedule.newPersonal")} onPress={create} />}>
    {loading && !projection ? <Skeleton /> : null}
    {source.offline ? <UiText accessibilityRole="alert" style={[offlineStyle.notice, { color: colors.macApricotText, backgroundColor: colors.macApricot }]}>{offlineMessage}</UiText> : null}
    {source.tasks.kind === "failure" || source.tasks.kind === "offline" ? <RetryCard title={t("schedule.tasksFailed")} message={failureMessage(source.tasks.message)} onRetry={refresh} /> : null}
    {source.events.kind === "failure" || source.events.kind === "offline" ? <RetryCard title={t("schedule.eventsFailed")} message={failureMessage(source.events.message)} onRetry={refresh} /> : null}
    {source.scheduleItems.kind === "failure" || source.scheduleItems.kind === "offline" ? <RetryCard title={t("schedule.personalFailed")} message={failureMessage(source.scheduleItems.message)} onRetry={refresh} /> : null}
    {projection?.kind === "invalid_schedule" ? <RetryCard title={t("schedule.personalFailed")} message={t("calendar.view.invalid")} onRetry={refresh} /> : null}
    {projection?.kind === "ready" ? <CalendarContent mode={mode} projection={projection} timeZone={timeZone} onConnectExternal={connectExternal}
      {...(external.view ? { external: external.view } : {})} onChangeMode={setMode} onSelectDate={setDateKey}
      onShift={direction => setDateKey(value => shiftCalendarSelection(value, mode, direction))}
      onToday={() => { setNow(new Date()); setDateKey(localParts(new Date(), timeZone).date); }} onCreate={create}
      onOpenItem={item => router.push(item.href as Href)}
      onEditPersonal={id => router.push(`/schedule/personal/${encodeURIComponent(id)}/edit?focus=time` as Href)} /> : null}
  </AppScreen>;
}

const offlineStyle = StyleSheet.create({ notice: { borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14, lineHeight: 21 } });
