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

export function PersonalScheduleList() {
  const auth = useOrbitAuthSession(); const { baseUrl } = useOrbitApiBaseUrl(); const actor = auth.user?.id ?? "";
  const { timeZone } = useOrbitTimeZone(); const router = useRouter(); const { styles } = useStyles();
  const state = useApiResource<unknown>(personalSchedulePath(), () => false, { scopeKey: JSON.stringify([actor, baseUrl]), cachePolicy: "network-only" });
  useFocusEffect(useCallback(() => { state.refresh(); }, [state.refresh]));
  const ready = state.kind === "success" || state.kind === "empty";
  const items = ready ? personalScheduleList(state.data, actor) : null;
  return <View style={styles.section}>
    <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>个人日程</Text><Pressable accessibilityRole="button" onPress={() => router.push("/schedule/personal/new" as Href)} style={styles.button}><Text style={styles.link}>新建个人日程</Text></Pressable></View>
    {state.kind === "loading" ? <LoadingState /> : null}
    {state.kind === "failure" || state.kind === "offline" || (ready && !items) ? <ErrorState title="个人日程加载失败" message="请重新读取，待办列表不受影响。" /> : null}
    <Pressable accessibilityRole="button" onPress={state.refresh} style={styles.button}><Text style={styles.link}>刷新个人日程</Text></Pressable>
    {items?.length === 0 ? <Text style={styles.detail}>暂无个人日程</Text> : null}
    {items?.map(item => { const parts = localParts(item.startsAt, timeZone); return <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(`/schedule/personal/${encodeURIComponent(item.id)}` as Href)} style={styles.row}>
      <Text style={styles.title}>{item.title}</Text><Text style={styles.detail}>{[parts.date + " " + parts.time, item.location, item.state === "ended" ? "已结束" : item.state === "ongoing" ? "进行中" : "已安排"].filter(Boolean).join(" · ")}</Text>
    </Pressable>; })}
  </View>;
}
const useStyles = createThemedStyles(colors => ({ section: { marginTop: 24, gap: 8 }, heading: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }, title: { color: colors.text, fontSize: 16, fontWeight: "600" as const }, detail: { color: colors.text2, fontSize: 14, lineHeight: 22 }, link: { color: colors.accent, fontSize: 14 }, button: { minHeight: 44, justifyContent: "center" as const }, row: { minHeight: 64, gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border } }));
