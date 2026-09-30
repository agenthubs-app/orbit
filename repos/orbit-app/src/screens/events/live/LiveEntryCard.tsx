/** Sprint 0107 LiveEntry: 「进入现场」 on event detail for registered attendees. */
import { StyleSheet, Pressable, Text, View } from "react-native";
import type { OrbitLanguage } from "../../../api/contract/language";
import { createControlStyles } from "../../../design/controls";
import { radius } from "../../../design/tokens";
import { createThemedStyles } from "../../../design/theme";
import { liveFont } from "./live-theme";

const copy = {
  zh: { enter: "进入现场", inProgress: "活动进行中", today: (time: string) => `今天 ${time} 开始`, pinnedBody: "签到、推荐的人和你的座位都在现场页。", body: "活动当天在现场页签到、看推荐、交换名片。" },
  en: { enter: "Enter live page", inProgress: "Event in progress", today: (time: string) => `Starts today at ${time}`, pinnedBody: "Check-in, recommended people and your seat are on the live page.", body: "On the day, check in, see recommendations and exchange cards on the live page." },
  ja: { enter: "会場ページへ", inProgress: "開催中", today: (time: string) => `本日 ${time} 開始`, pinnedBody: "チェックイン・おすすめ・あなたの席は会場ページにあります。", body: "当日は会場ページでチェックイン・おすすめ確認・名刺交換ができます。" }
};

export function LiveEntryCard({ language, pinned, inProgress, startTime, onEnter }: { language: OrbitLanguage; pinned: boolean; inProgress: boolean; startTime: string; onEnter: () => void }) {
  const { styles } = useStyles();
  const c = copy[language];
  if (!pinned) return <View style={styles.plain}>
    <Text style={styles.body}>{c.body}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={c.enter} onPress={onEnter} style={styles.secondary}><Text style={styles.secondaryText}>{c.enter}</Text></Pressable>
  </View>;
  return <View testID="event-live-entry" style={styles.pinned}>
    <View style={styles.statusRow}><View style={styles.dot} /><Text style={styles.status}>{inProgress ? c.inProgress : c.today(startTime)}</Text></View>
    <Text style={styles.body}>{c.pinnedBody}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={c.enter} onPress={onEnter} style={styles.primary}><Text style={styles.primaryText}>{c.enter}</Text></Pressable>
  </View>;
}

const useStyles = createThemedStyles(colors => {
  const controls = createControlStyles(colors);
  return StyleSheet.create({
    pinned: { gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.liveSoft },
    plain: { gap: 10 },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.live },
    status: { color: colors.live, fontFamily: liveFont, fontSize: 14, fontWeight: "700" },
    body: { color: colors.text2, fontFamily: liveFont, fontSize: 13, lineHeight: 20 },
    primary: { ...controls.primaryButton }, primaryText: { ...controls.primaryButtonText, fontFamily: liveFont },
    secondary: { ...controls.secondaryButton }, secondaryText: { ...controls.secondaryButtonText, fontFamily: liveFont }
  });
});
