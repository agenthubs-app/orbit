// R27 参加の取り消し（App；b3 #42 kit .sheet.actsheet）：🥂 + 「〈标题〉の参加を取り消しますか？」+ 日時 · 会場，后果 3 行，
// 珊瑚「参加を取り消す」在上、「参加を続ける」在下（读屏焦点从「続ける」开始，同 ActionSheet）。Web 同内容为居中确认框（b12 #374）。
import { StyleSheet, View } from "react-native";

import type { EventOverviewResponse } from "../../../api/contract/event-overview";
import { BottomSheet, Button, Icon, UiText, type IconName } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { tokyo, weekday, type JourneyT } from "./journey-model";

/** 「CFO Night Tokyo vol.18」→「CFO Night Tokyo」（标题去掉期号，同 Web CancelDialog）。 */
const shortTitle = (title: string) => title.replace(/\s*vol\.?\s*\d+\s*$/i, "").trim() || title;

export function CancelSheet({ visible, event, t, language, busy, onKeep, onCancel }: { visible: boolean; event: EventOverviewResponse; t: JourneyT; language: string; busy: boolean; onKeep: () => void; onCancel: () => void }) {
  const { styles, colors } = useStyles();
  const p = tokyo(event.startsAt);
  const when = p ? t("dateWeekTime", { d: p.day, hm: `${p.hh}:${String(p.mm).padStart(2, "0")}`, m: p.month, wd: weekday(language, p.weekday) }) : "";
  const place = (event.venue ?? "").trim().split(/\s+/)[0] ?? "";
  const title = t("cancelTitle", { title: shortTitle(event.title) });
  const effects: { icon: IconName; text: string }[] = [
    { icon: "bell", text: t("cancelNotify") },
    ...(event.priceYen ? [{ icon: "ticket" as const, text: t("cancelFee", { fee: event.priceYen.toLocaleString("ja-JP") }) }] : []),
    { icon: "users", text: t("cancelKeep", { n: event.attendees.filter((item) => item.wanted).length }) },
  ];
  return (
    <BottomSheet visible={visible} onClose={onKeep} accessibilityLabel={title}>
      <View style={styles.head} testID="events-cancel-sheet">
        <View style={[styles.emo, { backgroundColor: colors.macLav }]}><UiText style={styles.emoText}>{event.emoji}</UiText></View>
        <View style={styles.grow}>
          <UiText accessibilityRole="header" style={styles.title}>{title}</UiText>
          <UiText style={styles.lbl}>{[when, place].filter(Boolean).join(" · ")}</UiText>
        </View>
      </View>
      <View style={styles.effects}>
        {effects.map((effect) => (
          <View key={effect.icon} style={styles.effect}><Icon name={effect.icon} size={16} color={colors.ink} /><UiText style={styles.effectText}>{effect.text}</UiText></View>
        ))}
      </View>
      <View style={styles.buttons}>
        <Button block label={t("cancelDo")} variant="danger" loading={busy} onPress={onCancel} />
        <Button block label={t("cancelKeepGoing")} variant="secondary" onPress={onKeep} />
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  head: { alignItems: "center", flexDirection: "row", gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoText: { fontSize: 21, lineHeight: 26 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 22.4 },
  lbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
  effects: { gap: 8, marginVertical: 16 },
  effect: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
  effectText: { color: colors.ink, flex: 1, fontSize: 12.5, lineHeight: 18.75 },
  buttons: { gap: 8 },
}));
