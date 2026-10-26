import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import type { RelationshipMessagePageDTO } from "../../api/contract/relationship-communication";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { relationshipCommunicationConversationPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { radius, spacing, textStyles, typography } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import type { RelationshipCommunicationMessageView } from "../../view-models/contact-communication";
import { decodeRelationshipMessagePage } from "../../view-models/relationship-pages";
import { relationshipChatWindowView } from "../../view-models/relationship-chat-window";
import { OfflineNotice } from "../../components/OfflineNotice";
import { useLocalRelationshipThread } from "../../hooks/useLocalRelationshipMessages";
import { localRelationshipMessagePage } from "../../view-models/relationship-local";
import { MessagesOfflineNotice, OutboxMessageBubble } from "../../components/RelationshipOutboxViews";
import { useRelationshipMessageOutbox, type RelationshipMessageOutbox } from "../../hooks/useRelationshipMessageOutbox";
import { conversationOutboxMessages, type OutboxRelationshipMessage } from "../../view-models/relationship-outbox";

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
  const [cursor, setCursor] = useState<string | null>(null);
  // Sprint 0119: the device mirror holds the whole history (native always, the browser while its mirror is
  // active); older pages are read from it too.
  const local = useLocalRelationshipThread(conversationId, cursor);
  // Sprint 0135: offline (or behind queued messages) a message is queued and shown last with 「待发送」.
  const outbox = useRelationshipMessageOutbox(local);
  const queuedHere = useMemo(() => conversationOutboxMessages(outbox.messages, conversationId), [outbox.messages, conversationId]);
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
      refreshControl={<RefreshControl onRefresh={refreshAll} refreshing={state.refreshing} tintColor={colors.accentText} />}
      title="对话详情"
    >
      {offline ? outbox.enabled ? <MessagesOfflineNotice lastSyncedAt={local.freshness.lastSyncedAt} /> : <OfflineNotice lastSyncedAt={local.freshness.lastSyncedAt} /> : null}
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
          outbox={fromDevice && outbox.enabled ? outbox : undefined}
          queued={cursor ? [] : queuedHere}
        />
    </AppScreen>
  );
}

function ThreadContent({ actorId, page, outbox, queued = [] }: {
  actorId: string;
  page: RelationshipMessagePageDTO | null;
  /** Sprint 0135: the device queue (native, device mirror readable); messages queued before 10-27 can still be retried or discarded. */
  outbox?: RelationshipMessageOutbox | undefined;
  queued?: readonly OutboxRelationshipMessage[];
}) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const view = page ? relationshipChatWindowView(page, actorId) : null;

  // An unavailable window must not retain visible messages or contact links.
  // 10-27: relationship messages stop at drafts; this window offers no send.
  if (!view) return null;

  return (
    <>
      <DataCard detail={view.participant} title={view.title}>
        <View style={styles.callout}>
          <Ionicons color={colors.okText} name="shield-checkmark-outline" size={18} />
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
        ) : queued.length ? null : <EmptyState message="这段对话还没有消息。" title="暂无消息" />}
        {queued.length ? (
          <View style={styles.messageList}>{queued.map((message) => (
            <OutboxMessageBubble key={message.mutationId} message={message} senderLabel="我" onRetry={(id) => { void outbox?.retry(id).catch(() => undefined); }} onDiscard={(id) => { void outbox?.discard([id]).catch(() => undefined); }} />
          ))}</View>
        ) : null}
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
  bodyText: { ...textStyles.body, color: colors.ink },
  callout: { alignItems: "center", backgroundColor: colors.okSoft, borderRadius: radius.xl, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  calloutText: { ...textStyles.small, color: colors.ink, flex: 1 },
  linkButton: { alignSelf: "flex-start", paddingVertical: spacing.xs },
  linkButtonText: { color: colors.accentText, fontSize: typography.bodySm, fontWeight: "700" },
  messageHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  messageList: { gap: spacing.md },
  messageMeta: { color: colors.ink3Text, fontSize: typography.label },
  messageMine: { backgroundColor: colors.accentSoft },
  messageRow: { backgroundColor: colors.surface2, borderRadius: radius.xl, gap: spacing.xs, padding: spacing.md },
  messageSender: { color: colors.ink, fontSize: typography.bodySm, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  pageButton: { minHeight: 44, justifyContent: "center", paddingVertical: spacing.sm }
}));
