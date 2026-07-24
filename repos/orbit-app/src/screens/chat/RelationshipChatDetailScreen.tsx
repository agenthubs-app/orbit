import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { chatConversationPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  relationshipChatThreadToView,
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
  const state = useApiResource<unknown>(
    chatConversationPath(conversationId || "missing"),
    (data) => relationshipChatThreadToView(data).messages.length === 0
  );

  return (
    <AppScreen
      eyebrow="关系对话"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
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
        <ThreadContent data={state.data} />
      ) : null}
    </AppScreen>
  );
}

function ThreadContent({ data }: { data: unknown }) {
  const router = useRouter();
  const view = relationshipChatThreadToView(data);

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
    </>
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
  linkButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
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
  pressed: {
    opacity: 0.72
  }
});
