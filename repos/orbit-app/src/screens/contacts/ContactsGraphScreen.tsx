import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  connectionGraphToView,
  type ConnectionGraphMetricView,
  type ConnectionPriorityView,
  type ConnectionStageView
} from "../../view-models/connections-graph";

export function ContactsGraphScreen() {
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.connections,
    (data) => connectionGraphToView(data).priorityConnections.length === 0
  );

  return (
    <AppScreen
      eyebrow="名片夹"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="人脉图谱"
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
          message="先补联系人来源，关系连接会显示在这里。"
          title="暂无关系连接"
        />
      ) : null}
      {state.kind === "success" ? <GraphContent data={state.data} /> : null}
    </AppScreen>
  );
}

function GraphContent({ data }: { data: unknown }) {
  const router = useRouter();
  const view = connectionGraphToView(data);

  return (
    <>
      <DataCard detail={view.summary} title="关系总览">
        <MetricGrid metrics={view.metrics} />
        <View style={styles.callout}>
          <Ionicons color={colors.accent} name="git-network-outline" size={18} />
          <Text style={styles.calloutText}>{view.nextAction}</Text>
        </View>
      </DataCard>
      {view.stages.length > 0 ? <StageCard stages={view.stages} /> : null}
      {view.priorityConnections.length > 0 ? (
        <DataCard detail="按待跟进和关系强度排序" title="优先关系">
          <View style={styles.listStack}>
            {view.priorityConnections.map((connection) => (
              <ConnectionRow
                connection={connection}
                key={connection.id}
                onPress={() => {
                  if (connection.contactId) {
                    router.push(
                      `/contacts/${encodeURIComponent(connection.contactId)}` as Href
                    );
                  }
                }}
              />
            ))}
          </View>
        </DataCard>
      ) : null}
    </>
  );
}

function MetricGrid({ metrics }: { metrics: ConnectionGraphMetricView[] }) {
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

function StageCard({ stages }: { stages: ConnectionStageView[] }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <DataCard detail={`${total} 段连接`} title="关系阶段">
      <View style={styles.listStack}>
        {stages.map((stage) => (
          <View key={stage.id} style={styles.stageRow}>
            <View style={styles.rowTop}>
              <Text style={styles.itemTitle}>{stage.label}</Text>
              <Text style={styles.metaText}>{stage.count} 段</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max(
                      4,
                      total ? Math.round((stage.count / total) * 100) : 0
                    )}%`
                  }
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function ConnectionRow({
  connection,
  onPress
}: {
  connection: ConnectionPriorityView;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.connectionRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.rowTop}>
        <View style={styles.connectionTitle}>
          <Text numberOfLines={1} style={styles.itemTitle}>
            {connection.name}
          </Text>
          <Text numberOfLines={1} style={styles.metaText}>
            {[connection.organization, connection.role].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>{connection.scoreLabel}</Text>
        </View>
      </View>
      <Text style={styles.bodyText}>{connection.detail}</Text>
      <Text style={styles.bodyText}>{connection.nextAction}</Text>
      <View style={styles.tagRow}>
        <Text style={styles.stageTag}>{connection.stageLabel}</Text>
        <Text style={styles.sourceTag}>{connection.sourceLabel}</Text>
        <Text style={styles.metaText}>{connection.lastTouchedAt}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  barFill: {
    backgroundColor: colors.live,
    borderRadius: radius.pill,
    height: "100%"
  },
  barTrack: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    height: 8,
    overflow: "hidden"
  },
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
  connectionRow: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  connectionTitle: {
    flex: 1,
    gap: spacing.xs
  },
  itemTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 21
  },
  listStack: {
    gap: spacing.md
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  metricCell: {
    borderColor: colors.border,
    borderTopWidth: 1,
    flexBasis: "46%",
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 120,
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
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  scorePill: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  scoreText: {
    color: colors.amber,
    fontSize: typography.small,
    fontWeight: "700"
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
  stageRow: {
    gap: spacing.sm
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
  }
});
