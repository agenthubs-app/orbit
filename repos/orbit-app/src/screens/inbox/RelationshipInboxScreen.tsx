import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { ORBIT_API_ENDPOINTS, relationshipInboxPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildRelationshipThreadDraftRequest,
  createdRelationshipThreadToView,
  defaultRelationshipDraft,
  relationshipAlertsToView,
  relationshipInboxToView,
  type RelationshipAlertsView,
  type RelationshipCreatedThreadView,
  type RelationshipConversationView,
  type RelationshipThreadDetailView
} from "../../view-models/relationship-inbox";

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
  const proactiveState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.proactiveTurns,
    () => false
  );
  const [composing, setComposing] = useState(
    Boolean(seedContactId || seedName || seedOrganization)
  );

  useEffect(() => {
    if (seedContactId || seedName || seedOrganization) {
      setComposing(true);
    }
  }, [seedContactId, seedName, seedOrganization]);

  function refreshAll() {
    state.refresh();
    notificationsState.refresh();
    proactiveState.refresh();
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
            proactiveState.refreshing
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
      {state.kind === "empty" ? (
        <EmptyState
          message="有新的关系对话或提醒时，会显示在这里。"
          title="暂无关系对话"
        />
      ) : null}
      {state.kind === "success" ? (
        <InboxContent
          createdThread={createdThread}
          data={state.data}
          notificationsData={
            notificationsState.kind === "success" ? notificationsState.data : null
          }
          onCreateThread={setCreatedThread}
          onSelectConversation={setSelectedConversationId}
          proactiveData={
            proactiveState.kind === "success" ? proactiveState.data : null
          }
          selectedConversationId={selectedConversationId}
          seed={{
            contactId: seedContactId,
            organization: seedOrganization,
            participantName: seedName
          }}
          setComposing={setComposing}
          composing={composing}
          clientPost={(endpoint, body) => client.post<unknown>(endpoint, { body })}
        />
      ) : null}
    </AppScreen>
  );
}

function InboxContent({
  clientPost,
  composing,
  createdThread,
  data,
  notificationsData,
  onCreateThread,
  onSelectConversation,
  proactiveData,
  seed,
  selectedConversationId,
  setComposing
}: {
  clientPost: (endpoint: string, body: unknown) => Promise<{
    data?: unknown;
    error?: { message: string };
    success: boolean;
  }>;
  composing: boolean;
  createdThread: RelationshipCreatedThreadView | null;
  data: unknown;
  notificationsData: unknown;
  onCreateThread: (thread: RelationshipCreatedThreadView | null) => void;
  onSelectConversation: (conversationId: string | null) => void;
  proactiveData: unknown;
  seed: { contactId: string; organization: string; participantName: string };
  selectedConversationId: string | null;
  setComposing: (value: boolean) => void;
}) {
  const view = relationshipInboxToView(data);
  const alertsView = relationshipAlertsToView(notificationsData, proactiveData);
  const conversations = uniqueConversations([
    ...(createdThread ? [createdThread.conversation] : []),
    ...view.conversations
  ]);
  const selected =
    createdThread?.conversation.id === selectedConversationId
      ? createdThread.detail
      : view.selected;
  const activeId = selected?.conversationId ?? null;

  return (
    <>
      <DataCard detail={view.summary} title={view.title}>
        <Text style={styles.bodyText}>
          先看谁在等回复，再准备一版草稿。这里不会自动发送消息。
        </Text>
        <ActionButton
          icon="create-outline"
          label="写一段新跟进"
          onPress={() => setComposing(true)}
        />
      </DataCard>

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

      {alertsView.alerts.length > 0 ? <AlertsCard view={alertsView} /> : null}

      {conversations.length > 0 ? (
        <ConversationList
          activeId={activeId}
          conversations={conversations}
          onSelect={onSelectConversation}
        />
      ) : null}

      {selected ? <ThreadDetail detail={selected} /> : null}
    </>
  );
}

function AlertsCard({ view }: { view: RelationshipAlertsView }) {
  return (
    <DataCard detail={view.summary} title="提醒">
      <View style={styles.listStack}>
        {view.alerts.slice(0, 4).map((alert) => (
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
            </View>
          </View>
        ))}
      </View>
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
  return (
    <DataCard detail={`${conversations.length} 段`} title="对话">
      <View style={styles.listStack}>
        {conversations.map((conversation) => (
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
        ))}
      </View>
    </DataCard>
  );
}

function ThreadDetail({ detail }: { detail: RelationshipThreadDetailView }) {
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
      <ReplyComposer detail={detail} />
    </DataCard>
  );
}

function ReplyComposer({ detail }: { detail: RelationshipThreadDetailView }) {
  const [body, setBody] = useState(detail.draftReply);
  const [staged, setStaged] = useState("");

  useEffect(() => {
    setBody(detail.draftReply);
    setStaged("");
  }, [detail.conversationId, detail.draftReply]);

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
        onChangeText={setBody}
        placeholder="先写一版要说的话。"
        placeholderTextColor={colors.text4}
        style={styles.input}
        value={body}
      />
      <Text style={styles.safetyText}>{detail.safetyText}</Text>
      <ActionButton
        disabled={!body.trim()}
        icon="mail-unread-outline"
        label="暂存待复核"
        onPress={() => setStaged(body.trim())}
      />
    </View>
  );
}

function NewThreadComposer({
  clientPost,
  onCancel,
  onCreated,
  seed
}: {
  clientPost: (endpoint: string, body: unknown) => Promise<{
    data?: unknown;
    error?: { message: string };
    success: boolean;
  }>;
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
        setError(result.error?.message ?? "这段草稿暂时创建不了。");
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "这段草稿暂时创建不了。"
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
  safetyText: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18,
    padding: spacing.md
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
