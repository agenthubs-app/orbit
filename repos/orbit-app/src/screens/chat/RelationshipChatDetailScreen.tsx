import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  buildRelationshipMessageDeliveryRequest,
  relationshipDeliveryReceiptMatches
} from "../../api/contact-communication";
import type { RelationshipConversationDTO } from "../../api/contract/relationship-communication";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import {
  chatConversationExtractionsPath,
  relationshipCommunicationConversationPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { createControlStyles } from "../../design/controls";
import { radius, spacing, textStyles, typography } from "../../design/tokens";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  relationshipCommunicationThreadToView,
  type RelationshipCommunicationMessageView
} from "../../view-models/contact-communication";
import {
  relationshipChatExtractionToView,
  type RelationshipChatExtractionItemView
} from "../../view-models/relationship-chat";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isConversation(value: unknown, conversationId: string): value is RelationshipConversationDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<RelationshipConversationDTO>;
  return record.conversationId === conversationId && Array.isArray(record.messages) &&
    Array.isArray(record.participantAccountIds) && typeof record.qualificationVersion === "string";
}

export function RelationshipChatDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = firstParam(params.id);
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const scopeKey = useMemo(
    () => randomUUID(),
    [server.baseUrl, actorId, auth.cookieHeader, conversationId, ready]
  );

  if (!ready) return <AppScreen title="对话详情"><LoadingState /></AppScreen>;
  if (!conversationId) return <AppScreen title="对话详情"><ErrorState message="缺少对话 ID。" title="打不开对话" /></AppScreen>;
  return <ScopedChatDetailScreen actorId={actorId} conversationId={conversationId} key={scopeKey} scopeKey={scopeKey} />;
}

function ScopedChatDetailScreen({ actorId, conversationId, scopeKey }: {
  actorId: string;
  conversationId: string;
  scopeKey: string;
}) {
  const { colors } = useOrbitTheme();
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const state = useApiResource<unknown>(
    relationshipCommunicationConversationPath(conversationId),
    () => false,
    { scopeKey, cachePolicy: "network-only" }
  );
  const extractionState = useApiResource<unknown>(
    chatConversationExtractionsPath(conversationId),
    (data) => {
      const view = relationshipChatExtractionToView(data);
      return view.needs.length + view.tasks.length + view.profileUpdates.length + view.profileSuggestions.length === 0;
    },
    { scopeKey, cachePolicy: "network-only" }
  );
  const loaded = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const freshData = isConversation(loaded, conversationId) ? loaded : null;

  function refreshAll() {
    state.refresh();
    extractionState.refresh();
  }

  return (
    <AppScreen
      eyebrow="关系对话"
      refreshControl={<RefreshControl onRefresh={refreshAll} refreshing={state.refreshing || extractionState.refreshing} tintColor={colors.accent} />}
      title="对话详情"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? <ErrorState message={state.error.message} title="服务器连不上" /> : null}
      {state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {(state.kind === "success" || state.kind === "empty") && !freshData ? (
        <ErrorState message="没有读到当前账号可访问的会话，请刷新后重试。" />
      ) : null}
      {freshData ? (
        <ThreadContent
          actorId={actorId}
          conversation={freshData}
          extractionData={extractionState.kind === "success" ? extractionState.data : null}
          extractionError={extractionState.kind === "failure" || extractionState.kind === "offline" ? extractionState.error.message : ""}
          extractionLoading={extractionState.kind === "loading"}
          deliveryNotice={deliveryNotice}
          onDelivered={() => {
            setDeliveryNotice("消息已送达已验证的 Orbit 账号。");
            refreshAll();
          }}
          scopeKey={scopeKey}
        />
      ) : null}
    </AppScreen>
  );
}

