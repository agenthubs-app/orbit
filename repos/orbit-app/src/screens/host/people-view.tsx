// R17 参加者（App；b13 HM-P1–P9，2026-11-26 用户定：只用手机也能办完审核）。画面本体，无数据加载，渲染测试直接用。
// 区分（横滑）· 承認済み / 定員 一行 · 搜索 +「⋯」（申込リンク / QR）· 「プロフィール未完了」开关 chip ·「選択」；
// 行尾「承認」；左滑露出「待ち」「見送り」（VoiceOver 用自定义操作）；长按一行或「選択」进入选择模式 → 底部操作条（JourneyPage footer）；
// 还没有任何申込：申込リンク + コピー / QR（HM-P7）。与 Web HostPeoplePhone 同文同序。
import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, ScrollView, StyleSheet, TextInput, View } from "react-native";

import type { HostAdmissionDecision, HostPeopleBucket, HostPeopleResponse, HostPeopleRow } from "../../api/contract/host-console";
import { BottomSheet, Icon, UiPressable, UiText } from "../../components/ui";
import { avatarTone } from "../../components/ui/Avatar";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { addDesignMock } from "../add/add-design-mock";
import { Avatar } from "../events/v2/venue-ui";
import { ScoreRing } from "../events/v2/ScoreRing";
import type { HostT } from "./host-model";
import { useHostStyles } from "./host-ui";

export const PEOPLE_BUCKETS: readonly HostPeopleBucket[] = ["pending", "approved", "waitlisted", "rejected"];
const BUCKET_LABEL = { approved: "bApproved", pending: "bPending", rejected: "bRejected", waitlisted: "bWaitlisted" } as const;
/** 左滑露出的两个按钮宽（72 × 2，kit .swipe.open）。 */
export const SWIPE_OPEN = 144;
export type RowIssue = "conflict" | "failed";
export type PeopleQuery = { bucket: HostPeopleBucket; q: string; incomplete: boolean };

/** 审核按钮只给走过申込的 審査待ち / キャンセル待ち（申込なしの成員 applicationVersion 0 只能查看，服务端也会拒绝）。 */
export function decidable(row: Pick<HostPeopleRow, "status" | "applicationVersion">): boolean {
  return (row.status === "pending" || row.status === "waitlisted") && row.applicationVersion > 0;
}

/** 区分里一个人都没有、也没在搜索 / 筛选 = 还没有任何申込（HM-P7）。 */
export function noApplicants(data: Pick<HostPeopleResponse, "counts">): boolean {
  return data.counts.pending + data.counts.approved + data.counts.waitlisted + data.counts.rejected === 0;
}

type RowProps = {
  row: HostPeopleRow;
  t: HostT;
  issue?: RowIssue | undefined;
  busy: boolean;
  selecting: boolean;
  selected: boolean;
  open: boolean;
  onOpenSwipe: (actorId: string | null) => void;
  onLongPress: (row: HostPeopleRow) => void;
  onToggle: (row: HostPeopleRow) => void;
  onDetail: (row: HostPeopleRow) => void;
  onDecide: (row: HostPeopleRow, decision: HostAdmissionDecision) => void;
};

