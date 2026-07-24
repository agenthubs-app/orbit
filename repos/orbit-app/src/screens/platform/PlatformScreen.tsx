import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import {
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
  const view = platformToView({
    dashboard,
    events,
    profile
  });

  return (
    <>
      <DataCard detail={view.summary} title="平台健康">
        <StatGrid stats={view.stats} />
      </DataCard>

      {view.reviewQueue.length > 0 ? (
        <ReviewQueueCard
          items={view.reviewQueue}
          onOpenEvent={(href) => router.push(href)}
        />
      ) : (
        <EmptyState
          message={view.emptyReviewMessage}
          title={view.emptyReviewTitle}
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
  onOpenEvent
}: {
  items: PlatformReviewItemView[];
  onOpenEvent: (href: Href) => void;
}) {
  return (
    <DataCard detail={`${items.length} 个活动需要优先确认`} title="待复核活动">
      <View style={styles.list}>
        {items.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => onOpenEvent(item.href)}
            style={({ pressed }) => [
              styles.eventRow,
              pressed ? styles.pressed : null
            ]}
          >
            <View style={styles.eventIcon}>
              <Text style={styles.eventIconText}>{item.title.slice(0, 1)}</Text>
            </View>
            <View style={styles.eventCopy}>
              <Text numberOfLines={2} style={styles.itemTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.metaText}>
                {item.submitted} · {item.location}
              </Text>
              <Text numberOfLines={2} style={styles.detailText}>
                {item.detail}
              </Text>
            </View>
            <View style={styles.stateBadge}>
              <Text style={styles.stateText}>{item.stateLabel}</Text>
            </View>
          </Pressable>
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
  eventIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  eventIconText: {
    color: colors.accent,
    fontSize: typography.section,
    fontWeight: "700"
  },
  eventRow: {
    alignItems: "center",
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 92,
    padding: spacing.md
  },
  itemTitle: {
    color: colors.ink,
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