function ThreadContent({ actorId, conversation, deliveryNotice, extractionData, extractionError, extractionLoading, onDelivered, scopeKey }: {
  actorId: string;
  conversation: RelationshipConversationDTO;
  deliveryNotice: string;
  extractionData: unknown;
  extractionError: string;
  extractionLoading: boolean;
  onDelivered: () => void;
  scopeKey: string;
}) {
  const { colors, styles } = useStyles();
  const client = useOrbitApiClient({ scopeKey });
  const router = useRouter();
  const view = relationshipCommunicationThreadToView(conversation, actorId);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const attempt = useRef<{ body: string; qualificationVersion: string; requestId: string } | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  async function sendVerifiedMessage() {
    if (!mounted.current || request.current || !view.canSend) return;
    const normalizedBody = draftBody.trim();
    const currentAttempt = attempt.current?.body === normalizedBody && attempt.current.qualificationVersion === view.qualificationVersion
      ? attempt.current
      : { body: normalizedBody, qualificationVersion: view.qualificationVersion, requestId: randomUUID() };
    attempt.current = currentAttempt;
    const built = buildRelationshipMessageDeliveryRequest({ ...currentAttempt, conversationId: conversation.conversationId });
    setFeedback("");
    if (!built.success) {
      setFeedback(built.error);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      const result = await client.post<unknown>(built.request.endpoint, {
        body: built.request.body,
        headers: built.request.headers,
        signal: controller.signal
      });
      if (!mounted.current || controller.signal.aborted) return;
      if (!result.success || result.status < 200 || result.status >= 300 || !relationshipDeliveryReceiptMatches(result.data, {
        body: currentAttempt.body,
        conversationId: conversation.conversationId,
        qualificationVersion: currentAttempt.qualificationVersion,
        senderAccountId: actorId
      })) {
        setFeedback("尚未确认消息送达，输入已保留。请刷新资格后重试。");
        return;
      }
      attempt.current = null;
      setDraftBody("");
      setFeedback("");
      onDelivered();
    } catch {
      if (mounted.current && !controller.signal.aborted) setFeedback("消息暂时无法送达，输入已保留。请重试。");
    } finally {
      if (mounted.current && request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  function changeDraft(value: string) {
    if (request.current) return;
    setDraftBody(value);
    setFeedback("");
    attempt.current = null;
  }

  return (
    <>
      <DataCard detail={view.participant} title={view.title}>
        <View style={styles.callout}>
          <Ionicons color={colors.live} name="shield-checkmark-outline" size={18} />
          <Text style={styles.calloutText}>{view.sendBoundary}</Text>
        </View>
        {view.contactId ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/contacts/${encodeURIComponent(view.contactId)}` as Href)} style={({ pressed }) => [styles.linkButton, pressed ? styles.pressed : null]}>
            <Text style={styles.linkButtonText}>查看联系人</Text>
          </Pressable>
        ) : null}
      </DataCard>
      <DataCard detail={`${view.messages.length} 条消息`} title="消息记录">
        {view.messages.length ? (
          <View style={styles.messageList}>{view.messages.map((message) => <MessageRow key={message.id} message={message} />)}</View>
        ) : <EmptyState message="验证完成后可以发送第一条消息。" title="暂无消息" />}
      </DataCard>
      <DataCard detail="只有服务端投递回执匹配后才会清空输入" title="发送消息">
        <TextInput
          editable={!pending && view.canSend}
          multiline
          onChangeText={changeDraft}
          placeholder="写给已验证联系人"
          placeholderTextColor={colors.text3}
          style={styles.textArea}
          value={draftBody}
        />
        {deliveryNotice || feedback ? <Text style={deliveryNotice ? styles.successText : styles.errorText}>{deliveryNotice || feedback}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={pending || !view.canSend || !draftBody.trim()}
          onPress={() => void sendVerifiedMessage()}
          style={({ pressed }) => [styles.primaryButton, pending || !view.canSend || !draftBody.trim() ? styles.disabled : null, pressed ? styles.pressed : null]}
        >
          <Text style={styles.primaryButtonText}>{pending ? "发送中" : "发送消息"}</Text>
        </Pressable>
      </DataCard>
      <ExtractionCard data={extractionData} error={extractionError} loading={extractionLoading} />
    </>
  );
}

function MessageRow({ message }: { message: RelationshipCommunicationMessageView }) {
  const { styles } = useStyles();
  return (
    <View style={[styles.messageRow, message.fromMe ? styles.messageMine : null]}>
      <View style={styles.messageHeader}>
        <Text style={styles.messageSender}>{message.sender}</Text>
        <Text style={styles.messageMeta}>{message.time} · {message.deliveryLabel}</Text>
      </View>
      <Text style={styles.bodyText}>{message.body}</Text>
    </View>
  );
}

function ExtractionCard({ data, error, loading }: { data: unknown; error: string; loading: boolean }) {
  const { styles } = useStyles();
  if (loading) return <DataCard title="提取结果"><LoadingState /></DataCard>;
  if (error) return <DataCard title="提取结果"><Text style={styles.errorText}>{error}</Text></DataCard>;
  if (!data) return null;
  const view = relationshipChatExtractionToView(data);
  const items = [...view.needs, ...view.tasks, ...view.profileUpdates, ...view.profileSuggestions];
  return (
    <DataCard detail={view.nextAction} title="提取结果">
      {items.length ? <View style={styles.messageList}>{items.map((item) => <ExtractionRow item={item} key={item.id} />)}</View> : <Text style={styles.bodyText}>{view.emptyText}</Text>}
    </DataCard>
  );
}

function ExtractionRow({ item }: { item: RelationshipChatExtractionItemView }) {
  const { styles } = useStyles();
  return <View style={styles.extractionRow}><Text style={styles.messageSender}>{item.title}</Text><Text style={styles.bodyText}>{item.detail}</Text></View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  bodyText: { ...textStyles.body, color: colors.text },
  callout: { alignItems: "center", backgroundColor: colors.liveSoft, borderRadius: radius.card, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  calloutText: { ...textStyles.small, color: colors.text, flex: 1 },
  disabled: { opacity: 0.45 },
  errorText: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  extractionRow: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, paddingTop: spacing.sm },
  linkButton: { alignSelf: "flex-start", paddingVertical: spacing.xs },
  linkButtonText: { color: colors.accent, fontSize: typography.small, fontWeight: "700" },
  messageHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  messageList: { gap: spacing.md },
  messageMeta: { color: colors.text3, fontSize: typography.caption },
  messageMine: { backgroundColor: colors.accentSoft },
  messageRow: { backgroundColor: colors.surface2, borderRadius: radius.card, gap: spacing.xs, padding: spacing.md },
  messageSender: { color: colors.ink, fontSize: typography.small, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  primaryButton: { ...createControlStyles(colors).primaryButton, alignSelf: "flex-start" },
  primaryButtonText: { ...createControlStyles(colors).primaryButtonText },
  successText: { color: colors.live, fontSize: typography.small, lineHeight: 20 },
  textArea: { ...textStyles.body, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, color: colors.text, minHeight: 120, padding: spacing.md, textAlignVertical: "top" }
}));