function PersonRow({ row, t, issue, busy, selecting, selected, open, onOpenSwipe, onLongPress, onToggle, onDetail, onDecide }: RowProps) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = usePeopleStyles();
  const can = decidable(row);
  const swipeable = can && !selecting;
  const x = useRef(new Animated.Value(open ? -SWIPE_OPEN : 0)).current;
  const opened = useRef(open);
  opened.current = open;
  const dragging = useRef(false);
  const settle = (to: number) => Animated.spring(x, { toValue: to, useNativeDriver: false, bounciness: 0 }).start();
  // Another row opened, or a decision closed this one: follow without a drag.
  useEffect(() => { if (!dragging.current) settle(open ? -SWIPE_OPEN : 0); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => { dragging.current = true; },
    onPanResponderMove: (_, g) => { x.setValue(Math.max(-SWIPE_OPEN - 24, Math.min(0, (opened.current ? -SWIPE_OPEN : 0) + g.dx))); },
    onPanResponderRelease: (_, g) => { dragging.current = false; const end = (opened.current ? -SWIPE_OPEN : 0) + g.dx; onOpenSwipe(end < -SWIPE_OPEN / 2 ? row.actorId : null); settle(end < -SWIPE_OPEN / 2 ? -SWIPE_OPEN : 0); },
    onPanResponderTerminate: () => { dragging.current = false; settle(opened.current ? -SWIPE_OPEN : 0); },
  })).current;
  const low = row.profileScore < 50;
  const line = [row.org, row.role].filter(Boolean).join(" · ");
  // onLongPress stays set while selecting: dropping it mid-press made the release count as a tap and unselect the row.
  const tap = () => {
    if (open) { onOpenSwipe(null); return; }
    if (selecting) { if (can) onToggle(row); return; }
    onDetail(row);
  };
  // VoiceOver：左滑看不见，同样的两个决定作为自定义操作给出。
  const actions = can && !selecting ? [
    ...(row.status !== "waitlisted" ? [{ name: "waitlist", label: t("pSwipeWait", { name: row.name }) }] : []),
    { name: "reject", label: t("pSwipeReject", { name: row.name }) },
  ] : undefined;
  return (
    <View style={[styles.swipe, selected ? styles.swipeSel : null]} testID={`host-row-${row.actorId}`}>
      {swipeable ? (
        <View style={styles.acts} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden={!open}>
          {row.status !== "waitlisted" ? (
            <UiPressable accessibilityRole="button" accessibilityLabel={t("pSwipeWait", { name: row.name })} disabled={busy} onPress={() => { onOpenSwipe(null); onDecide(row, "waitlist"); }} style={[styles.act, { backgroundColor: colors.macBlue }]} testID={`host-swipe-wait-${row.actorId}`}>
              <Icon name="clock" size={16} color={colors.macBlueInk} /><UiText style={[styles.actText, { color: colors.macBlueInk }]}>{t("pWait")}</UiText>
            </UiPressable>
          ) : null}
          <UiPressable accessibilityRole="button" accessibilityLabel={t("pSwipeReject", { name: row.name })} disabled={busy} onPress={() => { onOpenSwipe(null); onDecide(row, "reject"); }} style={[styles.act, { backgroundColor: colors.coralSoft }]} testID={`host-swipe-reject-${row.actorId}`}>
            <Icon name="x" size={16} color={colors.coralText} /><UiText style={[styles.actText, { color: colors.coralText }]}>{t("pReject")}</UiText>
          </UiPressable>
        </View>
      ) : null}
      <Animated.View style={[styles.face, { transform: [{ translateX: x }] }]} {...(swipeable ? pan.panHandlers : {})}>
        {selecting && can ? (
          <UiPressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={t("pSelectRow", { name: row.name })} onPress={() => onToggle(row)} style={[styles.cbx, selected ? styles.cbxOn : null]} testID={`host-check-${row.actorId}`}>
            {selected ? <Icon name="check" size={16} color={colors.bg} /> : null}
          </UiPressable>
        ) : null}
        <UiPressable accessibilityRole="button" accessibilityLabel={selecting ? t("pSelectRow", { name: row.name }) : t("pdOpen", { name: row.name })}
          accessibilityActions={actions} onAccessibilityAction={(event) => onDecide(row, event.nativeEvent.actionName === "reject" ? "reject" : "waitlist")}
          onPress={tap} onLongPress={can ? () => { if (!selecting) onLongPress(row); } : undefined} delayLongPress={500} style={[h.row, styles.who]} testID={`host-person-open-${row.actorId}`}>
          <Avatar initial={row.initial} tone={avatarTone(row.name)} size="sm" />
          <View style={h.grow}>
            <UiText style={styles.name} numberOfLines={1}>{row.name}</UiText>
            {line ? <UiText style={styles.meta} numberOfLines={1}>{line}</UiText> : null}
            {row.answer ? <UiText style={[styles.meta, { color: colors.ink2 }]} numberOfLines={1}>{row.answer}</UiText> : null}
            {issue ? <UiText accessibilityRole="alert" style={styles.rowNote}>{t(issue === "conflict" ? "pRowConflict" : "pRowFailed")}</UiText> : null}
          </View>
        </UiPressable>
        <View style={styles.side}>
          {row.status === "approved" ? <UiText style={h.lbl}>{row.attendCount === 0 ? t("pFirstTime") : t("pTimes", { n: row.attendCount })}</UiText> : (
            <ScoreRing size={30} stroke={4} value={row.profileScore} color={low ? colors.coral : colors.plum500} label={t("pProfileScore", { n: row.profileScore })} fontSize={9}>
              <UiText style={styles.score}>{row.profileScore}</UiText>
            </ScoreRing>
          )}
          {can && !selecting ? (
            <UiPressable accessibilityRole="button" accessibilityLabel={`${t("pApprove")} ${row.name}`} disabled={busy} onPress={() => onDecide(row, "approve")} style={[h.btnSm, h.primary]} testID={`host-approve-${row.actorId}`}>
              <UiText style={[h.btnSmText, { color: colors.bg }]}>{t("pApprove")}</UiText>
            </UiPressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

export interface PeoplePanelProps {
  data: HostPeopleResponse;
  rows: readonly HostPeopleRow[];
  t: HostT;
  query: PeopleQuery;
  loading: boolean;
  busy: boolean;
  selecting: boolean;
  selected: ReadonlySet<string>;
  issues: ReadonlyMap<string, RowIssue>;
  onBucket: (bucket: HostPeopleBucket) => void;
  onSearch: (q: string) => void;
  onIncomplete: () => void;
  onSelecting: (on: boolean) => void;
  onSelect: (actorId: string) => void;
  onSelectAll: () => void;
  onOpen: (row: HostPeopleRow) => void;
  onDecide: (row: HostPeopleRow, decision: HostAdmissionDecision) => void;
  onMore: () => void;
  onMenu: () => void;
}

/** 参加者 · 一覧（b13 HM-P1 / P2 / P3 / P5 / P9）。 */
export function PeoplePanel(props: PeoplePanelProps) {
  const { data, rows, t, query, selecting, selected, issues, busy } = props;
  const { styles: h, colors } = useHostStyles();
  const { styles } = usePeopleStyles();
  const noKeyboard = addDesignMock("no-keyboard");
  const [swipeOpen, setSwipeOpen] = useState<string | null>(null);
  const canSelect = query.bucket === "pending" || query.bucket === "waitlisted";
  const selCount = rows.filter((row) => selected.has(row.actorId)).length;
  const filtered = Boolean(query.q.trim() || query.incomplete);
  const capacity = data.capacity;
  const approved = data.counts.approved;
  return (
    <View testID={`host-people-${query.bucket}`}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.segScroll} contentContainerStyle={styles.segIn} accessibilityLabel={t("pBuckets")} testID="host-people-buckets">
        {PEOPLE_BUCKETS.map((bucket) => {
          const on = bucket === query.bucket;
          const label = t(BUCKET_LABEL[bucket], { n: data.counts[bucket] });
          return (
            <UiPressable key={bucket} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={() => { setSwipeOpen(null); props.onBucket(bucket); }} style={[styles.seg, on ? styles.segOn : null]} testID={`host-bucket-${bucket}`}>
              <UiText style={[styles.segText, on ? { color: colors.bg } : null]}>{label}</UiText>
            </UiPressable>
          );
        })}
      </ScrollView>
      {selecting ? (
        <View style={[h.row, h.between, styles.selhead]} testID="host-people-selhead">
          <UiPressable accessibilityRole="button" accessibilityLabel={t("cancel")} onPress={() => props.onSelecting(false)} style={[h.btnSm, h.ghost]}><UiText style={h.btnSmText}>{t("cancel")}</UiText></UiPressable>
          <UiText style={styles.selCount}>{t("pSelected", { n: selCount })}</UiText>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("pSelectEveryone")} onPress={props.onSelectAll} style={[h.btnSm, h.ghost]} testID="host-select-all"><UiText style={h.btnSmText}>{t("pSelectEveryone")}</UiText></UiPressable>
        </View>
      ) : (
        <>
          <View style={[h.row, styles.capl]} testID="host-people-capacity">
            <UiText style={h.lbl}>{t("pCapApproved")}</UiText>
            <UiText style={styles.capNum}>{approved}{capacity ? <UiText style={h.lbl}>{` / ${capacity}`}</UiText> : null}</UiText>
            {capacity ? <View style={styles.capBar}><View style={[styles.capFill, { width: `${Math.min(100, Math.round((approved / capacity) * 100))}%` }]} /></View> : <View style={h.grow} />}
            <UiText style={h.lbl}>{data.remaining != null ? t("pCapLeft", { n: data.remaining }) : t("pApprovedNoCap")}</UiText>
          </View>
          <View style={[h.row, styles.tools]}>
            <View style={[styles.search, query.q ? styles.searchOn : null]}>
              <Icon name="search" size={16} color={colors.ink3} />
              <TextInput value={query.q} onChangeText={props.onSearch} placeholder={t("pSearchPh")} placeholderTextColor={colors.ink3} accessibilityLabel={t("pSearch")} showSoftInputOnFocus={!noKeyboard} returnKeyType="search" style={styles.searchInput} testID="host-people-search" />
            </View>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("pMoreMenu")} onPress={props.onMenu} style={styles.more} testID="host-people-more"><Icon name="more" size={20} color={colors.ink2} /></UiPressable>
          </View>
          <View style={[h.row, styles.tools2]}>
            <UiPressable accessibilityRole="switch" accessibilityState={{ checked: query.incomplete }} accessibilityLabel={t("pIncomplete")} onPress={props.onIncomplete} style={[styles.fchip, query.incomplete ? styles.fchipOn : null]} testID="host-people-incomplete">
              <Icon name={query.incomplete ? "check" : "filter"} size={16} color={query.incomplete ? colors.bg : colors.ink2} />
              <UiText style={[styles.fchipText, query.incomplete ? { color: colors.bg } : null]}>{t("pIncomplete")}</UiText>
            </UiPressable>
            <View style={h.grow} />
            {canSelect && rows.length > 0 ? <UiPressable accessibilityRole="button" accessibilityLabel={t("pSelect")} onPress={() => props.onSelecting(true)} style={[h.btnSm, h.ghost]} testID="host-people-select"><UiText style={h.btnSmText}>{t("pSelect")}</UiText></UiPressable> : null}
          </View>
        </>
      )}
      {props.loading ? (
        <View style={[h.card, styles.list]} accessibilityState={{ busy: true }} testID="host-people-loading">
          {[110, 90, 120, 100, 80].map((w) => <View key={w} style={[h.row, styles.ghostRow]}><View style={styles.gAv} /><View style={h.grow}><View style={[styles.gLine, { width: w }]} /><View style={[styles.gLine, { marginTop: 6, width: w + 70 }]} /></View></View>)}
        </View>
      ) : rows.length === 0 ? (
        filtered ? (
          <View style={[h.card, styles.nomatch]} testID="host-people-nomatch">
            <UiText style={styles.nomatchEmo}>🔍</UiText>
            <UiText style={h.h3}>{t("pNoMatch")}</UiText>
            <View style={[h.row, styles.nomatchActs]}>
              {query.q ? <UiPressable accessibilityRole="button" accessibilityLabel={t("pClearSearch")} onPress={() => props.onSearch("")} style={h.btnSm}><UiText style={h.btnSmText}>{t("pClearSearch")}</UiText></UiPressable> : null}
              {query.incomplete ? <UiPressable accessibilityRole="button" accessibilityLabel={t("pClearFilter")} onPress={props.onIncomplete} style={h.btnSm}><UiText style={h.btnSmText}>{t("pClearFilter")}</UiText></UiPressable> : null}
            </View>
          </View>
        ) : <View style={h.card}><UiText style={h.sub}>{t("pNone")}</UiText></View>
      ) : (
        <View style={[h.card, styles.list]}>
          {rows.map((row, index) => (
            <View key={row.actorId}>
              {index ? <View style={styles.line} /> : null}
              <PersonRow row={row} t={t} issue={issues.get(row.actorId)} busy={busy} selecting={selecting} selected={selected.has(row.actorId)} open={swipeOpen === row.actorId}
                onOpenSwipe={setSwipeOpen} onLongPress={(target) => { setSwipeOpen(null); props.onSelecting(true); if (!selected.has(target.actorId)) props.onSelect(target.actorId); }}
                onToggle={(target) => props.onSelect(target.actorId)} onDetail={props.onOpen} onDecide={props.onDecide} />
            </View>
          ))}
        </View>
      )}
      {data.more > 0 && data.nextCursor && !props.loading ? (
        <UiPressable accessibilityRole="button" accessibilityLabel={t("pMore", { n: data.more })} disabled={busy} onPress={props.onMore} style={[h.btnSm, styles.moreBtn]} testID="host-people-load-more"><UiText style={h.btnSmText}>{t("pMore", { n: data.more })}</UiText></UiPressable>
      ) : null}
    </View>
  );
}

