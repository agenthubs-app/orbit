// R17 受付（App）的画面本体（无数据加载、无相机，渲染测试直接用）：到着卡 · 搜索 · 结果 · 最新の受付。
import { StyleSheet, TextInput, View } from "react-native";

import type { HostKioskResponse, HostKioskRow } from "../../api/contract/host-console";
import { Icon, UiPressable, UiText } from "../../components/ui";
import { avatarTone } from "../../components/ui/Avatar";
import { createThemedStyles } from "../../design/theme";
import { addDesignMock } from "../add/add-design-mock";
import { Avatar, Chip } from "../events/v2/venue-ui";
import { clock, type HostT } from "./host-model";
import { BtnSm, numFont, Ring, useHostStyles } from "./host-ui";
import { streamRows, type KioskQueueItem } from "./kiosk-queue";
export const HEARTBEAT_MS = 30_000;
export const POLL_MS = 10_000;

export interface CheckInBodyProps {
  data: HostKioskResponse;
  t: HostT;
  q: string;
  rows: readonly HostKioskRow[];
  queue: readonly KioskQueueItem[];
  devices: number;
  busy: string | null;
  focusSearch?: boolean;
  onQ: (q: string) => void;
  onArrive: (row: HostKioskRow) => void;
  onUndo: (row: HostKioskRow) => void;
  onWalkIn: (row: HostKioskRow) => void;
  onRetry: (item: KioskQueueItem) => void;
}

/** 画面本体（渲染测试直接用）：到着卡 · 搜索 · 结果 · 最新の受付（本机未送出的在前，coral 底 + 再試行）。 */
export function CheckInBody(props: CheckInBodyProps) {
  const { data, t, q, rows, queue, devices, busy } = props;
  const { styles } = useHostStyles();
  const { styles: k, colors } = useKioskStyles();
  const noKeyboard = addDesignMock("no-keyboard");
  const stream = streamRows(data.recent, queue);
  const queued = new Set(queue.map((item) => item.participantId));
  const total = data.total || 0;
  return (
    <View testID="host-check-in">
      <View style={styles.card}>
        <View style={[styles.row, styles.between]}>
          <View>
            <UiText style={styles.lbl}>{t("kArrived")}</UiText>
            <View style={k.bigRow}><UiText style={k.big}>{data.checkedIn + queue.filter((item) => !data.recent.some((r) => r.participantId === item.participantId)).length}</UiText><UiText style={k.bigSmall}>{t("kOfTotal", { n: total })}</UiText></View>
          </View>
          <Ring share={total ? data.checkedIn / total : 0}><UiText style={k.ringNum}>{data.rate}<UiText style={k.ringPct}>%</UiText></UiText></Ring>
        </View>
      </View>
      <View style={k.search}>
        <Icon name="search" size={16} color={colors.ink} />
        <TextInput value={q} onChangeText={props.onQ} placeholder={t("kSearchPh")} placeholderTextColor={colors.ink3} autoFocus={Boolean(props.focusSearch)} showSoftInputOnFocus={!noKeyboard} selectionColor={colors.plum700} accessibilityLabel={t("kSearch")} style={k.searchInput} testID="host-check-in-search" />
      </View>
      {q.trim() ? (
        <View style={[styles.card, k.listCard]} testID="host-check-in-results">
          {rows.length ? rows.map((row, index) => {
            const isQueued = queued.has(row.participantId);
            const sub = row.status === "checked_in" && row.checkedInAt ? `${row.org ?? ""} · ${t("appCheckedAt", { time: clock(row.checkedInAt) })}` : row.org ?? "";
            const tap = row.status === "checked_in" && row.undoable && !isQueued ? () => props.onUndo(row) : row.status === "waitlisted" && data.canWalkIn ? () => props.onWalkIn(row) : undefined;
            return (
              <UiPressable key={row.participantId} accessibilityRole="button" accessibilityLabel={row.name} disabled={!tap} onPress={tap ?? (() => undefined)} style={k.li} testID={`host-check-in-row-${row.participantId}`}>
                {index ? <View style={k.liLine} /> : null}
                <Avatar initial={row.initial} tone={avatarTone(row.name)} />
                <View style={styles.grow}><UiText style={k.metaB} numberOfLines={1}>{row.name}</UiText><UiText style={k.metaS} numberOfLines={1}>{sub.replace(/^ · /, "")}</UiText></View>
                {row.status === "not_arrived" && !isQueued ? <BtnSm label={busy === row.participantId ? "…" : t("appArrive")} primary icon="check" onPress={() => props.onArrive(row)} testID={`host-arrive-${row.participantId}`} />
                  : <View>{isQueued ? <Chip label={t("kStPending")} coral />
                    : row.status === "checked_in" ? <Chip label={row.table ? t("kTable", { t: row.table }) : t("kArrived")} tone="teal" />
                      : <Chip label={t("kStWait")} tone="apricot" />}</View>}
              </UiPressable>
            );
          }) : <UiText style={[styles.sub, k.none]}>{t("kNoResult", { q: q.trim() })}</UiText>}
        </View>
      ) : null}
      <View style={[styles.cardH, k.streamH]}><UiText style={styles.h3}>{t("kStream")}</UiText>{devices > 0 ? <UiText style={styles.lbl}>{t("appDevices", { n: devices })}</UiText> : null}</View>
      <View style={[styles.card, k.listCard]} testID="host-check-in-stream">
        {stream.length ? stream.map((row, index) => {
          const item = row.queued ? queue.find((entry) => entry.idempotencyKey === row.key) : undefined;
          return (
            <View key={row.key} style={[k.li, row.queued ? k.failed : null]} testID={row.queued ? `host-queued-${row.participantId}` : undefined}>
              {index ? <View style={k.liLine} /> : null}
              <Avatar initial={row.initial} tone={avatarTone(row.name)} size="sm" />
              <View style={styles.grow}>
                <UiText style={k.metaB} numberOfLines={1}>{row.name}</UiText>
                <UiText style={k.metaS} numberOfLines={1}>{`${clock(row.at)} · ${row.queued ? t("appSendFailed") : row.org ?? ""}`}</UiText>
              </View>
              {row.queued && item ? <BtnSm label={t("kRetry")} icon="refresh" onPress={() => props.onRetry(item)} testID={`host-retry-${row.participantId}`} /> : row.table ? <View><Chip label={row.table} tone="lav" /></View> : null}
            </View>
          );
        }) : <UiText style={[styles.sub, k.none]}>{t("kStreamEmpty")}</UiText>}
      </View>
    </View>
  );
}

