import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { RefreshControl } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { OfflineNotice } from "../../components/OfflineNotice";
import { IconButton } from "../../components/ui";
import { useOrbitTheme } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { localParts } from "../../time/date-time";
import { useScheduleCalendarSource } from "../schedule/schedule-calendar-source";
import { CalendarContent } from "./CalendarContent";
import { calendarProjection, shiftCalendarSelection, type CalendarMode } from "./calendar-projection";

/** Task calendar body. TaskScreen owns its slot and the top-bar add action. */
export function CalendarScreen() {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { colors } = useOrbitTheme();
  const { language, t } = useOrbitLocale();
  const { timeZone } = useOrbitTimeZone();
  const source = useScheduleCalendarSource();
  const [now, setNow] = useState(() => new Date());
  const [dateKey, setDateKey] = useState(() => localParts(new Date(), timeZone).date);
  const [mode, setMode] = useState<CalendarMode>("month");
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const parts = [source.tasks, source.events, source.scheduleItems];
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
  return <AppScreen title={t("schedule.title")} refreshControl={<RefreshControl refreshing={source.refreshing} onRefresh={source.refresh} tintColor={colors.accentText} />}
    headerActions={<IconButton icon="plus" accessibilityLabel={t("schedule.newPersonal")} onPress={create} />}>
    {loading && !projection ? <LoadingState /> : null}
    {source.offline ? <OfflineNotice lastSyncedAt={source.offline.lastSyncedAt} queues="schedule" /> : null}
    {source.tasks.kind === "failure" || source.tasks.kind === "offline" ? <ErrorState title={t("schedule.tasksFailed")} message={source.tasks.message} /> : null}
    {source.events.kind === "failure" || source.events.kind === "offline" ? <ErrorState title={t("schedule.eventsFailed")} message={source.events.message} /> : null}
    {source.scheduleItems.kind === "failure" || source.scheduleItems.kind === "offline" ? <ErrorState title={t("schedule.personalFailed")} message={source.scheduleItems.message} /> : null}
    {projection?.kind === "invalid_schedule" ? <ErrorState title={t("schedule.personalFailed")} message={t("calendar.view.invalid")} /> : null}
    {projection?.kind === "ready" ? <CalendarContent mode={mode} projection={projection} onChangeMode={setMode} onSelectDate={setDateKey}
      onShift={direction => setDateKey(value => shiftCalendarSelection(value, mode, direction))}
      onToday={() => { setNow(new Date()); setDateKey(localParts(new Date(), timeZone).date); }} onCreate={create}
      onOpenItem={item => router.push(item.href as Href)}
      onEditPersonal={id => router.push(`/schedule/personal/${encodeURIComponent(id)}/edit?focus=time` as Href)} /> : null}
  </AppScreen>;
}