/** 选择模式的底部操作条（JourneyPage footer 里）：承認 N名 / キャンセル待ちへ / 見送り（HM-P3 / P4）。 */
export function BulkBar({ t, bucket, count, busy, onBulk }: { t: HostT; bucket: HostPeopleBucket; count: number; busy: boolean; onBulk: (decision: HostAdmissionDecision) => void }) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = usePeopleStyles();
  const off = busy || count === 0;
  return (
    <View style={styles.bulk} testID="host-people-bulk">
      <UiPressable accessibilityRole="button" accessibilityLabel={t("pBulkApprove", { n: count })} accessibilityState={{ disabled: off }} disabled={off} onPress={() => onBulk("approve")} style={[h.btn, h.primary, styles.bulkBtn, off ? styles.off : null]} testID="host-bulk-approve">
        <Icon name="check" size={16} color={colors.bg} /><UiText style={[h.btnText, { color: colors.bg }]}>{t("pBulkApprove", { n: count })}</UiText>
      </UiPressable>
      {bucket !== "waitlisted" ? (
        <UiPressable accessibilityRole="button" accessibilityLabel={t("pBulkWaitlist")} accessibilityState={{ disabled: off }} disabled={off} onPress={() => onBulk("waitlist")} style={[h.btn, styles.bulkBtn, off ? styles.off : null]} testID="host-bulk-waitlist">
          <UiText style={h.btnText}>{t("pBulkWaitlist")}</UiText>
        </UiPressable>
      ) : null}
      <UiPressable accessibilityRole="button" accessibilityLabel={t("pReject")} accessibilityState={{ disabled: off }} disabled={off} onPress={() => onBulk("reject")} style={[h.btn, styles.bulkBtn, off ? styles.off : null]} testID="host-bulk-reject">
        <UiText style={[h.btnText, { color: colors.coralText }]}>{t("pReject")}</UiText>
      </UiPressable>
    </View>
  );
}

