import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import {
  chatConversationExtractionsPath,
  chatConversationPath,
  chatConversationSummaryPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildRelationshipChatMessageRequest,
  relationshipChatDraftAllowed,
  relationshipChatDraftReceiptMatches,
  relationshipChatExtractionToView,
  relationshipChatMessageSendToView,
  relationshipChatSummaryToView,
  relationshipChatThreadToView,
  relationshipChatThreadMatches,
  type RelationshipChatExtractionItemView,
  type RelationshipChatMessageSendView,
  type RelationshipChatSummaryView,
  type RelationshipChatMessageView
} from "../../view-models/relationship-chat";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function RelationshipChatDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = firstParam(params.id);
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.user?.id ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  // Rotate an opaque identity for each account/session/server/route lifetime;
  // cookies themselves never become cache keys or visible identifiers.
  const scopeKey = useMemo(() => randomUUID(), [server.baseUrl, actorId, auth.cookieHeader, conversationId, ready]);

  if (!ready) return <AppScreen title="对话详情"><LoadingState /></AppScreen>;
  if (!conversationId) return <AppScreen title="对话详情"><ErrorState message="缺少对话 ID。" title="打不开对话" /></AppScreen>;
  return <ScopedChatDetailScreen key={scopeKey} conversationId={conversationId} scopeKey={scopeKey} />;
}

