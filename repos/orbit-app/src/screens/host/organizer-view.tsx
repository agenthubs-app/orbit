// R17 公開主催者ページ（App）的画面本体（无数据加载、无路由，渲染测试直接用）。
import { StyleSheet, View } from "react-native";

import type { OrganizerPublicResponse, OrganizerPublicUpcoming } from "../../api/contract/organizer-profile";
import { Icon, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { Chip } from "../events/v2/venue-ui";
import { eventTone, hostDateDay, hostDateLong, type HostT } from "./host-model";
import { BtnSm, Emo, numFont, useHostStyles } from "./host-ui";
export const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

export function feeText(event: OrganizerPublicUpcoming, t: HostT): string {
  if (event.feeKind === "free") return t("pubFree");
  if (event.feeKind === "amount" && event.feeAmountYen != null) return yen(event.feeAmountYen);
  if (event.feeKind === "pay_at_door") return t("pubAtDoor");
  return t("pubExternal");
}
/** 申込页地址 → App 路由（`/e/<slug>` App 也有；`/app/events/<id>` → `/events/<id>`）。 */
export const appEventHref = (href: string) => href.replace(/^\/app(?=\/)/, "");

/** 手机版过去活动先出 3 件（b7 #38），「すべて見る」展开。 */
export const PAST_PREVIEW = 3;

export interface OrganizerBodyProps { data: OrganizerPublicResponse; t: HostT; language: string; following: boolean; busy: boolean; expanded?: boolean; onFollow: () => void; onOpen: (event: OrganizerPublicUpcoming) => void; onShare: (event: OrganizerPublicUpcoming) => void; onSeeAll: () => void }

/** 画面本体（渲染测试直接用）。 */
export function OrganizerBody({ data, t, language, following, busy, expanded = false, onFollow, onOpen, onShare, onSeeAll }: OrganizerBodyProps) {
  const { styles, colors } = useHostStyles();
  const o = usePubStyles().styles;
  const { profile, stats } = data;
  const n = (value: number) => value.toLocaleString("en-US");
  const past = expanded ? data.past : data.past.slice(0, PAST_PREVIEW);
  return (
    <View testID={data.upcoming.length || data.past.length ? "host-organizer" : "host-organizer-empty"}>
      <View style={styles.card}>
        <View style={o.head}>
          <View style={o.hostav}><UiText style={o.hostavText}>{profile.emoji ?? "🎤"}</UiText></View>
          <View style={o.headText}>
            <UiText style={[styles.lbl, o.center]}>{t("pubHost")}</UiText>
            <UiText style={o.name}>{profile.displayName}</UiText>
            {profile.bio ? <UiText style={o.bio}>{profile.bio}</UiText> : null}
            <View style={o.stats}>
              {([["pubHeld", stats.eventsHeld, "pubHeldUnit"], ["pubAttendees", stats.attendeesTotal, "pubPeopleUnit"], ["pubFollowers", stats.followers, null]] as const).map(([key, value, unit]) => (
                <View key={key} style={o.stat}><UiText style={styles.cntLbl}>{t(key)}</UiText><UiText style={o.statNum}>{n(value)}{unit ? <UiText style={o.statUnit}>{t(unit)}</UiText> : null}</UiText></View>
              ))}
            </View>
          </View>
        </View>
        <View style={o.followBox}>
          <UiPressable accessibilityRole="button" accessibilityLabel={following ? t("pubFollowing") : t("pubFollow")} accessibilityState={{ selected: following, busy }} onPress={onFollow} style={[o.xl, following ? null : styles.primary]} testID="host-organizer-follow">
            {following ? <Icon name="check" size={16} color={colors.ink} /> : <Icon name="plus" size={16} color={colors.bg} />}
            <UiText style={[o.xlText, { color: following ? colors.ink : colors.bg }]}>{following ? t("pubFollowing") : t("pubFollow")}</UiText>
          </UiPressable>
          <UiText style={[styles.lbl, o.center]}>{t("pubFollowHint")}</UiText>
        </View>
      </View>
      <View style={o.secH}><UiText style={o.b15}>{t("pubUpcoming")}</UiText></View>
      {data.upcoming.length ? data.upcoming.map((event) => (
        <View key={event.eventId} style={o.pev} testID={`host-pub-${event.eventId}`}>
          <View style={[styles.row, styles.between]}>
            <Emo emoji={event.emoji ?? "📅"} tone={eventTone(event.emoji, event.eventId)} />
            <View>{event.registrationOpen ? (event.remainingSeats != null ? <Chip label={t("pubSeats", { n: event.remainingSeats })} tone="blue" /> : null) : <Chip label={t("pubNotOpen")} />}</View>
          </View>
          <UiText style={[o.b15, o.mt12]}>{event.title}</UiText>
          <UiText style={[styles.lbl, o.mt3]}>{[hostDateLong(event.startsAt, language, t), event.venue, feeText(event, t)].filter(Boolean).join(" · ")}</UiText>
          <View style={[styles.row, o.gap8, o.mt14]}>
            <BtnSm label={t("pubDetail")} primary onPress={() => onOpen(event)} />
            <UiPressable accessibilityRole="button" accessibilityLabel={t("pubShare")} onPress={() => onShare(event)} style={[styles.btnSm, styles.ghost]}><Icon name="share" size={16} color={colors.ink2} /><UiText style={[styles.btnSmText, { color: colors.ink2 }]}>{t("pubShare")}</UiText></UiPressable>
          </View>
        </View>
      )) : (
        <View style={[styles.card, o.mt10]} testID="host-pub-none">
          <View style={o.none}>
            <Emo emoji="🗓️" tone="apricot" />
            <View style={o.noneText}><UiText style={[o.b14, o.center]}>{t("pubNoneTitle")}</UiText><UiText style={[styles.lbl, o.center]}>{t("pubNoneSub")}</UiText></View>
            <BtnSm label={t("pubFollowNotify")} icon="bell" onPress={onFollow} />
          </View>
          <View style={o.ghosts}>
            <View style={o.ghostRow}><UiText style={o.ghostText}>{t("pubGhost1")}</UiText></View>
            <View style={[o.ghostRow, o.mt8]}><UiText style={o.ghostText}>{t("pubGhost2")}</UiText></View>
          </View>
        </View>
      )}
      {data.past.length ? (
        <View>
          <View style={[styles.row, styles.between, o.pastH]}><UiText style={o.b15}>{t("pubPast")}</UiText><UiText style={styles.lbl}>{t("pubPastCount", { n: data.pastTotal })}</UiText></View>
          <View style={o.pastList}>
            {past.map((event) => (
              <View key={event.eventId} style={o.past}>
                <Emo emoji={event.emoji ?? "📅"} tone={eventTone(event.emoji, event.eventId)} small />
                <View style={styles.grow}><UiText style={styles.b13} numberOfLines={1}>{event.title}</UiText><UiText style={styles.lbl}>{t("pubPastLine", { d: hostDateDay(event.startsAt, language, t), n: event.attended })}</UiText></View>
              </View>
            ))}
          </View>
          {data.pastTotal > past.length && !expanded ? <UiPressable accessibilityRole="button" accessibilityLabel={t("pubSeeAll", { n: data.pastTotal })} onPress={onSeeAll} style={[styles.btn, styles.ghost, o.seeAll]}><UiText style={[styles.btnText, { color: colors.ink2 }]}>{t("pubSeeAll", { n: data.pastTotal })}</UiText></UiPressable> : null}
        </View>
      ) : null}
      <UiText style={[styles.lbl, o.center, o.footer]}>{t("pubFooter")}</UiText>
    </View>
  );
}

// kit（b7 #36–#38）：.hostav.sm 64 r22 32 · 名前 21/900 · .sub lh1.75 mt6 · .grid3 gap8 mt14 · .stat surface-2 r16 10/14 · b 22/800 ·
// .btn.xl 50 14.5 · 区块标题 15/700 margin 22 2 0 · .pev r22 p18 mt10 · .past r18 p12 gap12 · .ghost-row 46 r14 1.5 dashed。
export const usePubStyles = createThemedStyles((colors) => StyleSheet.create({
  head: { alignItems: "center" },
  hostav: { alignItems: "center", backgroundColor: colors.macLav, borderRadius: 22, height: 64, justifyContent: "center", width: 64 },
  hostavText: { fontSize: 32, lineHeight: 40 },
  headText: { alignSelf: "stretch", marginTop: 10 },
  center: { textAlign: "center" },
  name: { color: colors.ink, fontSize: 21, fontWeight: "900", lineHeight: 31.5, textAlign: "center" },
  bio: { color: colors.ink2, fontSize: 12.5, lineHeight: 21.875, marginTop: 6, textAlign: "center" },
  stats: { flexDirection: "row", gap: 8, marginTop: 14 },
  stat: { backgroundColor: colors.surface2, borderRadius: 16, flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 10 },
  statNum: { color: colors.ink, fontFamily: numFont, fontSize: 22, fontWeight: "800", lineHeight: 26.4 },
  statUnit: { color: colors.ink3, fontSize: 12 },
  followBox: { gap: 8, marginTop: 14 },
  xl: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 50, justifyContent: "center" },
  xlText: { fontSize: 14.5, fontWeight: "700", lineHeight: 21.75 },
  secH: { marginHorizontal: 2, marginTop: 22 },
  b15: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22.5 },
  b14: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  pev: { backgroundColor: colors.surface, borderRadius: 22, marginTop: 10, padding: 18 },
  mt3: { marginTop: 3 },
  mt8: { marginTop: 8 },
  mt10: { marginTop: 10 },
  mt12: { marginTop: 12 },
  mt14: { marginTop: 14 },
  gap8: { gap: 8 },
  none: { alignItems: "center", gap: 14 },
  noneText: { alignSelf: "stretch" },
  ghosts: { marginTop: 14 },
  ghostRow: { alignItems: "center", borderColor: colors.surface3, borderRadius: 14, borderStyle: "dashed", borderWidth: 1.5, flexDirection: "row", height: 46, paddingHorizontal: 14 },
  ghostText: { color: colors.ink4, fontSize: 12, lineHeight: 18 },
  pastH: { marginBottom: 4, marginHorizontal: 2, marginTop: 22 },
  pastList: { gap: 10 },
  past: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 18, flexDirection: "row", gap: 12, padding: 12 },
  seeAll: { alignSelf: "stretch", height: 40, marginTop: 8 },
  footer: { marginTop: 18 },
}));