// kit（b6 #24）：.big 38/800 -0.02em lh1.05 · small 15/700 ink3 ml3 · .ring 84/9 · .search 44 r999 0/16 gap8 13.5/700 mt14 ·
// 结果卡 mt12 p6/16 · .li 11 0 gap12、分隔线 left 50 · 送信失败行 coral-soft m6/-10 p10 r14 · .card-h mt18。
export const useKioskStyles = createThemedStyles((colors) => StyleSheet.create({
  big: { color: colors.ink, fontFamily: numFont, fontSize: 38, fontVariant: ["tabular-nums"], fontWeight: "800", letterSpacing: -0.76, lineHeight: 39.9 },
  bigRow: { alignItems: "baseline", flexDirection: "row" },
  bigSmall: { color: colors.ink3, fontFamily: numFont, fontSize: 17, fontWeight: "700", letterSpacing: 0, marginLeft: 3 },
  ringNum: { color: colors.ink, fontFamily: numFont, fontSize: 19, fontWeight: "800", lineHeight: 21 },
  ringPct: { fontSize: 12 },
  search: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 999, flexDirection: "row", gap: 8, height: 44, marginTop: 14, paddingHorizontal: 16 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: "700", height: 44, padding: 0 },
  listCard: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 6 },
  li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
  liLine: { backgroundColor: colors.line, height: 1, left: 50, position: "absolute", right: 0, top: 0 },
  failed: { backgroundColor: colors.coralSoft, borderRadius: 14, marginHorizontal: -10, marginVertical: 6, paddingHorizontal: 10, paddingVertical: 10 },
  metaB: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25 },
  metaS: { color: colors.ink3, fontSize: 14, lineHeight: 21 },
  streamH: { marginBottom: 0, marginTop: 18 },
  none: { paddingVertical: 14, textAlign: "center" },
  qrSheet: { alignItems: "stretch" },
  viewfinder: { alignSelf: "center", borderColor: colors.plum300, borderRadius: 24, borderWidth: 3, height: 220, marginVertical: 10, overflow: "hidden", width: 220 },
  qrTitle: { color: colors.ink, fontSize: 18, fontWeight: "700", lineHeight: 27, textAlign: "center" },
  qrSub: { color: colors.ink2, fontSize: 15, lineHeight: 23, marginTop: 4, textAlign: "center" },
  qrBtn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 999, height: 40, justifyContent: "center", marginTop: 14 },
  qrBtnText: { color: colors.ink, fontSize: 15, fontWeight: "700" },
}));