/** 搜索旁「⋯」：申込ページのリンクをコピー / QR（HM-P9）。名簿の取り込み 在第 6 块接入。 */
export function PeopleMenu({ visible, t, hasLink, onClose, onCopy, onQr }: { visible: boolean; t: HostT; hasLink: boolean; onClose: () => void; onCopy: () => void; onQr: () => void }) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = usePeopleStyles();
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("pMoreMenu")}>
      <View style={styles.menu} testID="host-people-menu">
        <UiPressable accessibilityRole="button" accessibilityLabel={t("pCopyApplyLink")} disabled={!hasLink} onPress={() => { onClose(); onCopy(); }} style={[h.row, styles.mi]}><Icon name="link" size={16} color={colors.ink} /><UiText style={styles.miText}>{t("pCopyApplyLink")}</UiText></UiPressable>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("pQrTitle")} disabled={!hasLink} onPress={() => { onClose(); onQr(); }} style={[h.row, styles.mi]}><Icon name="scan" size={16} color={colors.ink} /><UiText style={styles.miText}>{t("pQrTitle")}</UiText></UiPressable>
      </View>
    </BottomSheet>
  );
}

/** 还没有任何申込（HM-P7）：申込リンク + コピー / QR。「申込設定を確認」「名簿の取り込み」两张卡在第 5 / 6 块接入。 */
export function PeopleEmpty({ t, link, onCopy, onQr }: { t: HostT; link: string | null; onCopy: () => void; onQr: () => void }) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = usePeopleStyles();
  return (
    <View style={[h.card, styles.empty]} testID="host-people-empty">
      <UiText style={styles.emptyTitle}>{t("pEmptyTitle")}</UiText>
      <UiText style={[h.sub, { marginTop: 6 }]}>{t("pEmptySub")}</UiText>
      <View style={[h.row, styles.emptyLink]} accessibilityLabel={t("pApplyLink")}><Icon name="link" size={16} color={colors.ink3} /><UiText style={[h.lbl, h.grow]} numberOfLines={1}>{link ?? t("pNoLink")}</UiText></View>
      <View style={[h.row, { gap: 8 }]}>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("copyLink")} disabled={!link} onPress={onCopy} style={[h.btn, h.primary, styles.half]}><Icon name="link" size={16} color={colors.bg} /><UiText style={[h.btnText, { color: colors.bg }]}>{t("copyLink")}</UiText></UiPressable>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("pQr")} disabled={!link} onPress={onQr} style={[h.btn, styles.half]}><UiText style={h.btnText}>{t("pQr")}</UiText></UiPressable>
      </View>
    </View>
  );
}

