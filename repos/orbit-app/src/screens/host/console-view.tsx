// R17 イベント運営（App）的画面本体（无数据加载、无路由，渲染测试直接用）：段 chip、概要、レポート摘要、マッチング結果、参加者 · 審査。
import { ScrollView, StyleSheet, View } from "react-native";

import type { HostMatchingResponse, HostOverviewResponse, HostPeopleBucket, HostPeopleResponse, HostPeopleRow } from "../../api/contract/host-console";
import { Icon, Segmented, UiPressable, UiText } from "../../components/ui";
import { avatarTone } from "../../components/ui/Avatar";
import { createThemedStyles } from "../../design/theme";
import { Avatar, Chip } from "../events/v2/venue-ui";
import { hostDateShort, hostTime, sameTokyoDay, type HostSeg, type HostT } from "./host-model";
import { Bar, BtnSm, Btn, Emo, numFont, PcCard, useHostStyles } from "./host-ui";
export const SEG_LABEL: Record<HostSeg, string> = { "check-in": "tCheckIn", matching: "tMatching", overview: "tOverview", people: "tPeople", report: "tReport" };

export const CHIP_SEGS: readonly HostSeg[] = ["overview", "matching", "people", "check-in", "report"];

/** kit .carousel 里的 chip 段（padding 7/14、12.5；当前段 ink 底）。 */
export function SegChips({ seg, t, pending, onSeg }: { seg: HostSeg; t: HostT; pending: number | null; onSeg: (seg: HostSeg) => void }) {
  const { styles } = useConsoleStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={styles.carouselIn} testID="host-console-segs">
      {CHIP_SEGS.map((key) => {
        const on = key === seg;
        const label = key === "people" && pending ? `${t(SEG_LABEL[key])} ${pending}` : t(SEG_LABEL[key]);
        return (
          <UiPressable key={key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={() => onSeg(key)} style={[styles.segChip, on ? styles.segChipOn : null]}>
            <UiText style={[styles.segChipText, on ? styles.segChipTextOn : null]}>{label}</UiText>
          </UiPressable>
        );
      })}
    </ScrollView>
  );
}

export interface OverviewProps { data: HostOverviewResponse; t: HostT; onCheckIn: () => void; onResults: () => void; onPublish: () => void; onReview: () => void; onNotify: () => void; onEditOnPc?: () => void }

/** 概要（b6 #23）：三格 + 到着条 + 受付を開く · マッチング卡 · 要対応 · 💻。 */
export function OverviewBody({ data, t, onCheckIn, onResults, onPublish, onReview, onNotify, onEditOnPc }: OverviewProps) {
  const { styles, colors } = useHostStyles();
  const c = useConsoleStyles().styles;
  const m = data.matching;
  const matchingChip = m.state === "published" ? { label: t("appPublished"), tone: "teal" as const } : m.state === "draft" ? { label: t("sDraft"), tone: "apricot" as const } : m.state === "generating" ? { label: t("appGenerating"), tone: "lav" as const } : { label: t("appNotGenerated"), tone: undefined };
  const review = data.todos.find((todo) => todo.kind === "review_pending");
  const profile = data.todos.find((todo) => todo.kind === "profile_incomplete");
  return (
    <View testID="host-overview">
      <View style={styles.card}>
        <View style={[styles.cnt3, c.cnt3Top]}>
          <View style={styles.cnt}><UiText style={styles.cntLbl}>{t("kApplied")}</UiText><UiText style={styles.cntNum}>{data.applied}</UiText></View>
          <View style={styles.cnt}><UiText style={styles.cntLbl}>{t("oMatchable")}</UiText><UiText style={styles.cntNum}>{data.matchable}</UiText></View>
          <View style={styles.cnt}><UiText style={styles.cntLbl}>{t("cCheckedIn")}</UiText><UiText style={styles.cntNum}>{data.checkedIn}</UiText></View>
        </View>
        <Bar share={data.applied ? data.checkedIn / data.applied : 0} />
        <UiText style={styles.lbl}>{t("appArrival", { a: data.checkedIn, n: data.applied, r: data.arrivalRate ?? 0 })}</UiText>
        {/* A draft is not open yet: 打开签到 made no sense; say it is unpublished and where to publish it. */}
        {data.event.status === "draft" ? (
          <View style={c.mt12} testID="host-overview-draft">
            <UiText style={styles.b13}>{t("bDraft")}</UiText>
            <UiText style={styles.lbl}>{t("appPublishOnPc")}</UiText>
            {onEditOnPc ? <Btn label={t("appSendPc")} variant="ghost" onPress={onEditOnPc} style={c.mt12} testID="host-overview-send-pc" /> : null}
          </View>
        ) : <Btn label={t("openCheckIn")} variant="primary" icon="check" height={46} onPress={onCheckIn} style={c.mt12} testID="host-open-check-in" />}
      </View>
      <View style={[styles.card, styles.next]} testID="host-overview-matching">
        <View style={[styles.row, styles.between]}>
          <View style={styles.grow}>
            <UiText style={styles.lbl}>{t("tMatching")}</UiText>
            <UiText style={c.b145}>{m.state === "none" ? t("todoMatching") : t("appRoundsTables", { r: m.roundCount, n: m.tableCount })}</UiText>
          </View>
          <View><Chip label={matchingChip.label} {...(matchingChip.tone ? { tone: matchingChip.tone } : {})} /></View>
        </View>
        {m.state === "draft" || m.state === "published" ? (
          <View style={[styles.row, c.gap8, c.mt12]}>
            <BtnSm label={t("appSeeResults")} onPress={onResults} />
            {m.state === "draft" ? <BtnSm label={t("aPublish")} icon="share" primary onPress={onPublish} testID="host-publish-matching" /> : null}
            {m.unplaced > 0 ? <UiText style={[styles.lbl, c.mlAuto]}>{t("chipUnplaced", { n: m.unplaced })}</UiText> : null}
          </View>
        ) : null}
      </View>
      {review || profile ? (
        <View style={[styles.card, styles.next]} testID="host-overview-todo">
          <View style={styles.cardH}><UiText style={styles.h3}>{t("appTodo")}</UiText></View>
          {review ? (
            <UiPressable accessibilityRole="button" accessibilityLabel={t("todoReview", { n: review.count })} onPress={onReview} style={[styles.row, c.todoRow]}>
              <Emo emoji="🧾" tone="apricot" small />
              <View style={styles.grow}><UiText style={styles.b13}>{t("todoReview", { n: review.count })}</UiText>{review.walkInSlots ? <UiText style={styles.lbl}>{t("appWalkInSlots", { n: review.walkInSlots })}</UiText> : null}</View>
              <Icon name="right" size={16} color={colors.ink3} />
            </UiPressable>
          ) : null}
          {profile ? (
            <UiPressable accessibilityRole="button" accessibilityLabel={t("todoProfile", { n: profile.count })} onPress={onNotify} style={[styles.row, c.todoRow]}>
              <Emo emoji="🙋" tone="pink" small />
              <View style={styles.grow}><UiText style={styles.b13}>{t("todoProfile", { n: profile.count })}</UiText><UiText style={styles.lbl}>{t("todoProfileSub")}</UiText></View>
              <Icon name="right" size={16} color={colors.ink3} />
            </UiPressable>
          ) : null}
        </View>
      ) : null}
      <PcCard text={t("appPcSetup")} style={styles.next} />
    </View>
  );
}

