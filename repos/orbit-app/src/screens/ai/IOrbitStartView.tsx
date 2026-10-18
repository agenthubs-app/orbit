import { useMemo, useState } from "react";
import { PanResponder, StyleSheet, TextInput, View } from "react-native";

import { AppScreen } from "../../components/AppScreen";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import { ActionSheet, BottomSheet, Button, Card, ConfirmDialog, FullDrawer, Icon, IconButton, MacTile, SearchField, TextField, UiPressable, UiText } from "../../components/ui";

export type IOrbitHistoryItem = {
  groupId: string | null;
  id: string;
  organizationRevision: number;
  pinned: boolean;
  preview: string;
  source: "conversation" | "session";
  title: string;
  updatedAt?: string;
  when: string;
};

export type IOrbitPlanIntake = { intakeId: string; goal: string };

function tokyoGroup(item: IOrbitHistoryItem, now = new Date()): "ピン留め" | "今日" | "今週" | "それ以前" {
  if (item.pinned) return "ピン留め";
  const date = new Date(item.updatedAt ?? "");
  if (Number.isNaN(date.getTime())) return "それ以前";
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const day = format.format(date);
  const today = format.format(now);
  if (day === today) return "今日";
  const todayDate = new Date(`${today}T00:00:00Z`);
  const monday = new Date(todayDate.getTime() - ((todayDate.getUTCDay() + 6) % 7) * 86_400_000);
  return new Date(`${day}T00:00:00Z`) >= monday ? "今週" : "それ以前";
}

