// R12 / R16 まとめて確認（App，统一版 b9 A2 ④ App；名刺版照决定表 §17-9）：三格（重複 / 要確認 / そのまま追加）、
// 重複卡（同内容自动统合的绿卡 + 「名前が似ているだけ」逐行勾选 = 統合，選んだ N件を統合 / 別人として追加）、
// 要確認按原因分行（点一行展开那一组逐张修改），下面放来源自己的内容（名刺：会った場所、読み取れなかった名刺）。
// N人を人脈に追加 在底部固定按钮区（由页面放 KitFoot）。与 Web UnifiedReview 同一语义。
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Avatar, Icon, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { KitChip } from "../plan/plan-kit";

export type ReviewTileKey = "duplicate" | "review" | "asIs";

export interface AppReviewDuplicateRow {
  id: string;
  name: string;
  existingName: string;
  /** 既存：北辰製作所 · 名刺 */
  existingLine: string;
  /** 今回：鈴木 大輔（会社なし） */
  incomingLine: string;
  selected: boolean;
  /** Why the last settle did not go through (保存できませんでした …), under the row. */
  problem: string | null;
}

export interface AppReviewGroupRow {
  key: string;
  label: string;
  example: string;
  tone: "mid" | "lo";
  count: number;
  open: boolean;
}

