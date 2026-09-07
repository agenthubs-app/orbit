import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import {
  ORBIT_API_ENDPOINTS,
  aiConversationPath,
  aiConversationSessionPath,
  taskSuggestionAcceptPath,
  taskSuggestionDismissPath
} from "../../api/endpoints";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { radius, spacing, typography } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  agentSessionCreateRequestFromThread,
  agentChatSessionPayloadToThreadView,
  agentSessionUpdateRequestFromThread
} from "../../view-models/agent-history";
import {
  aiRunDetailToView,
  buildAiRunDetailRequest,
  conversationAiRunReferencesFor,
  conversationInlinePanelsForThread,
  conversationPayloadToThreadView,
  conversationQuickRoutes,
  conversationRecordLinks,
  conversationTaskDetailHref,
  conversationAcceptedTaskId,
  markdownBlocksFor,
  pendingConversationThreadView,
  prioritizeConversationContacts,
  prioritizeConversationEvents,
  shouldSubmitInitialPrompt,
  type ChatMessageView,
  type AiRunDetailView,
  type ConversationAiRunReferenceView,
  type ConversationInlinePanelView,
  type ConversationQuickRouteView,
  type ConversationThreadView,
  type MarkdownBlockView,
  type MarkdownInlineView,
  type TaskInteractionView
} from "../../view-models/conversations";
import {
  contactAvatarFor,
  contactsToSummaries,
  type ContactSummary
} from "../../view-models/contacts";
import { eventsToSummaries, type EventSummary } from "../../view-models/events";
import {
  followupInlineContextLabel,
  followupsToView,
  type FollowupTaskView
} from "../../view-models/followups";
import { profileToSummary, type ProfileSummary } from "../../view-models/profile";
import {
  tasksToScheduleItems,
  type ScheduleItem
} from "../../view-models/schedule";

type ResourceKind = "empty" | "failure" | "loading" | "offline" | "success";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "conversation";
  }

  return value ?? "conversation";
}

function optionalParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

