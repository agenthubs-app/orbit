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
import { MetricPill } from "../../components/MetricPill";
import { colors, radius, spacing, typography } from "../../design/tokens";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import {
  bootstrapMetrics,
  bootstrapToSummary
} from "../../view-models/bootstrap";
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
  const bootstrapState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.bootstrap,
    () => false
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
      <OrbitSummaryCard state={bootstrapState} />
      <DataCard
        detail="Ask about who to meet, what to prepare, or who needs follow-up."
        title="Ask Orbit AI"
      >
        <View style={styles.composer}>
          <TextInput
            multiline
            onChangeText={setDraftMessage}
            placeholder="What should I do next?"
            placeholderTextColor={colors.text4}
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
              <Text style={styles.bodyText}>
                {item.preview ||
                  "Ask Orbit AI who to meet, what to prepare, or who needs follow-up."}
              </Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}

function OrbitSummaryCard({ state }: { state: ApiResourceState<unknown> }) {
  if (state.kind === "loading" || state.kind === "empty") {
    return null;
  }

  if (state.kind === "offline") {
    return (
      <ErrorState message={state.error.message} title="Startup summary unavailable" />
    );
  }

  if (state.kind === "failure") {
    return <ErrorState message={state.error.message} title="Startup summary unavailable" />;
  }

  const summary = bootstrapToSummary(state.data);
  const metrics = bootstrapMetrics(summary);

  return (
    <DataCard detail={summary.profileName} title={summary.workspaceName}>
      <Text style={styles.summaryText}>{summary.summary}</Text>
      <View style={styles.metricsRow}>
        {metrics.map((metric) => (
          <MetricPill
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </View>
      <View style={styles.nextAction}>
        <Text style={styles.nextActionLabel}>Next</Text>
        <Text style={styles.nextActionText}>{summary.nextAction}</Text>
      </View>
    </DataCard>
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
          <Text style={styles.bodyText}>{latestChat.assistantMessage}</Text>
        </DataCard>
      ) : null}
      {latestChat.proposedToolIntents.map((intent) => (
        <DataCard detail={intent.reason} key={intent.id} title={intent.label}>
          <Text style={styles.bodyText}>
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
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
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
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    textAlignVertical: "top"
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  nextAction: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  nextActionLabel: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  nextActionText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  pressed: {
    opacity: 0.72
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg
  },
  sendButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "600"
  },
  summaryText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  }
});