/** レポート摘要（b12 #430）。 */
export function ReportBody({ data, t, now, onPc }: { data: HostOverviewResponse; t: HostT; now: Date; onPc: () => void }) {
  const { styles } = useHostStyles();
  const c = useConsoleStyles().styles;
  const s = data.reportSummary;
  const pct = (value: number | null | undefined) => (value == null ? "—" : String(value));
  const asOf = s ? `${sameTokyoDay(s.asOf, now) ? t("today") : hostDateShort(s.asOf, t)} ${hostTime(s.asOf)}` : "";
  return (
    <View testID="host-report">
      <View style={styles.card}>
        <View style={[styles.cnt3, c.cnt3Top]}>
          {([["rpCheckInRate", s?.checkInRate], ["rpExchangeRate", s?.exchangeRate], ["rpFollow", s?.followupRate]] as const).map(([key, value]) => (
            <View key={key} style={styles.cnt}><UiText style={styles.cntLbl}>{t(key)}</UiText><UiText style={styles.cntNum}>{pct(value)}{value == null ? null : <UiText style={c.pctSmall}>%</UiText>}</UiText></View>
          ))}
        </View>
        {s ? <UiText style={[styles.lbl, c.mt8]}>{s.exchanges == null ? t("appReportLineNoX", { a: s.checkedIn, at: asOf, n: s.total }) : t("appReportLine", { a: s.checkedIn, at: asOf, n: s.total, x: s.exchanges })}</UiText> : <UiText style={[styles.lbl, c.mt8]}>{t("appReportBefore")}</UiText>}
      </View>
      <PcCard title={t("appReportPcTitle")} text={t("appReportPcSub")} style={styles.next} action={<BtnSm label={t("appPcDetail")} onPress={onPc} />} />
    </View>
  );
}

