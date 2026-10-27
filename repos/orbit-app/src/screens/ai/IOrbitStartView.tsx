import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, TextInput, View } from "react-native";

import { AppScreen } from "../../components/AppScreen";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import { ActionSheet, BottomSheet, Button, Card, ConfirmDialog, FullDrawer, Icon, IconButton, MacTile, SearchField, TextField, UiPressable, UiText } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { iorbitR21Copy } from "../../i18n/iorbitR21";

export type IOrbitHistoryItem = {
  groupId: string | null;
  id: string;
  organizationRevision: number;
  pinned: boolean;
  preview: string;
  source: "conversation" | "session";
  title: string;
  updatedAt: string;
  when: string;
};

export type IOrbitPlanIntake = { intakeId: string; goal: string };
export type IOrbitPlanGoal = { planId: string; goal: string; status: "active" | "achieved" };

function tokyoGroup(item: IOrbitHistoryItem, now = new Date()): "pinned" | "today" | "week" | "older" {
  if (item.pinned) return "pinned";
  const date = new Date(item.updatedAt ?? "");
  if (Number.isNaN(date.getTime())) return "older";
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const day = format.format(date);
  const today = format.format(now);
  if (day === today) return "today";
  const todayDate = new Date(`${today}T00:00:00Z`);
  const monday = new Date(todayDate.getTime() - ((todayDate.getUTCDay() + 6) % 7) * 86_400_000);
  return new Date(`${day}T00:00:00Z`) >= monday ? "week" : "older";
}

function HistoryItemRow({ item, onOpen, onSelect, styles, colors }: {
  item: IOrbitHistoryItem;
  onOpen: (item: IOrbitHistoryItem) => void;
  onSelect: (item: IOrbitHistoryItem) => void;
  styles: ReturnType<typeof useStyles>["styles"];
  colors: ReturnType<typeof useStyles>["colors"];
}) {
  const copy = iorbitR21Copy[useOrbitLocale().language];
  const swipeDistance = useRef(0);
  const swipeStartX = useRef<number | null>(null);
  const swipeActions = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => item.source === "session" && gesture.dx < -10 && Math.abs(gesture.dy) < 20,
    onPanResponderGrant: () => { swipeDistance.current = 0; swipeStartX.current = null; },
    onPanResponderMove: (_event, gesture) => {
      if (swipeStartX.current === null) swipeStartX.current = gesture.moveX - gesture.dx;
      swipeDistance.current = Math.min(swipeDistance.current, gesture.dx, gesture.moveX - swipeStartX.current);
    },
    onPanResponderRelease: () => { if (item.source === "session" && swipeDistance.current < -60) onSelect(item); swipeDistance.current = 0; swipeStartX.current = null; },
    onPanResponderTerminate: () => { swipeDistance.current = 0; swipeStartX.current = null; },
  }), [item, onSelect]);
  return <View style={styles.historyRow} {...swipeActions.panHandlers}>
    <UiPressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => onOpen(item)} onLongPress={() => onSelect(item)} style={styles.historyMain}>
      <Icon name={item.pinned ? "pin" : "chat"} size={16} color={colors.ink2} /><View style={styles.recentCopy}><UiText numberOfLines={2} style={styles.recentTitle}>{item.title}</UiText><UiText style={styles.recentMeta}>{item.when}</UiText></View>
    </UiPressable>
    {item.source === "session" ? <IconButton icon="more" accessibilityLabel={`${item.title}${copy.actionsFor}`} size={34} onPress={() => onSelect(item)} /> : null}
  </View>;
}

