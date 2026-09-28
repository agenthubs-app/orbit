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
import type { RelationshipMessagePageDTO } from "../../api/contract/relationship-communication";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { relationshipCommunicationConversationPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { createControlStyles } from "../../design/controls";
import { radius, spacing, textStyles, typography } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import type { RelationshipCommunicationMessageView } from "../../view-models/contact-communication";
import { decodeRelationshipMessagePage } from "../../view-models/relationship-pages";
import { relationshipChatWindowView } from "../../view-models/relationship-chat-window";
import { OfflineNotice } from "../../components/OfflineNotice";
import { useLocalRelationshipThread } from "../../hooks/useLocalRelationshipMessages";
import { localRelationshipMessagePage } from "../../view-models/relationship-local";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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
  const { colors, styles } = useStyles();
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  // Sprint 0119: the device mirror holds the whole history (native always, the browser while its mirror is
  // active); older pages are read from it too. Sending needs the network.
  const local = useLocalRelationshipThread(conversationId, cursor);
  const fromDevice = local.available && local.freshness.readable;
  const offline = fromDevice && local.freshness.offline;
  const localPage = useMemo(() => fromDevice
    ? localRelationshipMessagePage(local.conversations, local.messages, actorId, conversationId, { cursor, asOf: local.freshness.lastSyncedAt ?? new Date(0).toISOString() })
    : null, [fromDevice, local.conversations, local.messages, actorId, conversationId, cursor, local.freshness.lastSyncedAt]);
  const network = useApiResource<unknown>(
    `${relationshipCommunicationConversationPath(conversationId)}/messages?limit=30&direction=older${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    () => false,
    { scopeKey: `${scopeKey}:window:${cursor ?? "latest"}`, cachePolicy: "network-only", enabled: !local.available }
  );
  const localGone = fromDevice && !localPage && !local.freshness.refreshing;
  const state = local.available
    ? { kind: fromDevice && localPage ? "success" as const : local.freshness.failure || localGone ? "failure" as const : "loading" as const, refreshing: local.freshness.refreshing,
        error: { code: "ORBIT_APP_SYNC_FAILURE", message: localGone ? "这段对话已不在本机（关系已撤销或对话不可用）。" : "没有同步到当前账号的会话，请稍后重试。" }, data: localPage, refresh: () => { void local.refresh(); } }
    : network;
  const loaded = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const freshData = local.available ? localPage : decodeRelationshipMessagePage(loaded, actorId, conversationId);

  function refreshAll() {
    setCursor(null);
    state.refresh();
  }

  return (
    <AppScreen
      eyebrow="关系对话"
      refreshControl={<RefreshControl onRefresh={refreshAll} refreshing={state.refreshing} tintColor={colors.accent} />}
      title="对话详情"
    >
      {offline ? <OfflineNotice lastSyncedAt={local.freshness.lastSyncedAt} /> : null}
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? <ErrorState message={state.error.message} title="服务器连不上" /> : null}
      {state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {(state.kind === "success" || state.kind === "empty") && !freshData ? (
        <ErrorState message="没有读到当前账号可访问的会话，请刷新后重试。" />
      ) : null}
      {freshData?.hasMore ? <Pressable accessibilityRole="button" onPress={() => setCursor(freshData.nextCursor)} style={styles.pageButton}><Text style={styles.linkButtonText}>更早的消息</Text></Pressable> : null}
      {cursor ? <Pressable accessibilityRole="button" onPress={refreshAll} style={styles.pageButton}><Text style={styles.linkButtonText}>最新消息</Text></Pressable> : null}
        <ThreadContent
          actorId={actorId}
          page={freshData}
          deliveryNotice={deliveryNotice}
          offline={offline}
          onDelivered={() => {
            setDeliveryNotice("消息已送达已验证的 Orbit 账号。");
            refreshAll();
          }}
          scopeKey={scopeKey}
        />
    </AppScreen>
  );
}

function ThreadContent({ actorId, page, deliveryNotice, onDelivered, scopeKey, offline = false }: {
  actorId: string;
  page: RelationshipMessagePageDTO | null;
  deliveryNotice: string;
  /** Sprint 0119: offline the history shows as of the last sync and sending needs the network. */
  offline?: boolean;
  onDelivered: () => void;
  scopeKey: string;
}) {
  const { colors, styles } = useStyles();
  const client = useOrbitApiClient({ scopeKey });
  const router = useRouter();
  const view = page ? relationshipChatWindowView(page, actorId) : null;
  const active = useRef(false);
  active.current = Boolean(view?.canSend);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const attempt = useRef<{ body: string; qualificationVersion: string; requestId: string } | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!page) {
      request.current?.abort();
      request.current = null;
      setPending(false);
    }
  }, [page]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  async function sendVerifiedMessage() {
    if (!mounted.current || !active.current || request.current || !view?.canSend || offline) return;
    const normalizedBody = draftBody.trim();
    const currentAttempt = attempt.current?.body === normalizedBody && attempt.current.qualificationVersion === view.qualificationVersion
      ? attempt.current
      : { body: normalizedBody, qualificationVersion: view.qualificationVersion, requestId: randomUUID() };
    attempt.current = currentAttempt;
    const built = buildRelationshipMessageDeliveryRequest({ ...currentAttempt, conversationId: view.conversationId });
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
      if (!mounted.current || !active.current || controller.signal.aborted) return;
      if (!result.success || result.status < 200 || result.status >= 300 || !relationshipDeliveryReceiptMatches(result.data, {
        body: currentAttempt.body,
        conversationId: view.conversationId,
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

  // Keep only the local draft mounted; an unavailable window must not retain
  // visible messages, contact links or send authority.
  if (!view) return null;

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
      <DataCard detail={`本页 ${view.messages.length} 条消息`} title="消息记录">
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
          accessibilityLabel={offline ? "发送消息 · 需要联网" : undefined}
          disabled={offline || pending || !view.canSend || !draftBody.trim()}
          onPress={() => void sendVerifiedMessage()}
          style={({ pressed }) => [styles.primaryButton, offline || pending || !view.canSend || !draftBody.trim() ? styles.disabled : null, pressed ? styles.pressed : null]}
        >
          <Text style={styles.primaryButtonText}>{offline ? "发送消息 · 需要联网" : pending ? "发送中" : "发送消息"}</Text>
        </Pressable>
      </DataCard>
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

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  bodyText: { ...textStyles.body, color: colors.text },
  callout: { alignItems: "center", backgroundColor: colors.liveSoft, borderRadius: radius.card, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  calloutText: { ...textStyles.small, color: colors.text, flex: 1 },
  disabled: { opacity: 0.45 },
  errorText: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  linkButton: { alignSelf: "flex-start", paddingVertical: spacing.xs },
  linkButtonText: { color: colors.accent, fontSize: typography.small, fontWeight: "700" },
  messageHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  messageList: { gap: spacing.md },
  messageMeta: { color: colors.text3, fontSize: typography.caption },
  messageMine: { backgroundColor: colors.accentSoft },
  messageRow: { backgroundColor: colors.surface2, borderRadius: radius.card, gap: spacing.xs, padding: spacing.md },
  messageSender: { color: colors.ink, fontSize: typography.small, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  pageButton: { minHeight: 44, justifyContent: "center", paddingVertical: spacing.sm },
  primaryButton: { ...createControlStyles(colors).primaryButton, alignSelf: "flex-start" },
  primaryButtonText: { ...createControlStyles(colors).primaryButtonText },
  successText: { color: colors.live, fontSize: typography.small, lineHeight: 20 },
  textArea: { ...textStyles.body, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, color: colors.text, minHeight: 120, padding: spacing.md, textAlignVertical: "top" }
}));
