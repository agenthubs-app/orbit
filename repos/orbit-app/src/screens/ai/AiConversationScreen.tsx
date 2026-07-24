import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { ORBIT_API_ENDPOINTS, aiConversationPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  conversationInlinePanelsForThread,
  conversationPayloadToThreadView,
  conversationQuickRoutes,
  markdownBlocksFor,
  pendingConversationThreadView,
  shouldSubmitInitialPrompt,
  type ChatMessageView,
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
  const { id, initialMessage } = useLocalSearchParams<{
    id?: string | string[];
    initialMessage?: string | string[];
  }>();
  const conversationId = firstParam(id);
  const initialPrompt = optionalParam(initialMessage).trim();
  const isDraftConversation = conversationId === "new" && !!initialPrompt;
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const path = isDraftConversation
    ? ORBIT_API_ENDPOINTS.conversations
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
  const [sending, setSending] = useState(false);
  const submittedInitialPrompt = useRef<string | null>(null);

  function refresh() {
    setLatestData(null);
    state.refresh();
  }

  async function sendMessage() {
    const message = draftMessage.trim();

    if (!message) {
      setSendError("先输入你想继续问的问题。");
      return;
    }

    setSending(true);
    setSendError(null);

    const sendPath = resolvedConversationId
      ? aiConversationPath(resolvedConversationId)
      : isDraftConversation
        ? ORBIT_API_ENDPOINTS.conversations
        : path;
    const result = await client.post<unknown>(sendPath, {
      body: {
        locale: "zh",
        message
      }
    });

    if (result.success) {
      const nextThread = conversationPayloadToThreadView(result.data);
      setLatestData(result.data);
      setResolvedConversationId(nextThread.activeConversationId);
      setDraftMessage("");
      state.refresh();
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

    void client
      .post<unknown>(ORBIT_API_ENDPOINTS.conversations, {
        body: {
          locale: "zh",
          message: initialPrompt
        }
      })
      .then((result) => {
        if (result.success) {
          const nextThread = conversationPayloadToThreadView(result.data);
          setLatestData(result.data);
          setResolvedConversationId(nextThread.activeConversationId);
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

  const loadedData =
    !isDraftConversation && (state.kind === "success" || state.kind === "empty")
      ? state.data
      : null;
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
      ? conversationPayloadToThreadView(loadedData)
      : pendingThread;
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
          onBack={() => router.push("/ai" as Href)}
          onChangeDraft={setDraftMessage}
          onOpenContact={(contactId) =>
            router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)
          }
          onOpenEvent={(eventId) =>
            router.push(`/events/${encodeURIComponent(eventId)}` as Href)
          }
          onOpenHref={(href) => router.push(href as Href)}
          profile={profile}
          profileStateKind={profileState.kind}
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
  onOpenContact,
  onOpenEvent,
  onOpenHref,
  profile,
  profileStateKind,
  scheduleItems,
  scheduleStateKind,
  onSend,
  sendError,
  sending,
  thread
}: {
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
  onOpenContact: (contactId: string) => void;
  onOpenEvent: (eventId: string) => void;
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  profile: ProfileSummary | null;
  profileStateKind: ResourceKind;
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
  scheduleStateKind
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
}) {
  return (
    <View style={styles.inlinePanelStack}>
      {panels.map((panel) => {
        if (panel.kind === "people") {
          return (
            <PeopleInlinePanel
              contactCards={contactCards}
              contactsStateKind={contactsStateKind}
              key={panel.kind}
              onOpenContact={onOpenContact}
              onOpenHref={onOpenHref}
              panel={panel}
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
  panel
}: {
  baseUrl: string;
  eventCards: EventSummary[];
  eventsStateKind: ResourceKind;
  onOpenEvent: (eventId: string) => void;
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
          {eventCards.slice(0, 3).map((event) => (
            <Pressable
              accessibilityRole="button"
              key={event.id}
              onPress={() => onOpenEvent(event.id)}
              style={({ pressed }) => [
                styles.eventSuggestionCard,
                pressed ? styles.pressed : null
              ]}
            >
              <ImageBackground
                imageStyle={styles.eventImage}
                source={{ uri: assetUrl(baseUrl, event.coverPath) }}
                style={styles.eventImageFrame}
              >
                <View style={styles.eventImageScrim} />
                <Text style={styles.eventStatusBadge}>{event.status}</Text>
              </ImageBackground>
              <View style={styles.eventSuggestionText}>
                <Text numberOfLines={2} style={styles.eventSuggestionTitle}>
                  {event.title}
                </Text>
                <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                  {[event.startsAt, event.location].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PeopleInlinePanel({
  contactCards,
  contactsStateKind,
  onOpenContact,
  onOpenHref,
  panel
}: {
  contactCards: ContactSummary[];
  contactsStateKind: ResourceKind;
  onOpenContact: (contactId: string) => void;
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
      {contactsStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取人脉。</Text>
      ) : null}
      {contactsStateKind === "offline" || contactsStateKind === "failure" ? (
        <Text style={styles.errorText}>人脉暂时不可用。</Text>
      ) : null}
      {contactsStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有可展示的人脉。</Text>
      ) : null}
      {contactCards.length > 0 ? (
        <View style={styles.contactCardStack}>
          {contactCards.slice(0, 3).map((contact) => {
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
                  <Text style={styles.contactAvatarText}>{avatar.initial}</Text>
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
    if (href === "/contacts") return "people-outline";
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
  if (block.kind === "listItem") {
    return (
      <View style={styles.listItemRow}>
        <Text style={[styles.listBullet, isUser ? styles.messageTextUser : null]}>
          •
        </Text>
        <Text style={[styles.messageText, isUser ? styles.messageTextUser : null]}>
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

  return (
    <Text style={[styles.messageText, isUser ? styles.messageTextUser : null]}>
      {block.segments.map((segment, index) => (
        <MarkdownSegment
          isUser={isUser}
          key={`${segment.kind}-${index}`}
          segment={segment}
        />
      ))}
    </Text>
  );
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
  eventImage: {
    borderRadius: radius.sm
  },
  eventImageFrame: {
    alignItems: "flex-start",
    backgroundColor: colors.surface3,
    borderRadius: radius.sm,
    height: 74,
    justifyContent: "flex-start",
    overflow: "hidden",
    padding: spacing.sm,
    width: 92
  },
  eventImageScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.14)"
  },
  eventStatusBadge: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.pill,
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  eventSuggestionCard: {
    alignItems: "center",
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
    fontSize: typography.caption,
    lineHeight: 16
  },
  eventSuggestionText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
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
