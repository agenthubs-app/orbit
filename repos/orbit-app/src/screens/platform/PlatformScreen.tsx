import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  dashboardAggregatePath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  platformToView,
  type PlatformOrgAccountView,
  type PlatformReviewItemView,
  type PlatformStatView
} from "../../view-models/platform";

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

export function PlatformScreen() {
  const eventsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.events,
    (data) => platformToView({ events: data }).stats[1]?.value === "0"
  );
  const profileState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.profile,
    () => false
  );
  const dashboardState = useApiResource<unknown>(
    dashboardAggregatePath(4),
    () => false
  );

  function refreshAll() {
    eventsState.refresh();
    profileState.refresh();
    dashboardState.refresh();
  }

  return (
    <AppScreen
      eyebrow="平台工作台"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={
            eventsState.refreshing ||
            profileState.refreshing ||
            dashboardState.refreshing
          }
          tintColor={colors.accent}
        />
      }
      title="平台总览"
    >
      {eventsState.kind === "loading" ? <LoadingState /> : null}
      {eventsState.kind === "offline" ? (
        <ErrorState message={eventsState.error.message} title="服务器连不上" />
      ) : null}
      {eventsState.kind === "failure" ? (
        <ErrorState message={eventsState.error.message} />
      ) : null}
      {eventsState.kind === "empty" ? (
        <EmptyState
          message="有新的公开活动后，平台工作台会显示需要优先复核的内容。"
          title="暂无平台活动"
        />
      ) : null}
      {eventsState.kind === "success" ? (
        <PlatformContent
          dashboard={
            dashboardState.kind === "success" ? dashboardState.data : null
          }
          events={eventsState.data}
          profile={profileState.kind === "success" ? profileState.data : null}
        />
      ) : null}
    </AppScreen>
  );
}

function PlatformContent({
  dashboard,
  events,
  profile
}: {
  dashboard: unknown;
  events: unknown;
  profile: unknown;
}) {
  const router = useRouter();
  const [decidedReviewIds, setDecidedReviewIds] = useState<
    Record<string, "approved" | "rejected">
  >({});
  const [decisionFeedback, setDecisionFeedback] = useState<string | null>(null);
  const view = platformToView({
    dashboard,
    events,
    profile
  });
  const reviewQueue = view.reviewQueue.filter(
    (item) => !decidedReviewIds[item.id]
  );

  function onDecideReviewItem(
    item: PlatformReviewItemView,
    decision: "approved" | "rejected"
  ) {
    setDecidedReviewIds((current) => ({
      ...current,
      [item.id]: decision
    }));
    setDecisionFeedback(
      decision === "approved"
        ? `已批准并发布 ${item.title}。`
        : `已驳回 ${item.title}，请主办方补充后再提交。`
    );
  }

  return (
    <>
      <DataCard detail={view.summary} title="平台健康">
        <StatGrid stats={view.stats} />
      </DataCard>

      {decisionFeedback ? (
        <View style={styles.decisionFeedback}>
          <Ionicons color={colors.live} name="checkmark-circle-outline" size={17} />
          <Text style={styles.decisionFeedbackText}>{decisionFeedback}</Text>
        </View>
      ) : null}

      {reviewQueue.length > 0 ? (
        <ReviewQueueCard
          items={reviewQueue}
          onDecideReviewItem={onDecideReviewItem}
          onOpenEvent={(href) => router.push(href)}
        />
      ) : (
        <EmptyState
          message={
            view.reviewQueue.length > 0
              ? "当前没有待审核的活动。"
              : view.emptyReviewMessage
          }
          title={
            view.reviewQueue.length > 0 ? "审核队列已清空" : view.emptyReviewTitle
          }
        />
      )}

      <OrgAccountsCard accounts={view.orgAccounts} />
    </>
  );
}

