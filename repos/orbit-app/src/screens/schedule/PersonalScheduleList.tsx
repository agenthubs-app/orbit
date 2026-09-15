import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { personalScheduleList, personalSchedulePath } from "../../api/personal-schedule";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { localParts } from "../../time/date-time";
import { createThemedStyles } from "../../design/theme";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function PersonalScheduleList() {
  const auth = useOrbitAuthSession(); const { baseUrl } = useOrbitApiBaseUrl(); const actor = auth.user?.id ?? "";
  const locale = useOrbitLocale();
  const { timeZone } = useOrbitTimeZone(); const router = useRouter(); const { styles } = useStyles();
  const state = useApiResource<unknown>(personalSchedulePath(), () => false, { scopeKey: JSON.stringify([actor, baseUrl]), cachePolicy: "network-only" });
  useFocusEffect(useCallback(() => { state.refresh(); }, [state.refresh]));
  const ready = state.kind === "success" || state.kind === "empty";
  const items = ready ? personalScheduleList(state.data, actor) : null;
  return <View style={styles.section}>
    <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{locale.t("schedule.personalTitle")}</Text><Pressable accessibilityRole="button" onPress={() => router.push("/schedule/personal/new" as Href)} style={styles.button}><Text style={styles.link}>{locale.t("schedule.newPersonal")}</Text></Pressable></View>
    {state.kind === "loading" ? <LoadingState /> : null}
    {state.kind === "failure" || state.kind === "offline" || (ready && !items) ? <ErrorState title={locale.t("schedule.personalLoadFailure")} message={locale.t("schedule.personalLoadFailureBody")} /> : null}
    <Pressable accessibilityRole="button" onPress={state.refresh} style={styles.button}><Text style={styles.link}>{locale.t("schedule.refreshPersonal")}</Text></Pressable>
    {items?.length === 0 ? <Text style={styles.detail}>{locale.t("schedule.emptyPersonal")}</Text> : null}
    {items?.map(item => { const parts = localParts(item.startsAt, timeZone); return <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(`/schedule/personal/${encodeURIComponent(item.id)}` as Href)} style={styles.row}>
      <Text style={styles.title}>{item.title}</Text><Text style={styles.detail}>{[parts.date + " " + parts.time, item.location, locale.t(item.state === "ended" ? "schedule.stateEnded" : item.state === "ongoing" ? "schedule.stateOngoing" : "schedule.stateScheduled")].filter(Boolean).join(" · ")}</Text>
    </Pressable>; })}
  </View>;
}
const useStyles = createThemedStyles(colors => ({ section: { marginTop: 24, gap: 8 }, heading: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }, title: { color: colors.text, fontSize: 16, fontWeight: "600" as const }, detail: { color: colors.text2, fontSize: 14, lineHeight: 22 }, link: { color: colors.accent, fontSize: 14 }, button: { minHeight: 44, justifyContent: "center" as const }, row: { minHeight: 64, gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border } }));
