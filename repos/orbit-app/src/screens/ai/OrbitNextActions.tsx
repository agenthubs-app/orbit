import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { colors, radius, spacing, typography } from "../../design/tokens";
import type {
  AgentSignalActionView,
  AgentSignalNextActionView
} from "../../view-models/agent-signals";

export interface OrbitNextActionsProps {
  actions: readonly AgentSignalNextActionView[];
  error: string | null;
  loading: boolean;
  onAction: (
    item: AgentSignalNextActionView,
    action: AgentSignalActionView
  ) => void;
  onDismiss: (id: string) => void;
  onRefresh: () => void;
  onSnooze: (id: string) => void;
  updatingId: string | null;
}

export function OrbitNextActions({
  actions,
  error,
  loading,
  onAction,
  onDismiss,
  onRefresh,
  onSnooze,
  updatingId
}: OrbitNextActionsProps) {
  const [menuItem, setMenuItem] =
    useState<AgentSignalNextActionView | null>(null);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.mark}>
            <Ionicons color={colors.onAccent} name="sparkles" size={14} />
          </View>
          <Text style={styles.heading}>下一步</Text>
          {!loading && actions.length > 0 ? (
            <Text style={styles.count}>{actions.length}</Text>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="刷新下一步"
          accessibilityRole="button"
          onPress={onRefresh}
          style={({ pressed }) => [
            styles.iconButton,
            pressed ? styles.pressed : null
          ]}
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
            style={({ pressed }) => [
              styles.retryButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <Text accessibilityLiveRegion="polite" style={styles.stateText}>
          正在核对下一步
        </Text>
      ) : actions.length === 0 && !error ? (
        <Text style={styles.stateText}>现在没有必须处理的事项</Text>
      ) : actions.length > 0 ? (
        <View style={styles.list}>
          {actions.map((item) => (
            <View
              key={item.id}
              style={[styles.row, item.completed ? styles.rowCompleted : null]}
            >
              <View style={styles.rowMain}>
                <View
                  style={[
                    styles.index,
                    item.completed ? styles.indexCompleted : null
                  ]}
                >
                  {item.completed ? (
                    <Ionicons
                      color={colors.live}
                      name="checkmark"
                      size={16}
                    />
                  ) : (
                    <Text style={styles.indexText}>{item.index}</Text>
                  )}
                </View>
                <View style={styles.copy}>
                  <Text numberOfLines={2} style={styles.title}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.context}>
                    {item.context}
                  </Text>
                </View>
                {!item.completed ? (
                  <Pressable
                    accessibilityLabel={`${item.title}的更多操作`}
                    accessibilityRole="button"
                    onPress={() => setMenuItem(item)}
                    style={({ pressed }) => [
                      styles.moreButton,
                      pressed ? styles.pressed : null
                    ]}
                  >
                    <Ionicons
                      color={colors.text3}
                      name="ellipsis-horizontal"
                      size={18}
                    />
                  </Pressable>
                ) : (
                  <View style={styles.moreButton} />
                )}
              </View>

              {!item.completed ? (
                <View style={styles.actionButtons}>
                  {[0, 1].map((actionIndex) => {
                    const action = item.actions[actionIndex];
                    if (!action) {
                      return (
                        <View
                          key={actionIndex}
                          style={styles.actionButtonSlot}
                        />
                      );
                    }
                    const primary = actionIndex === 0;
                    const disabled = updatingId === item.id;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        disabled={disabled}
                        key={`${action.kind}:${action.label}`}
                        onPress={() => onAction(item, action)}
                        style={({ pressed }) => [
                          styles.actionButton,
                          primary
                            ? styles.actionButtonPrimary
                            : styles.actionButtonSecondary,
                          disabled ? styles.disabled : null,
                          pressed ? styles.pressed : null
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.actionLabel,
                            primary
                              ? styles.actionLabelPrimary
                              : styles.actionLabelSecondary
                          ]}
                        >
                          {action.label}
                        </Text>
                        {primary ? (
                          <Ionicons
                            color={colors.onAccent}
                            name="arrow-forward"
                            size={14}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <Modal
        animationType="fade"
        onRequestClose={() => setMenuItem(null)}
        transparent
        visible={menuItem !== null}
      >
        <View style={styles.menuRoot}>
          <Pressable
            accessibilityLabel="关闭更多操作"
            onPress={() => setMenuItem(null)}
            style={styles.menuScrim}
          />
          <View style={styles.menuPanel}>
            <Text numberOfLines={1} style={styles.menuTitle}>
              {menuItem?.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (menuItem) onSnooze(menuItem.id);
                setMenuItem(null);
              }}
              style={({ pressed }) => [
                styles.menuAction,
                pressed ? styles.pressed : null
              ]}
            >
              <Ionicons color={colors.text2} name="time-outline" size={18} />
              <Text style={styles.menuActionText}>明天提醒</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (menuItem) onDismiss(menuItem.id);
                setMenuItem(null);
              }}
              style={({ pressed }) => [
                styles.menuAction,
                pressed ? styles.pressed : null
              ]}
            >
              <Ionicons color={colors.text2} name="close-outline" size={18} />
              <Text style={styles.menuActionText}>忽略</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: spacing.sm
  },
  actionButtonPrimary: {
    backgroundColor: colors.accent
  },
  actionButtonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderWidth: 1
  },
  actionButtonSlot: {
    flex: 1,
    minHeight: 44
  },
  actionButtons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginLeft: 42,
    marginTop: spacing.sm
  },
  actionLabel: {
    flexShrink: 1,
    fontSize: typography.small,
    fontWeight: "700"
  },
  actionLabelPrimary: {
    color: colors.onAccent
  },
  actionLabelSecondary: {
    color: colors.ink
  },
  context: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17,
    marginTop: spacing.xxs
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  count: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  disabled: {
    opacity: 0.54
  },
  errorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  errorText: {
    color: colors.rose,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 19
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  headerTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  heading: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "800"
  },
  iconButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  index: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.control,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  indexCompleted: {
    backgroundColor: colors.liveSoft
  },
  indexText: {
    color: colors.accentPress,
    fontSize: typography.small,
    fontWeight: "800"
  },
  list: {
    borderTopColor: colors.hairline,
    borderTopWidth: 1
  },
  mark: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  menuAction: {
    alignItems: "center",
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md
  },
  menuActionText: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "600"
  },
  menuPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    gap: spacing.xs,
    marginBottom: spacing.xxl,
    marginHorizontal: spacing.lg,
    padding: spacing.md
  },
  menuRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  menuScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(22,22,26,0.24)"
  },
  menuTitle: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  moreButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  pressed: {
    opacity: 0.72
  },
  retryButton: {
    alignItems: "center",
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  retryText: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700"
  },
  row: {
    borderBottomColor: colors.hairline,
    borderBottomWidth: 1,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md
  },
  rowCompleted: {
    opacity: 0.68
  },
  rowMain: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  section: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden"
  },
  stateText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg
  },
  title: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  }
});
