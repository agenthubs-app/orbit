import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { radius, spacing, typography, textStyles } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import type { EventCenterItemView } from "../../view-models/event-center";

export type EventCenterContentState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "empty" }
  | { kind: "offline"; message: string }
  | { kind: "failure"; message: string };

function EventCenterRow({
  event,
  onOpenAdmission,
  onOpenAnalytics,
  onOpenCheckIn,
  onOpenOperations,
  onOpenRoles,
  onOpen
}: {
  event: EventCenterItemView;
  onOpenAdmission: () => void;
  onOpenAnalytics: () => void;
  onOpenCheckIn: () => void;
  onOpenOperations: () => void;
  onOpenRoles: () => void;
  onOpen: () => void;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.eventRow}>
      <View style={styles.eventHeader}>
        <View style={styles.eventHeading}>
          <Text style={styles.lifecycle}>
            {event.lifecycleLabel}
          </Text>
          <Text style={styles.eventTitle}>
            {event.title}
          </Text>
        </View>
        <View
          style={[
            styles.roleBadge,
            event.migrationPending ? styles.roleBadgeWarning : null
          ]}
        >
          <Text
            style={[
              styles.roleLabel,
              event.migrationPending ? styles.roleLabelWarning : null
            ]}
          >
            {event.roleLabel}
          </Text>
        </View>
      </View>

      <View style={styles.metadata}>
        <View style={styles.metaLine}>
          <Ionicons color={colors.text3} name="location-outline" size={16} />
          <Text style={styles.metaText}>
            {event.venueLabel}
          </Text>
        </View>
        <View style={styles.metaLine}>
          <Ionicons color={colors.text3} name="time-outline" size={16} />
          <Text style={styles.metaText}>
            {event.scheduleLabel}
          </Text>
        </View>
        <Text style={styles.roleDetail}>{event.roleDetail}</Text>
      </View>

      {event.restriction ? (
        <View style={styles.restriction}>
          <Ionicons color={colors.amber} name="alert-circle-outline" size={17} />
          <Text style={styles.restrictionText}>{event.restriction}</Text>
        </View>
      ) : null}

      <View style={styles.nextTask}>
        <View style={styles.nextTaskIcon}>
          <Ionicons color={colors.accent} name="arrow-forward" size={17} />
        </View>
        <View style={styles.nextTaskCopy}>
          <Text style={styles.nextTaskEyebrow}>下一步</Text>
          <Text style={styles.nextTaskLabel}>{event.nextTask.label}</Text>
          <Text style={styles.nextTaskDetail}>{event.nextTask.detail}</Text>
        </View>
      </View>

      {!event.migrationPending ? (
        <View style={styles.actionRow}>
          {event.phase === "upcoming" &&
          event.availableActionKeys.includes("admission") ? (
            <Pressable
              accessibilityLabel={`审核活动报名：${event.title}`}
              accessibilityRole="button"
              onPress={onOpenAdmission}
              style={({ pressed }) => [
                styles.primaryAction,
                pressed ? styles.pressed : null
              ]}
            >
              <Ionicons color={colors.onAccent} name="people-outline" size={17} />
              <Text style={styles.primaryActionText}>报名审核</Text>
            </Pressable>
          ) : null}
          {event.phase === "live" &&
          event.availableActionKeys.includes("check_in") ? (
            <Pressable
              accessibilityLabel={`打开活动签到台：${event.title}`}
              accessibilityRole="button"
              onPress={onOpenCheckIn}
              style={({ pressed }) => [styles.primaryAction, pressed ? styles.pressed : null]}
            >
              <Ionicons color={colors.onAccent} name="checkmark-circle-outline" size={17} />
              <Text style={styles.primaryActionText}>签到台</Text>
            </Pressable>
          ) : null}
          {event.phase === "ended" &&
          event.availableActionKeys.includes("analytics") ? (
            <Pressable
              accessibilityLabel={`查看活动分析：${event.title}`}
              accessibilityRole="button"
              onPress={onOpenAnalytics}
              style={({ pressed }) => [styles.primaryAction, pressed ? styles.pressed : null]}
            >
              <Ionicons color={colors.onAccent} name="stats-chart-outline" size={17} />
              <Text style={styles.primaryActionText}>活动分析</Text>
            </Pressable>
          ) : null}
          {event.availableActionKeys.includes("roles") ? (
            <Pressable
              accessibilityLabel={`管理活动角色：${event.title}`}
              accessibilityRole="button"
              onPress={onOpenRoles}
              style={({ pressed }) => [styles.iconAction, pressed ? styles.pressed : null]}
            >
              <Ionicons color={colors.accent} name="person-add-outline" size={19} />
            </Pressable>
          ) : null}
          {event.availableActionKeys.includes("operations") ? (
            <Pressable
              accessibilityLabel={`打开活动运营台：${event.title}`}
              accessibilityRole="button"
              onPress={onOpenOperations}
              style={({ pressed }) => [styles.iconAction, pressed ? styles.pressed : null]}
            >
              <Ionicons color={colors.accent} name="construct-outline" size={19} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={`查看活动：${event.title}`}
            accessibilityRole="button"
            onPress={onOpen}
            style={({ pressed }) => [
              styles.openButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.openButtonText}>查看活动</Text>
            <Ionicons color={colors.ink} name="chevron-forward" size={18} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function EventCenterContent({
  events,
  onOpenAdmission = () => undefined,
  onOpenAnalytics = () => undefined,
  onOpenCheckIn = () => undefined,
  onOpenOperations = () => undefined,
  onOpenRoles = () => undefined,
  onOpenEvent,
  state
}: {
  events: EventCenterItemView[];
  onOpenAdmission?: (id: string) => void;
  onOpenAnalytics?: (id: string) => void;
  onOpenCheckIn?: (id: string) => void;
  onOpenOperations?: (id: string) => void;
  onOpenRoles?: (id: string) => void;
  onOpenEvent: (id: string) => void;
  state: EventCenterContentState;
}) {
  const { styles } = useStyles();
  if (state.kind === "loading") {
    return (
      <DataCard title="正在读取你可运营的活动">
        <Text style={styles.stateText}>活动权限会按每场活动分别确认。</Text>
      </DataCard>
    );
  }

  if (state.kind === "offline" || state.kind === "failure") {
    return <ErrorState message={state.message} />;
  }

  if (state.kind === "empty") {
    return (
      <EmptyState
        message="成为活动负责人，或获得活动角色后，活动会出现在这里。"
        title="还没有可运营的活动"
      />
    );
  }

  return (
    <View accessibilityLabel="可运营活动" style={styles.eventList}>
      {events.map((event) => (
        <EventCenterRow
          event={event}
          key={event.id}
          onOpenAdmission={() => onOpenAdmission(event.id)}
          onOpenAnalytics={() => onOpenAnalytics(event.id)}
          onOpenCheckIn={() => onOpenCheckIn(event.id)}
          onOpenOperations={() => onOpenOperations(event.id)}
          onOpenRoles={() => onOpenRoles(event.id)}
          onOpen={() => onOpenEvent(event.id)}
        />
      ))}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actionRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingTop: spacing.md,
    flexWrap: "wrap"
  },
  eventHeader: {
    alignItems: "flex-start",
    gap: spacing.sm
  },
  eventHeading: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  eventList: {
    gap: spacing.md
  },
  eventRow: {
    gap: spacing.lg,
    backgroundColor: "transparent",
    paddingVertical: spacing.md
  },
  eventTitle: {
    color: colors.ink,
    ...textStyles.title
  },
  lifecycle: {
    color: colors.text3,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  metadata: {
    gap: spacing.sm
  },
  iconAction: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  metaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0
  },
  metaText: {
    color: colors.text2,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 19,
    minWidth: 0
  },
  nextTask: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  nextTaskCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0
  },
  nextTaskDetail: {
    color: colors.text2,
    fontSize: typography.caption,
    lineHeight: 17
  },
  nextTaskEyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 14
  },
  nextTaskIcon: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  nextTaskLabel: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 20
  },
  openButton: {
    flex: 1,
    minWidth: 180,
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    gap: spacing.sm
  },
  openButtonText: {
    ...createControlStyles(colors).secondaryButtonText
  },
  pressed: {
    opacity: 0.68
  },
  primaryAction: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%"
  },
  primaryActionText: {
    ...createControlStyles(colors).primaryButtonText
  },
  restriction: {
    alignItems: "flex-start",
    backgroundColor: colors.amberSoft,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  restrictionText: {
    color: colors.text2,
    flex: 1,
    fontSize: typography.caption,
    lineHeight: 18
  },
  roleBadge: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    flexShrink: 0,
    maxWidth: 112,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  roleBadgeWarning: {
    backgroundColor: colors.amberSoft
  },
  roleDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  roleLabel: {
    color: colors.live,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  roleLabelWarning: {
    color: colors.amber
  },
  stateText: {
    color: colors.text2,
    ...textStyles.body
  }
}));
