import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { MetricPill } from "../../components/MetricPill";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  followupsToView,
  type FollowupReminderView,
  type FollowupTaskView,
  type FollowupsView
} from "../../view-models/followups";

function usable<TData>(
  state: ReturnType<typeof useApiResource<TData>>
): state is Extract<typeof state, { kind: "empty" | "success" }> {
  return state.kind === "success" || state.kind === "empty";
}

export function FollowupsScreen() {
  const tasksState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.tasks,
    (data) => followupsToView({
      notificationsPayload: {},
      tasksPayload: data
    }).tasks.length === 0
  );
  const notificationsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.notifications,
    () => false
  );

  function refresh() {
    tasksState.refresh();
    notificationsState.refresh();
  }

  const view = usable(tasksState)
    ? followupsToView({
        notificationsPayload: usable(notificationsState)
          ? notificationsState.data
          : {},
        tasksPayload: tasksState.data
      })
    : null;
  const loading = tasksState.kind === "loading";

  return (
    <AppScreen
      eyebrow="关系工作"
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={tasksState.refreshing || notificationsState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="跟进队列"
    >
      {loading ? <LoadingState /> : null}
      {tasksState.kind === "offline" ? (
        <ErrorState message={tasksState.error.message} title="服务器连不上" />
      ) : null}
      {tasksState.kind === "failure" ? (
        <ErrorState message={tasksState.error.message} />
      ) : null}
      {view ? <FollowupsWorkspace view={view} /> : null}
      {view && notificationsState.kind === "failure" ? (
        <ErrorState message={notificationsState.error.message} title="提醒不可用" />
      ) : null}
      {view && notificationsState.kind === "offline" ? (
        <ErrorState
          message={notificationsState.error.message}
          title="提醒暂时连不上"
        />
      ) : null}
    </AppScreen>
  );
}

function FollowupsWorkspace({ view }: { view: FollowupsView }) {
  const router = useRouter();

  return (
    <>
      <DataCard detail={view.summary} title={view.title}>
        <Text style={styles.bodyText}>{view.nextAction}</Text>
        <View style={styles.metricsRow}>
          {view.metrics.map((metric) => (
            <MetricPill
              key={metric.label}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </View>
        <Text style={styles.safetyText}>{view.safetyText}</Text>
      </DataCard>
      {view.priorityTask ? (
        <PriorityTaskCard task={view.priorityTask} />
      ) : (
        <EmptyState
          message="先从联系人、活动或对话里记录一个明确的下一步。"
          title="暂无跟进"
        />
      )}
      {view.tasks.length > 0 ? (
        <DataCard detail={`${view.tasks.length} 个待复核动作`} title="全部跟进">
          <View style={styles.stack}>
            {view.tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </View>
        </DataCard>
      ) : null}
      {view.reminders.length > 0 ? (
        <DataCard detail="只做复核，不发送推送、邮件或短信" title="提醒队列">
          <View style={styles.stack}>
            {view.reminders.map((reminder) => (
              <ReminderRow key={reminder.id} reminder={reminder} />
            ))}
          </View>
        </DataCard>
      ) : null}
      <DataCard
        detail="看具体日期和时间"
        onPress={() => router.push("/schedule" as Href)}
        title="回到日程"
      >
        <View style={styles.linkRow}>
          <Ionicons color={colors.accent} name="calendar-outline" size={18} />
          <Text style={styles.bodyText}>按时间顺序看接下来要处理的关系事项。</Text>
        </View>
      </DataCard>
    </>
  );
}

function PriorityTaskCard({ task }: { task: FollowupTaskView }) {
  return (
    <DataCard detail={task.organization} title={task.title}>
      <View style={styles.pillRow}>
        <Text style={styles.priorityPill}>{task.priorityLabel}</Text>
        <Text style={styles.triggerPill}>{task.triggerLabel}</Text>
        <Text style={styles.neutralPill}>{task.evidenceLabel}</Text>
      </View>
      <Text style={styles.dateText}>{task.dueLabel}</Text>
      <Text style={styles.bodyText}>{task.recommendedAction}</Text>
      <Text style={styles.mutedText}>{task.rationale}</Text>
      <Text style={styles.sourceText}>{task.sourceLabel}</Text>
    </DataCard>
  );
}

function TaskRow({ task }: { task: FollowupTaskView }) {
  return (
    <View style={styles.rowBlock}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>{task.title}</Text>
        <Text style={styles.rowMeta}>{task.priorityLabel}</Text>
      </View>
      <Text style={styles.mutedText}>
        {[task.dueLabel, task.organization].filter(Boolean).join(" · ")}
      </Text>
      <Text style={styles.bodyText}>{task.recommendedAction}</Text>
    </View>
  );
}

function ReminderRow({ reminder }: { reminder: FollowupReminderView }) {
  return (
    <View style={styles.rowBlock}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>{reminder.title}</Text>
        <Text style={styles.rowMeta}>{reminder.priorityLabel}</Text>
      </View>
      <Text style={styles.mutedText}>
        {[reminder.dueLabel, reminder.organization].filter(Boolean).join(" · ")}
      </Text>
      <Text style={styles.bodyText}>{reminder.windowLabel}</Text>
      <Text style={styles.sourceText}>{reminder.queueLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  dateText: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 20
  },
  linkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  mutedText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 20
  },
  neutralPill: {
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  priorityPill: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    color: colors.amber,
    fontSize: typography.caption,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  rowBlock: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: spacing.xs,
    paddingBottom: spacing.md
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  rowMeta: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 18
  },
  rowTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 20
  },
  safetyText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  sourceText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  stack: {
    gap: spacing.md
  },
  triggerPill: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  }
});