export function AiConversationScreen() {
  const { colors, styles } = useStyles();
  const insets = useSafeAreaInsets();
  const { id, initialMessage, source } = useLocalSearchParams<{
    id?: string | string[];
    initialMessage?: string | string[];
    source?: string | string[];
  }>();
  const conversationId = firstParam(id);
  const initialPrompt = optionalParam(initialMessage).trim();
  const isStoredAgentSession = optionalParam(source) === "session";
  const isDraftConversation = conversationId === "new" && !!initialPrompt;
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const path = isDraftConversation
    ? ORBIT_API_ENDPOINTS.conversations
    : isStoredAgentSession
      ? aiConversationSessionPath(conversationId)
      : aiConversationPath(conversationId);
  const state = useApiResource<unknown>(
    path,
    (data) => conversationPayloadToThreadView(data).messages.length === 0
  );
  const eventsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.events,
    (data) => eventsToSummaries(data).length === 0
  );
  const contactsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.contacts,
    (data) => contactsToSummaries(data).length === 0
  );
  const tasksState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.tasks,
    (data) => followupsToView({ notificationsPayload: {}, tasksPayload: data })
      .tasks.length === 0
  );
  const profileState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.profile,
    () => false
  );
  const [draftMessage, setDraftMessage] = useState("");
  const [latestData, setLatestData] = useState<unknown | null>(null);
  const [resolvedConversationId, setResolvedConversationId] = useState<
    string | null
  >(null);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiRunError, setAiRunError] = useState<string | null>(null);
  const [aiRunDetailView, setAiRunDetailView] =
    useState<AiRunDetailView | null>(null);
  const [pendingAiRunId, setPendingAiRunId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [taskInteractionBusy, setTaskInteractionBusy] = useState(false);
  const [acceptedTaskId, setAcceptedTaskId] = useState<string | null>(null);
  const [taskInteractionResolution, setTaskInteractionResolution] = useState<
    "accepted" | "dismissed" | null
  >(null);
  const submittedInitialPrompt = useRef<string | null>(null);

  function refresh() {
    setLatestData(null);
    setAiRunError(null);
    setAiRunDetailView(null);
    state.refresh();
  }

  function conversationHistoryForRequest() {
    return thread
      ? thread.messages
          .map((item) => ({
            content: item.content,
            role: item.role
          }))
          .filter(
            (item): item is { content: string; role: "assistant" | "user" } =>
              Boolean(item.content.trim()) &&
              (item.role === "assistant" || item.role === "user")
          )
          .slice(-8)
      : undefined;
  }

  async function persistAndCanonicalizeDraftConversation(
    data: unknown,
    thread: ConversationThreadView
  ): Promise<boolean> {
    const activeConversationId = thread.activeConversationId;
    if (!isDraftConversation || !activeConversationId) {
      return false;
    }

    const runId = conversationAiRunReferencesFor(data)[0]?.id ?? "";
    const identity = (
      runId || `${activeConversationId}-${Date.now()}`
    ).replace(/[^A-Za-z0-9_-]/gu, "-");
    const sessionId = `agent-session-mobile-${identity}`;
    const sessionRequest = agentSessionCreateRequestFromThread({
      createdAt: new Date().toISOString(),
      sessionId,
      thread
    });

    if (!sessionRequest) {
      setSendError("这次回复缺少可保存的对话内容，请留在当前页面重试。");
      return true;
    }

    const saved = await client.post<unknown>(
      ORBIT_API_ENDPOINTS.aiConversationSessions,
      { body: sessionRequest }
    );

    if (!saved.success) {
      setSendError(`回复已生成，但保存失败：${saved.error.message}`);
      return true;
    }

    setSavedSessionId(sessionId);
    if (thread.taskInteraction?.state === "suggested") {
      return true;
    }

    router.replace({
      params: { id: sessionId, source: "session" },
      pathname: "/ai/[id]"
    });
    return true;
  }

  async function sendMessage() {
    const message = draftMessage.trim();

    if (!message) {
      setSendError("先输入你想继续问的问题。");
      return;
    }

    setSending(true);
    setSendError(null);
    setAiRunError(null);
    setAiRunDetailView(null);

    const sendPath = resolvedConversationId
      ? aiConversationPath(resolvedConversationId)
      : isDraftConversation || isStoredAgentSession
        ? ORBIT_API_ENDPOINTS.conversations
        : path;
    const result = await client.post<unknown>(sendPath, {
      body: {
        history: isStoredAgentSession ? conversationHistoryForRequest() : undefined,
        locale: "zh",
        message
      }
    });

    if (result.success) {
      const nextThread = conversationPayloadToThreadView(result.data);
      setTaskInteractionResolution(null);
      setAcceptedTaskId(null);
      setLatestData(result.data);
      setResolvedConversationId(nextThread.activeConversationId);
      setDraftMessage("");
      if (isStoredAgentSession && previousSessionData) {
        const sessionUpdate = agentSessionUpdateRequestFromThread({
          previousSession: previousSessionData,
          thread: nextThread
        });

        if (sessionUpdate) {
          void client.post<unknown>(ORBIT_API_ENDPOINTS.aiConversationSessions, {
            body: sessionUpdate
          });
        }
      }
      if (!(await persistAndCanonicalizeDraftConversation(result.data, nextThread))) {
        state.refresh();
      }
    } else {
      setSendError(result.error.message);
    }

    setSending(false);
  }

  useEffect(() => {
    if (
      !shouldSubmitInitialPrompt({
        initialPrompt,
        isDraftConversation,
        submittedPrompt: submittedInitialPrompt.current
      })
    ) {
      return;
    }

    submittedInitialPrompt.current = initialPrompt;
    setLatestData(null);
    setResolvedConversationId(null);
    setSending(true);
    setSendError(null);
    setAiRunError(null);
    setAiRunDetailView(null);

    void client
      .post<unknown>(ORBIT_API_ENDPOINTS.conversations, {
        body: {
          locale: "zh",
          message: initialPrompt
        }
      })
      .then(async (result) => {
        if (result.success) {
          const nextThread = conversationPayloadToThreadView(result.data);
          setTaskInteractionResolution(null);
          setAcceptedTaskId(null);
          setLatestData(result.data);
          setResolvedConversationId(nextThread.activeConversationId);
          await persistAndCanonicalizeDraftConversation(result.data, nextThread);
        } else {
          setSendError(result.error.message);
        }
      })
      .catch((error: unknown) => {
        setSendError(
          error instanceof Error ? error.message : "这条消息暂时发不出去。"
        );
      })
      .finally(() => setSending(false));
  }, [client, initialPrompt, isDraftConversation]);

  async function inspectAiRun(reference: ConversationAiRunReferenceView) {
    const request = buildAiRunDetailRequest(reference.id);

    if (!request.success) {
      setAiRunError(request.error);
      return;
    }

    setPendingAiRunId(reference.id);
    setAiRunError(null);

    const result = await client.get<unknown>(request.request.path);

    if (result.success) {
      setAiRunDetailView(aiRunDetailToView(result.data));
    } else {
      setAiRunError(result.error.message);
    }

    setPendingAiRunId(null);
  }

  async function resolveTaskSuggestion(action: "accept" | "dismiss") {
    const suggestionId = thread?.taskInteraction?.suggestionId;
    if (!suggestionId || taskInteractionBusy) return;

    setTaskInteractionBusy(true);
    setSendError(null);
    const endpoint =
      action === "accept"
        ? taskSuggestionAcceptPath(suggestionId)
        : taskSuggestionDismissPath(suggestionId);
    const result = await client.post<unknown>(endpoint, {
      body: {
        idempotencyKey: `ios:agent-task-${action}:${suggestionId}:${Date.now()}`
      }
    });

    if (result.success) {
      setAcceptedTaskId(action === "accept" ? conversationAcceptedTaskId(result.data) : null);
      setTaskInteractionResolution(
        action === "accept" ? "accepted" : "dismissed"
      );
      if (action === "accept") tasksState.refresh();
      if (savedSessionId) {
        router.replace({
          params: { id: savedSessionId, source: "session" },
          pathname: "/ai/[id]"
        });
      }
    } else {
      setSendError(result.error.message);
    }
    setTaskInteractionBusy(false);
  }

  const loadedData =
    !isDraftConversation && (state.kind === "success" || state.kind === "empty")
      ? state.data
      : null;
  const previousSessionData = isStoredAgentSession ? loadedData : null;
  const pendingThread = isDraftConversation
    ? pendingConversationThreadView(initialPrompt)
    : null;
  const currentLatestData =
    isDraftConversation && submittedInitialPrompt.current !== initialPrompt
      ? null
      : latestData;
  const thread = currentLatestData
    ? conversationPayloadToThreadView(currentLatestData)
    : loadedData
      ? isStoredAgentSession
        ? agentChatSessionPayloadToThreadView(loadedData)
        : conversationPayloadToThreadView(loadedData)
      : pendingThread;
  const runReferences = thread
    ? conversationAiRunReferencesFor(currentLatestData ?? loadedData ?? thread)
    : [];
  const inlinePanels = thread ? conversationInlinePanelsForThread(thread) : [];
  const eventCards =
    eventsState.kind === "success" ? eventsToSummaries(eventsState.data) : [];
  const contactCards = contactsState.kind === "success"
    ? contactsToSummaries(contactsState.data)
    : [];
  const followupTasks = tasksState.kind === "success"
    ? followupsToView({ notificationsPayload: {}, tasksPayload: tasksState.data })
        .tasks
    : [];
  const scheduleItems = tasksState.kind === "success"
    ? tasksToScheduleItems(tasksState.data)
    : [];
  const profile = profileState.kind === "success" || profileState.kind === "empty"
    ? profileToSummary(profileState.data)
    : null;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.readingSafeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={insets.top} style={styles.readingRoot}>
      {!thread ? <Pressable accessibilityLabel="返回 Orbit AI" accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
        <Ionicons color={colors.ink} name="arrow-back-outline" size={24} />
      </Pressable> : null}
      {!isDraftConversation && state.kind === "loading" ? <LoadingState /> : null}
      {!isDraftConversation && state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {!isDraftConversation && state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" && !thread ? (
        <EmptyState message="这条对话还没有消息。" title="没有消息" />
      ) : null}
      {thread ? (
        <ConversationThread
          baseUrl={baseUrl}
          contactCards={contactCards}
          contactsStateKind={contactsState.kind}
          draftMessage={draftMessage}
          eventCards={eventCards}
          eventsStateKind={eventsState.kind}
          followupTasks={followupTasks}
          followupsStateKind={tasksState.kind}
          inlinePanels={inlinePanels}
          aiRunDetailView={aiRunDetailView}
          aiRunError={aiRunError}
          onBack={() => router.push("/ai" as Href)}
          onChangeDraft={setDraftMessage}
          onInspectAiRun={inspectAiRun}
          onOpenContact={(contactId) =>
            router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)
          }
          onOpenEvent={(eventId) =>
            router.push(`/events/${encodeURIComponent(eventId)}` as Href)
          }
          onOpenHref={(href) => router.push(href as Href)}
          onResolveTaskSuggestion={resolveTaskSuggestion}
          profile={profile}
          profileStateKind={profileState.kind}
          pendingAiRunId={pendingAiRunId}
          onRefresh={refresh}
          refreshing={state.refreshing}
          runReferences={runReferences}
          scheduleItems={scheduleItems}
          scheduleStateKind={tasksState.kind}
          onSend={sendMessage}
          sendError={sendError}
          sending={sending}
          taskInteractionBusy={taskInteractionBusy}
          taskInteractionResolution={taskInteractionResolution}
          thread={acceptedTaskId && thread.taskInteraction ? { ...thread, taskInteraction: { ...thread.taskInteraction, taskId: acceptedTaskId } } : thread}
        />
      ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ConversationThread({
  aiRunDetailView,
  aiRunError,
  baseUrl,
  contactCards,
  contactsStateKind,
  draftMessage,
  eventCards,
  eventsStateKind,
  followupTasks,
  followupsStateKind,
  inlinePanels,
  onBack,
  onChangeDraft,
  onInspectAiRun,
  onOpenContact,
  onOpenEvent,
  onOpenHref,
  onResolveTaskSuggestion,
  profile,
  profileStateKind,
  pendingAiRunId,
  onRefresh,
  refreshing,
  runReferences,
  scheduleItems,
  scheduleStateKind,
  onSend,
  sendError,
  sending,
  taskInteractionBusy,
  taskInteractionResolution,
  thread
}: {
  aiRunDetailView: AiRunDetailView | null;
  aiRunError: string | null;
  baseUrl: string;
  contactCards: ContactSummary[];
  contactsStateKind: ResourceKind;
  draftMessage: string;
  eventCards: EventSummary[];
  eventsStateKind: ResourceKind;
  followupTasks: FollowupTaskView[];
  followupsStateKind: ResourceKind;
  inlinePanels: ConversationInlinePanelView[];
  onBack: () => void;
  onChangeDraft: (value: string) => void;
  onInspectAiRun: (reference: ConversationAiRunReferenceView) => void;
  onOpenContact: (contactId: string) => void;
  onOpenEvent: (eventId: string) => void;
  onOpenHref: (href: string) => void;
  onResolveTaskSuggestion: (action: "accept" | "dismiss") => void;
  profile: ProfileSummary | null;
  profileStateKind: ResourceKind;
  pendingAiRunId: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  runReferences: ConversationAiRunReferenceView[];
  scheduleItems: ScheduleItem[];
  scheduleStateKind: ResourceKind;
  onSend: () => void;
  sendError: string | null;
  sending: boolean;
  taskInteractionBusy: boolean;
  taskInteractionResolution: "accepted" | "dismissed" | null;
  thread: ConversationThreadView;
}) {
  const { colors, styles } = useStyles();
  const [routesOpen, setRoutesOpen] = useState(false);
  const historyScroll = useRef<ScrollView>(null);
  const followNewMessages = useRef(false);
  const inlinePanelAnchorIndex = thread.messages.reduce(
    (lastIndex, message, index) => (message.role === "user" ? index : lastIndex),
    -1
  );

  return (
    <View style={styles.threadSurface}>
      <View accessibilityLabel="对话导航" style={styles.threadHeader}>
        <Pressable accessibilityLabel="返回 Orbit AI" accessibilityRole="button" onPress={() => { Keyboard.dismiss(); onBack(); }} style={styles.backButton}>
          <Ionicons color={colors.ink} name="arrow-back-outline" size={24} />
        </Pressable>
        <View style={styles.threadTitleBlock}>
          <Text style={styles.threadEyebrow}>Orbit AI</Text>
          <Text numberOfLines={1} style={styles.threadTitle}>
            {thread.title}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="更多对话选项"
          accessibilityRole="button"
          accessibilityState={{ expanded: routesOpen }}
          onPress={() => { Keyboard.dismiss(); setRoutesOpen(!routesOpen); }}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.ink} name="ellipsis-horizontal" size={24} />
        </Pressable>
      </View>
      {routesOpen ? <View style={styles.routesPanel}><QuickRouteDock onOpenHref={(href) => { setRoutesOpen(false); onOpenHref(href); }} /></View> : null}
      <ScrollView
        ref={historyScroll}
        testID="conversation-history"
        contentContainerStyle={styles.readingContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          followNewMessages.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => { if (followNewMessages.current) historyScroll.current?.scrollToEnd({ animated: true }); }}
        refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor={colors.accent} />}
        style={styles.readingHistory}
      >
      <View style={styles.messagePanel}>
        {thread.messages.length === 0 ? (
          <EmptyState message="这条对话还没有消息。" title="没有消息" />
        ) : (
          <View style={styles.messageStack}>
            {thread.messages.map((message, index) => (
              <Fragment key={message.id}>
                <MessageBubble baseUrl={baseUrl} message={message} onOpenHref={onOpenHref} />
                {index === inlinePanelAnchorIndex && inlinePanels.length > 0 ? (
                  <ConversationInlinePanels
                    baseUrl={baseUrl}
                    contactCards={contactCards}
                    contactsStateKind={contactsStateKind}
                    eventCards={eventCards}
                    eventsStateKind={eventsStateKind}
                    followupTasks={followupTasks}
                    followupsStateKind={followupsStateKind}
                    onOpenContact={onOpenContact}
                    onOpenEvent={onOpenEvent}
                    onOpenHref={onOpenHref}
                    panels={inlinePanels}
                    profile={profile}
                    profileStateKind={profileStateKind}
                    scheduleItems={scheduleItems}
                    scheduleStateKind={scheduleStateKind}
                    thread={thread}
                  />
                ) : null}
              </Fragment>
            ))}
          </View>
        )}
      </View>
      {thread.taskInteraction ? (
        <TaskInteractionCard
          busy={taskInteractionBusy}
          interaction={thread.taskInteraction}
          onResolve={onResolveTaskSuggestion}
          onOpenHref={onOpenHref}
          resolution={taskInteractionResolution}
        />
      ) : null}
      {thread.proposedToolIntents.length > 0 ? (
        <View style={styles.intentPanel}>
          <Text style={styles.panelTitle}>建议动作</Text>
          {thread.proposedToolIntents.map((intent) => (
            <View key={intent.id} style={styles.intentBlock}>
              <Text style={styles.intentTitle}>{intent.label}</Text>
              <Text style={styles.bodyText}>{intent.reason}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {runReferences.length > 0 || aiRunDetailView || aiRunError ? (
        <AiRunAuditPanel
          detailView={aiRunDetailView}
          error={aiRunError}
          onInspectAiRun={onInspectAiRun}
          pendingAiRunId={pendingAiRunId}
          runReferences={runReferences}
        />
      ) : null}
      {sending ? <Text accessibilityLiveRegion="polite" style={styles.threadNextAction}>正在回复…</Text> : null}
      </ScrollView>
      <View testID="conversation-composer" style={styles.composerPanel}>
        <TextInput
          accessibilityLabel="继续聊聊"
          multiline
          onChangeText={onChangeDraft}
          placeholder="继续聊聊…"
          placeholderTextColor={colors.text4}
          style={styles.input}
          textAlignVertical="top"
          value={draftMessage}
        />
        {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}
        <View style={styles.composerActions}>
        <Pressable accessibilityLabel="打开快捷入口" accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setRoutesOpen(!routesOpen); }} style={styles.backButton}>
          <Ionicons color={colors.text3} name="add-circle-outline" size={27} />
        </Pressable>
        <Pressable
          accessibilityLabel="发送消息"
          accessibilityRole="button"
          accessibilityState={{ disabled: sending || !draftMessage.trim(), busy: sending }}
          disabled={sending || !draftMessage.trim()}
          onPress={() => { followNewMessages.current = true; onSend(); }}
          style={({ pressed }) => [
            styles.sendButton,
            sending || !draftMessage.trim() ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name={sending ? "ellipsis-horizontal" : "send-outline"} size={20} />
        </Pressable>
        </View>
      </View>
    </View>
  );
}

function TaskInteractionCard({
  busy,
  interaction,
  onResolve,
  onOpenHref,
  resolution
}: {
  busy: boolean;
  interaction: TaskInteractionView;
  onResolve: (action: "accept" | "dismiss") => void;
  onOpenHref: (href: string) => void;
  resolution: "accepted" | "dismissed" | null;
}) {
  const { colors, styles } = useStyles();
  const completed = interaction.state === "created" || resolution === "accepted";
  const dismissed = resolution === "dismissed";
  const failed = interaction.state === "failed";

  return (
    <View style={[styles.taskInteractionCard, failed ? styles.taskInteractionFailed : null]}>
      <View style={styles.taskInteractionHeader}>
        <View style={styles.taskInteractionIcon}>
          <Ionicons
            color={failed ? colors.rose : completed ? colors.live : colors.accent}
            name={failed ? "alert-circle-outline" : completed ? "checkmark" : "sparkles-outline"}
            size={18}
          />
        </View>
        <View style={styles.taskInteractionCopy}>
          <Text style={styles.taskInteractionEyebrow}>
            {failed
              ? "待办未创建"
              : completed
                ? "已加入待办"
                : dismissed
                  ? "已暂不处理"
                  : "待办建议"}
          </Text>
          <Text style={styles.taskInteractionTitle}>{interaction.title}</Text>
          {!completed && !dismissed && interaction.reason ? (
            <Text style={styles.taskInteractionReason}>{interaction.reason}</Text>
          ) : null}
        </View>
      </View>
      {interaction.state === "suggested" && !resolution ? (
        <View style={styles.taskInteractionActions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onResolve("dismiss")}
            style={({ pressed }) => [
              styles.taskInteractionSecondary,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.taskInteractionSecondaryText}>暂不需要</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onResolve("accept")}
            style={({ pressed }) => [
              styles.taskInteractionPrimary,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.taskInteractionPrimaryText}>
              {busy ? "处理中" : "加入待办"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {completed && conversationTaskDetailHref(interaction.taskId) ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`打开待办详情：${interaction.title}`} onPress={() => onOpenHref(conversationTaskDetailHref(interaction.taskId)!)} style={styles.recordLink}>
          <Text style={styles.recordLinkText}>查看待办</Text><Ionicons color={colors.accent} name="arrow-up-right-box-outline" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

function AiRunAuditPanel({
  detailView,
  error,
  onInspectAiRun,
  pendingAiRunId,
  runReferences
}: {
  detailView: AiRunDetailView | null;
  error: string | null;
  onInspectAiRun: (reference: ConversationAiRunReferenceView) => void;
  pendingAiRunId: string | null;
  runReferences: ConversationAiRunReferenceView[];
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.aiRunPanel}>
      <View style={styles.aiRunHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>AI 运行依据</Text>
          <Text style={styles.inlinePanelDetail}>
            查看这次回复的来源、证据和安全边界。
          </Text>
        </View>
        <Ionicons color={colors.accent} name="shield-checkmark-outline" size={18} />
      </View>
      {runReferences.length > 0 ? (
        <View style={styles.aiRunReferenceStack}>
          {runReferences.map((reference) => {
            const pending = pendingAiRunId === reference.id;

            return (
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(pendingAiRunId)}
                key={reference.id}
                onPress={() => onInspectAiRun(reference)}
                style={({ pressed }) => [
                  styles.aiRunReference,
                  pending ? styles.disabled : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <View style={styles.aiRunReferenceText}>
                  <Text numberOfLines={1} style={styles.eventSuggestionTitle}>
                    {reference.id}
                  </Text>
                  <Text numberOfLines={2} style={styles.inlinePanelDetail}>
                    {reference.detail}
                  </Text>
                </View>
                <Text style={styles.aiRunActionText}>
                  {pending ? "读取中" : reference.actionLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {detailView ? (
        <View style={styles.aiRunResult}>
          <View style={styles.aiRunMetricRow}>
            {detailView.metrics.map((metric) => (
              <Text key={metric} numberOfLines={1} style={styles.aiRunMetric}>
                {metric}
              </Text>
            ))}
          </View>
          <Text style={styles.bodyText}>{detailView.summary}</Text>
          <Text style={styles.aiRunOutput}>{detailView.outputPreview}</Text>
          <Text style={styles.inlinePanelDetail}>{detailView.nextAction}</Text>
          <Text style={styles.aiRunSafetyText}>{detailView.safetyText}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function ConversationInlinePanels({
  baseUrl,
  contactCards,
  contactsStateKind,
  eventCards,
  eventsStateKind,
  followupTasks,
  followupsStateKind,
  onOpenContact,
  onOpenEvent,
  onOpenHref,
  panels,
  profile,
  profileStateKind,
  scheduleItems,
  scheduleStateKind,
  thread
}: {
  baseUrl: string;
  contactCards: ContactSummary[];
  contactsStateKind: ResourceKind;
  eventCards: EventSummary[];
  eventsStateKind: ResourceKind;
  followupTasks: FollowupTaskView[];
  followupsStateKind: ResourceKind;
  onOpenContact: (contactId: string) => void;
  onOpenEvent: (eventId: string) => void;
  onOpenHref: (href: string) => void;
  panels: ConversationInlinePanelView[];
  profile: ProfileSummary | null;
  profileStateKind: ResourceKind;
  scheduleItems: ScheduleItem[];
  scheduleStateKind: ResourceKind;
  thread: ConversationThreadView;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.inlinePanelStack}>
      {panels.map((panel) => {
        if (panel.kind === "people") {
          return (
            <PeopleInlinePanel
              baseUrl={baseUrl}
              contactCards={contactCards}
              contactsStateKind={contactsStateKind}
              key={panel.kind}
              onOpenContact={onOpenContact}
              onOpenHref={onOpenHref}
              panel={panel}
              thread={thread}
            />
          );
        }

        if (panel.kind === "followups") {
          return (
            <FollowupsInlinePanel
              followupTasks={followupTasks}
              followupsStateKind={followupsStateKind}
              key={panel.kind}
              onOpenHref={onOpenHref}
              panel={panel}
            />
          );
        }

        if (panel.kind === "schedule") {
          return (
            <ScheduleInlinePanel
              key={panel.kind}
              onOpenHref={onOpenHref}
              panel={panel}
              scheduleItems={scheduleItems}
              scheduleStateKind={scheduleStateKind}
            />
          );
        }

        if (panel.kind === "profile") {
          return (
            <ProfileInlinePanel
              key={panel.kind}
              onOpenHref={onOpenHref}
              panel={panel}
              profile={profile}
              profileStateKind={profileStateKind}
            />
          );
        }

        return (
            <EventInlinePanel
              baseUrl={baseUrl}
              eventCards={eventCards}
              eventsStateKind={eventsStateKind}
              key={panel.kind}
              onOpenEvent={onOpenEvent}
              onOpenHref={onOpenHref}
              panel={panel}
              thread={thread}
            />
        );
      })}
    </View>
  );
}

function EventInlinePanel({
  baseUrl,
  eventCards,
  eventsStateKind,
  onOpenEvent,
  onOpenHref,
  panel,
  thread
}: {
  baseUrl: string;
  eventCards: EventSummary[];
  eventsStateKind: ResourceKind;
  onOpenEvent: (eventId: string) => void;
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  panel: ConversationInlinePanelView;
  thread: ConversationThreadView;
}) {
  const { colors, styles } = useStyles();
  const prioritizedEvents = prioritizeConversationEvents(thread, eventCards);

  return (
    <View style={styles.inlinePanel}>
      <View style={styles.inlinePanelHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>{panel.title}</Text>
          <Text style={styles.inlinePanelDetail}>{panel.detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref(panel.actionHref)}
          style={({ pressed }) => [
            styles.inlinePanelAction,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.inlinePanelActionText}>全部</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      </View>
      {eventsStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取活动。</Text>
      ) : null}
      {eventsStateKind === "offline" || eventsStateKind === "failure" ? (
        <Text style={styles.errorText}>活动暂时不可用。</Text>
      ) : null}
      {eventsStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有可展示的活动。</Text>
      ) : null}
      {eventCards.length > 0 ? (
        <View style={styles.eventCardStack}>
          {prioritizedEvents.slice(0, 3).map((event) => (
            <Pressable
              accessibilityRole="button"
              key={event.id}
              onPress={() => onOpenEvent(event.id)}
              style={({ pressed }) => [
                styles.eventSuggestionCard,
                pressed ? styles.pressed : null
              ]}
            >
              <View style={styles.eventSuggestionMediaColumn}>
                <ImageBackground
                  imageStyle={styles.eventSuggestionThumbImage}
                  source={{ uri: assetUrl(baseUrl, event.coverPath) }}
                  style={styles.eventSuggestionThumbFrame}
                >
                  <View style={styles.eventSuggestionThumbOverlay} />
                </ImageBackground>
                <Text style={styles.eventStatusBadge}>{event.status}</Text>
              </View>
              <View style={styles.eventSuggestionText}>
                <Text numberOfLines={2} style={styles.eventSuggestionTitle}>
                  {event.title}
                </Text>
                <View style={styles.eventSuggestionMeta}>
                  <View style={styles.eventSuggestionMetaLine}>
                    <Ionicons color={colors.text3} name="time-outline" size={13} />
                    <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                      {event.startsAt}
                    </Text>
                  </View>
                  {event.location ? (
                    <View style={styles.eventSuggestionMetaLine}>
                      <Ionicons
                        color={colors.text3}
                        name="location-outline"
                        size={13}
                      />
                      <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                        {event.location}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.eventSuggestionMetaLine}>
                    <Ionicons color={colors.text3} name="people-outline" size={13} />
                    <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                      {event.participantCountLabel}
                    </Text>
                  </View>
                </View>
                <View style={styles.eventSuggestionFooter}>
                  <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                    打开活动背景
                  </Text>
                  <Text numberOfLines={1} style={styles.eventSuggestionAction}>
                    {event.actionLabel}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PeopleInlinePanel({
  baseUrl,
  contactCards,
  contactsStateKind,
  onOpenContact,
  onOpenHref,
  panel,
  thread
}: {
  baseUrl: string;
  contactCards: ContactSummary[];
  contactsStateKind: ResourceKind;
  onOpenContact: (contactId: string) => void;
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  panel: ConversationInlinePanelView;
  thread: ConversationThreadView;
}) {
  const { colors, styles } = useStyles();
  const prioritizedContacts = prioritizeConversationContacts(thread, contactCards);

  return (
    <View style={styles.inlinePanel}>
      <View style={styles.inlinePanelHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>{panel.title}</Text>
          <Text style={styles.inlinePanelDetail}>{panel.detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref(panel.actionHref)}
          style={({ pressed }) => [
            styles.inlinePanelAction,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.inlinePanelActionText}>全部</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      </View>
      {contactsStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取人脉。</Text>
      ) : null}
      {contactsStateKind === "offline" || contactsStateKind === "failure" ? (
        <Text style={styles.errorText}>人脉暂时不可用。</Text>
      ) : null}
      {contactsStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有可展示的人脉。</Text>
      ) : null}
      {prioritizedContacts.length > 0 ? (
        <View style={styles.contactCardStack}>
          {prioritizedContacts.slice(0, 3).map((contact) => {
            const avatar = contactAvatarFor(contact);

            return (
              <Pressable
                accessibilityRole="button"
                key={contact.id}
                onPress={() => onOpenContact(contact.id)}
                style={({ pressed }) => [
                  styles.contactSuggestionCard,
                  pressed ? styles.pressed : null
                ]}
              >
                <View
                  style={[
                    styles.contactAvatar,
                    contactAvatarToneStyle(avatar.tone, styles)
                  ]}
                >
                  {contact.imageUrl ? (
                    <Image
                      resizeMode="cover"
                      source={{ uri: assetUrl(baseUrl, contact.imageUrl) }}
                      style={styles.contactAvatarImage}
                    />
                  ) : (
                    <Text style={styles.contactAvatarText}>
                      {avatar.initial}
                    </Text>
                  )}
                </View>
                <View style={styles.contactSuggestionText}>
                  <Text numberOfLines={1} style={styles.eventSuggestionTitle}>
                    {contact.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                    {[
                      contact.status,
                      contact.valueLabels.slice(0, 2).join(" / ")
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <Text numberOfLines={2} style={styles.inlinePanelDetail}>
                    {contact.nextAction}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function FollowupsInlinePanel({
  followupTasks,
  followupsStateKind,
  onOpenHref,
  panel
}: {
  followupTasks: FollowupTaskView[];
  followupsStateKind: ResourceKind;
  onOpenHref: (href: string) => void;
  panel: ConversationInlinePanelView;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.inlinePanel}>
      <View style={styles.inlinePanelHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>{panel.title}</Text>
          <Text style={styles.inlinePanelDetail}>{panel.detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref(panel.actionHref)}
          style={({ pressed }) => [
            styles.inlinePanelAction,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.inlinePanelActionText}>全部</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      </View>
      {followupsStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取待办。</Text>
      ) : null}
      {followupsStateKind === "offline" || followupsStateKind === "failure" ? (
        <Text style={styles.errorText}>待办暂时不可用。</Text>
      ) : null}
      {followupTasks.length > 0 ? (
        <View style={styles.followupCardStack}>
          {followupTasks.slice(0, 3).map((task) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`打开待办详情：${task.title}`}
              disabled={!conversationTaskDetailHref(task.id)}
              key={task.id}
              onPress={() => onOpenHref(conversationTaskDetailHref(task.id)!)}
              style={({ pressed }) => [
                styles.followupSuggestionCard,
                pressed ? styles.pressed : null
              ]}
            >
              <View style={styles.followupStatusColumn}>
                <Text style={styles.followupPriority}>{task.priorityLabel}</Text>
                <Text style={styles.followupDue}>{task.dueLabel}</Text>
              </View>
              <View style={styles.eventSuggestionText}>
                <Text numberOfLines={1} style={styles.eventSuggestionTitle}>
                  {task.title}
                </Text>
                <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                  {followupInlineContextLabel(task)}
                </Text>
                <Text numberOfLines={2} style={styles.inlinePanelDetail}>
                  {task.recommendedAction}
                </Text>
              </View>
              <Ionicons color={colors.accent} name="chevron-forward" size={18} />
            </Pressable>
          ))}
        </View>
      ) : followupsStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有需要复核的跟进。</Text>
      ) : null}
    </View>
  );
}

function ScheduleInlinePanel({
  onOpenHref,
  panel,
  scheduleItems,
  scheduleStateKind
}: {
  onOpenHref: (href: string) => void;
  panel: ConversationInlinePanelView;
  scheduleItems: ScheduleItem[];
  scheduleStateKind: ResourceKind;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.inlinePanel}>
      <View style={styles.inlinePanelHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>{panel.title}</Text>
          <Text style={styles.inlinePanelDetail}>{panel.detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref(panel.actionHref)}
          style={({ pressed }) => [
            styles.inlinePanelAction,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.inlinePanelActionText}>全部</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      </View>
      {scheduleStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取日程。</Text>
      ) : null}
      {scheduleStateKind === "offline" || scheduleStateKind === "failure" ? (
        <Text style={styles.errorText}>日程暂时不可用。</Text>
      ) : null}
      {scheduleItems.length > 0 ? (
        <View style={styles.scheduleCardStack}>
          {scheduleItems.slice(0, 3).map((item) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`打开待办详情：${item.title}`}
              disabled={!conversationTaskDetailHref(item.id)}
              key={item.id}
              onPress={() => onOpenHref(conversationTaskDetailHref(item.id)!)}
              style={({ pressed }) => [
                styles.scheduleSuggestionCard,
                pressed ? styles.pressed : null
              ]}
            >
              <View style={styles.scheduleDateBadge}>
                <Text numberOfLines={2} style={styles.scheduleDateText}>
                  {item.dayLabel}
                </Text>
                {item.timeLabel ? (
                  <Text style={styles.scheduleTimeText}>{item.timeLabel}</Text>
                ) : null}
              </View>
              <View style={styles.eventSuggestionText}>
                <Text numberOfLines={1} style={styles.eventSuggestionTitle}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                  {item.priority}
                </Text>
                <Text numberOfLines={2} style={styles.inlinePanelDetail}>
                  {item.recommendedAction}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : scheduleStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有可展示的日程。</Text>
      ) : null}
    </View>
  );
}

function ProfileInlinePanel({
  onOpenHref,
  panel,
  profile,
  profileStateKind
}: {
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  panel: ConversationInlinePanelView;
  profile: ProfileSummary | null;
  profileStateKind: ResourceKind;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.inlinePanel}>
      <View style={styles.inlinePanelHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>{panel.title}</Text>
          <Text style={styles.inlinePanelDetail}>{panel.detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref(panel.actionHref)}
          style={({ pressed }) => [
            styles.inlinePanelAction,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.inlinePanelActionText}>完善</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      </View>
      {profileStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取档案。</Text>
      ) : null}
      {profileStateKind === "offline" || profileStateKind === "failure" ? (
        <Text style={styles.errorText}>档案暂时不可用。</Text>
      ) : null}
      {profile ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref("/profile")}
          style={({ pressed }) => [
            styles.profileSuggestionCard,
            pressed ? styles.pressed : null
          ]}
        >
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {profile.displayName.trim().slice(0, 1) || "O"}
            </Text>
          </View>
          <View style={styles.profileSuggestionText}>
            <Text numberOfLines={1} style={styles.eventSuggestionTitle}>
              {profile.displayName}
            </Text>
            <Text numberOfLines={2} style={styles.eventSuggestionDetail}>
              {profile.headline}
            </Text>
            <View style={styles.profileChipRow}>
              {profile.offering.slice(0, 3).map((item) => (
                <Text numberOfLines={1} key={item} style={styles.profileChip}>
                  {item}
                </Text>
              ))}
            </View>
          </View>
        </Pressable>
      ) : profileStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有可展示的档案。</Text>
      ) : null}
    </View>
  );
}

function contactAvatarToneStyle(tone: ReturnType<typeof contactAvatarFor>["tone"], styles: ReturnType<typeof useStyles>["styles"]) {
  if (tone === "amber") return styles.contactAvatarAmber;
  if (tone === "emerald") return styles.contactAvatarEmerald;
  if (tone === "rose") return styles.contactAvatarRose;
  if (tone === "sky") return styles.contactAvatarSky;
  return styles.contactAvatarViolet;
}

function QuickRouteDock({
  onOpenHref
}: {
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
}) {
  const { colors, styles } = useStyles();
  const iconForRoute = (
    href: ConversationQuickRouteView["href"]
  ): keyof typeof Ionicons.glyphMap => {
    if (href === "/events") return "calendar-outline";
    if (href === "/contacts" || href === "/contacts/list") {
      return "people-outline";
    }
    if (href === "/followups") return "checkmark-done-outline";
    if (href === "/schedule") return "time-outline";
    return "person-circle-outline";
  };

  return (
    <View style={styles.quickRouteDock}>
      <Text style={styles.quickRouteLabel}>通用入口</Text>
      <View style={styles.quickRouteGrid}>
        {conversationQuickRoutes().map((route) => (
          <Pressable
            accessibilityRole="button"
            key={route.href}
            onPress={() => onOpenHref(route.href)}
            style={({ pressed }) => [
              styles.quickRouteButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons
              color={colors.accent}
              name={iconForRoute(route.href)}
              size={17}
            />
            <Text numberOfLines={1} style={styles.quickRouteTitle}>
              {route.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MessageBubble({ baseUrl, message, onOpenHref }: { baseUrl: string; message: ChatMessageView; onOpenHref: (href: string) => void }) {
  const { colors, styles } = useStyles();
  const isUser = message.role === "user";
  const links = conversationRecordLinks(message.content, baseUrl);
  const [linkError, setLinkError] = useState<string | null>(null);

  return (
    <View accessibilityLabel={isUser ? "我的消息" : "Orbit AI 回复"} style={[styles.messageBubble, isUser ? styles.userBubble : null]}>
      {isUser ? <Text selectable style={[styles.messageText, styles.messageTextUser]}>{message.content}</Text> : <MarkdownContent content={message.content} isUser={false} />}
      {links.map((link) => (
        <Pressable
          accessibilityLabel={`打开${link.kind}详情：${link.id}`}
          accessibilityRole="link"
          key={link.href}
          onPress={() => {
            Keyboard.dismiss();
            setLinkError(null);
            if (link.external) void Linking.openURL(link.href).catch(() => setLinkError("链接暂时无法打开，请稍后重试。"));
            else onOpenHref(link.href);
          }}
          style={styles.recordLink}
        >
          <Ionicons color={colors.accent} name={link.kind === "人脉" ? "person-outline" : link.kind === "待办" ? "checkbox-outline" : link.kind === "行动" ? "flash-outline" : "calendar-outline"} size={20} />
          <Text style={styles.recordLinkText}>{link.kind}详情 · {link.id}{link.external ? " · 网页" : ""}</Text>
          <Ionicons color={colors.accent} name="arrow-up-right-box-outline" size={18} />
        </Pressable>
      ))}
      {/(?:https?:\/\/|orbit:\/\/|\]\()/iu.test(message.content) ? <Text style={styles.linkBoundary}>详情入口仅支持当前服务的记录；未提供入口的链接不会跳转。</Text> : null}
      {linkError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{linkError}</Text> : null}
    </View>
  );
}

function MarkdownContent({
  content,
  isUser
}: {
  content: string;
  isUser: boolean;
}) {
  const { styles } = useStyles();
  const blocks = markdownBlocksFor(content);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View style={styles.markdownStack}>
      {blocks.map((block, index) => (
        <MarkdownBlock block={block} isUser={isUser} key={`${block.kind}-${index}`} />
      ))}
    </View>
  );
}

function MarkdownBlock({
  block,
  isUser
}: {
  block: MarkdownBlockView;
  isUser: boolean;
}) {
  const { styles } = useStyles();
  const textStyle = [
    styles.messageText,
    block.quote ? styles.markdownQuoteText : null,
    isUser ? styles.messageTextUser : null
  ];

  if (block.kind === "listItem") {
    return (
      <View
        style={[
          styles.listItemRow,
          block.quote ? styles.markdownQuoteBlock : null
        ]}
      >
        <Text style={[styles.listBullet, isUser ? styles.messageTextUser : null]}>
          {block.marker ?? "•"}
        </Text>
        <Text style={textStyle}>
          {block.segments.map((segment, index) => (
            <MarkdownSegment
              isUser={isUser}
              key={`${segment.kind}-${index}`}
              segment={segment}
            />
          ))}
        </Text>
      </View>
    );
  }

  const paragraph = (
    <Text selectable style={textStyle}>
      {block.segments.map((segment, index) => (
        <MarkdownSegment
          isUser={isUser}
          key={`${segment.kind}-${index}`}
          segment={segment}
        />
      ))}
    </Text>
  );

  if (block.quote) {
    return <View style={styles.markdownQuoteBlock}>{paragraph}</View>;
  }

  return paragraph;
}

function MarkdownSegment({
  isUser,
  segment
}: {
  isUser: boolean;
  segment: MarkdownInlineView;
}) {
  const { styles } = useStyles();
  return (
    <Text
      style={[
        segment.kind === "strong" ? styles.markdownStrong : null,
        segment.kind === "code" ? styles.markdownCode : null,
        isUser ? styles.messageTextUser : null
      ]}
    >
      {segment.text}
    </Text>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  readingSafeArea: { backgroundColor: colors.surface, flex: 1 },
  readingRoot: { flex: 1 },
  readingHistory: { flex: 1 },
  readingContent: { gap: spacing.lg, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 24 },
  routesPanel: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  composerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recordLink: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm },
  recordLinkText: { flex: 1, color: colors.accent, fontSize: typography.small, fontWeight: "600", lineHeight: 20 },
  linkBoundary: { color: colors.muted, fontSize: typography.small, lineHeight: 20 },
  backButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  aiRunActionText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  aiRunHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  aiRunMetric: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.accent,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
    maxWidth: "100%",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  aiRunMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  aiRunOutput: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    padding: spacing.md
  },
  aiRunPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  aiRunReference: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  aiRunReferenceStack: {
    gap: spacing.sm
  },
  aiRunReferenceText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  aiRunResult: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  aiRunSafetyText: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  composerPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6
  },
  contactAvatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  contactAvatarAmber: {
    backgroundColor: colors.amberSoft
  },
  contactAvatarEmerald: {
    backgroundColor: colors.liveSoft
  },
  contactAvatarRose: {
    backgroundColor: colors.roseSoft
  },
  contactAvatarSky: {
    backgroundColor: colors.skySoft
  },
  contactAvatarImage: {
    borderRadius: radius.pill,
    height: "100%",
    width: "100%"
  },
  contactAvatarText: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "900",
    lineHeight: 22
  },
  contactAvatarViolet: {
    backgroundColor: colors.accentSofter
  },
  contactCardStack: {
    gap: spacing.sm
  },
  contactSuggestionCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  contactSuggestionText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 25,
    minHeight: 48,
    maxHeight: 120,
    paddingHorizontal: 7,
    paddingTop: 2,
    paddingBottom: 2
  },
  eventCardStack: {
    gap: spacing.sm
  },
  eventStatusBadge: {
    alignSelf: "stretch",
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 4,
    textAlign: "center"
  },
  eventSuggestionCard: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.sm
  },
  eventSuggestionDetail: {
    color: colors.text3,
    flex: 1,
    fontSize: typography.caption,
    lineHeight: 16,
    minWidth: 0
  },
  eventSuggestionAction: {
    color: colors.accent,
    flexShrink: 0,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  eventSuggestionFooter: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingTop: spacing.xs
  },
  eventSuggestionMediaColumn: {
    flexShrink: 0,
    gap: spacing.xs,
    width: 64
  },
  eventSuggestionMeta: {
    gap: spacing.xxs
  },
  eventSuggestionMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minWidth: 0
  },
  eventSuggestionText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  eventSuggestionThumbFrame: {
    backgroundColor: colors.surface3,
    borderRadius: radius.sm,
    height: 64,
    overflow: "hidden",
    width: 64
  },
  eventSuggestionThumbImage: {
    borderRadius: radius.sm
  },
  eventSuggestionThumbOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10,10,16,0.10)"
  },
  eventSuggestionTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  followupCardStack: {
    gap: spacing.sm
  },
  followupDue: {
    color: colors.text3,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  },
  followupPriority: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "900",
    lineHeight: 16
  },
  followupStatusColumn: {
    alignItems: "flex-start",
    backgroundColor: colors.liveSoft,
    borderRadius: radius.sm,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    width: 82
  },
  followupSuggestionCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 50,
    justifyContent: "center",
    width: 50
  },
  profileAvatarText: {
    color: colors.accent,
    fontSize: typography.section,
    fontWeight: "900",
    lineHeight: 22
  },
  profileChip: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.text2,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    maxWidth: "100%",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  profileChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  profileSuggestionCard: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  profileSuggestionText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  intentPanel: {
    gap: spacing.sm
  },
  taskInteractionActions: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end"
  },
  taskInteractionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  taskInteractionCopy: { flex: 1, gap: 4, minWidth: 0 },
  taskInteractionEyebrow: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  taskInteractionFailed: { borderColor: colors.rose },
  taskInteractionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  taskInteractionIcon: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  taskInteractionPrimary: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.md
  },
  taskInteractionPrimaryText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800"
  },
  taskInteractionReason: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  taskInteractionSecondary: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.sm
  },
  taskInteractionSecondaryText: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "700"
  },
  taskInteractionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 22
  },
  intentBlock: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  intentTitle: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  inlinePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    paddingVertical: spacing.lg
  },
  inlinePanelAction: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.md
  },
  inlinePanelActionText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  inlinePanelDetail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  inlinePanelHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  inlinePanelStack: {
    gap: spacing.sm
  },
  inlinePanelTitleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  listBullet: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    width: 14
  },
  listItemRow: {
    alignItems: "flex-start",
    flexDirection: "row"
  },
  markdownCode: {
    backgroundColor: colors.surface3,
    borderRadius: radius.xs,
    color: colors.ink,
    fontSize: typography.caption,
    overflow: "hidden"
  },
  markdownStack: {
    gap: spacing.sm
  },
  markdownQuoteBlock: {
    borderLeftColor: colors.border,
    borderLeftWidth: 3,
    paddingLeft: spacing.sm
  },
  markdownQuoteText: {
    color: colors.text2
  },
  markdownStrong: {
    color: colors.ink,
    fontWeight: "800"
  },
  messageBubble: {
    alignSelf: "stretch",
    gap: spacing.sm
  },
  messageLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  messageStack: {
    gap: spacing.lg
  },
  messagePanel: {
    gap: spacing.sm
  },
  messageText: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 27
  },
  messageTextUser: {
    color: colors.accentPress,
    fontWeight: "600"
  },
  messageTime: {
    color: colors.text4,
    fontSize: typography.caption
  },
  panelTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "700",
    lineHeight: 22
  },
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 0.5 }]
  },
  scheduleCardStack: {
    gap: spacing.sm
  },
  scheduleDateBadge: {
    alignItems: "flex-start",
    backgroundColor: colors.skySoft,
    borderRadius: radius.sm,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    width: 86
  },
  scheduleDateText: {
    color: colors.sky,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15
  },
  scheduleSuggestionCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  scheduleTimeText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  quickRouteButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexBasis: "18%",
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 58,
    minWidth: 58,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm
  },
  quickRouteDock: {
    gap: spacing.sm
  },
  quickRouteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  quickRouteLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  quickRouteTitle: {
    color: colors.text2,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 44,
    width: 44,
    justifyContent: "center",
  },
  sendButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  threadEyebrow: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "600"
  },
  threadHeader: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 68,
    paddingHorizontal: 8,
    paddingBottom: 8
  },
  threadNextAction: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  threadSurface: {
    backgroundColor: colors.surface,
    flex: 1
  },
  threadTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 22
  },
  threadTitleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  userBubble: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderWidth: 1,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6
  }
}));