/** マッチング結果（b12 #422，只读）。 */
export function MatchingBody({ data, t, onRound }: { data: HostMatchingResponse; t: HostT; onRound: (round: number) => void }) {
  const { styles } = useHostStyles();
  const c = useConsoleStyles().styles;
  const tables = data.tables.filter((table) => table.round === data.round);
  return (
    <View testID="host-matching">
      {data.rounds.length > 1 ? (
        <View style={c.mb12}><Segmented segments={data.rounds.map((round) => ({ key: String(round.index), label: t("mRoundShort", { n: round.index }) }))} value={String(data.round)} onChange={(key) => onRound(Number(key))} accessibilityLabel={t("mRoundsLabel")} /></View>
      ) : null}
      <PcCard emoji="👀" tone="lav" text={t("appMatchReadOnly")} />
      {data.state === "none" ? <View style={[styles.card, styles.next]}><UiText style={styles.sub}>{t("appMatchNone")}</UiText></View> : null}
      {tables.map((table) => (
        <View key={`${table.round}-${table.table}`} style={[styles.card, styles.next]} testID={`host-table-${table.table}`}>
          <View style={[styles.row, styles.between]}><UiText style={styles.b14}>{t("appTableName", { t: table.table })}</UiText><UiText style={styles.lbl}>{t("appPeopleN", { n: table.members.length })}</UiText></View>
          <View style={c.mt6}>
            {table.members.map((member, index) => (
              <View key={member.participantId} style={c.li}>
                {index ? <View style={c.liLine} /> : null}
                <Avatar initial={member.initial} tone={avatarTone(member.name)} size="sm" />
                <View style={styles.grow}><UiText style={c.metaB} numberOfLines={1}>{member.name}</UiText>{member.org ? <UiText style={c.metaS} numberOfLines={1}>{member.org}</UiText> : null}</View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export const BUCKETS: readonly HostPeopleBucket[] = ["pending", "approved", "waitlisted", "rejected"];
const BUCKET_LABEL: Record<HostPeopleBucket, string> = { approved: "appBApproved", pending: "appBPending", rejected: "appBRejected", waitlisted: "appBWaitlisted" };

/** 参加者 · 審査（b12 #424）。 */
export function PeopleBody({ data, t, approving, onBucket, onApprove }: { data: HostPeopleResponse; t: HostT; approving: string | null; onBucket: (bucket: HostPeopleBucket) => void; onApprove: (row: HostPeopleRow) => void }) {
  const { styles } = useHostStyles();
  const c = useConsoleStyles().styles;
  return (
    <View testID="host-people">
      <View style={c.mb12}><Segmented segments={BUCKETS.map((key) => ({ key, label: t(BUCKET_LABEL[key], { n: data.counts[key] }) }))} value={data.bucket} onChange={onBucket} accessibilityLabel={t("tPeople")} /></View>
      {data.rows.length ? (
        <View style={[styles.card, c.listCard]}>
          {data.rows.map((row, index) => (
            <View key={row.actorId} style={c.li}>
              {index ? <View style={c.liLine} /> : null}
              <Avatar initial={row.initial} tone={avatarTone(row.name)} size="sm" />
              <View style={styles.grow}>
                <UiText style={c.metaB} numberOfLines={1}>{row.name}</UiText>
                {row.org ? <UiText style={c.metaS} numberOfLines={1}>{row.org}</UiText> : null}
                {row.answer ? <UiText style={[c.metaS, c.answer]} numberOfLines={1}>{row.answer}</UiText> : null}
              </View>
              {row.status === "pending" || row.status === "waitlisted" ? <BtnSm label={approving === row.actorId ? "…" : t("pApprove")} primary onPress={() => onApprove(row)} testID={`host-approve-${row.actorId}`} /> : null}
            </View>
          ))}
        </View>
      ) : <View style={styles.card}><UiText style={styles.sub}>{t("pNoMatch")}</UiText></View>}
      <UiText style={[styles.lbl, c.center, c.mt8]}>{t("appPeoplePc")}</UiText>
    </View>
  );
}

// kit（b6 #23 / b12 #422 #424 #430）：.carousel gap6 mb12、外扩 18 · chip 段 7/14 12.5 · .cnt3 mt0 · .li 11 0 gap12、分隔线 left 50。
export const useConsoleStyles = createThemedStyles((colors) => StyleSheet.create({
  carousel: { flexGrow: 0, marginBottom: 12, marginHorizontal: -18 },
  // The first chip lines up with the page gutter (starting at 0 left it flush against the screen edge, looking cut off).
  carouselIn: { gap: 6, paddingBottom: 4, paddingLeft: 18, paddingRight: 18, paddingTop: 2 },
  segChip: { backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  segChipOn: { backgroundColor: colors.ink },
  segChipText: { color: colors.ink2, fontSize: 15, fontWeight: "700", lineHeight: 23 },
  segChipTextOn: { color: colors.bg },
  cnt3Top: { marginTop: 0 },
  mt6: { marginTop: 6 },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  mb12: { marginBottom: 12 },
  gap8: { gap: 8 },
  mlAuto: { marginLeft: "auto" },
  center: { textAlign: "center" },
  b145: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25 },
  todoRow: { paddingVertical: 8 },
  pctSmall: { color: colors.ink3, fontFamily: numFont, fontSize: 14, fontWeight: "700" },
  listCard: { paddingHorizontal: 16, paddingVertical: 6 },
  li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
  liLine: { backgroundColor: colors.line, height: 1, left: 50, position: "absolute", right: 0, top: 0 },
  metaB: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25 },
  metaS: { color: colors.ink3, fontSize: 14, lineHeight: 21 },
  answer: { color: colors.ink2 },
  search: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 999, flexDirection: "row", gap: 8, height: 44, marginBottom: 12, paddingHorizontal: 16 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 16, height: 44 },
}));
