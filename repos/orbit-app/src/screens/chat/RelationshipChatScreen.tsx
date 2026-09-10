import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { textStyles, radius, spacing, typography } from "../../design/tokens";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import {
  relationshipChatListToView,
  type RelationshipChatConversationView,
  type RelationshipChatMetricView
} from "../../view-models/relationship-chat";

export function RelationshipChatScreen() {
  const { colors } = useOrbitTheme();
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.chatConversations,
    (data) => relationshipChatListToView(data).conversations.length === 0
  );

  return (
    <AppScreen
      eyebrow="人脉消息"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="关系对话"
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
          message="有一对一关系上下文时，对话会出现在这里。"
          title="暂无关系对话"
        />
      ) : null}
      {state.kind === "success" ? <ChatListContent data={state.data} /> : null}
    </AppScreen>
  );
}

function ChatListContent({ data }: { data: unknown }) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const view = relationshipChatListToView(data);

  return (
    <>
      <RelationshipAgentEntry onPress={() => router.push("/ai" as Href)} />
      <DataCard detail={view.summary} title={view.title}>
        <MetricGrid metrics={view.metrics} />
        <View style={styles.callout}>
          <Ionicons color={colors.accent} name="chatbubbles-outline" size={18} />
          <Text style={styles.calloutText}>
            这里看关系对话上下文。真正发出消息前仍然要确认。
          </Text>
        </View>
      </DataCard>
      <DataCard detail="按待联系和未读排序" title="对话列表">
        <View style={styles.listStack}>
          {view.conversations.map((conversation) => (
            <ConversationRow
              conversation={conversation}
              key={conversation.id}
              onPress={() =>
                router.push(`/chat/${encodeURIComponent(conversation.id)}` as Href)
              }
            />
          ))}
        </View>
      </DataCard>
    </>
  );
}

function RelationshipAgentEntry({ onPress }: { onPress: () => void }) {
  const { colors, styles } = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.agentEntry, pressed ? styles.pressed : null]}
    >
      <View style={styles.agentEntryIcon}>
        <Ionicons color={colors.onAccent} name="sparkles-outline" size={19} />
      </View>
      <View style={styles.agentEntryBody}>
        <Text style={styles.agentEntryTitle}>Orbit AI 关系管家</Text>
        <Text style={styles.agentPrompt}>
          {"让 Orbit AI 先帮我判断该联系谁、怎么写、下一步放在哪里。"}
        </Text>
      </View>
      <Ionicons color={colors.text3} name="chevron-forward" size={17} />
    </Pressable>
  );
}

function MetricGrid({ metrics }: { metrics: RelationshipChatMetricView[] }) {
  const { styles } = useStyles();
  return (
    <View style={styles.metricGrid}>
      {metrics.map((metric) => (
        <View key={metric.label} style={styles.metricCell}>
          <Text style={styles.metricValue}>{metric.value}</Text>
          <Text style={styles.metricLabel}>{metric.label}</Text>
        </View>
      ))}
    </View>
  );
}

function ConversationRow({
  conversation,
  onPress
}: {
  conversation: RelationshipChatConversationView;
  onPress: () => void;
}) {
  const { styles } = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.rowTop}>
        <View style={styles.rowTitle}>
          <Text numberOfLines={1} style={styles.itemTitle}>
            {conversation.name}
          </Text>
          <Text numberOfLines={1} style={styles.metaText}>
            {conversation.detail}
          </Text>
        </View>
        <Text style={styles.timeText}>{conversation.lastAt}</Text>
      </View>
      <Text style={styles.bodyText}>{conversation.preview}</Text>
      <Text style={styles.bodyText}>{conversation.nextAction}</Text>
      <View style={styles.tagRow}>
        <Text style={styles.sourceTag}>{conversation.sourceLabel}</Text>
        <Text style={styles.stageTag}>{conversation.unreadLabel}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  agentEntry: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 0
  },
  agentEntryBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  agentEntryIcon: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  agentEntryTitle: {
    ...textStyles.listTitle,
    color: colors.text
  },
  agentPrompt: {
    fontSize: typography.small,
    lineHeight: 20,
    color: colors.text2
  },
  bodyText: {
    ...textStyles.body,
    color: colors.text
  },
  callout: {
    alignItems: "center",
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.card
  },
  calloutText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  itemTitle: {
    ...textStyles.listTitle,
    color: colors.ink,
    flex: 1
  },
  listStack: {
    gap: spacing.md
  },
  metaText: {
    ...textStyles.small,
    color: colors.text3
  },
  metricCell: {
    borderColor: colors.border,
    borderTopWidth: 1,
    flexBasis: "30%",
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 88,
    paddingTop: spacing.md
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  metricLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "600"
  },
  metricValue: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30
  },
  pressed: {
    opacity: 0.72
  },
  row: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  rowTitle: {
    flex: 1,
    gap: spacing.xs
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  sourceTag: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.pill,
    color: colors.sky,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  stageTag: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  tagRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  timeText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  }
}));
