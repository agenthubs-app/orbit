import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { localParts } from "../../time/date-time";
import { createThemedStyles } from "../../design/theme";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { OfflineNotice } from "../../components/OfflineNotice";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { usePersonalScheduleList } from "./personal-schedule-source";

export function PersonalScheduleList() {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const actor = auth.actorId ?? "";
  const locale = useOrbitLocale();
  const { timeZone } = useOrbitTimeZone(); const router = useRouter(); const { styles } = useStyles();
  const ready = auth.ready && auth.signedIn && server.ready && !!actor;
  const scopeKey = JSON.stringify([actor, server.baseUrl, ready, timeZone]);
  // Native reads the device mirror (sprint 0108); the browser is mirror-first or the network.
  const source = usePersonalScheduleList({ actorId: actor, ready, scopeKey, timeZone });
  const refresh = source.refresh;
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const items = source.items;
  // Sprint 0134: on the phone a new schedule can be created offline (it queues until the connection is back).
  const createBlocked = source.offline && !source.outbox;
  return <View style={styles.section}>
    <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{locale.t("schedule.personalTitle")}</Text><Pressable accessibilityRole="button" accessibilityLabel={createBlocked ? `${locale.t("schedule.newPersonal")}，${locale.t("sync.needsNetwork")}` : locale.t("schedule.newPersonal")} accessibilityState={{ disabled: createBlocked }} disabled={createBlocked} onPress={() => router.push("/schedule/personal/new" as Href)} style={styles.button}><Text style={[styles.link, createBlocked && styles.disabled]}>{locale.t(createBlocked ? "sync.needsNetwork" : "schedule.newPersonal")}</Text></Pressable></View>
    {source.offline ? <OfflineNotice lastSyncedAt={source.lastSyncedAt} queues="schedule" /> : null}
    {source.loading ? <LoadingState /> : null}
    {source.failed ? <ErrorState title={locale.t("schedule.personalLoadFailure")} message={locale.t("schedule.personalLoadFailureBody")} /> : null}
    <Pressable accessibilityRole="button" onPress={refresh} style={styles.button}><Text style={styles.link}>{locale.t("schedule.refreshPersonal")}</Text></Pressable>
    {items?.length === 0 ? <Text style={styles.detail}>{locale.t("schedule.emptyPersonal")}</Text> : null}
    {items?.map(item => { const parts = localParts(item.startsAt, timeZone); return <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(`/schedule/personal/${encodeURIComponent(item.id)}` as Href)} style={styles.row}>
      <Text style={styles.title}>{item.title}</Text><Text style={styles.detail}>{[parts.date + " " + parts.time, item.location, locale.t(item.state === "ended" ? "schedule.stateEnded" : item.state === "ongoing" ? "schedule.stateOngoing" : "schedule.stateScheduled"),
        source.localStates?.[item.id] ? locale.t(source.localStates[item.id] === "conflict" ? "schedule.outboxConflict" : source.localStates[item.id] === "failed" ? "schedule.outboxFailed" : "schedule.outboxQueued") : null].filter(Boolean).join(" · ")}</Text>
    </Pressable>; })}
  </View>;
}
const useStyles = createThemedStyles(colors => ({ section: { marginTop: 24, gap: 8 }, heading: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }, title: { color: colors.ink, fontSize: 16, fontWeight: "600" as const }, detail: { color: colors.ink2, fontSize: 14, lineHeight: 22 }, link: { color: colors.accentText, fontSize: 14 }, disabled: { color: colors.ink3Text }, button: { minHeight: 44, justifyContent: "center" as const }, row: { minHeight: 64, gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line } }));
