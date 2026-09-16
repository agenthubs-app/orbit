import { useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { AppScreen } from "../../components/AppScreen";
import { LoadingState } from "../../components/LoadingState";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { personalSchedulePath, readPersonalSchedule } from "../../api/personal-schedule";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createThemedStyles } from "../../design/theme";
import { personalScheduleDetail } from "../../view-models/personal-schedule-detail";
import { PersonalScheduleAssociations } from "./PersonalScheduleAssociations";

export function PersonalScheduleDetailScreen() {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const params = useLocalSearchParams<{ id?: string | string[]; saved?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && !!auth.actorId;
  const scopeKey = JSON.stringify([auth.actorId, server.baseUrl, id, ready]);
  return <Detail key={scopeKey} actorId={auth.actorId ?? ""} id={id} ready={ready} scopeKey={scopeKey} savedVersion={(Array.isArray(params.saved) ? params.saved[0] : params.saved) ?? ""} />;
}
function Detail({ actorId, id, ready, scopeKey, savedVersion }: { actorId: string; id: string; ready: boolean; scopeKey: string; savedVersion: string }) {
  const client = useOrbitApiClient({ scopeKey }); const { timeZone } = useOrbitTimeZone(); const locale = useOrbitLocale(); const router = useRouter(); const { styles } = useStyles();
  const [view, setView] = useState<ReturnType<typeof personalScheduleDetail>>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setView(null); setError("");
    if (!ready || !id) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    void client.get<unknown>(personalSchedulePath(id), { headers: { "x-orbit-personal-schedule-version": "2" }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const item = result.success ? readPersonalSchedule(result.data) : null;
      if (!item || item.id !== id || item.sourceId !== id || item.accountId !== actorId || item.ownerUserId !== actorId || item.state === "cancelled") { setError(result.success ? locale.t("schedule.readUnconfirmed") : result.error.message); return; }
      const next = personalScheduleDetail(item, timeZone);
      if (!next) setError(locale.t("schedule.timezoneUnavailable")); else setView(next);
    }).catch(() => { if (!controller.signal.aborted) setError(locale.t("schedule.readFailed")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [actorId, id, ready, client, revision, timeZone, locale]);
  return <AppScreen title={locale.t("personal53.detail")} backLabel={locale.t("schedule.title")} headerActions={view ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal53.edit")} onPress={() => router.push(view.editHref as Href)} style={styles.action}><Text style={styles.link}>{locale.t("personal53.edit")}</Text></Pressable> : null} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => setRevision(value => value + 1)} />}>
    {loading ? <LoadingState /> : null}{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {view ? <>{view.updatedAt === savedVersion ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{locale.t("schedule.saved")}</Text> : null}<Text style={styles.hint}>{locale.t("personal53.private")}</Text><Text accessibilityRole="header" style={styles.title}>{view.title}</Text>
      <View style={styles.timeCard}><View><Text style={styles.hint}>{locale.t("schedule.fieldStartTime")}</Text><Text style={styles.time}>{view.allDay ? locale.t("schedule.allDay") : view.startTime}</Text></View><Text style={styles.hint}>→</Text><View><Text style={styles.hint}>{locale.t("schedule.fieldEndTime")}</Text><Text style={styles.time}>{view.allDay ? locale.t("schedule.allDay") : view.endTime ?? "—"}</Text></View></View>
      <Text style={styles.hint}>{[view.date, view.endDate && view.endDate !== view.date ? view.endDate : null, view.durationMinutes !== null ? new Intl.NumberFormat(locale.language === "zh" ? "zh-CN" : locale.language === "ja" ? "ja-JP" : "en-US", { style: "unit", unit: "minute", unitDisplay: "short" }).format(view.durationMinutes) : locale.t("personal53.noEnd"), view.zone].filter(Boolean).join(" · ")}</Text>
      {view.location ? <View style={styles.row}><Text style={styles.hint}>{locale.t("schedule.fieldLocation")}</Text><Text style={styles.body}>{view.location}</Text></View> : null}
      <PersonalScheduleAssociations actorId={actorId} scopeKey={scopeKey} noteIds={view.noteIds} contactIds={view.contactIds} />
      <Text style={styles.hint}>{locale.t("personal53.unsupported")}</Text>
      {view.meetingUrl ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal53.join")} onPress={() => { void Linking.openURL(view.meetingUrl!).catch(() => setError(locale.t("schedule.operationFailed"))); }} style={styles.primary}><Text style={styles.primaryText}>{locale.t("personal53.join")}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal53.reschedule")} onPress={() => router.push(`${view.editHref}?focus=time` as Href)} style={styles.secondary}><Text style={styles.body}>{locale.t("personal53.reschedule")}</Text></Pressable>
    </> : null}
  </AppScreen>;
}
const useStyles = createThemedStyles(colors => ({
  title: { color: colors.text, fontSize: 28, fontWeight: "800" as const, marginBottom: 20 }, time: { color: colors.text, fontSize: 28, fontWeight: "800" as const }, timeCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const }, hint: { color: colors.text3, fontSize: 13, lineHeight: 20, marginBottom: 8 }, row: { minHeight: 48, borderBottomWidth: 1, borderColor: colors.border, justifyContent: "center" as const }, body: { color: colors.text, fontSize: 16 }, action: { minHeight: 44, justifyContent: "center" as const }, link: { color: colors.accent, fontSize: 16 }, error: { color: colors.rose }, primary: { minHeight: 52, justifyContent: "center" as const, alignItems: "center" as const, backgroundColor: colors.text, borderRadius: 12, marginTop: 20 }, primaryText: { color: colors.surface, fontSize: 16, fontWeight: "700" as const }, secondary: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: "center" as const, justifyContent: "center" as const, marginTop: 12 },
}));
