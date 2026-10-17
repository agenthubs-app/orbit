import { StyleSheet, View } from "react-native";

import type { TodoDecisionItem, TodoFollowupItem, TodoNextMoveItem, TodoPageContract, TodoSectionKey } from "../../api/contract/todo-page";
import { Button, Card, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { canWriteTodoFollowup, todoSectionCount } from "./todo-page-model";

export function TodoSections({ page, offline, staleDay, mirroredTaskIds, onRefresh, onOpen, onComplete, onDefer }: {
  page: TodoPageContract;
  offline: boolean;
  staleDay: boolean;
  mirroredTaskIds: ReadonlySet<string>;
  onRefresh: () => void;
  onOpen: (item: TodoDecisionItem | TodoNextMoveItem) => void;
  onComplete: (item: TodoFollowupItem) => void;
  onDefer: (item: TodoFollowupItem) => void;
}) {
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  const readOnly = offline || staleDay;
  const countLabel = (section: TodoSectionKey) => {
    const count = todoSectionCount(page, section);
    return count.accuracy === "unknown" ? t("todo.countUnknown")
      : t(count.accuracy === "exact" ? "todo.countExact" : "todo.countAtLeast", { count: count.value });
  };
  const sectionHead = (section: TodoSectionKey) => (
    <View style={styles.heading}>
      <UiText accessibilityRole="header" style={styles.headingText}>{t(`todo.${section}`)}</UiText>
      <UiText style={styles.count}>{countLabel(section)}</UiText>
    </View>
  );
  const partial = (section: TodoSectionKey) => todoSectionCount(page, section).incompleteSources.length ? (
    <View accessibilityRole="alert" style={styles.partial}>
      <UiText style={styles.muted}>{t("todo.partial")}</UiText>
      {!offline ? <Button label={t("todo.retry")} onPress={onRefresh} size="sm" variant="ghost" /> : null}
    </View>
  ) : null;
  const empty = (section: TodoSectionKey, length: number) => length === 0 && todoSectionCount(page, section).accuracy === "exact"
    ? <UiText style={styles.muted}>{t("todo.empty")}</UiText> : null;

  return <View style={styles.sections}>
    {readOnly ? <View accessibilityRole="alert" style={styles.notice}>
      <UiText style={styles.noticeText}>{[offline ? t("todo.offline") : null, staleDay ? t("todo.stale") : null].filter(Boolean).join(" · ")}</UiText>
    </View> : null}

    <Card style={styles.section}>
      {sectionHead("decisions")}
      {partial("decisions")}
      {empty("decisions", page.decisions.items.length)}
      {page.decisions.items.map(item => <View key={item.key} style={styles.row}>
        <View style={styles.rowBody}>
          <UiText style={styles.title}>{item.titlePreview}</UiText>
          {item.reasonPreview ? <UiText style={styles.muted}>{item.reasonPreview}</UiText> : null}
          {item.sample ? <UiText style={styles.sample}>{t("todo.sample")}</UiText> : null}
        </View>
        <Button label={t("todo.open")} onPress={() => onOpen(item)} size="sm" variant="secondary" disabled={readOnly || Boolean(item.sample)} />
      </View>)}
    </Card>

    <Card style={styles.section}>
      {sectionHead("nextMoves")}
      {partial("nextMoves")}
      {empty("nextMoves", page.nextMoves.items.length)}
      {page.nextMoves.items.map(item => <View key={item.key} style={styles.row}>
        <View style={styles.rowBody}>
          <UiText style={styles.title}>{item.titlePreview}</UiText>
          {item.reasonPreview ? <UiText style={styles.muted}>{item.reasonPreview}</UiText> : null}
          {item.sample ? <UiText style={styles.sample}>{t("todo.sample")}</UiText> : null}
        </View>
        <Button label={t(item.draftAvailable ? "todo.draft" : "todo.open")} onPress={() => onOpen(item)} size="sm" variant="secondary" disabled={readOnly || Boolean(item.sample) || !item.draftAvailable} />
      </View>)}
    </Card>

    <Card style={styles.section}>
      {sectionHead("followups")}
      {partial("followups")}
      {empty("followups", page.followups.items.length)}
      {page.followups.items.map(item => {
        const enabled = !item.sample && canWriteTodoFollowup(item, { offline, staleDay, locallyMirrored: mirroredTaskIds.has(item.taskId) });
        return <View key={item.key} style={styles.row}>
          <View style={styles.rowBody}>
            <UiText style={styles.title}>{item.titlePreview}</UiText>
            {item.overdue ? <UiText style={styles.overdue}>{t("todo.overdue")}</UiText> : null}
            {item.sample ? <UiText style={styles.sample}>{t("todo.sample")}</UiText> : null}
          </View>
          <View style={styles.actions}>
            <Button label={t("todo.defer")} onPress={() => onDefer(item)} size="sm" variant="ghost" disabled={!enabled} />
            <Button label={t("todo.complete")} onPress={() => onComplete(item)} size="sm" variant="secondary" disabled={!enabled} />
          </View>
        </View>;
      })}
    </Card>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  sections: { gap: 14, paddingHorizontal: 16, paddingBottom: 24 },
  section: { gap: 12 },
  heading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 8 },
  headingText: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  count: { color: colors.ink2, fontSize: 12 },
  row: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", gap: 8, paddingTop: 12 },
  rowBody: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  muted: { color: colors.ink2, fontSize: 12 },
  sample: { color: colors.accentText, fontSize: 11 },
  overdue: { color: colors.coralText, fontSize: 12, fontWeight: "700" },
  actions: { alignItems: "center", flexDirection: "row", gap: 4 },
  partial: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  notice: { backgroundColor: colors.macApricot, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  noticeText: { color: colors.macApricotInk, fontSize: 12 },
}));