export function UnifiedReviewApp({ tiles, active, duplicateTitle, exceptionsOnly, autoMergedLabel, autoMergedNote, similarLabel, duplicates, onToggle, onRowMenu, toggleLabel, mergeLabel, separateLabel, skipLabel, onMergeSelected, onSeparate, reviewTitle, reviewNote, estimated, groups, onGroup, groupBody, reviewAttention, busy, children }: {
  tiles: readonly { key: ReviewTileKey; label: string; count: number }[];
  active: ReviewTileKey;
  duplicateTitle: string;
  exceptionsOnly: string;
  autoMergedLabel: string | null;
  autoMergedNote: string;
  similarLabel: string;
  duplicates: readonly AppReviewDuplicateRow[];
  onToggle: (id: string) => void;
  /** Long press on a row: スキップ (not added, not merged). */
  onRowMenu: (id: string) => void;
  toggleLabel: (row: AppReviewDuplicateRow) => string;
  mergeLabel: string;
  separateLabel: string;
  skipLabel: string;
  onMergeSelected: () => void;
  onSeparate: () => void;
  reviewTitle: string;
  reviewNote: string;
  estimated: string;
  groups: readonly AppReviewGroupRow[];
  onGroup: (key: string) => void;
  /** The cards of an opened group (edited one by one). */
  groupBody: (key: string) => ReactNode;
  /** Opens 要確認 by itself (a card there could not be added and says why). */
  reviewAttention: boolean;
  busy: boolean;
  children?: ReactNode;
}) {
  const { colors, styles } = useStyles();
  const [reviewToggled, setReviewOpen] = useState(false);
  const reviewOpen = reviewToggled || reviewAttention;
  const selected = duplicates.filter((row) => row.selected).length;
  return (
    <View testID="add-batch-review">
      <View style={styles.bq}>
        {tiles.map((tile) => (
          <View key={tile.key} accessible accessibilityLabel={`${tile.label} ${tile.count}`} style={[styles.bqTile, active === tile.key && styles.bqOn]} testID={`add-tile-${tile.key}`}>
            <UiText numberOfLines={1} style={[styles.lbl, styles.bqLbl]}>{tile.label}</UiText>
            <UiText style={styles.bqNum}>{tile.count}</UiText>
          </View>
        ))}
      </View>

      {duplicates.length || autoMergedLabel ? (
        <View style={[styles.card, styles.cardTop]} testID="add-section-duplicate">
          <View style={styles.cardH}>
            <UiText style={styles.h3}>{duplicateTitle}</UiText>
            <UiText style={styles.lbl}>{exceptionsOnly}</UiText>
          </View>
          {autoMergedLabel ? (
            <View style={styles.ok}>
              <View style={styles.okMark}><Icon name="check" size={16} color={colors.surface} /></View>
              <View style={styles.grow}>
                <UiText style={styles.okTitle}>{autoMergedLabel}</UiText>
                <UiText style={styles.lbl}>{autoMergedNote}</UiText>
              </View>
            </View>
          ) : null}
          {/* 「名前が似ているだけの N件」 only contrasts with the auto-merged block above (b9 #4); without it the rows stand alone (b11 #4). */}
          {autoMergedLabel && duplicates.length ? <UiText style={[styles.lbl, styles.similar]}>{similarLabel}</UiText> : null}
          {duplicates.map((row, index) => (
            <View key={row.id} style={index > 0 ? styles.xrowLine : null}>
            <UiPressable accessibilityRole="checkbox" accessibilityLabel={toggleLabel(row)} accessibilityState={{ checked: row.selected }} onPress={() => onToggle(row.id)}
              onLongPress={() => onRowMenu(row.id)} accessibilityActions={[{ name: "longpress", label: skipLabel }]} onAccessibilityAction={() => onRowMenu(row.id)}
              style={styles.xrow} testID={`add-dup-${row.id}`}>
              <View style={[styles.cbx, row.selected && styles.cbxOn]}>{row.selected ? <Icon name="check" size={16} color={colors.surface} /> : null}</View>
              <View style={styles.avs}>
                <Avatar name={row.existingName} size="sm" />
                <View style={styles.avSecond}><Avatar name={row.name} size="sm" /></View>
              </View>
              <View style={styles.grow}>
                <UiText numberOfLines={1} style={styles.metaTitle}>{row.name}</UiText>
                <UiText numberOfLines={1} style={styles.metaSub}>{row.existingLine}</UiText>
                <UiText numberOfLines={1} style={styles.metaSub}>{row.incomingLine}</UiText>
              </View>
            </UiPressable>
            {row.problem ? <UiText style={styles.problem}>{row.problem}</UiText> : null}
            </View>
          ))}
          {duplicates.length ? (
            <View style={styles.acts}>
              <SmallButton primary label={mergeLabel} disabled={busy || !selected} onPress={onMergeSelected} testID="add-review-merge" />
              <SmallButton label={separateLabel} disabled={busy || !selected} onPress={onSeparate} testID="add-review-separate" />
            </View>
          ) : null}
        </View>
      ) : null}

      {groups.length ? (
        <View style={[styles.card, styles.cardNext, !reviewOpen && styles.accClosed]} testID="add-section-review">
          <UiPressable accessibilityRole="button" accessibilityState={{ expanded: reviewOpen }} onPress={() => setReviewOpen((value) => !value)} style={styles.between} testID="add-review-toggle">
            <UiText style={styles.h3}>{reviewTitle}</UiText>
            <View style={styles.accHead}>
              <UiText style={styles.lbl}>{reviewNote}</UiText>
              <View style={reviewOpen ? styles.chevOpen : null}><Icon name="down" size={16} color={colors.ink3} /></View>
            </View>
          </UiPressable>
          {reviewOpen ? <View style={styles.accBody}>
            {groups.map((group, index) => (
              <View key={group.key} testID={`add-group-${group.key}`}>
                <UiPressable accessibilityRole="button" accessibilityState={{ expanded: group.open }} accessibilityLabel={`${group.label} ${group.example} ${group.count}`} onPress={() => onGroup(group.key)}
                  style={[styles.frow, index < groups.length - 1 || group.open ? styles.frowLine : null]}>
                  <UiText numberOfLines={2} style={styles.frowKey}>{group.label}</UiText>
                  <View style={[styles.dot, { backgroundColor: group.tone === "lo" ? colors.coral : colors.plum300 }]} />
                  <UiText numberOfLines={1} style={styles.frowText}>{group.example}</UiText>
                  <KitChip label={estimated} tone="apricot" />
                </UiPressable>
                {group.open ? <View style={styles.groupBody}>{groupBody(group.key)}</View> : null}
              </View>
            ))}
          </View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** .btn.sm（高 32、左右 12、12px 700）/ .primary。可点范围补到 44。 */
export function SmallButton({ label, onPress, primary = false, ghost = false, disabled = false, busy = false, testID }: { label: string; onPress: () => void; primary?: boolean; ghost?: boolean; disabled?: boolean; busy?: boolean; testID?: string }) {
  const { colors, styles } = useStyles();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} hitSlop={6} onPress={onPress}
      style={[styles.sm, busy ? styles.smBusy : null, primary ? styles.smPrimary : ghost ? styles.smGhost : null, disabled ? styles.smOff : null]} testID={testID}>
      <UiText numberOfLines={1} style={[styles.smText, { color: primary ? colors.bg : ghost ? colors.ink2 : colors.ink }]}>{label}</UiText>
    </UiPressable>
  );
}

// kit 数值（b9 #4）：.bq / .card / .ok-card / .xrow / .cbx / .avs / .frow / .dot。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  bq: { flexDirection: "row", gap: 8 },
  bqTile: { flex: 1, minWidth: 0, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.surface },
  // .bq 里的 span.lbl 是行内元素：行盒取父级 14px × 1.5 = 21。
  bqLbl: { lineHeight: 21 },
  bqOn: { borderWidth: 1.5, borderColor: colors.plum500, paddingVertical: 8.5, paddingHorizontal: 10.5 },
  bqNum: { fontSize: 24, fontWeight: "800", lineHeight: 27.6, color: colors.ink, fontVariant: ["tabular-nums"] },
  lbl: { fontSize: 11.5, fontWeight: "500", lineHeight: 17.25, color: colors.ink3 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18 },
  cardTop: { marginTop: 12 },
  cardNext: { marginTop: 14 },
  // kit .acc collapsed: the body keeps its padding-top 8 (grid 0fr), so the closed card is 8 taller.
  accClosed: { paddingBottom: 26 },
  cardH: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  h3: { fontSize: 14.5, fontWeight: "800", lineHeight: 21.75, color: colors.ink },
  ok: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: `${colors.ok}73` },
  okMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ok, alignItems: "center", justifyContent: "center" },
  okTitle: { fontSize: 12.5, fontWeight: "700", lineHeight: 18.75, color: colors.ink },
  grow: { flex: 1, minWidth: 0 },
  similar: { marginTop: 12, marginBottom: 2 },
  xrow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  xrowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  cbx: { width: 20, height: 20, borderRadius: 7, borderWidth: 1.8, borderColor: colors.ink4, alignItems: "center", justifyContent: "center" },
  cbxOn: { backgroundColor: colors.plum700, borderColor: colors.plum700 },
  avs: { flexDirection: "row" },
  avSecond: { marginLeft: -8, borderRadius: 999, borderWidth: 2, borderColor: colors.surface, margin: -2 },
  metaTitle: { fontSize: 13, fontWeight: "700", lineHeight: 19.5, color: colors.ink },
  metaSub: { fontSize: 11.5, lineHeight: 17.25, color: colors.ink3 },
  acts: { flexDirection: "row", gap: 8, marginTop: 10 },
  sm: { height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  smPrimary: { backgroundColor: colors.ink },
  smGhost: { backgroundColor: "transparent" },
  smOff: { opacity: 0.4 },
  smBusy: { opacity: 0.6 },
  smText: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  accHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  chevOpen: { transform: [{ rotate: "180deg" }] },
  accBody: { paddingTop: 8 },
  frow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  frowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  frowKey: { width: 62, fontSize: 11.5, lineHeight: 17.25, color: colors.ink3 },
  problem: { marginBottom: 8, marginLeft: 30, fontSize: 11.5, lineHeight: 17.25, color: colors.coralText },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  frowText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "700", lineHeight: 19.5, color: colors.ink },
  groupBody: { paddingVertical: 8, gap: 8 },
}));
