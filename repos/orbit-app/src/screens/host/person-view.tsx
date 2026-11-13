// 参加者詳細（App；Web `orbit-2026/host/HostPersonDrawer.tsx` 的移植，内容与顺序相同）。画面本体，无数据加载，渲染测试直接用：
// 头部（名字 / 公司 · 职位 / 状态 · 受付 · 参加歴 · 申込日或「申込フォームなしで参加登録」）→ 申込時の回答 → プロフィール
// （只列填了的项）+ 話したいテーマ / 提供できること / 探していること → マッチング結果（各轮的桌、主题、理由、同桌；
// おすすめの相手 先显示 5 位，可展开；未公开时一句说明）。
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { HostPeopleBucket, HostPersonResponse } from "../../api/contract/host-console";
import { UiText } from "../../components/ui";
import { avatarTone } from "../../components/ui/Avatar";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { Avatar, Chip, type Tone } from "../events/v2/venue-ui";
import { hostDateShort, hostTime, type HostT } from "./host-model";
import { BtnSm, numFont, useHostStyles } from "./host-ui";

export const RECS_FIRST = 5;

const STATUS_TONE: Record<HostPeopleBucket, Tone | null> = { approved: "teal", pending: "apricot", rejected: null, waitlisted: "blue" };
/** 申込資料的固定键（服务端给键，画面翻译）；不认识的键原样显示。 */
const PROFILE_KEYS: ReadonlySet<string> = new Set(["positioning", "industry", "targetAttendees", "valueOffered", "desiredOutcome", "energyStyle", "experienceHighlight", "followUpPreference", "company", "role", "seniority"]);

/** 头部状态旁的一串小字：受付時刻 · 受付番号 · 参加歴 · 申込日（或申込なし）。 */
export function personMeta(data: HostPersonResponse, t: HostT): string[] {
  return [
    data.checkedInAt ? t("pdCheckedIn", { time: hostTime(data.checkedInAt) }) : null,
    data.receptionNumber ? t("pdReception", { n: data.receptionNumber }) : null,
    data.attendCount === 0 ? t("pFirstTime") : t("pTimes", { n: data.attendCount }),
    data.source === "member" ? t("pdNoForm") : data.submittedAt ? t("pdApplied", { date: hostDateShort(data.submittedAt, t) }) : null,
  ].filter((item): item is string => Boolean(item));
}

