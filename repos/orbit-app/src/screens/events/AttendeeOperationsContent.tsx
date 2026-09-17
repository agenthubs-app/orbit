import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { OrbitLanguage } from "../../api/contract/language";
import { DataCard } from "../../components/DataCard";
import { createThemedStyles } from "../../design/theme";
import type { AttendeeAction, AttendeeState } from "../../view-models/event-attendee-controller";

const copy = {
  zh: { title: "参会者与名片交换", refresh: "重新读取", loading: "正在读取活动…", me: "我的现场信息", checkIn: "签到", checkedIn: "已签到", closed: "签到尚未开放或已关闭", recommendations: "推荐认识的人", directory: "参会者目录", search: "搜索参会者", round: "轮次", table: "桌号", seat: "座位", request: "申请交换名片", accept: "同意交换名片", decline: "拒绝交换", withdraw: "撤回申请", pending: "等待对方同意", incoming: "对方申请交换名片", accepted: "双方已同意交换", declined: "申请已拒绝", withdrawn: "申请已撤回", contact: "查看联系人", contactPending: "联系人尚不可读取，请刷新确认。", opens: "活动开始后可申请交换名片", self: "这是你本人", none: "暂无推荐", profile: "本次报名资料", current: "当前资料", published: "已发布资料", busy: "正在确认结果…", locked: "结果尚未开放", not_generated: "结果尚未生成", processing: "结果正在生成", failed: "结果生成未完成，请稍后刷新", ready: "已发布结果" },
  en: { title: "Attendees & card exchange", refresh: "Reload", loading: "Loading event…", me: "My event information", checkIn: "Check in", checkedIn: "Checked in", closed: "Check-in is not open", recommendations: "Recommended people", directory: "Attendee directory", search: "Search attendees", round: "Round", table: "Table", seat: "Seat", request: "Request card exchange", accept: "Accept card exchange", decline: "Decline exchange", withdraw: "Withdraw request", pending: "Awaiting consent", incoming: "Incoming card request", accepted: "Exchange accepted", declined: "Request declined", withdrawn: "Request withdrawn", contact: "View contact", contactPending: "Contact not yet readable. Reload to check.", opens: "Card exchange opens when the event starts", self: "This is you", none: "No recommendations yet", profile: "Event registration profile", current: "Current profile", published: "Published profile", busy: "Confirming result…", locked: "Results are not open yet", not_generated: "Results have not been generated", processing: "Results are being generated", failed: "Results are not ready. Please reload later", ready: "Published results" },
  ja: { title: "参加者・名刺交換", refresh: "再読み込み", loading: "イベントを読み込み中…", me: "自分の参加情報", checkIn: "チェックイン", checkedIn: "チェックイン済み", closed: "チェックイン受付時間外です", recommendations: "おすすめの参加者", directory: "参加者一覧", search: "参加者を検索", round: "ラウンド", table: "テーブル", seat: "席", request: "名刺交換を申請", accept: "名刺交換に同意", decline: "申請を拒否", withdraw: "申請を取り消す", pending: "相手の同意待ち", incoming: "名刺交換の申請があります", accepted: "名刺交換に双方が同意済み", declined: "申請は拒否されました", withdrawn: "申請は取り消されました", contact: "連絡先を見る", contactPending: "連絡先をまだ読み込めません。再読み込みしてください。", opens: "イベント開始後に名刺交換できます", self: "あなた自身です", none: "おすすめはまだありません", profile: "イベント参加プロフィール", current: "現在のプロフィール", published: "公開済みプロフィール", busy: "結果を確認中…", locked: "結果はまだ公開されていません", not_generated: "結果はまだ生成されていません", processing: "結果を生成中です", failed: "結果は未完了です。後でもう一度お試しください", ready: "公開済みの結果" },
};
export const attendeeOperationsTitle = (language: OrbitLanguage) => copy[language].title;
export function AttendeeOperationsContent({ state, language, now, onAction, onRefresh, onParticipant, onContact }: {
  state: AttendeeState; language: OrbitLanguage; now: number; onAction: (action: AttendeeAction) => void; onRefresh: () => void; onParticipant: (id: string) => void; onContact: (id: string) => void;
}) {
  const { styles } = useStyles(); const c = copy[language]; const w = state.workspace; const d = state.detail;
  const [query, setQuery] = useState("");
  const button = (label: string, action: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={state.busy || state.loading} onPress={action} style={[styles.button, (state.busy || state.loading) && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  const lines = (values: readonly string[]) => values.map((value, index) => <Text key={index} style={styles.body}>{value}</Text>);
  return <View style={styles.stack}>
    {state.error ? <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text> : null}
    {state.loading ? <Text style={styles.body}>{c.loading}</Text> : null}
    {state.busy ? <Text style={styles.body}>{c.busy}</Text> : null}
    {button(c.refresh, onRefresh)}
    {w && !d ? <>
      <DataCard title={c.me} detail={w.me.displayName}>
        {w.checkIn ? <Text style={styles.body}>{c.checkedIn} · {w.checkIn.checkedInAt}</Text> : w.checkInAvailable ? button(c.checkIn, () => onAction("check-in")) : <Text style={styles.body}>{c.closed}</Text>}
        {[w.roundOneTable, w.roundTwoTable].map((table, index) => table ? <View style={styles.stack} key={index}>
          <Text style={styles.heading}>{c.round} {index + 1} · {c.table} {table.tableNumber} · {c.seat} {table.members.find(m => m.participantId === w.me.participantId)?.seat}</Text>
          {lines([table.theme, table.rationale, ...table.icebreakers, ...(table.memberPrompts[w.me.participantId] ?? [])])}
          {table.members.map(m => <View key={m.participantId}>{button(`${w.directory.find(p => p.participantId === m.participantId)?.displayName ?? m.participantId} · ${m.seat}`, () => onParticipant(m.participantId))}</View>)}
        </View> : null)}
      </DataCard>
      <DataCard title={c.recommendations} detail={c[w.resultsState]}>
        {w.resultsState === "ready" ? w.recommendations?.recommendations.length ? w.recommendations.recommendations.map(r => <View style={styles.stack} key={r.targetParticipantId}>
          {button(w.directory.find(p => p.participantId === r.targetParticipantId)!.displayName, () => onParticipant(r.targetParticipantId))}
          {lines([...r.reasons, r.memberHint, ...r.icebreakers])}
        </View>) : <Text style={styles.body}>{w.recommendations?.noMatchReason ?? c.none}</Text> : null}
      </DataCard>
      <DataCard title={c.directory}>
        <TextInput accessibilityLabel={c.search} placeholder={c.search} value={query} onChangeText={setQuery} style={styles.input} />
        {w.directory.filter(p => [p.displayName, p.company, p.role, p.industry, ...p.topics].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(p => <View key={p.participantId} style={styles.stack}>
          {button(`${p.displayName}${p.participantId === w.me.participantId ? ` · ${c.self}` : ""}`, () => onParticipant(p.participantId))}
          <Text style={styles.body}>{[p.company, p.role, p.industry].filter(Boolean).join(" · ")}</Text>
        </View>)}
      </DataCard>
    </> : null}
    {w && d ? <>
      <DataCard title={d.displayName} detail={[d.company, d.role, d.industry].filter(Boolean).join(" · ")}>
        {lines(d.topics)}
        {d.participantId === w.me.participantId ? <Text style={styles.body}>{c.self}</Text> : <>
          {d.contactRequest.status === "none" || (d.contactRequest.status === "withdrawn" && d.contactRequest.direction === "outgoing") ? now >= Date.parse(w.configuration.eventStartsAt) ? button(c.request, () => onAction("request")) : <Text style={styles.body}>{c.opens}</Text> : null}
          {d.contactRequest.status === "awaiting_target_consent" ? d.contactRequest.direction === "incoming" ? <>
            <Text style={styles.body}>{c.incoming}</Text>{button(c.accept, () => onAction("accept"))}{button(c.decline, () => onAction("decline"))}
          </> : <><Text style={styles.body}>{c.pending}</Text>{button(c.withdraw, () => onAction("withdraw"))}</> : null}
          {d.contactRequest.status === "accepted" ? <><Text style={styles.body}>{c.accepted}</Text>{d.contactRequest.contactId ? button(c.contact, () => onContact(d.contactRequest.contactId!)) : <Text style={styles.body}>{c.contactPending}</Text>}</> : null}
          {d.contactRequest.status === "declined" || d.contactRequest.status === "withdrawn" ? <Text style={styles.body}>{c[d.contactRequest.status]}</Text> : null}
        </>}
      </DataCard>
      <DataCard title={c.profile} detail={d.sourceContext === "published_generation" ? c.published : c.current}>
        {d.responses.map((r, index) => <View key={index}><Text style={styles.heading}>{language === "zh" ? r.label.zh : r.label.en}</Text><Text style={styles.body}>{r.answer}</Text></View>)}
      </DataCard>
      {d.recommendation ? <DataCard title={c.recommendations}>{lines([...d.recommendation.reasons, d.recommendation.memberHint, ...d.recommendation.icebreakers])}</DataCard> : null}
      {d.placements.map(p => <DataCard key={p.roundNumber} title={`${c.round} ${p.roundNumber} · ${c.table} ${p.tableNumber} · ${c.seat} ${p.seat}`} detail={p.theme}>{lines([...(p.groupingRationale ? [p.groupingRationale] : []), ...p.icebreakers])}</DataCard>)}
    </> : null}
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  stack: { gap: 12 }, body: { color: colors.text2, fontSize: 15, lineHeight: 23 }, heading: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  error: { color: colors.ink, fontSize: 15 }, button: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 44, marginVertical: 4 }, buttonText: { color: colors.accent, fontSize: 16 }, disabled: { opacity: 0.5 }, input: { color: colors.ink, borderColor: colors.border, borderWidth: 1, padding: 12, minHeight: 44, borderRadius: 8 },
}));