function StatGrid({ stats }: { stats: PlatformStatView[] }) {
  return (
    <View style={styles.statGrid}>
      {stats.map((stat) => (
        <View key={stat.id} style={styles.statCell}>
          <View style={[styles.toneDot, styles[`tone_${stat.tone}`]]} />
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.statValue}>
            {stat.value}
          </Text>
          <Text numberOfLines={1} style={styles.statLabel}>
            {stat.label}
          </Text>
          <Text numberOfLines={1} style={styles.statNote}>
            {stat.note}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReviewQueueCard({
  items,
  onDecideReviewItem,
  onOpenEvent
}: {
  items: PlatformReviewItemView[];
  onDecideReviewItem: (
    item: PlatformReviewItemView,
    decision: "approved" | "rejected"
  ) => void;
  onOpenEvent: (href: Href) => void;
}) {
  const { baseUrl } = useOrbitApiBaseUrl();

  return (
    <DataCard detail={`${items.length} 个活动需要优先确认`} title="待复核活动">
      <View style={styles.list}>
        {items.map((item) => (
          <View key={item.id} style={styles.reviewItem}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenEvent(item.href)}
              style={({ pressed }) => [
                styles.eventRow,
                pressed ? styles.pressed : null
              ]}
            >
              {item.coverPath ? (
                <ImageBackground
                  imageStyle={styles.eventThumbImage}
                  source={{ uri: assetUrl(baseUrl, item.coverPath) }}
                  style={styles.eventThumbFrame}
                >
                  <View style={styles.eventThumbOverlay} />
                </ImageBackground>
              ) : (
                <View style={styles.eventIcon}>
                  <Text style={styles.eventFallbackText}>
                    {item.title.slice(0, 1)}
                  </Text>
                </View>
              )}
              <View style={styles.eventCopy}>
                <View style={styles.eventTitleRow}>
                  <Text numberOfLines={2} style={styles.itemTitle}>
                    {item.title}
                  </Text>
                  <View style={styles.stateBadge}>
                    <Text style={styles.stateText}>{item.stateLabel}</Text>
                  </View>
                </View>
                <View style={styles.eventMetaStack}>
                  <View style={styles.eventMetaLine}>
                    <Ionicons color={colors.text3} name="time-outline" size={14} />
                    <Text numberOfLines={1} style={styles.metaText}>
                      {item.submitted}
                    </Text>
                  </View>
                  <View style={styles.eventMetaLine}>
                    <Ionicons color={colors.text3} name="location-outline" size={14} />
                    <Text numberOfLines={1} style={styles.metaText}>
                      {item.location}
                    </Text>
                  </View>
                </View>
                <Text numberOfLines={2} style={styles.detailText}>
                  {item.detail}
                </Text>
              </View>
            </Pressable>
            <View style={styles.reviewActionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onDecideReviewItem(item, "rejected")}
                style={({ pressed }) => [
                  styles.rejectButton,
                  pressed ? styles.pressed : null
                ]}
              >
                <Ionicons color={colors.rose} name="close-outline" size={16} />
                <Text style={styles.rejectButtonText}>驳回</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onDecideReviewItem(item, "approved")}
                style={({ pressed }) => [
                  styles.approveButton,
                  pressed ? styles.pressed : null
                ]}
              >
                <Ionicons color={colors.onAccent} name="checkmark-outline" size={16} />
                <Text style={styles.approveButtonText}>批准并发布</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function OrgAccountsCard({ accounts }: { accounts: PlatformOrgAccountView[] }) {
  return (
    <DataCard
      detail="移动端展示账号状态和活动覆盖，正式处理保留在平台流程中。"
      title="主办方账号"
    >
      <View style={styles.list}>
        {accounts.map((account) => (
          <View key={account.id} style={styles.accountRow}>
            <View style={styles.accountIcon}>
              <Text style={styles.accountIconText}>{account.initial}</Text>
            </View>
            <View style={styles.accountCopy}>
              <Text numberOfLines={1} style={styles.itemTitle}>
                {account.name}
              </Text>
              <Text numberOfLines={1} style={styles.metaText}>
                {account.owner} · {account.events}
              </Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons color={colors.live} name="checkmark-circle" size={15} />
              <Text style={styles.verifiedText}>{account.statusLabel}</Text>
            </View>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

const styles = StyleSheet.create({
  accountCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  accountIcon: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  accountIconText: {
    color: colors.onAccent,
    fontSize: typography.section,
    fontWeight: "700"
  },
  accountRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  approveButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  approveButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  decisionFeedback: {
    alignItems: "flex-start",
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  decisionFeedbackText: {
    color: colors.live,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  detailText: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 19
  },
  eventCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  eventFallbackText: {
    color: colors.accent,
    fontSize: typography.section,
    fontWeight: "700"
  },
  eventIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  eventMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "100%",
    minWidth: 0
  },
  eventMetaStack: {
    gap: spacing.xxs
  },
  eventRow: {
    alignItems: "flex-start",
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 92,
    padding: spacing.md
  },
  eventThumbFrame: {
    backgroundColor: colors.surface3,
    borderRadius: radius.md,
    height: 76,
    overflow: "hidden",
    width: 76
  },
  eventThumbImage: {
    borderRadius: radius.md
  },
  eventThumbOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10,10,16,0.08)"
  },
  eventTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  itemTitle: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  list: {
    gap: spacing.sm
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small
  },
  pressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  rejectButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  rejectButtonText: {
    color: colors.rose,
    fontSize: typography.small,
    fontWeight: "700"
  },
  reviewActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "flex-end"
  },
  reviewItem: {
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm
  },
  statCell: {
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: 106,
    padding: spacing.md,
    width: "48%"
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  statLabel: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "600"
  },
  statNote: {
    color: colors.text3,
    fontSize: typography.caption
  },
  statValue: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32
  },
  stateBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  stateText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  tone_accent: {
    backgroundColor: colors.accent
  },
  tone_amber: {
    backgroundColor: colors.amber
  },
  tone_blue: {
    backgroundColor: colors.sky
  },
  tone_green: {
    backgroundColor: colors.live
  },
  toneDot: {
    borderRadius: radius.pill,
    height: 8,
    width: 8
  },
  verifiedBadge: {
    alignItems: "center",
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  verifiedText: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700"
  }
});
