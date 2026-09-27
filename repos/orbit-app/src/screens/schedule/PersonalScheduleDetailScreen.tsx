import { useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { AppScreen } from "../../components/AppScreen";
import { LoadingState } from "../../components/LoadingState";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { OfflineNotice } from "../../components/OfflineNotice";
import { usePersonalScheduleItem } from "./personal-schedule-source";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createThemedStyles } from "../../design/theme";
import { personalScheduleDetail } from "../../view-models/personal-schedule-detail";
import { PersonalScheduleAssociations } from "./PersonalScheduleAssociations";
import { PersonalScheduleRules } from "./PersonalScheduleRules";
import { personalScheduleDraft } from "../../view-models/personal-schedule-editor";

export function PersonalScheduleDetailScreen() {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const params = useLocalSearchParams<{ id?: string | string[]; saved?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && !!auth.actorId;
  const scopeKey = JSON.stringify([auth.actorId, server.baseUrl, id, ready]);
  return <Detail key={scopeKey} actorId={auth.actorId ?? ""} id={id} ready={ready} scopeKey={scopeKey} savedVersion={(Array.isArray(params.saved) ? params.saved[0] : params.saved) ?? ""} />;
}
function Detail({ actorId, id, ready, scopeKey, savedVersion }: { actorId: string; id: string; ready: boolean; scopeKey: string; savedVersion: string }) {
  const { timeZone } = useOrbitTimeZone(); const locale = useOrbitLocale(); const router = useRouter(); const { styles } = useStyles();
  // Native reads the device mirror (sprint 0108); the browser is mirror-first or the network.
  const source = usePersonalScheduleItem({ actorId, ready, scopeKey, id });
  const [view, setView] = useState<ReturnType<typeof personalScheduleDetail>>(null); const [error, setError] = useState("");
  const [rules, setRules] = useState<ReturnType<typeof personalScheduleDraft> | null>(null);
  const loading = source.loading;
  useEffect(() => {
    const item = source.item;
    if (!item) { setView(null); setRules(null); setError(source.errorKey ? locale.t(source.errorKey) : source.errorText); return; }
    if (item.state === "cancelled") { setView(null); setRules(null); setError(locale.t("schedule.readUnconfirmed")); return; }
    const next = personalScheduleDetail(item, timeZone);
    if (!next) { setView(null); setRules(null); setError(locale.t("schedule.timezoneUnavailable")); } else { setError(""); setView(next); setRules(personalScheduleDraft(item, next.zone)); }
  }, [source.item, source.errorKey, source.errorText, timeZone, locale]);
  return <AppScreen title={locale.t("personal53.detail")} backLabel={locale.t("schedule.title")} headerActions={view ? <Pressable accessibilityRole="button" accessibilityLabel={source.offline ? `${locale.t("personal53.edit")}，${locale.t("sync.needsNetwork")}` : locale.t("personal53.edit")} accessibilityState={{ disabled: source.offline }} disabled={source.offline} onPress={() => router.push(view.editHref as Href)} style={styles.action}><Text style={[styles.link, source.offline && styles.disabled]}>{locale.t(source.offline ? "sync.needsNetwork" : "personal53.edit")}</Text></Pressable> : null} refreshControl={<RefreshControl refreshing={loading} onRefresh={source.refresh} />}>
    {source.offline ? <OfflineNotice lastSyncedAt={source.lastSyncedAt} /> : null}
    {loading ? <LoadingState /> : null}{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {view ? <>{view.updatedAt === savedVersion ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{locale.t("schedule.saved")}</Text> : null}<Text style={styles.hint}>{locale.t("personal53.private")}</Text><Text accessibilityRole="header" style={styles.title}>{view.title}</Text>
      <View style={styles.timeCard}><View><Text style={styles.hint}>{locale.t("schedule.fieldStartTime")}</Text><Text style={styles.time}>{view.allDay ? locale.t("schedule.allDay") : view.startTime}</Text></View><Text style={styles.hint}>→</Text><View><Text style={styles.hint}>{locale.t("schedule.fieldEndTime")}</Text><Text style={styles.time}>{view.allDay ? locale.t("schedule.allDay") : view.endTime ?? "—"}</Text></View></View>
      <Text style={styles.hint}>{[view.date, view.endDate && view.endDate !== view.date ? view.endDate : null, view.durationMinutes !== null ? locale.t("home.durationMinutes", { count: view.durationMinutes }) : locale.t("personal53.noEnd"), view.zone].filter(Boolean).join(" · ")}</Text>
      {view.location ? <View style={styles.row}><Text style={styles.hint}>{locale.t("schedule.fieldLocation")}</Text><Text style={styles.body}>{view.location}</Text></View> : null}
      <PersonalScheduleAssociations actorId={actorId} scopeKey={scopeKey} noteIds={view.noteIds} contactIds={view.contactIds} />
      {rules ? <PersonalScheduleRules draft={rules} readOnly /> : null}
      <Text style={styles.hint}>{locale.t("personal60.localOnly")}</Text>
      {view.meetingUrl ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal53.join")} onPress={() => { void Linking.openURL(view.meetingUrl!).catch(() => setError(locale.t("schedule.operationFailed"))); }} style={styles.primary}><Text style={styles.primaryText}>{locale.t("personal53.join")}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={source.offline ? `${locale.t("personal53.reschedule")}，${locale.t("sync.needsNetwork")}` : locale.t("personal53.reschedule")} accessibilityState={{ disabled: source.offline }} disabled={source.offline} onPress={() => router.push(`${view.editHref}?focus=time` as Href)} style={[styles.secondary, source.offline && styles.disabledBox]}><Text style={styles.body}>{locale.t("personal53.reschedule")}</Text></Pressable>
    </> : null}
  </AppScreen>;
}
const useStyles = createThemedStyles(colors => ({
  title: { color: colors.text, fontSize: 28, fontWeight: "800" as const, marginBottom: 20 }, time: { color: colors.text, fontSize: 28, fontWeight: "800" as const }, timeCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const }, hint: { color: colors.text3, fontSize: 13, lineHeight: 20, marginBottom: 8 }, row: { minHeight: 48, borderBottomWidth: 1, borderColor: colors.border, justifyContent: "center" as const }, body: { color: colors.text, fontSize: 16 }, action: { minHeight: 44, justifyContent: "center" as const }, link: { color: colors.accent, fontSize: 16 }, disabled: { color: colors.text4 }, disabledBox: { opacity: 0.4 }, error: { color: colors.rose }, primary: { minHeight: 52, justifyContent: "center" as const, alignItems: "center" as const, backgroundColor: colors.text, borderRadius: 12, marginTop: 20 }, primaryText: { color: colors.surface, fontSize: 16, fontWeight: "700" as const }, secondary: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: "center" as const, justifyContent: "center" as const, marginTop: 12 },
}));
