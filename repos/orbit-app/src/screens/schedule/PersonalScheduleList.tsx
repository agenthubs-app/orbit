import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { personalScheduleList, personalScheduleListPath } from "../../api/personal-schedule";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { localDayStart, localParts, shiftCalendarDate } from "../../time/date-time";
import type { PersonalScheduleContract } from "../../api/contract/tasks";
import { createThemedStyles } from "../../design/theme";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function PersonalScheduleList() {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const actor = auth.actorId ?? "";
  const locale = useOrbitLocale();
  const { timeZone } = useOrbitTimeZone(); const router = useRouter(); const { styles } = useStyles();
  const ready = auth.ready && auth.signedIn && server.ready && !!actor;
  const scopeKey = JSON.stringify([actor, server.baseUrl, ready, timeZone]);
  const client = useOrbitApiClient({ scopeKey });
  const [snapshot, setSnapshot] = useState<{ scopeKey: string; items: PersonalScheduleContract[] | null; loading: boolean; failed: boolean }>({ scopeKey, items: null, loading: true, failed: false });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => {
    const controller = new AbortController(); setSnapshot({ scopeKey, items: null, loading: ready, failed: false });
    if (!ready) return () => controller.abort();
    const date = localParts(new Date(), timeZone).date;
    const from = localDayStart(date, timeZone), to = localDayStart(shiftCalendarDate(date, 90), timeZone);
    if (from === null || to === null) { setSnapshot({ scopeKey, items: null, loading: false, failed: true }); return () => controller.abort(); }
    const path = `${personalScheduleListPath}&${new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() })}`;
    void client.get<unknown>(path, { headers: { "x-orbit-personal-schedule-version": "3" }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const items = result.success ? personalScheduleList(result.data, actor) : null;
      setSnapshot({ scopeKey, items, loading: false, failed: items === null });
    }).catch(() => { if (!controller.signal.aborted) setSnapshot({ scopeKey, items: null, loading: false, failed: true }); });
    return () => controller.abort();
  }, [ready, actor, scopeKey, client, revision, timeZone]);
  const state = snapshot.scopeKey === scopeKey ? snapshot : { items: null, loading: ready, failed: false };
  const items = state.items;
  return <View style={styles.section}>
    <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{locale.t("schedule.personalTitle")}</Text><Pressable accessibilityRole="button" onPress={() => router.push("/schedule/personal/new" as Href)} style={styles.button}><Text style={styles.link}>{locale.t("schedule.newPersonal")}</Text></Pressable></View>
    {state.loading ? <LoadingState /> : null}
    {state.failed ? <ErrorState title={locale.t("schedule.personalLoadFailure")} message={locale.t("schedule.personalLoadFailureBody")} /> : null}
    <Pressable accessibilityRole="button" onPress={refresh} style={styles.button}><Text style={styles.link}>{locale.t("schedule.refreshPersonal")}</Text></Pressable>
    {items?.length === 0 ? <Text style={styles.detail}>{locale.t("schedule.emptyPersonal")}</Text> : null}
    {items?.map(item => { const parts = localParts(item.startsAt, timeZone); return <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(`/schedule/personal/${encodeURIComponent(item.id)}` as Href)} style={styles.row}>
      <Text style={styles.title}>{item.title}</Text><Text style={styles.detail}>{[parts.date + " " + parts.time, item.location, locale.t(item.state === "ended" ? "schedule.stateEnded" : item.state === "ongoing" ? "schedule.stateOngoing" : "schedule.stateScheduled")].filter(Boolean).join(" · ")}</Text>
    </Pressable>; })}
  </View>;
}
const useStyles = createThemedStyles(colors => ({ section: { marginTop: 24, gap: 8 }, heading: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }, title: { color: colors.text, fontSize: 16, fontWeight: "600" as const }, detail: { color: colors.text2, fontSize: 14, lineHeight: 22 }, link: { color: colors.accent, fontSize: 14 }, button: { minHeight: 44, justifyContent: "center" as const }, row: { minHeight: 64, gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border } }));
