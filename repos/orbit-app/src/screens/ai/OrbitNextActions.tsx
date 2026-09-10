import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { textStyles, radius, spacing, typography } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import type {
  TodayHomeActionView,
  TodayHomeSummaryView,
} from "../../view-models/today-tasks";

export interface OrbitNextActionsProps {
  error: string | null;
  loading: boolean;
  onOpen: (item: TodayHomeActionView) => void;
  onOpenSuggestions: () => void;
  onRefresh: () => void;
  summary: TodayHomeSummaryView;
}

export function OrbitNextActions({
  error,
  loading,
  onOpen,
  onOpenSuggestions,
  onRefresh,
  summary,
}: OrbitNextActionsProps) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.mark}>
            <Ionicons color={colors.onAccent} name="sparkles" size={14} />
          </View>
          <Text style={styles.heading}>下一步</Text>
          {!loading && summary.openTaskCount > 0 ? (
            <Text style={styles.count}>{summary.openTaskCount}</Text>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="刷新下一步"
          accessibilityRole="button"
          onPress={onRefresh}
          style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
        >
          <Ionicons color={colors.text3} name="refresh" size={17} />
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRefresh}
            style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <Text accessibilityLiveRegion="polite" style={styles.stateText}>
          正在核对下一步
        </Text>
      ) : summary.items.length === 0 && !error ? (
        <Text style={styles.stateText}>现在没有必须处理的事项</Text>
      ) : summary.items.length > 0 ? (
        <View style={styles.list}>
          {summary.items.map((item) => (
            <Pressable
              accessibilityLabel={`${item.kind === "schedule" ? "打开日程" : "打开待办"}：${item.title}`}
              accessibilityRole="button"
              key={`${item.kind}:${item.id}`}
              onPress={() => onOpen(item)}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <View style={[styles.index, item.kind === "schedule" ? styles.scheduleIndex : null]}>
                {item.kind === "schedule" ? (
                  <Ionicons color={colors.sky} name="calendar-outline" size={16} />
                ) : (
                  <Text style={styles.indexText}>{item.index}</Text>
                )}
              </View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.context}>{item.context}</Text>
              </View>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {!loading && summary.suggestionCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenSuggestions}
          style={({ pressed }) => [styles.suggestionLink, pressed ? styles.pressed : null]}
        >
          <Ionicons color={colors.accent} name="sparkles-outline" size={15} />
          <Text style={styles.suggestionText}>{summary.suggestionCount} 条待办建议</Text>
          <Ionicons color={colors.text4} name="chevron-forward" size={15} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  context: { ...textStyles.caption, color: colors.text3, marginTop: spacing.xxs },
  copy: { flex: 1, minWidth: 0 },
  count: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  errorRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  errorText: { color: colors.rose, flex: 1, fontSize: typography.small, lineHeight: 19 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.md, paddingHorizontal: 0 },
  headerTitleRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  heading: { ...textStyles.section, color: colors.ink },
  iconButton: { alignItems: "center", borderRadius: radius.pill, height: 44, justifyContent: "center", width: 44 },
  index: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: radius.control, height: 32, justifyContent: "center", width: 32 },
  indexText: { color: colors.accent, fontSize: typography.small, fontWeight: "800" },
  list: { borderTopColor: colors.hairline, borderTopWidth: 1 },
  mark: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.control, height: 28, justifyContent: "center", width: 28 },
  pressed: { opacity: 0.72 },
  retryButton: { alignItems: "center", borderColor: colors.border2, borderRadius: radius.control, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md },
  retryText: { color: colors.ink, fontSize: typography.small, fontWeight: "700" },
  row: { alignItems: "center", borderBottomColor: colors.hairline, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 64, paddingVertical: spacing.sm, paddingHorizontal: 0 },
  scheduleIndex: { backgroundColor: colors.skySoft },
  section: { borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 0 },
  stateText: { color: colors.text3, fontSize: typography.small, lineHeight: 19, paddingBottom: spacing.lg, paddingHorizontal: 0 },
  suggestionLink: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: 0 },
  suggestionText: { color: colors.text2, flex: 1, fontSize: typography.caption, fontWeight: "600" },
  title: { ...textStyles.listTitle, color: colors.ink },
}));