export function HostPersonView({ data, t }: { data: HostPersonResponse; t: HostT }) {
  const { styles: h } = useHostStyles();
  const { styles } = usePersonStyles();
  const [allRecs, setAllRecs] = useState(false);
  const meta = personMeta(data, t);
  const recs = data.matching?.recommendations ?? [];
  const shownRecs = allRecs ? recs : recs.slice(0, RECS_FIRST);
  const chips = ([["pdTopics", data.topics], ["pdOffers", data.offers], ["pdNeeds", data.needs]] as const).filter(([, items]) => items.length > 0);
  const tone = STATUS_TONE[data.status];
  return (
    <View style={styles.body} testID={`host-person-${data.actorId}`}>
      <View style={styles.head}>
        <Avatar initial={data.initial} tone={avatarTone(data.name)} size="lg" />
        <View style={h.grow}>
          <UiText style={styles.name} accessibilityRole="header">{data.name}</UiText>
          {data.org || data.role ? <UiText style={styles.orgLine}>{[data.org, data.role].filter(Boolean).join(" · ")}</UiText> : null}
          <View style={styles.meta}>
            <View><Chip label={t(`pdStatus_${data.status}`)} {...(tone ? { tone } : {})} /></View>
            {meta.map((item) => <UiText key={item} style={h.lbl}>{item}</UiText>)}
          </View>
        </View>
      </View>

      {data.hostAnswers.length ? (
        <View style={styles.section} testID="host-person-answers">
          <UiText style={styles.h} accessibilityRole="header">{t("pdHostAnswers")}</UiText>
          {data.hostAnswers.map((item, index) => <QA key={index} label={item.label} value={item.value} />)}
        </View>
      ) : null}

      {data.profile.length || chips.length ? (
        <View style={styles.section} testID="host-person-profile">
          <UiText style={styles.h} accessibilityRole="header">{t("pdProfile")}</UiText>
          {data.profile.map((item) => <QA key={item.label} label={PROFILE_KEYS.has(item.label) ? t(`pf_${item.label}`) : item.label} value={item.value} />)}
          {chips.map(([label, items]) => (
            <View key={label} style={styles.chipsRow}>
              <UiText style={styles.dt}>{t(label)}</UiText>
              <View style={styles.chips}>{items.map((item) => <View key={item} style={styles.chip}><UiText style={styles.chipText}>{item}</UiText></View>)}</View>
            </View>
          ))}
        </View>
      ) : null}

      {data.matching ? (
        <View style={styles.section} testID={`host-person-matching-${data.matching.published ? "published" : "none"}`}>
          <UiText style={styles.h} accessibilityRole="header">{t("pdMatching")}</UiText>
          {!data.matching.published ? <UiText style={styles.note}>{t("pdNotPublished")}</UiText>
            : data.matching.tables.length === 0 && recs.length === 0 ? <UiText style={styles.note}>{t("pdNotSeated")}</UiText> : null}
          {data.matching.tables.map((table) => (
            <View key={table.round} style={styles.table}>
              <View style={[h.row, styles.tableHead]}>
                <View style={styles.tno}><UiText style={styles.tnoText}>{table.table}</UiText></View>
                <View style={h.grow}>
                  <UiText style={h.lbl}>{t("pdRoundTable", { n: table.round, t: table.table })}</UiText>
                  {table.theme ? <UiText style={styles.theme}>{table.theme}</UiText> : null}
                </View>
              </View>
              {table.why ? <UiText style={styles.why}>{table.why}</UiText> : null}
              {table.mates.length ? (
                <View style={styles.chips}>
                  <UiText style={styles.dt}>{t("pdMates")}</UiText>
                  {table.mates.map((mate) => (
                    <View key={mate.participantId} style={[styles.chip, styles.mate]}>
                      <UiText style={styles.chipText}>{mate.name}{mate.org ? <UiText style={styles.chipSmall}>{`  ${mate.org}`}</UiText> : null}</UiText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          {recs.length ? (
            <View style={styles.recs} testID="host-person-recs">
              <UiText style={styles.dt}>{t("pdRecs")}</UiText>
              {shownRecs.map((rec) => (
                <View key={rec.participantId} style={styles.rec}>
                  <View style={styles.rank}><UiText style={styles.rankText}>{rec.rank}</UiText></View>
                  <View style={h.grow}>
                    <UiText style={styles.recName}>{rec.name}{rec.org || rec.role ? <UiText style={h.lbl}>{` · ${[rec.org, rec.role].filter(Boolean).join(" · ")}`}</UiText> : null}</UiText>
                    {rec.reason ? <UiText style={styles.why}>{rec.reason}</UiText> : null}
                  </View>
                </View>
              ))}
              {recs.length > RECS_FIRST && !allRecs ? <View style={styles.more}><BtnSm label={t("pdShowAll", { n: recs.length })} onPress={() => setAllRecs(true)} testID="host-person-recs-all" /></View> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function QA({ label, value }: { label: string; value: string }) {
  const { styles } = usePersonStyles();
  return (
    <View>
      <UiText style={styles.dt}>{label}</UiText>
      <UiText style={styles.dd} selectable>{value}</UiText>
    </View>
  );
}

/** 读取中的占位（同 Web .loading：三块 56 高）。 */
export function HostPersonLoading() {
  const { styles } = usePersonStyles();
  return <View style={styles.loading} accessibilityState={{ busy: true }} testID="host-person-loading"><View style={styles.loadingRow} /><View style={styles.loadingRow} /><View style={styles.loadingRow} /></View>;
}

// Web person.module.css 的数值（换成 App 的 host 字号档：caption → 12、meta → 13、body-sm → 15）：
// body gap 18 · section 上分隔线 pt16 gap10 · 卓 p12 r-tile surface-2 · 卓号 32 r-input-sm plum-100/900 · 推荐序号 24 圆 plum-100/900。
const usePersonStyles = createThemedStyles((colors) => StyleSheet.create({
  body: { gap: 18, paddingBottom: 8 },
  head: { alignItems: "flex-start", flexDirection: "row", gap: 14 },
  name: { color: colors.ink, fontSize: 19, fontWeight: "800", lineHeight: 27 },
  orgLine: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22, marginTop: 2 },
  meta: { alignItems: "center", columnGap: 10, flexDirection: "row", flexWrap: "wrap", marginTop: 8, rowGap: 6 },
  section: { borderTopColor: colors.line, borderTopWidth: 1, gap: 10, paddingTop: 16 },
  h: { color: colors.ink, fontSize: 15, fontWeight: "800", lineHeight: 22 },
  dt: { color: colors.ink3, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  dd: { color: colors.ink, fontSize: 15, lineHeight: 24, marginTop: 2 },
  chipsRow: { gap: 6 },
  chips: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  mate: { backgroundColor: colors.surface },
  chipText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  chipSmall: { color: colors.ink3, fontSize: 12 },
  note: { backgroundColor: colors.surface2, borderRadius: radius.tile, color: colors.ink3, fontSize: 13, lineHeight: 20, overflow: "hidden", padding: 12 },
  table: { backgroundColor: colors.surface2, borderRadius: radius.tile, gap: 8, padding: 12 },
  tableHead: { gap: 10 },
  tno: { alignItems: "center", backgroundColor: colors.plum100, borderRadius: radius.inputSm, height: 32, justifyContent: "center", width: 32 },
  tnoText: { color: colors.plum900, fontFamily: numFont, fontSize: 15, fontWeight: "900", lineHeight: 20 },
  theme: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  why: { color: colors.ink2, fontSize: 13, lineHeight: 20, marginTop: 2 },
  recs: { gap: 8 },
  rec: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  rank: { alignItems: "center", backgroundColor: colors.plum100, borderRadius: radius.pill, height: 24, justifyContent: "center", width: 24 },
  rankText: { color: colors.plum900, fontFamily: numFont, fontSize: 12, fontWeight: "700", lineHeight: 16 },
  recName: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  more: { alignItems: "flex-start" },
  loading: { gap: 12 },
  loadingRow: { backgroundColor: colors.surface2, borderRadius: radius.tile, height: 56 },
}));