export function IOrbitStartView({
  contactCount, confirmDelete, deleting, draft, error, history, historyHasMore,
  historyLoading, historyOpen, historyQuery, offline, offlineAt, onClose, onConfirmDelete,
  onCancelDelete, onDelete, onDraftChange, onHistoryClose, onHistoryOpen, onHistoryQueryChange,
  onLoadMore, onNew, onNewGoal, onOpen, onOpenIntake, onPin, onRename, onScan, onSend, onUndo, planIntakes, suggestions,
  undoAvailable,
}: {
  contactCount: number;
  confirmDelete: IOrbitHistoryItem | null;
  deleting: boolean;
  draft: string;
  error: string | null;
  history: IOrbitHistoryItem[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyOpen: boolean;
  historyQuery: string;
  offline: boolean;
  offlineAt: string | null;
  onClose: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onDelete: (item: IOrbitHistoryItem) => void;
  onDraftChange: (value: string) => void;
  onHistoryClose: () => void;
  onHistoryOpen: () => void;
  onHistoryQueryChange: (value: string) => void;
  onLoadMore: () => void;
  onNew: () => void;
  onNewGoal: () => void;
  onOpen: (item: IOrbitHistoryItem) => void;
  onOpenIntake: (intake: IOrbitPlanIntake) => void;
  onPin: (item: IOrbitHistoryItem) => void;
  onRename: (item: IOrbitHistoryItem, title: string) => void;
  onScan: () => void;
  onSend: (text?: string) => void;
  onUndo: () => void;
  planIntakes: readonly IOrbitPlanIntake[];
  suggestions: { key: string; label: string; emoji: string }[];
  undoAvailable: boolean;
}) {
  const { colors, styles } = useStyles();
  const [selected, setSelected] = useState<IOrbitHistoryItem | null>(null);
  const [renaming, setRenaming] = useState<IOrbitHistoryItem | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const edgeExit = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.x0 < 54 && gesture.dx > 24 && Math.abs(gesture.dy) < 28,
    onPanResponderRelease: (_event, gesture) => { if (gesture.x0 < 54 && gesture.dx > 64) onClose(); },
  }), [onClose]);
  const groups = useMemo(() => {
    const result = new Map<string, IOrbitHistoryItem[]>([["ピン留め", []], ["今日", []], ["今週", []], ["それ以前", []]]);
    for (const item of history) result.get(tokyoGroup(item))!.push(item);
    return [...result].filter(([, items]) => items.length > 0);
  }, [history]);
  const recent = history.slice(0, 3);
  return <View {...edgeExit.panHandlers} style={styles.root}>
    <AppScreen inset="kit" title="iOrbit" showBack={false} header={<View style={styles.header}>
      <IconButton icon="menu" accessibilityLabel="会話リスト" onPress={onHistoryOpen} />
      <UiText accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit style={styles.headerTitle}>iOrbit</UiText>
      <IconButton icon="x" accessibilityLabel="閉じる" onPress={onClose} />
    </View>}>
      <View style={styles.body}>
        <View style={styles.greeting}>
          <MacTile emoji="✨" tone="lav" />
          <UiText accessibilityRole="header" style={styles.title}>何をお手伝いしましょう？</UiText>
          <UiText style={styles.subtitle}>人脈やイベント、プランのこと。iOrbit に聞いてください。</UiText>
        </View>
        {contactCount === 0 ? <Card variant="flat"><View style={styles.emptyCard}>
          <MacTile emoji="📇" tone="apricot" /><UiText style={styles.cardTitle}>名刺を追加すると、もっと具体的に答えられます</UiText>
          <Button label="スキャン" variant="primary" onPress={onScan} />
        </View></Card> : null}
        <View style={styles.starters}>
          {suggestions.slice(0, 4).map((item) => <UiPressable key={item.key} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => onSend(item.label)} style={styles.starter}>
            <MacTile emoji={item.emoji} tone="lav" size="sm" /><UiText style={styles.starterText}>{item.label}</UiText><Icon name="right" size={16} color={colors.ink3Text} />
          </UiPressable>)}
        </View>
        {recent.length ? <Card><View style={styles.sectionHead}><UiText style={styles.cardTitle}>最近の会話</UiText><Button label="すべて" variant="ghost" size="sm" onPress={onHistoryOpen} /></View>
          {recent.map((item) => <UiPressable key={`${item.source}:${item.id}`} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => onOpen(item)} style={styles.recentRow}>
            <View style={styles.recentCopy}><UiText numberOfLines={2} style={styles.recentTitle}>{item.title}</UiText><UiText numberOfLines={1} style={styles.recentMeta}>{item.when}</UiText></View><Icon name="right" size={16} color={colors.ink3Text} />
          </UiPressable>)}
        </Card> : null}
        {offline ? <UiText accessibilityRole="alert" style={styles.muted}>オフライン · {offlineAt && !Number.isNaN(new Date(offlineAt).getTime()) ? `${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(offlineAt))} 時点の履歴` : "保存済みの履歴"}</UiText> : null}
        <View style={styles.composer}>
          <TextInput accessibilityLabel="iOrbit に聞く" autoCorrect multiline={false} onChangeText={onDraftChange} onSubmitEditing={() => onSend()} placeholder="iOrbit に聞く…" placeholderTextColor={colors.ink3Text} returnKeyType="send" style={styles.input} value={draft} />
          <IconButton icon="send" accessibilityLabel="送信" onPress={() => onSend()} disabled={!draft.trim() || offline} solid />
        </View>
        {error ? <UiText accessibilityRole="alert" style={styles.error}>{error}</UiText> : null}
        {undoAvailable ? <Button label="削除を元に戻す" variant="ghost" icon="undo" onPress={onUndo} /> : null}
        <UiText style={styles.muted}>送信はあなたが行います。</UiText>
      </View>
    </AppScreen>
    <FullDrawer visible={historyOpen} title="会話リスト" onClose={onHistoryClose}>
      <Button label="新しい会話" icon="plus" variant="primary" onPress={onNew} block />
      <SearchField value={historyQuery} onChangeText={onHistoryQueryChange} placeholder="タイトルと本文を検索" />
      {error ? <UiText accessibilityRole="alert" style={styles.error}>{error}</UiText> : null}
      {undoAvailable ? <Button label="削除を元に戻す" variant="ghost" icon="undo" onPress={onUndo} /> : null}
      {!history.length && !historyLoading ? <UiText style={styles.muted}>{historyQuery ? "一致する会話はありません" : "まだ会話はありません"}</UiText> : null}
      {groups.map(([label, items]) => <View key={label} style={styles.group}><UiText style={styles.groupTitle}>{label}</UiText>
        {items.map((item) => <View key={`${item.source}:${item.id}`} style={styles.historyRow}>
          <UiPressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => onOpen(item)} onLongPress={() => setSelected(item)} style={styles.historyMain}>
            <Icon name={item.pinned ? "pin" : "chat"} size={16} color={colors.ink2} /><View style={styles.recentCopy}><UiText numberOfLines={2} style={styles.recentTitle}>{item.title}</UiText><UiText style={styles.recentMeta}>{item.when}</UiText></View>
          </UiPressable>
          {item.source === "session" ? <IconButton icon="more" accessibilityLabel={`${item.title} の操作`} size={34} onPress={() => setSelected(item)} /> : null}
        </View>)}
      </View>)}
      <View style={styles.group}><UiText style={styles.groupTitle}>プランを作る</UiText>
        {planIntakes.map((intake) => <UiPressable key={intake.intakeId} accessibilityRole="button" accessibilityLabel={intake.goal} onPress={() => onOpenIntake(intake)} style={styles.historyMain}>
          <Icon name="target" size={16} color={colors.ink2} /><View style={styles.recentCopy}><UiText numberOfLines={2} style={styles.recentTitle}>{intake.goal}</UiText><UiText style={styles.recentMeta}>作成中のプランを続ける</UiText></View>
        </UiPressable>)}
        <Button label="新しい目標" icon="plus" variant="ghost" size="sm" onPress={onNewGoal} />
      </View>
      {historyHasMore ? <Button label={historyLoading ? "読み込み中…" : "もっと見る"} variant="ghost" onPress={onLoadMore} disabled={historyLoading} block /> : null}
    </FullDrawer>
    <ActionSheet visible={selected !== null} title="会話の操作" onClose={() => setSelected(null)} options={selected?.source === "session" ? [
      { key: "pin", label: selected.pinned ? "ピン留めを外す" : "ピン留め" },
      { key: "rename", label: "名前を変更" },
      { key: "delete", label: "削除", destructive: true },
      { key: "cancel", label: "キャンセル" },
    ] : [{ key: "cancel", label: "キャンセル" }]} onSelect={(key) => {
      const item = selected; setSelected(null); if (!item) return;
      if (key === "pin") onPin(item);
      if (key === "rename") { setRenameDraft(item.title); setRenaming(item); }
      if (key === "delete") onDelete(item);
    }} />
    <BottomSheet visible={renaming !== null} onClose={() => setRenaming(null)} accessibilityLabel="名前を変更"><View style={styles.renameEditor}>
      <TextField label="会話の名前" autoFocus value={renameDraft} onChangeText={setRenameDraft} />
      <Button label="保存" variant="primary" disabled={!renameDraft.trim()} onPress={() => { if (renaming && renameDraft.trim()) onRename(renaming, renameDraft.trim()); setRenaming(null); }} />
    </View></BottomSheet>
    <ConfirmDialog visible={confirmDelete !== null} title="この会話を削除しますか？" message="会話内で追加したタスクや予定は削除されません。" confirmLabel={deleting ? "削除中…" : "削除"} destructive icon="trash" onConfirm={onConfirmDelete} onCancel={onCancelDelete} />
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm, paddingBottom: spacing.md },
  headerTitle: { color: colors.ink, fontSize: typography.titleSm, fontWeight: "800", flexShrink: 1 },
  body: { gap: spacing.lg, paddingBottom: spacing.xl },
  greeting: { alignItems: "flex-start", gap: spacing.sm, paddingTop: spacing.xl },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: "800", flexShrink: 1, lineHeight: 30 },
  subtitle: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 21 },
  emptyCard: { gap: spacing.sm, alignItems: "flex-start" },
  cardTitle: { color: colors.ink, fontSize: typography.body, fontWeight: "800", flex: 1 },
  starters: { gap: spacing.sm },
  starter: { flexDirection: "row", alignItems: "center", minHeight: 64, gap: spacing.sm, padding: spacing.md, borderRadius: 20, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
  starterText: { flex: 1, color: colors.ink, fontSize: typography.bodySm, fontWeight: "700" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recentRow: { flexDirection: "row", alignItems: "center", minHeight: 52, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  recentCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  recentTitle: { color: colors.ink, fontSize: typography.bodySm, fontWeight: "700" },
  recentMeta: { color: colors.ink3Text, fontSize: typography.label },
  composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: 22, borderColor: colors.line, borderWidth: 1, paddingHorizontal: spacing.sm, minHeight: 58 },
  input: { flex: 1, minWidth: 0, color: colors.ink, fontSize: typography.body, paddingHorizontal: spacing.sm, minHeight: 44 },
  error: { color: colors.coralText, fontSize: typography.bodySm },
  muted: { color: colors.ink3Text, fontSize: typography.label },
  group: { gap: spacing.xs },
  groupTitle: { color: colors.ink3Text, fontSize: typography.label, fontWeight: "700" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  historyMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 56 },
  renameEditor: { gap: spacing.md },
}));