function ScopedChatDetailScreen({ conversationId, scopeKey }: { conversationId: string; scopeKey: string }) {
  const { colors } = useOrbitTheme();
  const state = useApiResource<unknown>(
    chatConversationPath(conversationId || "missing"),
    () => false,
    { scopeKey, cachePolicy: "network-only" }
  );
  const extractionState = useApiResource<unknown>(
    chatConversationExtractionsPath(conversationId || "missing"),
    (data) => {
      const view = relationshipChatExtractionToView(data);
      return (
        view.needs.length +
          view.tasks.length +
          view.profileUpdates.length +
          view.profileSuggestions.length ===
        0
      );
    },
    { scopeKey, cachePolicy: "network-only" }
  );
  const loadedData = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const freshData = useRef<unknown>(null);
  freshData.current = relationshipChatThreadMatches(loadedData, conversationId) ? loadedData : null;

  function refreshAll() {
    freshData.current = null;
    state.refresh();
    extractionState.refresh();
  }

  return (
    <AppScreen
      eyebrow="关系对话"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={state.refreshing || extractionState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="对话详情"
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
      {(state.kind === "success" || state.kind === "empty") && !freshData.current ? (
        <ErrorState message="没有读到当前会话，请刷新后重试。" />
      ) : null}
      {conversationId ? (
        <ThreadContent
          conversationId={conversationId}
          scopeKey={scopeKey}
          freshData={freshData}
          onSaved={refreshAll}
          extractionData={
            extractionState.kind === "success" ? extractionState.data : null
          }
          extractionError={
            extractionState.kind === "failure" ||
            extractionState.kind === "offline"
              ? extractionState.error.message
              : ""
          }
          extractionLoading={extractionState.kind === "loading"}
        />
      ) : null}
    </AppScreen>
  );
}

function ThreadContent({
  conversationId,
  scopeKey,
  freshData,
  onSaved,
  extractionData,
  extractionError,
  extractionLoading
}: {
  conversationId: string;
  scopeKey: string;
  freshData: RefObject<unknown>;
  onSaved: () => void;
  extractionData: unknown;
  extractionError: string;
  extractionLoading: boolean;
}) {
  const { colors, styles } = useStyles();
  const client = useOrbitApiClient({ scopeKey });
  const router = useRouter();
  const lastRead = useRef<unknown>(null);
  if (freshData.current) lastRead.current = freshData.current;
  const view = lastRead.current ? relationshipChatThreadToView(lastRead.current) : null;
  const mounted = useRef(true);
  const draftRequest = useRef<AbortController | null>(null);
  const summaryRequest = useRef<AbortController | null>(null);
  const draftAttempt = useRef<{ body: string; requestId: string } | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const currentBody = useRef(draftBody);
  currentBody.current = draftBody;
  const [draftError, setDraftError] = useState("");
  const [draftPending, setDraftPending] = useState(false);
  const [draftResult, setDraftResult] =
    useState<RelationshipChatMessageSendView | null>(null);
  const [summary, setSummary] = useState<RelationshipChatSummaryView | null>(
    null
  );
  const [summaryError, setSummaryError] = useState("");
  const [summaryPending, setSummaryPending] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      draftRequest.current?.abort();
      summaryRequest.current?.abort();
    };
  }, []);

  async function requestSummary() {
    if (!mounted.current || summaryRequest.current || !relationshipChatThreadMatches(freshData.current, conversationId)) return;
    const controller = new AbortController();
    summaryRequest.current = controller;
    setSummaryPending(true);
    setSummaryError("");

    try {
      const result = await client.post<unknown>(chatConversationSummaryPath(conversationId), { signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;

      if (!result.success || result.status < 200 || result.status >= 300) {
        setSummaryError(!result.success ? result.error.message : "摘要暂时生成不了。");
        return;
      }

      const nextSummary = relationshipChatSummaryToView(result.data);

      if (!nextSummary) {
        setSummaryError("这段对话还没有可用摘要。");
        return;
      }

      setSummary(nextSummary);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      setSummaryError(
        error instanceof Error ? error.message : "摘要暂时生成不了。"
      );
    } finally {
      if (mounted.current && summaryRequest.current === controller) {
        summaryRequest.current = null;
        setSummaryPending(false);
      }
    }
  }

  async function sendMessageDraft() {
    if (!mounted.current || draftRequest.current || currentBody.current !== draftBody ||
      !relationshipChatDraftAllowed(freshData.current, conversationId)) return;
    const request = buildRelationshipChatMessageRequest(
      conversationId,
      draftBody
    );

    setDraftError("");
    setDraftResult(null);

    if (!request.success) {
      setDraftError(request.error);
      return;
    }

    const body = request.request.options.body.body;
    const attempt = draftAttempt.current?.body === body ? draftAttempt.current : { body, requestId: randomUUID() };
    draftAttempt.current = attempt;
    const controller = new AbortController();
    draftRequest.current = controller;
    setDraftPending(true);

    try {
      const result = await client.post<unknown>(
        request.request.endpoint,
        { body: { body, requestId: attempt.requestId }, signal: controller.signal }
      );
      if (!mounted.current || controller.signal.aborted) return;

      if (!result.success || result.status < 200 || result.status >= 300) {
        setDraftError("草稿暂时保存不了，输入已保留。请重试。");
        return;
      }
      if (!relationshipChatDraftReceiptMatches(result.data, conversationId, body)) {
        setDraftError("尚未确认草稿已保存，输入已保留。请刷新核对后重试。");
        return;
      }

      const nextResult = relationshipChatMessageSendToView(result.data);
      setDraftResult({ ...nextResult, summary: "草稿已保存，未发送给对方。", nextAction: "可继续编辑下一版草稿。" });
      draftAttempt.current = null;
      currentBody.current = "";
      setDraftBody("");
      onSaved();
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      setDraftError("草稿暂时保存不了，输入已保留。请重试。");
    } finally {
      if (mounted.current && draftRequest.current === controller) {
        draftRequest.current = null;
        setDraftPending(false);
      }
    }
  }

  function changeDraftBody(value: string) {
    if (!mounted.current || draftRequest.current) return;
    currentBody.current = value;
    draftAttempt.current = null;
    setDraftBody(value);
    setDraftResult(null);
  }

  if (!view) return null;
  const canSaveDraft = relationshipChatDraftAllowed(freshData.current, conversationId);
  const sendBoundary = canSaveDraft ? "这里仅保存回复草稿，不会发给联系人。" : "暂时不能保存草稿。请刷新确认会话状态。";

  return (
    <>
      <DataCard detail={view.participant} title={view.title}>
        <Text style={styles.bodyText}>{view.context}</Text>
        <View style={styles.callout}>
          <Ionicons color={colors.accent} name="shield-checkmark-outline" size={18} />
          <Text style={styles.calloutText}>联系人资料不代表已验证的平台账号。这里仅供复核和保存草稿，不会发给联系人。</Text>
        </View>
        {view.contactId ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(`/contacts/${encodeURIComponent(view.contactId)}` as Href)
            }
            style={({ pressed }) => [
              styles.linkButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.linkButtonText}>查看联系人</Text>
          </Pressable>
        ) : null}
      </DataCard>
      <DataCard detail={`${view.messages.length} 条消息`} title="消息">
        {view.messages.length === 0 ? <EmptyState message="可以先写一版回复草稿。" title="暂无消息" /> : null}
        <View style={styles.messageList}>
          {view.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </View>
      </DataCard>
      <ChatDraftComposerCard
        body={draftBody}
        canSave={canSaveDraft}
        error={draftError}
        onChangeBody={changeDraftBody}
        onSave={sendMessageDraft}
        pending={draftPending}
        result={draftResult}
        sendBoundary={sendBoundary}
      />
      <ChatSummaryCard
        available={Boolean(freshData.current)}
        error={summaryError}
        onRequestSummary={requestSummary}
        pending={summaryPending}
        summary={summary}
      />
      <ChatExtractionCard
        data={extractionData}
        error={extractionError}
        loading={extractionLoading}
      />
    </>
  );
}

function ChatDraftComposerCard({
  body,
  canSave,
  error,
  onChangeBody,
  onSave,
  pending,
  result,
  sendBoundary
}: {
  body: string;
  canSave: boolean;
  error: string;
  onChangeBody: (value: string) => void;
  onSave: () => void;
  pending: boolean;
  result: RelationshipChatMessageSendView | null;
  sendBoundary: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <DataCard detail="本地草稿" title="回复草稿">
      <Text style={styles.mutedText}>{sendBoundary}</Text>
      <TextInput
        accessibilityLabel="回复草稿"
        editable={!pending}
        multiline
        numberOfLines={4}
        onChangeText={onChangeBody}
        placeholder="写一版给对方的回复"
        placeholderTextColor={colors.text3}
        style={styles.draftInput}
        textAlignVertical="top"
        value={body}
      />
      {result ? (
        <View style={styles.draftResult}>
          <Text style={styles.draftResultTitle}>{result.title}</Text>
          <Text style={styles.mutedText}>{result.summary}</Text>
          <Text style={styles.mutedText}>{result.nextAction}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ChatActionButton
        disabled={pending || !canSave || !body.trim()}
        icon="document-text-outline"
        label={pending ? "保存中" : "保存草稿"}
        onPress={onSave}
      />
    </DataCard>
  );
}

function ChatSummaryCard({
  available,
  error,
  onRequestSummary,
  pending,
  summary
}: {
  available: boolean;
  error: string;
  onRequestSummary: () => void;
  pending: boolean;
  summary: RelationshipChatSummaryView | null;
}) {
  const { styles } = useStyles();
  return (
    <DataCard
      detail={summary?.sourceLabel ?? "从这段对话整理"}
      title={summary?.title ?? "对话摘要"}
    >
      {summary ? (
        <>
          <Text style={styles.bodyText}>{summary.narrative}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.sourcePill}>{summary.evidenceLabel}</Text>
          </View>
          <Text style={styles.mutedText}>{summary.nextAction}</Text>
        </>
      ) : (
        <Text style={styles.bodyText}>
          需要时再生成摘要。生成后先核对证据，不会自动写入关系资料。
        </Text>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ChatActionButton
        disabled={pending || !available}
        icon="sparkles-outline"
        label="生成摘要"
        onPress={onRequestSummary}
      />
    </DataCard>
  );
}

function ChatExtractionCard({
  data,
  error,
  loading
}: {
  data: unknown;
  error: string;
  loading: boolean;
}) {
  const { styles } = useStyles();
  const view = data ? relationshipChatExtractionToView(data) : null;

  return (
    <DataCard detail={view?.sourceLabel ?? "读取对话信号"} title="提取结果">
      {loading ? <Text style={styles.mutedText}>正在读取提取结果。</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {view ? (
        <>
          {view.emptyText ? (
            <Text style={styles.mutedText}>{view.emptyText}</Text>
          ) : null}
          <ExtractionGroup items={view.needs} title="需求" />
          <ExtractionGroup items={view.tasks} title="任务" />
          <ExtractionGroup items={view.profileUpdates} title="资料更新" />
          <ExtractionGroup items={view.profileSuggestions} title="需确认" />
          <Text style={styles.mutedText}>{view.nextAction}</Text>
        </>
      ) : null}
    </DataCard>
  );
}

function ExtractionGroup({
  items,
  title
}: {
  items: RelationshipChatExtractionItemView[];
  title: string;
}) {
  const { styles } = useStyles();
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.signalSection}>
      <Text style={styles.signalSectionTitle}>{title}</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.signalRow}>
          <Text style={styles.signalTitle}>{item.title}</Text>
          <Text style={styles.mutedText}>{item.detail}</Text>
        </View>
      ))}
    </View>
  );
}

