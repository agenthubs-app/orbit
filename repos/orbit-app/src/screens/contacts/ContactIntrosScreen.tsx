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
  contactsPipelineToView,
  type ContactIntroCandidateView,
  type ContactPipelineMetricView
} from "../../view-models/contact-pipeline";

export function ContactIntrosScreen() {
  const contactsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.contacts,
    (data) =>
      contactsPipelineToView({
        connectionsPayload: { connections: [] },
        contactsPayload: data
      }).stages.every((stage) => stage.count === 0)
  );
  const connectionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.connections,
    () => false
  );
  const refreshing = contactsState.refreshing || connectionsState.refreshing;
  const refresh = () => {
    contactsState.refresh();
    connectionsState.refresh();
  };

  return (
    <AppScreen
      eyebrow="名片夹"
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
      title="引荐准备"
    >
      {contactsState.kind === "loading" || connectionsState.kind === "loading" ? (
        <LoadingState />
      ) : null}
      {contactsState.kind === "offline" || connectionsState.kind === "offline" ? (
        <ErrorState
          message={
            contactsState.kind === "offline"
              ? contactsState.error.message
              : connectionsState.kind === "offline"
                ? connectionsState.error.message
                : "请检查服务器连接。"
          }
          title="服务器连不上"
        />
      ) : null}
      {contactsState.kind === "failure" || connectionsState.kind === "failure" ? (
        <ErrorState
          message={
            contactsState.kind === "failure"
              ? contactsState.error.message
              : connectionsState.kind === "failure"
                ? connectionsState.error.message
                : "引荐准备暂时无法加载。"
          }
        />
      ) : null}
      {contactsState.kind === "empty" ? (
        <EmptyState
          message="先补联系人来源，再整理适合互相介绍的人。"
          title="暂无引荐候选"
        />
      ) : null}
      {contactsState.kind === "success" && connectionsState.kind === "success" ? (
        <IntrosContent
          connectionsPayload={connectionsState.data}
          contactsPayload={contactsState.data}
        />
      ) : null}
    </AppScreen>
  );
}

function IntrosContent({
  connectionsPayload,
  contactsPayload
}: {
  connectionsPayload: unknown;
  contactsPayload: unknown;
}) {
  const router = useRouter();
  const view = contactsPipelineToView({ connectionsPayload, contactsPayload });
  const totalMetric = view.metrics.find((metric) => metric.label === "联系人") ?? {
    label: "联系人",
    value: "0"
  };
  const introMetric = view.metrics.find((metric) => metric.label === "可引荐") ?? {
    label: "可引荐",
    value: "0"
  };

  return (
    <>
      <DataCard detail={view.introReadiness.summary} title="引荐总览">
        <MetricGrid
          metrics={[
            totalMetric,
            introMetric,
            { label: "已保存", value: "网页版" },
            { label: "外发", value: "需确认" }
          ]}
        />
        <View style={styles.callout}>
          <Ionicons color={colors.live} name="git-compare-outline" size={18} />
          <Text style={styles.calloutText}>
            这里先找适合牵线的人。已保存的引荐记录暂时留在网页版查看。
          </Text>
        </View>
      </DataCard>
      {view.introReadiness.candidates.length > 0 ? (
        <DataCard detail="按关系强度和引荐路径排序" title="可准备的人">
          <View style={styles.listStack}>
            {view.introReadiness.candidates.map((candidate) => (
              <IntroCandidateRow
                candidate={candidate}
                key={candidate.id}
                onPress={() =>
                  router.push(
                    `/contacts/${encodeURIComponent(candidate.contactId)}` as Href
                  )
                }
              />
            ))}
          </View>
        </DataCard>
      ) : (
        <EmptyState
          message="有明确引荐路径或朋友介绍来源的人会出现在这里。"
          title="暂无合适候选"
        />
      )}
    </>
  );
}

function MetricGrid({ metrics }: { metrics: ContactPipelineMetricView[] }) {
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

function IntroCandidateRow({
  candidate,
  onPress
}: {
  candidate: ContactIntroCandidateView;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.rowTop}>
        <View style={styles.rowTitle}>
          <Text numberOfLines={1} style={styles.itemTitle}>
            {candidate.name}
          </Text>
          <Text numberOfLines={1} style={styles.metaText}>
            {candidate.detail}
          </Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>{candidate.strengthLabel}</Text>
        </View>
      </View>
      <Text style={styles.bodyText}>{candidate.reason}</Text>
      <Text style={styles.bodyText}>{candidate.nextAction}</Text>
      <View style={styles.tagRow}>
        <Text style={styles.sourceTag}>{candidate.sourceLabel}</Text>
        <Text style={styles.stageTag}>发出前确认</Text>
      </View>
    </Pressable>
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
    backgroundColor: colors.liveSoft,
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