const usePeopleStyles = createThemedStyles((colors) => StyleSheet.create({
  segScroll: { flexGrow: 0, marginBottom: 12, marginHorizontal: -18 },
  segIn: { gap: 6, paddingHorizontal: 18, paddingVertical: 2 },
  seg: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  segOn: { backgroundColor: colors.ink },
  segText: { color: colors.ink2, fontSize: 15, fontWeight: "700", lineHeight: 23 },
  selhead: { marginBottom: 12, minHeight: 44 },
  selCount: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  capl: { gap: 8, marginBottom: 12 },
  capNum: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  capBar: { backgroundColor: colors.surface3, borderRadius: 3, flex: 1, height: 6, overflow: "hidden" },
  capFill: { backgroundColor: colors.plum500, borderRadius: 3, height: 6 },
  tools: { gap: 8, marginBottom: 10 },
  search: { alignItems: "center", backgroundColor: colors.surface, borderColor: "transparent", borderRadius: radius.pill, borderWidth: 1.5, flex: 1, flexDirection: "row", gap: 8, height: 44, paddingHorizontal: 14 },
  searchOn: { borderColor: colors.plum300 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 16, height: 44 },
  more: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  tools2: { marginBottom: 12 },
  fchip: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 34, paddingHorizontal: 12 },
  fchipOn: { backgroundColor: colors.ink },
  fchipText: { color: colors.ink2, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  list: { overflow: "hidden", paddingHorizontal: 0, paddingVertical: 4 },
  line: { backgroundColor: colors.line, height: 1, marginLeft: 66 },
  swipe: { overflow: "hidden" },
  swipeSel: { backgroundColor: colors.macLav },
  acts: { bottom: 0, flexDirection: "row", position: "absolute", right: 0, top: 0, width: SWIPE_OPEN },
  act: { alignItems: "center", flex: 1, gap: 2, justifyContent: "center" },
  actText: { fontSize: 13, fontWeight: "700", lineHeight: 20 },
  face: { alignItems: "center", backgroundColor: colors.surface, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  cbx: { alignItems: "center", borderColor: colors.ink3, borderRadius: 11, borderWidth: 1.5, height: 22, justifyContent: "center", width: 22 },
  cbxOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  who: { flex: 1, gap: 12, minWidth: 0 },
  name: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25 },
  meta: { color: colors.ink3, fontSize: 14, lineHeight: 21 },
  rowNote: { color: colors.coralText, fontSize: 13, fontWeight: "600", lineHeight: 20, marginTop: 2 },
  side: { alignItems: "center", flexDirection: "row", gap: 8 },
  score: { color: colors.ink2, fontSize: 10, fontWeight: "800" },
  ghostRow: { gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  gAv: { backgroundColor: colors.surface2, borderRadius: 18, height: 36, width: 36 },
  gLine: { backgroundColor: colors.surface2, borderRadius: 4, height: 10 },
  nomatch: { alignItems: "center", gap: 6, paddingVertical: 28 },
  nomatchEmo: { fontSize: 28, lineHeight: 36 },
  nomatchActs: { gap: 8, marginTop: 8 },
  moreBtn: { alignSelf: "center", marginTop: 12 },
  bulk: { flex: 1, flexDirection: "row", gap: 8 },
  bulkBtn: { flex: 1, height: 44, paddingHorizontal: 8 },
  off: { opacity: 0.45 },
  menu: { gap: 4, paddingBottom: 8 },
  mi: { gap: 12, minHeight: 52, paddingHorizontal: 4 },
  miText: { color: colors.ink, fontSize: 17, fontWeight: "600", lineHeight: 25 },
  empty: { gap: 4 },
  emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", lineHeight: 28 },
  emptyLink: { backgroundColor: colors.surface2, borderRadius: radius.tile, gap: 8, marginBottom: 10, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10 },
  half: { flex: 1, height: 44 },
}));
