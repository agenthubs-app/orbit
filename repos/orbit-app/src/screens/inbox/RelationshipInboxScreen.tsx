import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  ORBIT_API_ENDPOINTS,
  chatPrivacyControlsPath,
  relationshipInboxPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildRelationshipSignalConfirmRequest,
  buildRelationshipPrivacyToggleRequest,
  buildRelationshipRewriteRequest,
  buildRelationshipThreadDraftRequest,
  createdRelationshipThreadToView,
  defaultRelationshipDraft,
  relationshipConversationIdForContact,
  relationshipInboxBadgeCount,
  relationshipAlertsToView,
  relationshipInboxErrorText,
  relationshipInboxToView,
  relationshipPrivacyControlsToView,
  relationshipRewriteToDraft,
  relationshipSignalConfirmToView,
  relationshipSignalsToView,
  type RelationshipAlertsView,
  type RelationshipCreatedThreadView,
  type RelationshipConversationView,
  type RelationshipPrivacyControlsView,
  type RelationshipRewriteDraftView,
  type RelationshipSignalConfirmView,
  type RelationshipSignalsView,
  type RelationshipThreadDetailView
} from "../../view-models/relationship-inbox";

type InboxSection = "alerts" | "threads";
type ClientGet = (endpoint: string) => Promise<{
  data?: unknown;
  error?: { message: string };
  success: boolean;
}>;
type ClientPost = (endpoint: string, body: unknown) => Promise<{
  data?: unknown;
  error?: { message: string };
  success: boolean;
}>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function uniqueConversations(
  conversations: RelationshipConversationView[]
): RelationshipConversationView[] {
  const seen = new Set<string>();
  return conversations.filter((conversation) => {
    if (seen.has(conversation.id)) {
      return false;
    }
    seen.add(conversation.id);
    return true;
  });
}

export function RelationshipInboxScreen() {
  const params = useLocalSearchParams<{
    contactId?: string | string[];
    organization?: string | string[];
    participantName?: string | string[];
  }>();
  const seedContactId = firstParam(params.contactId);
  const seedName = firstParam(params.participantName);
  const seedOrganization = firstParam(params.organization);
  const client = useOrbitApiClient();
  const clientGet = useCallback(
    (endpoint: string) => client.get<unknown>(endpoint),
    [client]
  );
  const clientPost = useCallback(
    (endpoint: string, body: unknown) => client.post<unknown>(endpoint, { body }),
    [client]
  );
  const [createdThread, setCreatedThread] =
    useState<RelationshipCreatedThreadView | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const selectedIsCreated =
    Boolean(createdThread) &&
    createdThread?.conversation.id === selectedConversationId;
  const state = useApiResource<unknown>(
    relationshipInboxPath(selectedIsCreated ? null : selectedConversationId),
    (data) => relationshipInboxToView(data).conversations.length === 0
  );
  const notificationsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.notifications,
    (data) => relationshipAlertsToView(data).alerts.length === 0
  );
  const signalsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.relationshipSignalsEmailCalendar,
    (data) => relationshipSignalsToView(data).signals.length === 0
  );
  const [composing, setComposing] = useState(
    Boolean(!seedContactId && (seedName || seedOrganization))
  );

  useEffect(() => {
    if (seedContactId) {
      setCreatedThread(null);
      setSelectedConversationId(null);
      setComposing(false);
      return;
    }

    if (seedName || seedOrganization) {
      setComposing(true);
    }
  }, [seedContactId, seedName, seedOrganization]);

  function refreshAll() {
    state.refresh();
    notificationsState.refresh();
    signalsState.refresh();
  }

  return (
    <AppScreen
      eyebrow="关系与跟进"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={
            state.refreshing ||
            notificationsState.refreshing ||
            signalsState.refreshing
          }
          tintColor={colors.accent}
        />
      }
      title="关系收件箱"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <InboxContent
          clientGet={clientGet}
          clientPost={clientPost}
          createdThread={createdThread}
          data={state.kind === "success" ? state.data : null}
          notificationsData={
            notificationsState.kind === "success" ? notificationsState.data : null
          }
          onCreateThread={setCreatedThread}
          onSelectConversation={setSelectedConversationId}
          onRefreshSignals={signalsState.refresh}
          selectedConversationId={selectedConversationId}
          seed={{
            contactId: seedContactId,
            organization: seedOrganization,
            participantName: seedName
          }}
          signalsData={
            signalsState.kind === "success" || signalsState.kind === "empty"
              ? signalsState.data
              : null
          }
          signalsError={
            signalsState.kind === "failure" || signalsState.kind === "offline"
              ? relationshipInboxErrorText(
                  signalsState.error.message,
                  "关系线索暂时不可用。"
                )
              : ""
          }
          signalsLoading={signalsState.kind === "loading"}
          setComposing={setComposing}
          composing={composing}
        />
      ) : null}
    </AppScreen>
  );
}