function ChatActionButton({
  disabled,
  icon,
  label,
  onPress
}: {
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, styles } = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.linkButton,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons color={colors.onAccent} name={icon} size={16} />
      <Text style={styles.linkButtonText}>{label}</Text>
    </Pressable>
  );
}

function MessageBubble({ message }: { message: RelationshipChatMessageView }) {
  const { styles } = useStyles();
  return (
    <View
      style={[
        styles.messageBubble,
        message.fromMe ? styles.messageBubbleMine : styles.messageBubbleOther
      ]}
    >
      <View style={styles.messageMeta}>
        <Text style={styles.messageSender}>{message.sender}</Text>
        <Text style={styles.messageTime}>{message.time}</Text>
      </View>
      <Text style={styles.messageBody}>{message.body}</Text>
      <Text style={styles.deliveryText}>{message.deliveryLabel}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  callout: {
    alignItems: "center",
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface2
  },
  calloutText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  deliveryText: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  disabled: {
    opacity: 0.54
  },
  draftInput: {
    ...createControlStyles(colors).input,
    minHeight: 104
  },
  draftResult: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  draftResultTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800"
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  linkButton: {
    ...createControlStyles(colors).primaryButton,
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexDirection: "row",
    gap: spacing.sm
  },
  linkButtonText: {
    ...createControlStyles(colors).primaryButtonText,
    color: colors.onAccent,
    flexShrink: 1
  },
  messageBody: {
    ...textStyles.body,
    color: colors.text
  },
  messageBubble: {
    borderColor: colors.border,
    gap: spacing.sm,
    maxWidth: "92%",
    padding: spacing.md,
    borderRadius: radius.card
  },
  messageBubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.accentSofter
  },
  messageBubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface2
  },
  messageList: {
    gap: spacing.md
  },
  messageMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  messageSender: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  messageTime: {
    color: colors.text3,
    fontSize: typography.caption
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  mutedText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  pressed: {
    opacity: 0.72
  },
  signalRow: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  signalSection: {
    gap: spacing.sm
  },
  signalSectionTitle: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  signalTitle: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  sourcePill: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  }
}));
