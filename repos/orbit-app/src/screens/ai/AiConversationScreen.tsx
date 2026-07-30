import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Image,
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import {
  ORBIT_API_ENDPOINTS,
  aiConversationPath,
  aiConversationSessionPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
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
  type MarkdownInlineView
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
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiRunError, setAiRunError] = useState<string | null>(null);
  const [aiRunDetailView, setAiRunDetailView] =
    useState<AiRunDetailView | null>(null);
  const [pendingAiRunId, setPendingAiRunId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
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
    <AppScreen
      eyebrow="Orbit AI"
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      showBack={false}
      title="对话"
    >
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
          profile={profile}
          profileStateKind={profileState.kind}
          pendingAiRunId={pendingAiRunId}
          runReferences={runReferences}
          scheduleItems={scheduleItems}
          scheduleStateKind={tasksState.kind}
          onSend={sendMessage}
          sendError={sendError}
          sending={sending}
          thread={thread}
        />
      ) : null}
    </AppScreen>
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
  profile,
  profileStateKind,
  pendingAiRunId,
  runReferences,
  scheduleItems,
  scheduleStateKind,
  onSend,
  sendError,
  sending,
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
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  profile: ProfileSummary | null;
  profileStateKind: ResourceKind;
  pendingAiRunId: string | null;
  runReferences: ConversationAiRunReferenceView[];
  scheduleItems: ScheduleItem[];
  scheduleStateKind: ResourceKind;
  onSend: () => void;
  sendError: string | null;
  sending: boolean;
  thread: ConversationThreadView;
}) {
  const inlinePanelAnchorIndex = thread.messages.reduce(
    (lastIndex, message, index) => (message.role === "user" ? index : lastIndex),
    -1
  );

  return (
    <View style={styles.threadSurface}>
      <View style={styles.threadHeader}>
        <View style={styles.threadTitleBlock}>
          <Text style={styles.threadEyebrow}>Orbit AI</Text>
          <Text numberOfLines={2} style={styles.threadTitle}>
            {thread.title}
          </Text>
          <Text numberOfLines={2} style={styles.threadNextAction}>
            {thread.nextAction}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="返回 Orbit AI"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="arrow-back-outline" size={17} />
        </Pressable>
      </View>
      <View style={styles.messagePanel}>
        {thread.messages.length === 0 ? (
          <EmptyState message="这条对话还没有消息。" title="没有消息" />
        ) : (
          <View style={styles.messageStack}>
            {thread.messages.map((message, index) => (
              <Fragment key={message.id}>
                <MessageBubble message={message} />
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
      <View style={styles.composerPanel}>
        <TextInput
          multiline
          onChangeText={onChangeDraft}
          placeholder="继续问一个具体问题"
          placeholderTextColor={colors.text4}
          style={styles.input}
          textAlignVertical="top"
          value={draftMessage}
        />
        {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={sending}
          onPress={onSend}
          style={({ pressed }) => [
            styles.sendButton,
            sending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="send-outline" size={17} />
          <Text style={styles.sendButtonText}>{sending ? "发送中" : "发送"}</Text>
        </Pressable>
      </View>
      <QuickRouteDock onOpenHref={onOpenHref} />
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
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  panels: ConversationInlinePanelView[];
  profile: ProfileSummary | null;
  profileStateKind: ResourceKind;
  scheduleItems: ScheduleItem[];
  scheduleStateKind: ResourceKind;
  thread: ConversationThreadView;
}) {
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
                    contactAvatarToneStyle(avatar.tone)
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
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  panel: ConversationInlinePanelView;
}) {
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
        <Text style={styles.inlinePanelDetail}>正在读取跟进事项。</Text>
      ) : null}
      {followupsStateKind === "offline" || followupsStateKind === "failure" ? (
        <Text style={styles.errorText}>跟进事项暂时不可用。</Text>
      ) : null}
      {followupTasks.length > 0 ? (
        <View style={styles.followupCardStack}>
          {followupTasks.slice(0, 3).map((task) => (
            <Pressable
              accessibilityRole="button"
              key={task.id}
              onPress={() => onOpenHref("/followups")}
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
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  panel: ConversationInlinePanelView;
  scheduleItems: ScheduleItem[];
  scheduleStateKind: ResourceKind;
}) {
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
              key={item.id}
              onPress={() => onOpenHref("/schedule")}
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

function contactAvatarToneStyle(tone: ReturnType<typeof contactAvatarFor>["tone"]) {
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

function MessageBubble({ message }: { message: ChatMessageView }) {
  const isUser = message.role === "user";
  const messageTime = message.createdAt.replace("T", " ").slice(0, 16);

  return (
    <View style={[styles.messageBubble, isUser ? styles.userBubble : null]}>
      <Text style={styles.messageLabel}>{isUser ? "我" : "Orbit AI"}</Text>
      <MarkdownContent content={message.content} isUser={isUser} />
      {messageTime ? <Text style={styles.messageTime}>{messageTime}</Text> : null}
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
    <Text style={textStyle}>
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

const styles = StyleSheet.create({
  backButton: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: "center",
    width: 40
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
    gap: spacing.md
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
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 21,
    minHeight: 94,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md
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
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
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
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    maxWidth: "92%",
    padding: spacing.md
  },
  messageLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  messageStack: {
    gap: spacing.sm
  },
  messagePanel: {
    gap: spacing.sm
  },
  messageText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  messageTextUser: {
    color: colors.onAccent
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
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  sendButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  threadEyebrow: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  threadHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  threadNextAction: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  threadSurface: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg
  },
  threadTitle: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 25
  },
  threadTitleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.accent,
    borderColor: colors.accent
  }
});