function InboxContent({
  clientGet,
  clientPost,
  composing,
  createdThread,
  data,
  notificationsData,
  onCreateThread,
  onSelectConversation,
  onRefreshSignals,
  seed,
  selectedConversationId,
  signalsData,
  signalsError,
  signalsLoading,
  setComposing
}: {
  clientGet: ClientGet;
  clientPost: ClientPost;
  composing: boolean;
  createdThread: RelationshipCreatedThreadView | null;
  data: unknown;
  notificationsData: unknown;
  onCreateThread: (thread: RelationshipCreatedThreadView | null) => void;
  onSelectConversation: (conversationId: string | null) => void;
  onRefreshSignals: () => void;
  seed: { contactId: string; organization: string; participantName: string };
  selectedConversationId: string | null;
  signalsData: unknown;
  signalsError: string;
  signalsLoading: boolean;
  setComposing: (value: boolean) => void;
}) {
  const view = relationshipInboxToView(data);
  const alertsView = relationshipAlertsToView(notificationsData);
  const signalsView = relationshipSignalsToView(signalsData);
  const signalCount = signalsView.signals.length;
  const pendingSignalCount = signalsView.signals.filter(
    (signal) => signal.canConfirm
  ).length;
  const conversations = uniqueConversations([
    ...(createdThread ? [createdThread.conversation] : []),
    ...view.conversations
  ]);
  const selected =
    createdThread?.conversation.id === selectedConversationId
      ? createdThread.detail
      : view.selected;
  const activeId = selected?.conversationId ?? null;
  const [activeSection, setActiveSection] = useState<InboxSection>("threads");
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(
    () => new Set()
  );
  const visibleAlerts = alertsView.alerts.filter(
    (alert) => !dismissedAlertIds.has(alert.id)
  );
  const visibleAlertsView: RelationshipAlertsView = {
    ...alertsView,
    alerts: visibleAlerts,
    summary: visibleAlerts.length ? `${visibleAlerts.length} 条提醒` : "暂无提醒"
  };
  const badgeCount =
    relationshipInboxBadgeCount(view, visibleAlertsView) + pendingSignalCount;
  const seededConversationId = relationshipConversationIdForContact(
    view,
    seed.contactId
  );

  useEffect(() => {
    if (!seed.contactId || selectedConversationId || createdThread) {
      return;
    }

    if (seededConversationId) {
      onSelectConversation(seededConversationId);
      setComposing(false);
      return;
    }

    setComposing(true);
  }, [
    createdThread,
    onSelectConversation,
    seed.contactId,
    seededConversationId,
    selectedConversationId,
    setComposing
  ]);

  useEffect(() => {
    if (composing || selectedConversationId) {
      setActiveSection("threads");
    }
  }, [composing, selectedConversationId]);

  return (
    <>
      <DataCard
        detail={`${visibleAlertsView.summary} · ${view.summary}`}
        title={view.title}
      >
        <View style={styles.inboxMetrics}>
          <MetricPill label="待处理" value={String(badgeCount)} />
          <MetricPill label="线索" value={String(signalCount)} />
          <MetricPill label="提醒" value={String(visibleAlerts.length)} />
          <MetricPill label="对话" value={String(conversations.length)} />
        </View>
        <InboxSegmentedControl
          activeSection={activeSection}
          alertCount={visibleAlerts.length + signalCount}
          onChange={setActiveSection}
          threadCount={conversations.length}
        />
      </DataCard>

      {activeSection === "alerts" ? (
        <>
          <RelationshipSignalsCard
            clientPost={clientPost}
            error={signalsError}
            loading={signalsLoading}
            onConfirmed={onRefreshSignals}
            view={signalsView}
          />
          <AlertsCard
            onDismissAlert={(id) =>
              setDismissedAlertIds((current) => {
                const next = new Set(current);
                next.add(id);
                return next;
              })
            }
            view={visibleAlertsView}
          />
        </>
      ) : null}

      {activeSection === "threads" ? (
        <>
          <ActionButton
            icon="create-outline"
            label="写一段新跟进"
            onPress={() => setComposing(true)}
          />

          {composing ? (
            <NewThreadComposer
              clientPost={clientPost}
              onCancel={() => setComposing(false)}
              onCreated={(thread) => {
                onCreateThread(thread);
                onSelectConversation(thread.conversation.id);
                setComposing(false);
              }}
              seed={seed}
            />
          ) : null}

          {conversations.length > 0 ? (
            <ConversationList
              activeId={activeId}
              conversations={conversations}
              onSelect={onSelectConversation}
            />
          ) : (
            <DataCard detail="新的关系往来会显示在这里" title="暂无对话">
              <Text style={styles.bodyText}>
                可以先写一段跟进草稿，确认后再放进收件箱复核。
              </Text>
            </DataCard>
          )}

          {selected ? (
            <ThreadDetail
              clientGet={clientGet}
              clientPost={clientPost}
              detail={selected}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function RelationshipSignalsCard({
  clientPost,
  error,
  loading,
  onConfirmed,
  view
}: {
  clientPost: ClientPost;
  error: string;
  loading: boolean;
  onConfirmed: () => void;
  view: RelationshipSignalsView;
}) {
  const [pendingSignalId, setPendingSignalId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmation, setConfirmation] =
    useState<RelationshipSignalConfirmView | null>(null);

  async function onConfirmSignal(id: string) {
    const request = buildRelationshipSignalConfirmRequest(id);

    if (!request.success) {
      setActionError(request.error);
      return;
    }

    setPendingSignalId(id);
    setActionError(null);

    try {
      const result = await clientPost(request.request.endpoint, request.request.body);

      if (!result.success) {
        setActionError(
          relationshipInboxErrorText(
            result.error?.message,
            "这条线索暂时确认不了。"
          )
        );
        return;
      }

      setConfirmation(relationshipSignalConfirmToView(result.data));
      onConfirmed();
    } catch (requestError) {
      setActionError(
        relationshipInboxErrorText(requestError, "这条线索暂时确认不了。")
      );
    } finally {
      setPendingSignalId(null);
    }
  }

  return (
    <DataCard detail={view.summary} title="关系线索">
      {loading ? <Text style={styles.threadPreview}>正在读取关系线索。</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      {confirmation ? (
        <View style={styles.stagedBox}>
          <Text style={styles.stagedTitle}>{confirmation.title}</Text>
          <Text style={styles.bodyText}>{confirmation.contactLine}</Text>
          <Text style={styles.threadPreview}>
            {confirmation.detail} · {confirmation.confirmedAt}
          </Text>
          <Text style={styles.safetyText}>{confirmation.safetyText}</Text>
        </View>
      ) : null}
      {view.signals.length > 0 ? (
        <View style={styles.listStack}>
          {view.signals.slice(0, 4).map((signal) => (
            <View key={signal.id} style={styles.alertRow}>
              <View style={styles.threadRowTop}>
                <Text numberOfLines={1} style={styles.threadName}>
                  {signal.title}
                </Text>
                <Text style={styles.threadTime}>{signal.occurredAt}</Text>
              </View>
              <Text numberOfLines={1} style={styles.threadSubject}>
                {signal.metaLine}
              </Text>
              <Text numberOfLines={2} style={styles.threadPreview}>
                {signal.context}
              </Text>
              <Text numberOfLines={2} style={styles.threadPreview}>
                {signal.evidenceExcerpt}
              </Text>
              <View style={styles.tagsRow}>
                <Text style={styles.sourceTag}>{signal.sourceLabel}</Text>
                <Text style={styles.unreadTag}>{signal.confidenceLabel}</Text>
                <Text style={styles.proactiveTag}>{signal.statusLabel}</Text>
                <Text style={styles.sourceTag}>{signal.permissionLabel}</Text>
              </View>
              <Text style={styles.safetyText}>{signal.nextAction}</Text>
              {signal.canConfirm ? (
                <ActionButton
                  disabled={pendingSignalId !== null}
                  icon="checkmark-outline"
                  label="确认线索"
                  onPress={() => onConfirmSignal(signal.id)}
                  variant="secondary"
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyInboxSection}>
          <Ionicons color={colors.text3} name="trail-sign-outline" size={22} />
          <Text style={styles.emptyInboxTitle}>暂无关系线索</Text>
          <Text style={styles.threadPreview}>{view.emptyText}</Text>
        </View>
      )}
      <Text style={styles.safetyText}>{view.safetyText}</Text>
    </DataCard>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function InboxSegmentedControl({
  activeSection,
  alertCount,
  onChange,
  threadCount
}: {
  activeSection: InboxSection;
  alertCount: number;
  onChange: (section: InboxSection) => void;
  threadCount: number;
}) {
  return (
    <View style={styles.segmentedControl}>
      <SegmentButton
        active={activeSection === "alerts"}
        count={alertCount}
        icon="notifications-outline"
        label="待处理"
        onPress={() => onChange("alerts")}
      />
      <SegmentButton
        active={activeSection === "threads"}
        count={threadCount}
        icon="chatbubbles-outline"
        label="对话"
        onPress={() => onChange("threads")}
      />
    </View>
  );
}

function SegmentButton({
  active,
  count,
  icon,
  label,
  onPress
}: {
  active: boolean;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        active ? styles.segmentButtonActive : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons
        color={active ? colors.accent : colors.text3}
        name={icon}
        size={16}
      />
      <Text
        style={[
          styles.segmentButtonText,
          active ? styles.segmentButtonTextActive : null
        ]}
      >
        {label}
      </Text>
      {count > 0 ? <Text style={styles.segmentCount}>{count}</Text> : null}
    </Pressable>
  );
}

function AlertDismissButton({
  label = "忽略",
  onPress
}: {
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.alertDismissButton,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons color={colors.text3} name="close-outline" size={15} />
      <Text style={styles.alertDismissText}>{label}</Text>
    </Pressable>
  );
}

function AlertsCard({
  onDismissAlert,
  view
}: {
  onDismissAlert: (id: string) => void;
  view: RelationshipAlertsView;
}) {
  return (
    <DataCard detail={view.summary} title="提醒">
      {view.alerts.length > 0 ? (
        <View style={styles.listStack}>
          {view.alerts.slice(0, 6).map((alert) => (
            <View key={alert.id} style={styles.alertRow}>
              <View style={styles.threadRowTop}>
                <Text numberOfLines={1} style={styles.threadName}>
                  {alert.title}
                </Text>
                <Text style={styles.threadTime}>{alert.dueLabel}</Text>
              </View>
              {alert.detail ? (
                <Text numberOfLines={2} style={styles.threadPreview}>
                  {alert.detail}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <Text
                  style={
                    alert.kind === "proactive"
                      ? styles.proactiveTag
                      : styles.unreadTag
                  }
                >
                  {alert.priorityLabel}
                </Text>
                <AlertDismissButton
                  label="忽略"
                  onPress={() => onDismissAlert(alert.id)}
                />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyInboxSection}>
          <Ionicons color={colors.text3} name="notifications-outline" size={22} />
          <Text style={styles.emptyInboxTitle}>暂无提醒</Text>
          <Text style={styles.threadPreview}>
            有需要准备的会面、跟进或 Orbit AI 提示时，会先出现在这里。
          </Text>
        </View>
      )}
      <Text style={styles.safetyText}>{view.safetyText}</Text>
    </DataCard>
  );
}

function ConversationList({
  activeId,
  conversations,
  onSelect
}: {
  activeId: string | null;
  conversations: RelationshipConversationView[];
  onSelect: (conversationId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleConversations = normalizedQuery
    ? conversations.filter((conversation) =>
        [
          conversation.name,
          conversation.organization,
          conversation.subject,
          conversation.preview,
          conversation.nextAction
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : conversations;

  return (
    <DataCard detail={`${conversations.length} 段`} title="对话">
      <View style={styles.searchBox}>
        <Ionicons color={colors.text3} name="search-outline" size={16} />
        <TextInput
          onChangeText={setQuery}
          placeholder="搜索对话"
          placeholderTextColor={colors.text4}
          style={styles.searchInput}
          value={query}
        />
      </View>
      <View style={styles.listStack}>
        {visibleConversations.length > 0 ? (
          visibleConversations.map((conversation) => (
            <Pressable
              accessibilityRole="button"
              key={conversation.id}
              onPress={() => onSelect(conversation.id)}
              style={({ pressed }) => [
                styles.threadRow,
                conversation.id === activeId ? styles.threadRowActive : null,
                pressed ? styles.pressed : null
              ]}
            >
              <View style={styles.threadRowTop}>
                <Text numberOfLines={1} style={styles.threadName}>
                  {conversation.name}
                </Text>
                <Text style={styles.threadTime}>{conversation.lastAt}</Text>
              </View>
              <Text numberOfLines={1} style={styles.threadSubject}>
                {conversation.subject}
              </Text>
              <Text numberOfLines={2} style={styles.threadPreview}>
                {conversation.preview}
              </Text>
              <View style={styles.metaRow}>
                {conversation.unreadLabel ? (
                  <Text style={styles.unreadTag}>{conversation.unreadLabel}</Text>
                ) : null}
                <Text numberOfLines={1} style={styles.nextActionText}>
                  {conversation.nextAction}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyInboxSection}>
            <Ionicons color={colors.text3} name="search-outline" size={22} />
            <Text style={styles.emptyInboxTitle}>没有匹配对话</Text>
            <Text style={styles.threadPreview}>换一个姓名、公司或主题试试。</Text>
          </View>
        )}
      </View>
    </DataCard>
  );
}

function ThreadDetail({
  clientGet,
  clientPost,
  detail
}: {
  clientGet: ClientGet;
  clientPost: ClientPost;
  detail: RelationshipThreadDetailView;
}) {
  return (
    <DataCard detail={detail.summary} title={detail.subject}>
      {detail.sourceLabels.length > 0 ? (
        <View style={styles.tagsRow}>
          {detail.sourceLabels.map((label) => (
            <Text key={label} style={styles.sourceTag}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.messageStack}>
        {detail.messages.map((message) => (
          <View
            key={message.id}
            style={[styles.messageBubble, message.fromMe ? styles.messageMine : null]}
          >
            <View style={styles.messageMeta}>
              <Text style={styles.messageSender}>{message.sender}</Text>
              <Text style={styles.messageTime}>{message.time}</Text>
            </View>
            <Text style={styles.messageBody}>{message.body}</Text>
          </View>
        ))}
      </View>
      <PrivacyControlsPanel
        clientGet={clientGet}
        clientPost={clientPost}
        detail={detail}
      />
      <ReplyComposer clientPost={clientPost} detail={detail} />
    </DataCard>
  );
}

function PrivacyControlsPanel({
  clientGet,
  clientPost,
  detail
}: {
  clientGet: ClientGet;
  clientPost: ClientPost;
  detail: RelationshipThreadDetailView;
}) {
  const [privacy, setPrivacy] = useState<RelationshipPrivacyControlsView | null>(
    null
  );
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacyToggling, setPrivacyToggling] = useState(false);

  async function loadPrivacyControls() {
    setPrivacyLoading(true);
    setPrivacyError(null);

    try {
      const result = await clientGet(chatPrivacyControlsPath(detail.conversationId));

      if (result.success) {
        setPrivacy(relationshipPrivacyControlsToView(result.data));
      } else {
        setPrivacyError(
          relationshipInboxErrorText(
            result.error?.message,
            "隐私控制暂时不可用。"
          )
        );
      }
    } catch (requestError) {
      setPrivacyError(
        relationshipInboxErrorText(requestError, "隐私控制暂时不可用。")
      );
    } finally {
      setPrivacyLoading(false);
    }
  }

  useEffect(() => {
    setPrivacy(null);
    void loadPrivacyControls();
  }, [detail.conversationId]);

  async function toggleAnalysis() {
    if (!privacy) {
      return;
    }

    const request = buildRelationshipPrivacyToggleRequest({
      conversationId: detail.conversationId,
      enabled: privacy.nextEnabled
    });

    if (!request.success) {
      setPrivacyError(request.error);
      return;
    }

    setPrivacyToggling(true);
    setPrivacyError(null);

    try {
      const result = await clientPost(request.request.endpoint, request.request.body);

      if (result.success) {
        setPrivacy(relationshipPrivacyControlsToView(result.data));
      } else {
        setPrivacyError(
          relationshipInboxErrorText(
            result.error?.message,
            "隐私控制暂时更新不了。"
          )
        );
      }
    } catch (requestError) {
      setPrivacyError(
        relationshipInboxErrorText(requestError, "隐私控制暂时更新不了。")
      );
    } finally {
      setPrivacyToggling(false);
    }
  }

  if (!privacy) {
    return (
      <View style={styles.stagedBox}>
        <Text style={styles.stagedTitle}>{"隐私控制"}</Text>
        <Text style={styles.threadPreview}>
          {privacyLoading ? "正在读取这段对话的隐私状态。" : "隐私控制暂时不可用。"}
        </Text>
        {privacyError ? <Text style={styles.errorText}>{privacyError}</Text> : null}
        {!privacyLoading ? (
          <ActionButton
            icon="refresh-outline"
            label="重试"
            onPress={loadPrivacyControls}
            variant="secondary"
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.privacyBox}>
      <View style={styles.threadRowTop}>
        <View>
          <Text style={styles.stagedTitle}>{privacy.title}</Text>
          <Text style={styles.threadPreview}>{privacy.summary}</Text>
        </View>
        <Text style={styles.sourceTag}>{privacy.sourceLabel}</Text>
      </View>
      <View style={styles.tagsRow}>
        <Text style={styles.unreadTag}>{privacy.analysisLabel}</Text>
        <Text style={styles.sourceTag}>{privacy.privateNotesLabel}</Text>
        <Text style={styles.proactiveTag}>{privacy.shareLabel}</Text>
      </View>
      <Text style={styles.bodyText}>{privacy.analysisDetail}</Text>
      <Text style={styles.threadPreview}>{privacy.deletionLabel}</Text>
      <Text style={styles.safetyText}>{privacy.safetyText}</Text>
      {privacyError ? <Text style={styles.errorText}>{privacyError}</Text> : null}
      <ActionButton
        disabled={privacyToggling}
        icon="lock-closed-outline"
        label={privacy.toggleLabel}
        onPress={toggleAnalysis}
        variant="secondary"
      />
    </View>
  );
}

function ReplyComposer({
  clientPost,
  detail
}: {
  clientPost: ClientPost;
  detail: RelationshipThreadDetailView;
}) {
  const [body, setBody] = useState(detail.draftReply);
  const [rewriteDraftView, setRewriteDraftView] =
    useState<RelationshipRewriteDraftView | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [staged, setStaged] = useState("");

  useEffect(() => {
    setBody(detail.draftReply);
    setRewriteDraftView(null);
    setRewriteError(null);
    setStaged("");
  }, [detail.conversationId, detail.draftReply]);

  async function rewriteDraft() {
    const request = buildRelationshipRewriteRequest({
      conversationId: detail.conversationId,
      organization: "",
      participantName: detail.participantName,
      sourceText: body
    });

    if (!request.success) {
      setRewriteError(request.error);
      return;
    }

    setRewriting(true);
    setRewriteError(null);

    try {
      const result = await clientPost(
        ORBIT_API_ENDPOINTS.chatAssistRewrite,
        request.request.body
      );

      if (!result.success) {
        setRewriteError(
          relationshipInboxErrorText(
            result.error?.message,
            "这段草稿暂时润色不了。"
          )
        );
        return;
      }

      const rewrite = relationshipRewriteToDraft(result.data);

      if (!rewrite) {
        setRewriteError("暂时没有可用的润色版本。");
        return;
      }

      setBody(rewrite.body);
      setRewriteDraftView(rewrite);
    } catch (requestError) {
      setRewriteError(
        relationshipInboxErrorText(requestError, "这段草稿暂时润色不了。")
      );
    } finally {
      setRewriting(false);
    }
  }

  if (staged) {
    return (
      <View style={styles.stagedBox}>
        <Text style={styles.stagedTitle}>已暂存待复核，未发送</Text>
        <Text style={styles.bodyText}>{staged}</Text>
        <ActionButton
          icon="pencil-outline"
          label="继续编辑"
          onPress={() => setStaged("")}
          variant="secondary"
        />
      </View>
    );
  }

  return (
    <View style={styles.composer}>
      <Text style={styles.fieldLabel}>回复草稿</Text>
      <TextInput
        multiline
        onChangeText={(value) => {
          setBody(value);
          setRewriteDraftView(null);
        }}
        placeholder="先写一版要说的话。"
        placeholderTextColor={colors.text4}
        style={styles.input}
        value={body}
      />
      {rewriteDraftView ? (
        <View style={styles.rewriteBox}>
          <Text style={styles.stagedTitle}>{rewriteDraftView.label}</Text>
          <Text style={styles.threadPreview}>{rewriteDraftView.rationale}</Text>
          <Text style={styles.sourceTag}>{rewriteDraftView.sourceLabel}</Text>
          <Text style={styles.safetyText}>{rewriteDraftView.safetyText}</Text>
        </View>
      ) : null}
      {rewriteError ? <Text style={styles.errorText}>{rewriteError}</Text> : null}
      <Text style={styles.safetyText}>{detail.safetyText}</Text>
      <View style={styles.buttonRow}>
        <ActionButton
          disabled={!body.trim() || rewriting}
          icon="sparkles-outline"
          label="润色草稿"
          onPress={rewriteDraft}
          variant="secondary"
        />
        <ActionButton
          disabled={!body.trim()}
          icon="mail-unread-outline"
          label="暂存待复核"
          onPress={() => setStaged(body.trim())}
        />
      </View>
    </View>
  );
}

function NewThreadComposer({
  clientPost,
  onCancel,
  onCreated,
  seed
}: {
  clientPost: ClientPost;
  onCancel: () => void;
  onCreated: (thread: RelationshipCreatedThreadView) => void;
  seed: { contactId: string; organization: string; participantName: string };
}) {
  const initialDraft = defaultRelationshipDraft(seed);
  const [participantName, setParticipantName] = useState(seed.participantName);
  const [organization, setOrganization] = useState(seed.organization);
  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setParticipantName(seed.participantName);
    setOrganization(seed.organization);
    const draft = defaultRelationshipDraft(seed);
    setSubject(draft.subject);
    setBody(draft.body);
  }, [seed.contactId, seed.organization, seed.participantName]);

  async function createThread() {
    const draft = buildRelationshipThreadDraftRequest({
      body,
      contactId: seed.contactId,
      organization,
      participantName,
      subject
    });

    if (!draft.success) {
      setError(draft.error);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await clientPost(draft.request.endpoint, draft.request.body);
      if (result.success) {
        onCreated(createdRelationshipThreadToView(result.data));
      } else {
        setError(
          relationshipInboxErrorText(
            result.error?.message,
            "这段草稿暂时创建不了。"
          )
        );
      }
    } catch (requestError) {
      setError(
        relationshipInboxErrorText(requestError, "这段草稿暂时创建不了。")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DataCard detail="确认前不会发送给对方" title="新跟进草稿">
      <View style={styles.composer}>
        <LabeledInput
          label="收件人"
          onChangeText={setParticipantName}
          placeholder="联系人姓名"
          value={participantName}
        />
        <LabeledInput
          label="公司/组织"
          onChangeText={setOrganization}
          placeholder="选填"
          value={organization}
        />
        <LabeledInput
          label="主题"
          onChangeText={setSubject}
          placeholder="这次跟进的主题"
          value={subject}
        />
        <Text style={styles.fieldLabel}>正文</Text>
        <TextInput
          multiline
          onChangeText={setBody}
          placeholder="写下第一条跟进内容。"
          placeholderTextColor={colors.text4}
          style={styles.input}
          value={body}
        />
        <Text style={styles.safetyText}>
          创建后只是放进收件箱复核，不会发送消息或创建日程。
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.buttonRow}>
          <ActionButton
            icon="close-outline"
            label="取消"
            onPress={onCancel}
            variant="secondary"
          />
          <ActionButton
            disabled={busy}
            icon="checkmark-outline"
            label={busy ? "创建中" : "创建草稿"}
            onPress={createThread}
          />
        </View>
      </View>
    </DataCard>
  );
}

function LabeledInput({
  label,
  onChangeText,
  placeholder,
  value
}: {
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text4}
        style={styles.singleInput}
        value={value}
      />
    </View>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onPress,
  variant = "primary"
}: {
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}) {
  const secondary = variant === "secondary";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        secondary ? styles.actionButtonSecondary : null,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons
        color={secondary ? colors.text2 : colors.onAccent}
        name={icon}
        size={16}
      />
      <Text
        style={[
          styles.actionButtonText,
          secondary ? styles.actionButtonTextSecondary : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg
  },
  actionButtonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderWidth: 1
  },
  actionButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  actionButtonTextSecondary: {
    color: colors.text2
  },
  alertRow: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  alertDismissButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 9
  },
  alertDismissText: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  composer: {
    gap: spacing.md
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  emptyInboxSection: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg
  },
  emptyInboxTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700"
  },
  fieldGroup: {
    gap: spacing.xs
  },
  fieldLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 21,
    minHeight: 128,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    textAlignVertical: "top"
  },
  inboxMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  listStack: {
    gap: spacing.sm
  },
  messageBody: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  messageBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    gap: spacing.xs,
    maxWidth: "92%",
    padding: spacing.md
  },
  messageMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  messageMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.accentSofter
  },
  messageSender: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  messageStack: {
    gap: spacing.md
  },
  messageTime: {
    color: colors.text3,
    fontSize: typography.caption
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  metricLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  metricPill: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minWidth: 86,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  metricValue: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800"
  },
  nextActionText: {
    color: colors.text3,
    flexShrink: 1,
    fontSize: typography.caption,
    lineHeight: 17
  },
  pressed: {
    opacity: 0.78
  },
  proactiveTag: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.pill,
    color: colors.sky,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  privacyBox: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  rewriteBox: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  safetyText: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18,
    padding: spacing.md
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    minWidth: 0,
    paddingVertical: 0
  },
  segmentButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.md
  },
  segmentButtonActive: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft
  },
  segmentButtonText: {
    color: colors.text3,
    fontSize: typography.small,
    fontWeight: "700"
  },
  segmentButtonTextActive: {
    color: colors.accent
  },
  segmentCount: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    color: colors.onAccent,
    fontSize: typography.caption,
    fontWeight: "800",
    minWidth: 20,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textAlign: "center"
  },
  segmentedControl: {
    flexDirection: "row",
    gap: spacing.sm
  },
  singleInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm
  },
  sourceTag: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  stagedBox: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  stagedTitle: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  threadName: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "700"
  },
  threadPreview: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  threadRow: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  threadRowActive: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft
  },
  threadRowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  threadSubject: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "700"
  },
  threadTime: {
    color: colors.text3,
    fontSize: typography.caption
  },
  unreadTag: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    color: colors.amber,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  }
});
