import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { type PropsWithChildren, useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ORBIT_API_ENDPOINTS,
  chatPrivacyControlsPath,
  relationshipInboxPath
} from "../../api/endpoints";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout, textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildRelationshipSignalConfirmRequest,
  buildRelationshipPrivacyToggleRequest,
  buildRelationshipRewriteRequest,
  buildRelationshipThreadDraftRequest,
  createdRelationshipThreadToView,
  relationshipConversationIdForContact,
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
  const { colors } = useOrbitTheme();
  const router = useRouter();
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
  const state = useApiResource<unknown>(
    relationshipInboxPath(null),
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
  const [createdThread, setCreatedThread] =
    useState<RelationshipCreatedThreadView | null>(null);
  const contentReady = state.kind === "success" || state.kind === "empty";

  useEffect(() => {
    if (seedContactId) {
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

  function openConversation(conversationId: string) {
    router.push(`/inbox/${encodeURIComponent(conversationId)}` as Href);
  }

  return (
    <InboxLayout
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
      title={contentReady && composing ? "写消息" : contentReady && createdThread ? "草稿预览" : "收件箱"}
      onCompose={contentReady && !composing && !createdThread ? () => setComposing(true) : undefined}
      hideBack={contentReady && composing}
      onBack={createdThread ? () => setCreatedThread(null) : undefined}
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
          onOpenConversation={openConversation}
          onSetCreatedThread={setCreatedThread}
          onRefreshSignals={signalsState.refresh}
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
    </InboxLayout>
  );
}

export function RelationshipInboxThreadScreen() {
  const { colors } = useOrbitTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = firstParam(params.id);
  const client = useOrbitApiClient();
  const clientGet = useCallback(
    (endpoint: string) => client.get<unknown>(endpoint),
    [client]
  );
  const clientPost = useCallback(
    (endpoint: string, body: unknown) => client.post<unknown>(endpoint, { body }),
    [client]
  );
  const state = useApiResource<unknown>(
    relationshipInboxPath(conversationId),
    (data) => relationshipInboxToView(data).selected === null
  );
  const view =
    state.kind === "success" || state.kind === "empty"
      ? relationshipInboxToView(state.data)
      : null;

  return (
    <InboxLayout
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="消息"
    >
      {!conversationId ? (
        <ErrorState message="缺少对话 ID。" title="打不开对话" />
      ) : null}
      {conversationId && state.kind === "loading" ? <LoadingState /> : null}
      {conversationId && state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {conversationId && state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {conversationId && view?.selected ? (
        <ThreadDetail
          clientGet={clientGet}
          clientPost={clientPost}
          detail={view.selected}
        />
      ) : null}
      {conversationId && state.kind === "empty" ? (
        <EmptyState
          message="这段往来还没有可显示的消息。"
          title="暂无消息"
        />
      ) : null}
    </InboxLayout>
  );
}

function InboxLayout({ children, title, refreshControl, onCompose, onBack, hideBack = false }: PropsWithChildren<{
  title: string;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  onCompose?: (() => void) | undefined;
  onBack?: (() => void) | undefined;
  hideBack?: boolean;
}>) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  return (
    <SafeAreaView edges={["top"]} style={styles.inboxSafeArea}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.inboxCanvas}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {!hideBack ? (
          <View style={styles.mailToolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="返回"
              onPress={onBack ?? (() => router.canGoBack()
                ? router.back()
                : router.replace("/ai" as Href))}
              style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.accent} name="chevron-back" size={23} />
              <Text style={styles.toolbarText}>返回</Text>
            </Pressable>
            {onCompose ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="写消息"
                onPress={onCompose}
                style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}
              >
                <Ionicons color={colors.accent} name="create-outline" size={23} />
                <Text style={styles.toolbarText}>写消息</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Text accessibilityRole="header" style={styles.mailTitle}>
          {title}
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function InboxContent({
  clientGet,
  clientPost,
  composing,
  createdThread,
  data,
  notificationsData,
  onOpenConversation,
  onSetCreatedThread,
  onRefreshSignals,
  seed,
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
  onOpenConversation: (conversationId: string) => void;
  onSetCreatedThread: (thread: RelationshipCreatedThreadView | null) => void;
  onRefreshSignals: () => void;
  seed: { contactId: string; organization: string; participantName: string };
  signalsData: unknown;
  signalsError: string;
  signalsLoading: boolean;
  setComposing: (value: boolean) => void;
}) {
  const { colors, styles } = useStyles();
  const view = relationshipInboxToView(data);
  const alertsView = relationshipAlertsToView(notificationsData);
  const signalsView = relationshipSignalsToView(signalsData);
  const signalCount = signalsView.signals.length;
  const conversations = uniqueConversations(view.conversations);
  const [activeSection, setActiveSection] = useState<InboxSection>("threads");
  const [query, setQuery] = useState("");
  const [seedHandled, setSeedHandled] = useState(false);
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
  const seededConversationId = relationshipConversationIdForContact(
    view,
    seed.contactId
  );

  useEffect(() => {
    if (!seed.contactId || seedHandled) {
      return;
    }

    setSeedHandled(true);

    if (seededConversationId) {
      onOpenConversation(seededConversationId);
      setComposing(false);
      return;
    }

    setComposing(true);
  }, [
    onOpenConversation,
    seed.contactId,
    seedHandled,
    seededConversationId,
    setComposing
  ]);

  useEffect(() => {
    if (composing) {
      setActiveSection("threads");
    }
  }, [composing]);

  if (composing || createdThread) {
    return (
      <NewThreadComposer
        clientPost={clientPost}
        clientGet={clientGet}
        preview={createdThread}
        onEdit={() => {
          onSetCreatedThread(null);
          setComposing(true);
        }}
        onCancel={() => setComposing(false)}
        onCreated={(thread) => {
          onSetCreatedThread(thread);
          setComposing(false);
        }}
        seed={seed}
      />
    );
  }

  return (
    <View style={styles.mailContent}>
      {activeSection === "threads" ? (
        <View style={styles.searchBox}>
          <Ionicons color={colors.text3} name="search-outline" size={20} />
          <TextInput
            accessibilityLabel="搜索姓名、主题或内容"
            onChangeText={setQuery}
            placeholder="搜索姓名、主题或内容"
            placeholderTextColor={colors.text3}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
        </View>
      ) : null}
      <InboxSegmentedControl
        activeSection={activeSection}
        alertCount={visibleAlerts.length + signalCount}
        onChange={setActiveSection}
      />

      {activeSection === "alerts" ? (
        <>
          {signalCount > 0 || signalsError || signalsLoading ? (
            <RelationshipSignalsCard
              clientPost={clientPost}
              error={signalsError}
              loading={signalsLoading}
              onConfirmed={onRefreshSignals}
              view={signalsView}
            />
          ) : null}
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
        <ConversationList
          conversations={conversations}
          onSelect={onOpenConversation}
          query={query}
        />
      ) : null}
    </View>
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
  const { colors, styles } = useStyles();
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
          {view.signals.map((signal) => (
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

function InboxSegmentedControl({
  activeSection,
  alertCount,
  onChange
}: {
  activeSection: InboxSection;
  alertCount: number;
  onChange: (section: InboxSection) => void;
}) {
  const { styles } = useStyles();
  return (
    <View accessibilityRole="tablist" style={styles.segmentedControl}>
      <SegmentButton
        active={activeSection === "threads"}
        label="消息"
        onPress={() => onChange("threads")}
      />
      <SegmentButton
        active={activeSection === "alerts"}
        count={alertCount}
        label="提醒"
        onPress={() => onChange("alerts")}
      />
    </View>
  );
}

function SegmentButton({
  active,
  count = 0,
  label,
  onPress
}: {
  active: boolean;
  count?: number;
  label: string;
  onPress: () => void;
}) {
  const { styles } = useStyles();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={count ? `${label} ${count}` : label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        active ? styles.segmentButtonActive : null,
        pressed ? styles.pressed : null
      ]}
    >
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
  const { colors, styles } = useStyles();
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
  const { colors, styles } = useStyles();
  return (
    <View style={styles.remindersPane}>
      <Text style={styles.threadPreview}>忽略仅对本次查看生效。</Text>
      {view.alerts.length > 0 ? (
        <View style={styles.listStack}>
          {view.alerts.map((alert) => (
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
            有需要准备的会面、待办或 Orbit AI 提示时，会先出现在这里。
          </Text>
        </View>
      )}
      <Text style={styles.safetyText}>{view.safetyText}</Text>
    </View>
  );
}

function ConversationList({
  conversations,
  onSelect,
  query
}: {
  conversations: RelationshipConversationView[];
  onSelect: (conversationId: string) => void;
  query: string;
}) {
  const { colors, styles } = useStyles();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleConversations = normalizedQuery
    ? conversations.filter((conversation) =>
        [
          conversation.name,
          conversation.organization,
          conversation.subject,
          conversation.preview
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : conversations;

  return (
      <View style={styles.mailList}>
        {visibleConversations.length > 0 ? (
          visibleConversations.map((conversation) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${conversation.name}，${conversation.subject}，${conversation.lastAt}，${conversation.preview}${conversation.unreadCount > 0 ? `，${conversation.unreadCount} 条未读` : ""}`}
              key={conversation.id}
              onPress={() => onSelect(conversation.id)}
              style={({ pressed }) => [
                styles.threadRow,
                pressed ? styles.pressed : null
              ]}
            >
              <View style={styles.threadRowTop}>
                {conversation.unreadCount > 0 ? (
                  <Ionicons color={colors.accent} name="ellipse" size={8} />
                ) : null}
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
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyInboxSection}>
            <Ionicons color={colors.text3} name="search-outline" size={22} />
            <Text style={styles.emptyInboxTitle}>{query.trim() ? "没有找到消息" : "暂无消息"}</Text>
            <Text style={styles.threadPreview}>{query.trim() ? "换个姓名、主题或关键词试试。" : "收到的消息会显示在这里。"}</Text>
          </View>
        )}
      </View>
  );
}

function ThreadDetail({
  clientGet,
  clientPost,
  detail,
  previewOnly = false
}: {
  clientGet: ClientGet;
  clientPost: ClientPost;
  detail: RelationshipThreadDetailView;
  previewOnly?: boolean;
}) {
  const { styles } = useStyles();
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showEmptyRecords, setShowEmptyRecords] = useState(false);
  const emptyCount = detail.messages.filter(message => message.body === "暂无消息正文").length;
  const visibleMessages = showEmptyRecords
    ? detail.messages
    : detail.messages.filter(message => message.body !== "暂无消息正文");
  return (
    <View style={styles.readingPane}>
      <Text accessibilityRole="header" style={styles.readingSubject}>{detail.subject}</Text>
      {!previewOnly ? <Text style={styles.bodyText}>联系人：{detail.participantName}</Text> : null}
      {emptyCount > 0 ? (
        <View>
          <Text style={styles.threadPreview}>{emptyCount} 条记录没有可显示的正文。</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showEmptyRecords }}
            onPress={() => setShowEmptyRecords(value => !value)}
            style={styles.privacyDisclosure}
          >
            <Text style={styles.threadPreview}>{showEmptyRecords ? "收起无正文记录" : "展开无正文记录"}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.messageStack}>
        {visibleMessages.map((message) => (
          <View
            key={message.id}
            style={styles.mailMessage}
          >
            <View style={styles.messageMeta}>
              <Text style={styles.messageSender}>{message.sender}</Text>
              <Text style={styles.messageTime}>{message.time}</Text>
            </View>
            <Text style={styles.messageBody}>{message.body}</Text>
          </View>
        ))}
      </View>
      {previewOnly ? (
        <Text style={styles.safetyText}>仅在本页预览，尚未保存或发送。</Text>
      ) : (
        <>
          <ReplyComposer clientPost={clientPost} detail={detail} />
          <Pressable accessibilityRole="button" accessibilityLabel="隐私设置" accessibilityState={{ expanded: showPrivacy }} onPress={() => setShowPrivacy(value => !value)} style={styles.privacyDisclosure}>
            <Text style={styles.threadPreview}>{showPrivacy ? "收起隐私设置" : "隐私设置"}</Text>
          </Pressable>
          {showPrivacy ? <PrivacyControlsPanel clientGet={clientGet} clientPost={clientPost} detail={detail} /> : null}
        </>
      )}
    </View>
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
  const { styles } = useStyles();
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
  const { colors, styles } = useStyles();
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
        <Text style={styles.stagedTitle}>回复预览</Text>
        <Text style={styles.threadPreview}>仅在本页预览，尚未保存或发送。</Text>
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
        accessibilityLabel="回复正文"
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
          label="预览回复"
          onPress={() => setStaged(body.trim())}
        />
      </View>
    </View>
  );
}

function NewThreadComposer({
  clientGet,
  clientPost,
  preview,
  onEdit,
  onCancel,
  onCreated,
  seed
}: {
  clientGet: ClientGet;
  clientPost: ClientPost;
  preview: RelationshipCreatedThreadView | null;
  onEdit: () => void;
  onCancel: () => void;
  onCreated: (thread: RelationshipCreatedThreadView) => void;
  seed: { contactId: string; organization: string; participantName: string };
}) {
  const { colors, styles } = useStyles();
  const [participantName, setParticipantName] = useState(seed.participantName);
  const [organization, setOrganization] = useState(seed.organization);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setParticipantName(seed.participantName);
    setOrganization(seed.organization);
    setSubject("");
    setBody("");
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

  if (preview) {
    return (
      <View style={styles.readingPane}>
        <Text style={styles.bodyText}>收件人：{preview.conversation.name}</Text>
        <ThreadDetail clientGet={clientGet} clientPost={clientPost} detail={preview.detail} previewOnly />
        <ActionButton icon="pencil-outline" label="继续编辑" onPress={onEdit} variant="secondary" />
      </View>
    );
  }

  return (
    <View style={styles.readingPane}>
      <View style={styles.composer}>
        <LabeledInput
          editable={!busy}
          label="收件人"
          onChangeText={setParticipantName}
          placeholder="联系人姓名"
          value={participantName}
        />
        <LabeledInput
          editable={!busy}
          label="公司/组织"
          onChangeText={setOrganization}
          placeholder="选填"
          value={organization}
        />
        <LabeledInput
          editable={!busy}
          label="主题"
          onChangeText={setSubject}
          placeholder="这次联系的主题"
          value={subject}
        />
        <Text style={styles.fieldLabel}>正文</Text>
        <TextInput
          accessibilityLabel="正文"
          editable={!busy}
          multiline
          onChangeText={setBody}
          placeholder="写下第一条消息。"
          placeholderTextColor={colors.text4}
          style={styles.input}
          value={body}
        />
        <Text style={styles.safetyText}>
          下一步只预览草稿，不会保存或发送消息。
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.buttonRow}>
          <ActionButton
            disabled={busy}
            icon="close-outline"
            label="取消"
            onPress={onCancel}
            variant="secondary"
          />
          <ActionButton
            disabled={busy}
            icon="checkmark-outline"
            label={busy ? "正在准备" : "预览草稿"}
            onPress={createThread}
          />
        </View>
      </View>
    </View>
  );
}

function LabeledInput({
  editable = true,
  label,
  onChangeText,
  placeholder,
  value
}: {
  editable?: boolean;
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        editable={editable}
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
  const { colors, styles } = useStyles();
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

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  inboxSafeArea: {
    backgroundColor: colors.surface,
    flex: 1
  },
  inboxCanvas: {
    alignSelf: "center",
    width: "100%",
    maxWidth: layout.contentMax,
    paddingBottom: layout.contentBottom,
    paddingHorizontal: layout.pageInset
  },
  mailToolbar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    marginHorizontal: -6
  },
  toolbarButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 4
  },
  toolbarText: {
    color: colors.accent,
    fontSize: 17
  },
  mailTitle: {
    ...textStyles.pageTitle,
    color: colors.ink,
    marginBottom: 12,
    marginTop: 10
  },
  mailContent: { gap: 0 },
  mailList: { gap: 0 },
  readingPane: { gap: 20 },
  remindersPane: { gap: 12, paddingTop: 16 },
  readingSubject: { ...textStyles.title, color: colors.ink },
  mailMessage: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
    paddingBottom: 24
  },
  privacyDisclosure: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  actionButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm
  },
  actionButtonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderWidth: 1,
    minHeight: layout.control
  },
  actionButtonText: {
    ...createControlStyles(colors).primaryButtonText,
    color: colors.onAccent,
    flexShrink: 1
  },
  actionButtonTextSecondary: {
    color: colors.text2
  },
  alertRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingVertical: spacing.md
  },
  alertDismissButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 44,
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
    borderRadius: radius.card,
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
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md
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
    minHeight: 128,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    textAlignVertical: "top",
    lineHeight: 23
  },
  listStack: {
    gap: spacing.sm
  },
  messageBody: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 26
  },
  messageMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  messageSender: {
    color: colors.text2,
    fontSize: 16,
    fontWeight: "600"
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
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  rewriteBox: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderRadius: radius.card,
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
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.input
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 0
  },
  segmentButton: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12
  },
  segmentButtonActive: {
    borderBottomColor: colors.accent
  },
  segmentButtonText: {
    color: colors.text3,
    fontSize: 16,
    fontWeight: "500"
  },
  segmentButtonTextActive: {
    color: colors.accent
  },
  segmentCount: {
    color: colors.text3,
    fontSize: 14
  },
  segmentedControl: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginTop: 8,
    gap: spacing.lg
  },
  singleInput: {
    backgroundColor: colors.surface,
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    minWidth: 0,
    minHeight: 44,
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
    borderRadius: radius.card,
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
    ...textStyles.listTitle,
    color: colors.ink,
    flex: 1
  },
  threadPreview: {
    color: colors.text3,
    fontSize: 14,
    lineHeight: 21
  },
  threadRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
    minHeight: 126,
    paddingVertical: 22
  },
  threadRowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  threadSubject: {
    ...textStyles.body,
    color: colors.text
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
}));