export function IOrbitStartView({
  contactCount, confirmDelete, deleting, designMenu = false, draft, error, history, historyHasMore,
  historyLoading, historyNotice, historyOpen, historyQuery, offline, offlineAt, hasPendingWrites, onDiscardFailedWrite, onClose, onConfirmDelete,
  onCancelDelete, onDelete, onDraftChange, onHistoryClose, onHistoryOpen, onHistoryQueryChange,
  onLoadMore, onNew, onNewGoal, onOpen, onOpenGoal, onOpenIntake, onPin, onRename, onScan, onSend, onUndo, planGoals, planIntakes, suggestions,
  undoAvailable,
}: {
  contactCount: number;
  confirmDelete: IOrbitHistoryItem | null;
  deleting: boolean;
  designMenu?: boolean;
  draft: string;
  error: string | null;
  history: IOrbitHistoryItem[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyNotice: { message: string; retryLabel?: string; onRetry?: () => void } | null;
  historyOpen: boolean;
  historyQuery: string;
  offline: boolean;
  offlineAt: string | null;
  hasPendingWrites?: boolean;
  onDiscardFailedWrite?: (() => void) | undefined;
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
  onOpenGoal: (goal: IOrbitPlanGoal, destination: "overview" | "review" | "done") => void;
  onPin: (item: IOrbitHistoryItem) => void;
  onRename: (item: IOrbitHistoryItem, title: string) => void;
  onScan: () => void;
  onSend: (text?: string) => void;
  onUndo: () => void;
  planIntakes: readonly IOrbitPlanIntake[];
  planGoals: readonly IOrbitPlanGoal[];
  suggestions: { key: string; label: string; emoji: string }[];
  undoAvailable: boolean;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const copy = iorbitR21Copy[locale.language];
  const [selected, setSelected] = useState<IOrbitHistoryItem | null>(null);
  useEffect(() => {
    if (designMenu && historyOpen) setSelected((current) => current ?? history.find((item) => item.source === "session" && !item.pinned) ?? null);
  }, [designMenu, history, historyOpen]);
  const [renaming, setRenaming] = useState<IOrbitHistoryItem | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const edgeExit = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.x0 < 54 && gesture.dx > 24 && Math.abs(gesture.dy) < 28,
    onPanResponderRelease: (_event, gesture) => { if (gesture.x0 < 54 && gesture.dx > 64) onClose(); },
  }), [onClose]);
  const groups = useMemo(() => {
    const result = new Map<ReturnType<typeof tokyoGroup>, IOrbitHistoryItem[]>([["pinned", []], ["today", []], ["week", []], ["older", []]]);
    for (const item of history) result.get(tokyoGroup(item))!.push(item);
    return [...result].filter(([, items]) => items.length > 0);
  }, [history]);
  const recent = history.slice(0, 3);
  return <View {...edgeExit.panHandlers} style={styles.root}>
    <AppScreen inset="kit" title="iOrbit" showBack={false} header={<View style={styles.header}>
      <IconButton icon="menu" accessibilityLabel={copy.conversations} onPress={onHistoryOpen} />
      <View style={styles.headerCopy}><UiText accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit style={styles.headerTitle}>iOrbit</UiText>
        {contactCount > 0 ? <UiText numberOfLines={1} style={styles.headerSubtitle}>{copy.headerSubtitle}</UiText> : null}
      </View>
      <IconButton icon="x" accessibilityLabel={copy.close} onPress={onClose} />
    </View>}>
      <View style={styles.body}>
        <View style={styles.greeting}>
          <MacTile emoji="✨" tone="lav" />
          <UiText accessibilityRole="header" style={styles.title}>{copy.greeting}</UiText>
          <UiText style={styles.subtitle}>{copy.subtitle}</UiText>
        </View>
        {contactCount === 0 ? <Card variant="flat"><View style={styles.emptyCard}>
          <MacTile emoji="📇" tone="apricot" /><UiText style={styles.cardTitle}>{copy.addCard}</UiText>
          <Button label={copy.scan} variant="primary" onPress={onScan} />
        </View></Card> : null}
        <View style={styles.starters}>
          {suggestions.slice(0, 4).map((item) => <UiPressable key={item.key} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => onSend(item.label)} style={styles.starter}>
            <MacTile emoji={item.emoji} tone="lav" size="sm" /><UiText style={styles.starterText}>{item.label}</UiText>
          </UiPressable>)}
        </View>
        {recent.length ? <Card><View style={styles.sectionHead}><UiText style={styles.cardTitle}>{copy.recent}</UiText><Button label={copy.all} variant="ghost" size="sm" onPress={onHistoryOpen} /></View>
          {recent.map((item) => <UiPressable key={`${item.source}:${item.id}`} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => onOpen(item)} style={styles.recentRow}>
            <View style={styles.recentIcon}><Icon name="clock" size={16} color={colors.ink2} /></View>
            <UiText numberOfLines={1} style={[styles.recentTitle, styles.recentRowTitle]}>{item.title}</UiText>
            <UiText numberOfLines={1} style={styles.recentWhen}>{item.when}</UiText>
          </UiPressable>)}
        </Card> : null}
        {offline ? <UiText accessibilityRole="alert" style={styles.muted}>{copy.offline} · {offlineAt && !Number.isNaN(new Date(offlineAt).getTime()) ? `${new Intl.DateTimeFormat(locale.language, { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(offlineAt))} ${copy.historyAt}` : copy.savedHistory}</UiText> : null}
        {hasPendingWrites ? <UiText accessibilityLiveRegion="polite" style={styles.muted}>{copy.syncPending}</UiText> : null}
        <View style={styles.composer}>
          <TextInput accessibilityLabel={copy.ask} autoCorrect multiline={false} onChangeText={onDraftChange} onSubmitEditing={() => onSend()} placeholder={copy.askPlaceholder} placeholderTextColor={colors.ink3Text} returnKeyType="send" style={styles.input} value={draft} />
          <IconButton icon="send" accessibilityLabel={copy.send} onPress={() => onSend()} disabled={!draft.trim() || offline} solid />
        </View>
        {error ? <UiText accessibilityRole="alert" style={styles.error}>{error}</UiText> : null}
        {onDiscardFailedWrite ? <Button label={copy.discardChange} variant="ghost" onPress={onDiscardFailedWrite} /> : null}
        {undoAvailable ? <Button label={copy.undo} variant="ghost" icon="undo" onPress={onUndo} /> : null}
        <UiText style={styles.muted}>{copy.manualSend}</UiText>
      </View>
    </AppScreen>
    <FullDrawer visible={historyOpen} title={copy.conversations} side="left" onClose={onHistoryClose}>
      <Button label={copy.newConversation} icon="plus" variant="primary" onPress={onNew} block />
      <SearchField value={historyQuery} onChangeText={onHistoryQueryChange} placeholder={copy.searchHistory} />
      {historyLoading && !history.length ? <UiText accessibilityLiveRegion="polite" style={styles.muted}>{copy.loading}</UiText> : null}
      {historyNotice ? <View style={styles.notice}><UiText accessibilityRole="alert" style={styles.error}>{historyNotice.message}</UiText>{historyNotice.onRetry ? <Button label={historyNotice.retryLabel ?? copy.retry} variant="ghost" size="sm" onPress={historyNotice.onRetry} /> : null}</View> : null}
      {hasPendingWrites ? <UiText accessibilityLiveRegion="polite" style={styles.muted}>{copy.syncPending}</UiText> : null}
      {error ? <UiText accessibilityRole="alert" style={styles.error}>{error}</UiText> : null}
      {onDiscardFailedWrite ? <Button label={copy.discardChange} variant="ghost" onPress={onDiscardFailedWrite} /> : null}
      {undoAvailable ? <Button label={copy.undo} variant="ghost" icon="undo" onPress={onUndo} /> : null}
      {!history.length && !historyLoading && !historyNotice ? <UiText style={styles.muted}>{historyQuery ? copy.noMatch : copy.noHistory}</UiText> : null}
      {groups.map(([label, items]) => <View key={label} style={styles.group}><UiText style={styles.groupTitle}>{copy[label]}</UiText>
        {items.map((item) => <HistoryItemRow key={`${item.source}:${item.id}`} item={item} onOpen={onOpen} onSelect={setSelected} styles={styles} colors={colors} />)}
      </View>)}
      {/* QA-A: the search box filtered chats only; plans stayed listed under "no matching chats". */}
      {(() => {
        const needle = historyQuery.trim().toLowerCase();
        const shownIntakes = needle ? planIntakes.filter((intake) => intake.goal.toLowerCase().includes(needle)) : planIntakes;
        const shownGoals = needle ? planGoals.filter((goal) => goal.goal.toLowerCase().includes(needle)) : planGoals;
        if (needle && !shownIntakes.length && !shownGoals.length) return null;
        return (
      <View style={styles.group}><UiText style={styles.groupTitle}>{copy.plan}</UiText>
        {shownIntakes.map((intake) => <UiPressable key={intake.intakeId} accessibilityRole="button" accessibilityLabel={intake.goal} onPress={() => onOpenIntake(intake)} style={styles.historyMain}>
          <Icon name="target" size={16} color={colors.ink2} /><View style={styles.recentCopy}><UiText numberOfLines={2} style={styles.recentTitle}>{intake.goal}</UiText><UiText style={styles.recentMeta}>{copy.continuePlan}</UiText></View>
        </UiPressable>)}
        {shownGoals.map((goal) => <View key={goal.planId} style={styles.historyRow}>
          <UiPressable accessibilityRole="button" accessibilityLabel={goal.goal} onPress={() => onOpenGoal(goal, "overview")} style={styles.historyMain}>
            <Icon name="target" size={16} color={colors.ink2} /><View style={styles.recentCopy}><UiText numberOfLines={2} style={styles.recentTitle}>{goal.goal}</UiText><UiText style={styles.recentMeta}>{goal.status === "achieved" ? copy.achieved : copy.active}</UiText></View>
          </UiPressable>
          <Button label={goal.status === "achieved" ? copy.viewDone : copy.review} variant="ghost" size="sm" onPress={() => onOpenGoal(goal, goal.status === "achieved" ? "done" : "review")} />
        </View>)}
        {needle ? null : <Button label={copy.newGoal} icon="plus" variant="ghost" size="sm" onPress={onNewGoal} />}
      </View>
        );
      })()}
      {historyHasMore ? <Button label={historyLoading ? copy.loadingMore : copy.more} variant="ghost" onPress={onLoadMore} disabled={historyLoading} block /> : null}
    </FullDrawer>
    <ActionSheet visible={selected !== null} title={selected?.title || copy.conversationActions} onClose={() => setSelected(null)} options={selected?.source === "session" ? [
      { key: "pin", label: selected.pinned ? copy.unpin : copy.pin },
      { key: "rename", label: copy.rename },
      { key: "delete", label: copy.delete, destructive: true },
      { key: "cancel", label: copy.cancel },
    ] : [{ key: "cancel", label: copy.cancel }]} onSelect={(key) => {
      const item = selected; setSelected(null); if (!item) return;
      if (key === "pin") onPin(item);
      if (key === "rename") { setRenameDraft(item.title); setRenaming(item); }
      if (key === "delete") onDelete(item);
    }} />
    <BottomSheet visible={renaming !== null} onClose={() => setRenaming(null)} accessibilityLabel={copy.rename}><View style={styles.renameEditor}>
      <TextField label={copy.conversationName} autoFocus value={renameDraft} onChangeText={setRenameDraft} />
      <Button label={copy.save} variant="primary" disabled={!renameDraft.trim()} onPress={() => { if (renaming && renameDraft.trim()) onRename(renaming, renameDraft.trim()); setRenaming(null); }} />
    </View></BottomSheet>
    <ConfirmDialog visible={confirmDelete !== null} title={copy.confirmDelete} message={confirmDelete ? `${confirmDelete.title}\n\n${copy.deleteDetail}` : copy.deleteDetail} confirmLabel={deleting ? copy.deleting : copy.delete} destructive icon="trash" onConfirm={onConfirmDelete} onCancel={onCancelDelete} />
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm, paddingBottom: spacing.md },
  headerCopy: { flex: 1, alignItems: "center", gap: spacing.xxs },
  headerTitle: { color: colors.ink, fontSize: typography.titleSm, fontWeight: "800", flexShrink: 1 },
  headerSubtitle: { color: colors.ink3Text, fontSize: typography.label },
  body: { gap: spacing.lg, paddingBottom: spacing.xl },
  greeting: { alignItems: "flex-start", gap: spacing.sm },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: "800", flexShrink: 1, lineHeight: 35 },
  subtitle: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 24 },
  emptyCard: { gap: spacing.sm, alignItems: "flex-start" },
  cardTitle: { color: colors.ink, fontSize: typography.body, fontWeight: "800", flex: 1 },
  starters: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.sm },
  starter: { width: "48%", minHeight: 106, alignItems: "flex-start", justifyContent: "space-between", gap: spacing.xs, padding: spacing.md, borderRadius: 20, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
  starterText: { flex: 1, color: colors.ink, fontSize: typography.bodySm, fontWeight: "700" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recentRow: { flexDirection: "row", alignItems: "center", minHeight: 52, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  recentIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  recentCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  recentTitle: { color: colors.ink, fontSize: typography.bodySm, fontWeight: "700" },
  recentRowTitle: { flex: 1 },
  recentWhen: { color: colors.ink3Text, fontSize: typography.label },
  recentMeta: { color: colors.ink3Text, fontSize: typography.label },
  composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xl, backgroundColor: colors.surface, borderRadius: 22, borderColor: colors.line, borderWidth: 1, paddingHorizontal: spacing.sm, minHeight: 58 },
  input: { flex: 1, minWidth: 0, color: colors.ink, fontSize: typography.body, paddingHorizontal: spacing.sm, minHeight: 44 },
  error: { color: colors.coralText, fontSize: typography.bodySm },
  muted: { color: colors.ink3Text, fontSize: typography.label },
  notice: { gap: spacing.xs },
  group: { gap: spacing.xs },
  groupTitle: { color: colors.ink3Text, fontSize: typography.label, fontWeight: "700" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  historyMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 56 },
  renameEditor: { gap: spacing.md },
}));
