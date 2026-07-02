import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { createOrbitApiClient } from "../../api/client";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  conversationPayloadToChatView,
  conversationsToSummaries,
  type ConversationChatView
} from "../../view-models/conversations";

export function AiScreen() {
  const { baseUrl } = useOrbitApiBaseUrl();
  const client = useMemo(() => createOrbitApiClient({ baseUrl }), [baseUrl]);
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.conversations,
    (data) => conversationsToSummaries(data).length === 0
  );
  const [draftMessage, setDraftMessage] = useState("");
  const [latestChat, setLatestChat] = useState<ConversationChatView | null>(
    null
  );
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function sendMessage() {
    const message = draftMessage.trim();

    if (!message) {
      setSendError("Enter a message for Orbit AI.");
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      const result = await client.post<unknown>(
        ORBIT_API_ENDPOINTS.conversations,
        {
          body: { message }
        }
      );

      if (result.success) {
        setLatestChat(conversationPayloadToChatView(result.data));
        setDraftMessage("");
        state.refresh();
      } else {
        setSendError(result.error.message);
      }
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Could not send this message."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <AppScreen
      eyebrow="Relationship steward"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="Orbit AI"
    >
      <DataCard
        detail="Ask about who to meet, what to prepare, or who needs follow-up."
        title="Ask Orbit AI"
      >
        <View style={styles.composer}>
          <TextInput
            multiline
            onChangeText={setDraftMessage}
            placeholder="What should I do next?"
            style={styles.input}
            value={draftMessage}
          />
          <Pressable
            accessibilityRole="button"
            disabled={sending}
            onPress={sendMessage}
            style={({ pressed }) => [
              styles.sendButton,
              sending ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.sendButtonText}>
              {sending ? "Sending" : "Send"}
            </Text>
          </Pressable>
          {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}
        </View>
      </DataCard>
      {latestChat ? <LatestChatCard latestChat={latestChat} /> : null}
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="Server is offline" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState
          message="Start a conversation to prepare your next relationship move."
          title="No conversations yet"
        />
      ) : null}
      {state.kind === "success"
        ? conversationsToSummaries(state.data).map((item) => (
            <DataCard
              detail={item.preview || "Ready for your next prompt"}
              key={item.id}
              title={item.title}
            >
              <Text>
                {item.preview ||
                  "Ask Orbit AI who to meet, what to prepare, or who needs follow-up."}
              </Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}

function LatestChatCard({
  latestChat
}: {
  latestChat: ConversationChatView;
}) {
  return (
    <>
      {latestChat.assistantMessage ? (
        <DataCard detail="Latest reply" title="Orbit AI replied">
          <Text>{latestChat.assistantMessage}</Text>
        </DataCard>
      ) : null}
      {latestChat.proposedToolIntents.map((intent) => (
        <DataCard detail={intent.reason} key={intent.id} title={intent.label}>
          <Text>
            {intent.requiresUserConfirmation
              ? "Review before Orbit AI takes action."
              : "Ready to use in this conversation."}
          </Text>
        </DataCard>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  composer: {
    gap: spacing.md
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.caution,
    fontSize: typography.small,
    lineHeight: 20
  },
  input: {
    backgroundColor: colors.canvas,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ink,
    fontSize: typography.body,
    minHeight: 96,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: "top"
  },
  pressed: {
    opacity: 0.72
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  sendButtonText: {
    color: colors.surface,
    fontSize: typography.small,
    fontWeight: "800"
  }
});
