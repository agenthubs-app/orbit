import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
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
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildRelationshipChatMessageRequest,
  relationshipChatExtractionToView,
  relationshipChatMessageSendToView,
  relationshipChatSummaryToView,
  relationshipChatThreadToView,
  type RelationshipChatExtractionItemView,
  type RelationshipChatMessageSendView,
  type RelationshipChatSummaryView,
  type RelationshipChatMessageView,
  type RelationshipChatThreadView
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
  const state = useApiResource<unknown>(
    chatConversationPath(conversationId || "missing"),
    (data) => relationshipChatThreadToView(data).messages.length === 0
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
    }
  );

  function refreshAll() {
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
      {conversationId && state.kind === "empty" ? (
        <EmptyState
          message="这段关系对话还没有可显示的消息。"
          title="暂无消息"
        />
      ) : null}
      {conversationId && state.kind === "success" ? (
        <ThreadContent
          data={state.data}
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
  data,
  extractionData,
  extractionError,
  extractionLoading
}: {
  data: unknown;
  extractionData: unknown;
  extractionError: string;
  extractionLoading: boolean;
}) {
  const client = useOrbitApiClient();
  const router = useRouter();
  const [sentThread, setSentThread] =
    useState<RelationshipChatThreadView | null>(null);
  const view = sentThread ?? relationshipChatThreadToView(data);
  const [draftBody, setDraftBody] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftPending, setDraftPending] = useState(false);
  const [draftResult, setDraftResult] =
    useState<RelationshipChatMessageSendView | null>(null);
  const [summary, setSummary] = useState<RelationshipChatSummaryView | null>(
    null
  );
  const [summaryError, setSummaryError] = useState("");
  const [summaryPending, setSummaryPending] = useState(false);

  async function requestSummary() {
    setSummaryPending(true);
    setSummaryError("");

    try {
      const result = await client.post<unknown>(chatConversationSummaryPath(view.conversationId));

      if (!result.success) {
        setSummaryError(result.error.message || "摘要暂时生成不了。");
        return;
      }

      const nextSummary = relationshipChatSummaryToView(result.data);

      if (!nextSummary) {
        setSummaryError("这段对话还没有可用摘要。");
        return;
      }

      setSummary(nextSummary);
    } catch (error) {
      setSummaryError(
        error instanceof Error ? error.message : "摘要暂时生成不了。"
      );
    } finally {
      setSummaryPending(false);
    }
  }

  async function sendMessageDraft() {
    const request = buildRelationshipChatMessageRequest(
      view.conversationId,
      draftBody
    );

    setDraftError("");
    setDraftResult(null);

    if (!request.success) {
      setDraftError(request.error);
      return;
    }

    setDraftPending(true);

    try {
      const result = await client.post<unknown>(
        request.request.endpoint,
        request.request.options
      );

      if (!result.success) {
        setDraftError(result.error.message || "草稿暂时保存不了。");
        return;
      }

      const nextResult = relationshipChatMessageSendToView(result.data);
      setSentThread(nextResult.thread);
      setDraftResult(nextResult);
      setDraftBody("");
    } catch (error) {
      setDraftError(
        error instanceof Error ? error.message : "草稿暂时保存不了。"
      );
    } finally {
      setDraftPending(false);
    }
  }

  return (
    <>
      <DataCard detail={view.participant} title={view.title}>
        <Text style={styles.bodyText}>{view.context}</Text>
        <View style={styles.callout}>
          <Ionicons color={colors.accent} name="shield-checkmark-outline" size={18} />
          <Text style={styles.calloutText}>{view.sendBoundary}</Text>
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
        <View style={styles.messageList}>
          {view.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </View>
      </DataCard>
      <ChatDraftComposerCard
        body={draftBody}
        error={draftError}
        onChangeBody={setDraftBody}
        onSave={sendMessageDraft}
        pending={draftPending}
        result={draftResult}
        sendBoundary={view.sendBoundary}
      />
      <ChatSummaryCard
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
  error,
  onChangeBody,
  onSave,
  pending,
  result,
  sendBoundary
}: {
  body: string;
  error: string;
  onChangeBody: (value: string) => void;
  onSave: () => void;
  pending: boolean;
  result: RelationshipChatMessageSendView | null;
  sendBoundary: string;
}) {
  return (
    <DataCard detail="本地草稿" title="回复草稿">
      <Text style={styles.mutedText}>{sendBoundary}</Text>
      <TextInput
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
        disabled={pending}
        icon="document-text-outline"
        label={pending ? "保存中" : "保存草稿"}
        onPress={onSave}
      />
    </DataCard>
  );
}

function ChatSummaryCard({
  error,
  onRequestSummary,
  pending,
  summary
}: {
  error: string;
  onRequestSummary: () => void;
  pending: boolean;
  summary: RelationshipChatSummaryView | null;
}) {
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
        disabled={pending}
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

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  callout: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
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
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    minHeight: 104,
    padding: spacing.md
  },
  draftResult: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
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
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  linkButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  messageBody: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  messageBubble: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: "92%",
    padding: spacing.md
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
    borderRadius: radius.md,
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
});
