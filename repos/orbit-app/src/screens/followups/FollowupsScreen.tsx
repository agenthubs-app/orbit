import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  ORBIT_API_ENDPOINTS,
  chatAssistFollowupDraftPath,
  messageDraftPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { MetricPill } from "../../components/MetricPill";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildMessageDraftReviewRequest,
  buildChatFollowupDraftRequestFromTask,
  buildMessageDraftRequestFromTask,
  buildReminderGenerationRequest,
  chatFollowupDraftsToView,
  generatedFollowupRemindersToView,
  generatedFollowupTasksToView,
  followupsToView,
  messageDraftsToView,
  type ChatFollowupDraftsView,
  type GeneratedFollowupRemindersView,
  type GeneratedFollowupTasksView,
  type FollowupReminderView,
  type FollowupTaskView,
  type FollowupsView,
  type MessageDraftView,
  type MessageDraftsView
} from "../../view-models/followups";

function usable<TData>(
  state: ReturnType<typeof useApiResource<TData>>
): state is Extract<typeof state, { kind: "empty" | "success" }> {
  return state.kind === "success" || state.kind === "empty";
}

export function FollowupsScreen() {
  const client = useOrbitApiClient();
  const [generatedView, setGeneratedView] =
    useState<GeneratedFollowupTasksView | null>(null);
  const [generatedRemindersView, setGeneratedRemindersView] =
    useState<GeneratedFollowupRemindersView | null>(null);
  const [chatDraftsView, setChatDraftsView] =
    useState<ChatFollowupDraftsView | null>(null);
  const [messageDraftsView, setMessageDraftsView] =
    useState<MessageDraftsView | null>(null);
  const [chatDraftingTaskId, setChatDraftingTaskId] = useState<string | null>(
    null
  );
  const [draftingTaskId, setDraftingTaskId] = useState<string | null>(null);
  const [reviewingDraftId, setReviewingDraftId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [reminderGenerationError, setReminderGenerationError] =
    useState<string | null>(null);
  const [chatDraftError, setChatDraftError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingReminders, setGeneratingReminders] = useState(false);
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

  async function generateFollowupTasks() {
    setGenerating(true);
    setGenerationError(null);

    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.taskGeneration, {
      body: { limit: 5 }
    });

    if (result.success) {
      setGeneratedView(generatedFollowupTasksToView(result.data));
    } else {
      setGenerationError(result.error.message);
    }

    setGenerating(false);
  }

  async function generateFollowupReminders() {
    setGeneratingReminders(true);
    setReminderGenerationError(null);

    const result = await client.post<unknown>(
      ORBIT_API_ENDPOINTS.reminderGeneration,
      {
        body: buildReminderGenerationRequest()
      }
    );

    if (result.success) {
      setGeneratedRemindersView(generatedFollowupRemindersToView(result.data));
    } else {
      setReminderGenerationError(result.error.message);
    }

    setGeneratingReminders(false);
  }

  async function createMessageDraft(task: FollowupTaskView) {
    setDraftingTaskId(task.id);
    setDraftError(null);

    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.messageDrafts, {
      body: buildMessageDraftRequestFromTask(task)
    });

    if (result.success) {
      setMessageDraftsView(messageDraftsToView(result.data));
    } else {
      setDraftError(result.error.message);
    }

    setDraftingTaskId(null);
  }

  async function createChatFollowupDraft(task: FollowupTaskView) {
    setChatDraftingTaskId(task.id);
    setChatDraftError(null);

    const result = await client.post<unknown>(chatAssistFollowupDraftPath(), {
      body: buildChatFollowupDraftRequestFromTask(task)
    });

    if (result.success) {
      setChatDraftsView(chatFollowupDraftsToView(result.data));
    } else {
      setChatDraftError(result.error.message);
    }

    setChatDraftingTaskId(null);
  }

  async function markMessageDraftReady(draft: MessageDraftView) {
    setReviewingDraftId(draft.id);
    setDraftError(null);

    const result = await client.patch<unknown>(messageDraftPath(draft.id), {
      body: buildMessageDraftReviewRequest(draft)
    });

    if (result.success) {
      setMessageDraftsView(messageDraftsToView(result.data));
    } else {
      setDraftError(result.error.message);
    }

    setReviewingDraftId(null);
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
      {view ? (
        <FollowupsWorkspace
          chatDraftError={chatDraftError}
          chatDraftingTaskId={chatDraftingTaskId}
          chatDraftsView={chatDraftsView}
          draftingTaskId={draftingTaskId}
          draftError={draftError}
          generatedRemindersView={generatedRemindersView}
          generatedView={generatedView}
          generating={generating}
          generatingReminders={generatingReminders}
          generationError={generationError}
          messageDraftsView={messageDraftsView}
          onCreateChatFollowupDraft={createChatFollowupDraft}
          onCreateMessageDraft={createMessageDraft}
          onGenerate={generateFollowupTasks}
          onGenerateReminders={generateFollowupReminders}
          onMarkMessageDraftReady={markMessageDraftReady}
          reminderGenerationError={reminderGenerationError}
          reviewingDraftId={reviewingDraftId}
          view={view}
        />
      ) : null}
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

function FollowupsWorkspace({
  chatDraftError,
  chatDraftingTaskId,
  chatDraftsView,
  draftingTaskId,
  draftError,
  generatedRemindersView,
  generatedView,
  generating,
  generatingReminders,
  generationError,
  messageDraftsView,
  onCreateChatFollowupDraft,
  onCreateMessageDraft,
  onGenerate,
  onGenerateReminders,
  onMarkMessageDraftReady,
  reminderGenerationError,
  reviewingDraftId,
  view
}: {
  chatDraftError: string | null;
  chatDraftingTaskId: string | null;
  chatDraftsView: ChatFollowupDraftsView | null;
  draftingTaskId: string | null;
  draftError: string | null;
  generatedRemindersView: GeneratedFollowupRemindersView | null;
  generatedView: GeneratedFollowupTasksView | null;
  generating: boolean;
  generatingReminders: boolean;
  generationError: string | null;
  messageDraftsView: MessageDraftsView | null;
  onCreateChatFollowupDraft: (task: FollowupTaskView) => void;
  onCreateMessageDraft: (task: FollowupTaskView) => void;
  onGenerate: () => void;
  onGenerateReminders: () => void;
  onMarkMessageDraftReady: (draft: MessageDraftView) => void;
  reminderGenerationError: string | null;
  reviewingDraftId: string | null;
  view: FollowupsView;
}) {
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
      <DataCard detail="从现有关系上下文里找下一步" title="生成跟进建议">
        <Text style={styles.bodyText}>生成后先复核，不会自动发消息。</Text>
        <Pressable
          accessibilityRole="button"
          disabled={generating}
          onPress={onGenerate}
          style={({ pressed }) => [
            styles.primaryButton,
            generating ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="sparkles-outline" size={17} />
          <Text style={styles.primaryButtonText}>
            {generating ? "生成中" : "生成候选"}
          </Text>
        </Pressable>
        {generationError ? (
          <Text style={styles.errorText}>{generationError}</Text>
        ) : null}
      </DataCard>
      <DataCard detail="从到期跟进里准备提醒" title="生成提醒候选">
        <Text style={styles.bodyText}>生成后先复核，不会发推送、邮件或短信。</Text>
        <Pressable
          accessibilityRole="button"
          disabled={generatingReminders}
          onPress={onGenerateReminders}
          style={({ pressed }) => [
            styles.secondaryButton,
            generatingReminders ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="notifications-outline" size={17} />
          <Text style={styles.secondaryButtonText}>
            {generatingReminders ? "生成中" : "生成提醒候选"}
          </Text>
        </Pressable>
        {reminderGenerationError ? (
          <Text style={styles.errorText}>{reminderGenerationError}</Text>
        ) : null}
      </DataCard>
      {generatedView ? <GeneratedFollowupsCard view={generatedView} /> : null}
      {generatedRemindersView ? (
        <GeneratedRemindersCard view={generatedRemindersView} />
      ) : null}
      {chatDraftsView ? <ChatFollowupDraftsCard view={chatDraftsView} /> : null}
      {chatDraftError ? (
        <Text style={styles.errorText}>{chatDraftError}</Text>
      ) : null}
      {messageDraftsView ? (
        <MessageDraftsCard
          onMarkReady={onMarkMessageDraftReady}
          reviewingDraftId={reviewingDraftId}
          view={messageDraftsView}
        />
      ) : null}
      {draftError ? <Text style={styles.errorText}>{draftError}</Text> : null}
      {view.priorityTask ? (
        <PriorityTaskCard
          chatDrafting={chatDraftingTaskId === view.priorityTask.id}
          drafting={draftingTaskId === view.priorityTask.id}
          onCreateChatFollowupDraft={onCreateChatFollowupDraft}
          onCreateMessageDraft={onCreateMessageDraft}
          task={view.priorityTask}
        />
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

function MessageDraftsCard({
  onMarkReady,
  reviewingDraftId,
  view
}: {
  onMarkReady: (draft: MessageDraftView) => void;
  reviewingDraftId: string | null;
  view: MessageDraftsView;
}) {
  return (
    <DataCard detail={view.summary} title={view.title}>
      <Text style={styles.bodyText}>{view.nextAction}</Text>
      <View style={styles.stack}>
        {view.drafts.map((draft) => (
          <View key={draft.id} style={styles.draftBlock}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>{draft.subject}</Text>
              <Text style={styles.rowMeta}>{draft.reviewLabel}</Text>
            </View>
            <Text style={styles.mutedText}>{draft.recipientLine}</Text>
            <Text style={styles.bodyText}>{draft.body}</Text>
            <Text style={styles.sourceText}>
              {[draft.channelLabel, draft.windowLabel, draft.sourceLabel]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Text style={styles.safetyText}>{draft.safetyText}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={reviewingDraftId === draft.id}
              onPress={() => onMarkReady(draft)}
              style={({ pressed }) => [
                styles.primaryButton,
                reviewingDraftId === draft.id ? styles.disabled : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Ionicons
                color={colors.onAccent}
                name="checkmark-circle-outline"
                size={17}
              />
              <Text style={styles.primaryButtonText}>
                {reviewingDraftId === draft.id ? "确认中" : "标记可确认"}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function ChatFollowupDraftsCard({
  view
}: {
  view: ChatFollowupDraftsView;
}) {
  return (
    <DataCard detail={view.summary} title={view.title}>
      <Text style={styles.bodyText}>{view.nextAction}</Text>
      <View style={styles.stack}>
        {view.drafts.map((draft) => (
          <View key={draft.id} style={styles.draftBlock}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>{draft.title}</Text>
              <Text style={styles.rowMeta}>{draft.sourceLabel}</Text>
            </View>
            <Text style={styles.mutedText}>{draft.recipientLine}</Text>
            <Text style={styles.bodyText}>{draft.body}</Text>
            <Text style={styles.sourceText}>{draft.reason}</Text>
            <Text style={styles.safetyText}>{draft.safetyText}</Text>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function GeneratedFollowupsCard({ view }: { view: GeneratedFollowupTasksView }) {
  return (
    <DataCard detail={view.summary} title={view.title}>
      <Text style={styles.bodyText}>{view.nextAction}</Text>
      {view.tasks.length > 0 ? (
        <View style={styles.stack}>
          {view.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </View>
      ) : null}
      <Text style={styles.safetyText}>{view.safetyText}</Text>
    </DataCard>
  );
}

function GeneratedRemindersCard({
  view
}: {
  view: GeneratedFollowupRemindersView;
}) {
  return (
    <DataCard detail={view.summary} title={view.title}>
      <Text style={styles.bodyText}>{view.nextAction}</Text>
      {view.reminders.length > 0 ? (
        <View style={styles.stack}>
          {view.reminders.map((reminder) => (
            <ReminderRow key={reminder.id} reminder={reminder} />
          ))}
        </View>
      ) : null}
      <Text style={styles.safetyText}>{view.safetyText}</Text>
    </DataCard>
  );
}

function PriorityTaskCard({
  chatDrafting,
  drafting,
  onCreateChatFollowupDraft,
  onCreateMessageDraft,
  task
}: {
  chatDrafting: boolean;
  drafting: boolean;
  onCreateChatFollowupDraft: (task: FollowupTaskView) => void;
  onCreateMessageDraft: (task: FollowupTaskView) => void;
  task: FollowupTaskView;
}) {
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
      <Pressable
        accessibilityRole="button"
        disabled={chatDrafting}
        onPress={() => onCreateChatFollowupDraft(task)}
        style={({ pressed }) => [
          styles.secondaryButton,
          chatDrafting ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.accent} name="sparkles-outline" size={17} />
        <Text style={styles.secondaryButtonText}>
          {chatDrafting ? "起草中" : "AI 起草"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={drafting}
        onPress={() => onCreateMessageDraft(task)}
        style={({ pressed }) => [
          styles.primaryButton,
          drafting ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.onAccent} name="mail-outline" size={17} />
        <Text style={styles.primaryButtonText}>
          {drafting ? "起草中" : "起草跟进消息"}
        </Text>
      </Pressable>
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
  disabled: {
    opacity: 0.54
  },
  draftBlock: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
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
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
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
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentRing,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
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
